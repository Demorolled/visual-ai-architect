#!/usr/bin/env python3
import os, sys, json, math, threading, time, gc
from pathlib import Path
from datetime import datetime
from tkinter import filedialog, messagebox

import customtkinter as ctk
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
from tkinterdnd2 import DND_FILES, DND_TEXT, TkinterDnD

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# The remote client lives in training/remote/; importable so the GUI can submit jobs to an
# agent box over HTTP (no SSH). Missing dir is fine — the app just cannot go remote.
_REMOTE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "training", "remote")
if os.path.isdir(_REMOTE_DIR) and _REMOTE_DIR not in sys.path:
    sys.path.append(_REMOTE_DIR)
from engine import Engine, ALLOWED_EXTENSIONS, MODEL_EXTENSIONS, DATA_DIR, EXPORTS_DIR, HAS_REAL_TRAINING, HAS_MINDSPACE, HAS_MINDSPACE_TRANSFORMER, HAS_RAG

# Optional: MindSpace API server
HAS_MINDSPACE_API = False
try:
    from mindspace_api import create_app as _create_mindspace_api, _resolve_transformer_export_dir
    import uvicorn as _uvicorn
    HAS_MINDSPACE_API = True
except ImportError:
    pass

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

PAD = {"padx": 8, "pady": 4}
SML = {"padx": 4, "pady": 2}

# Sentinel entry in the model dropdown: selecting it opens the "type a Hugging Face
# repo id" dialog. It is deliberately not a usable model name, so it can never be
# picked up and trained by accident.
HF_ADD_ENTRY = "+ Add HF repo id"

class LLMTrainingStudio:
    def __init__(self):
        self.engine = Engine()
        self.engine.on_update = self.refresh_ui
        self._refresh_lock = threading.Lock()
        self.selected_files = set()
        self._ignore_clicks = False  # prevents click-vs-drop race
        self._build_ui()
        self.refresh_ui()
        self.poll_ollama()
        # Start MindSpace API server in background
        self._api_server = None
        if HAS_MINDSPACE_API:
            self._start_api_server()
        # Graceful shutdown
        if self.root:
            self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        self.root = TkinterDnD.Tk()
        self.root.title("LLM Training Studio")
        self.data_scanning = False
        self.model_scanning = False
        self._blink_data = None
        self._blink_model = None
        self._chart_initialized = False
        self.root.geometry("1400x900")
        self.root.minsize(1100, 700)

        self.root.grid_rowconfigure(0, weight=1)
        self.root.grid_columnconfigure(1, weight=1)

        # ─── Left sidebar ────────────────────────────────────────────────
        self.sidebar = ctk.CTkFrame(self.root, width=380, corner_radius=0)
        self.sidebar.grid(row=0, column=0, sticky="nsew")
        self.sidebar.grid_rowconfigure(2, weight=1)
        self.sidebar.grid_columnconfigure(0, weight=1)

        # Header
        hdr = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        hdr.grid(row=0, column=0, **PAD, sticky="ew")
        ctk.CTkLabel(hdr, text="LLM Training Studio", font=("Times New Roman", 21, "bold")).pack(side="left")
        self.settings_btn = ctk.CTkButton(hdr, text="\u2699 Settings", fg_color="#2d3148",
            hover_color="#6c5ce7", width=90, height=24, command=self.open_settings)
        self.settings_btn.pack(side="right", padx=(0, 4))
        self.open_folder_btn = ctk.CTkButton(hdr, text="\U0001f4c2 Open Folder", fg_color="#2d3148",
            hover_color="#6c5ce7", width=100, height=24, command=self.open_app_folder)
        self.open_folder_btn.pack(side="right", padx=(0, 4))
        self.kill_btn = ctk.CTkButton(hdr, text="\u25a0 STOP TRAINING (Esc)", fg_color="#e17055",
            hover_color="#d63031", width=140, command=self.kill_training)
        self.kill_btn.pack(side="right")
        ctk.CTkLabel(hdr, text="Global kill switch \u2014 immediately aborts training",
            font=("Times New Roman", 10), text_color="#e17055").pack(side="right", padx=(0,6))

        # ─── Upload section ──────────────────────────────────────────────
        up_frame = ctk.CTkFrame(self.sidebar)
        up_frame.grid(row=1, column=0, **PAD, sticky="ew")
        up_frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(up_frame, text="1.  DATA INGESTION  \u2014  Drop files or entire folders",
            font=("Times New Roman", 12, "bold")).grid(row=0, column=0, **SML, sticky="w")

        # ─── Data scanning indicator ──────────────────────────────────────
        scan_row = ctk.CTkFrame(up_frame, fg_color="transparent", height=20)
        scan_row.grid(row=1, column=0, **SML, sticky="ew")
        scan_row.grid_columnconfigure(1, weight=1)
        self.data_indicator = ctk.CTkLabel(scan_row, text="\u25cf", font=("Times New Roman", 10),
            text_color="#2d3148")
        self.data_indicator.pack(side="left", padx=(2, 4))
        self.data_scan_label = ctk.CTkLabel(scan_row, text="Idle",
            font=("Times New Roman", 10), text_color="#5a5d70")
        self.data_scan_label.pack(side="left")
        data_browse = ctk.CTkButton(scan_row, text="\U0001f4c2  Browse Data",
            font=("Times New Roman", 10), fg_color="#2d3148", hover_color="#6c5ce7",
            width=110, height=22, command=self.browse_data)
        data_browse.pack(side="right", padx=2)

        # Large drop zone for data
        import tkinter as tk
        self.data_drop_frame = tk.Frame(up_frame, bg="#1e2235", highlightbackground="#6c5ce7",
            highlightthickness=2, padx=10, pady=10)
        self.data_drop_frame.grid(row=2, column=0, **SML, sticky="ew")
        self.data_drop_frame.grid_columnconfigure(0, weight=1)
        self.data_drop_frame.bind("<Button-1>", lambda e: self.upload_files() if not self._ignore_clicks else None)

        drop_icon = tk.Label(self.data_drop_frame, text="\u2b07", font=("Times New Roman", 28),
            fg="#6c5ce7", bg="#1e2235")
        drop_icon.grid(row=0, column=0, pady=(14, 2))
        drop_icon.bind("<Button-1>", lambda e: self.upload_files() if not self._ignore_clicks else None)

        tk.Label(self.data_drop_frame, text="Drop Training Data Here",
            font=("Times New Roman", 14, "bold"), fg="#a99aed", bg="#1e2235").grid(row=1, column=0)
        tk.Label(self.data_drop_frame, text="HF Datasets: .jsonl .json .csv .parquet .arrow .txt .yaml",
            font=("Times New Roman", 10), fg="#6c5ce7", bg="#1e2235").grid(row=2, column=0, pady=(0, 2))
        tk.Label(self.data_drop_frame, text="Entire folders supported \u2014 scans recursively",
            font=("Times New Roman", 10), fg="#8b8fa3", bg="#1e2235").grid(row=3, column=0, pady=(0, 2))
        tk.Label(self.data_drop_frame, text="Click or drag files/folders here \u2192 auto-parsed & sorted",
            font=("Times New Roman", 10), fg="#5a5d70", bg="#1e2235").grid(row=4, column=0, pady=(0, 10))

        self.data_drop_frame.drop_target_register(DND_FILES)
        self.data_drop_frame.dnd_bind("<<Drop>>", self.on_drop_data)
        for child in self.data_drop_frame.winfo_children():
            child.drop_target_register(DND_FILES)
            child.dnd_bind("<<Drop>>", self.on_drop_data)

        # ─── Model scanning indicator ─────────────────────────────────────
        ctk.CTkLabel(up_frame, text="Drop model folders below to load into trainer",
            font=("Times New Roman", 11), text_color="#8b8fa3").grid(row=3, column=0, **SML, sticky="w")

        model_scan_row = ctk.CTkFrame(up_frame, fg_color="transparent", height=20)
        model_scan_row.grid(row=4, column=0, **SML, sticky="ew")
        model_scan_row.grid_columnconfigure(1, weight=1)
        self.model_indicator = ctk.CTkLabel(model_scan_row, text="\u25cf", font=("Times New Roman", 10),
            text_color="#2d3148")
        self.model_indicator.pack(side="left", padx=(2, 4))
        self.model_scan_label = ctk.CTkLabel(model_scan_row, text="Idle",
            font=("Times New Roman", 10), text_color="#5a5d70")
        self.model_scan_label.pack(side="left")
        model_browse = ctk.CTkButton(model_scan_row, text="\U0001f4c2  Browse Model",
            font=("Times New Roman", 10), fg_color="#2d3148", hover_color="#a78bfa",
            width=115, height=22, command=self.browse_models)
        model_browse.pack(side="right", padx=2)

        self.model_drop_frame = tk.Frame(up_frame, bg="#1e2235", highlightbackground="#a78bfa",
            highlightthickness=2, padx=10, pady=10)
        self.model_drop_frame.grid(row=5, column=0, **SML, sticky="ew")
        self.model_drop_frame.grid_columnconfigure(0, weight=1)
        self.model_drop_frame.bind("<Button-1>", lambda e: self.upload_models() if not self._ignore_clicks else None)

        tk.Label(self.model_drop_frame, text="\U0001f4c1  Drop LLM Model Folder / Files",
            font=("Times New Roman", 13, "bold"), fg="#c4b5fd", bg="#1e2235").grid(row=0, column=0, pady=(10, 2))
        tk.Label(self.model_drop_frame, text="HF Models: .safetensors .bin .pt .gguf + entire model folders",
            font=("Times New Roman", 10), fg="#8b8fa3", bg="#1e2235").grid(row=1, column=0, pady=(0, 2))
        tk.Label(self.model_drop_frame, text="Drop a HuggingFace model folder being built into an LLM",
            font=("Times New Roman", 10), fg="#a78bfa", bg="#1e2235").grid(row=2, column=0, pady=(0, 10))

        self.model_drop_frame.drop_target_register(DND_FILES)
        self.model_drop_frame.dnd_bind("<<Drop>>", self.on_drop_model)
        for child in self.model_drop_frame.winfo_children():
            child.drop_target_register(DND_FILES)
            child.dnd_bind("<<Drop>>", self.on_drop_model)

        stats_row = ctk.CTkFrame(up_frame, fg_color="transparent")
        stats_row.grid(row=6, column=0, **SML, sticky="ew")
        stats_row.grid_columnconfigure(0, weight=1)
        self.file_stats = ctk.CTkLabel(stats_row, text="Total: 0  |  Ready: 0  |  Review: 0  |  Bad: 0",
            font=("Times New Roman", 12), text_color="#8b8fa3")
        self.file_stats.pack(side="left")
        ctk.CTkButton(stats_row, text="\u21bb Re-categorize All", font=("Times New Roman", 11),
            fg_color="#2d3148", hover_color="#6c5ce7", width=130, height=22,
            command=self.recategorize).pack(side="right")

        # Clear all data button
        clear_row = ctk.CTkFrame(up_frame, fg_color="transparent")
        clear_row.grid(row=7, column=0, **SML, sticky="ew")
        ctk.CTkButton(clear_row, text="\u2716 Clear All Training Data",
            font=("Times New Roman", 11), fg_color="#e17055", hover_color="#d63031",
            width=160, height=22, command=self.clear_all_data).pack(side="left", padx=2)
        ctk.CTkLabel(clear_row, text="Removes files, queue, history & experiments",
            font=("Times New Roman", 9), text_color="#e17055").pack(side="left", padx=4)

        # ─── Tabs + Search ───────────────────────────────────────────────
        tab_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        tab_frame.grid(row=2, column=0, sticky="nsew", **PAD)
        tab_frame.grid_rowconfigure(2, weight=1)
        tab_frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(tab_frame, text="2.  FILE BROWSER  \u2014  Browse, search, click name to edit content",
            font=("Times New Roman", 12, "bold")).grid(row=0, column=0, **SML, sticky="w")

        self.search_var = ctk.StringVar(value="")
        self.search_var.trace_add("write", lambda *a: self.filter_files())
        search_entry = ctk.CTkEntry(tab_frame, placeholder_text="Search by filename, theme, or content...",
            textvariable=self.search_var)
        search_entry.grid(row=1, column=0, **SML, sticky="ew")

        self.tab_var = ctk.StringVar(value="all")
        tabs = ctk.CTkSegmentedButton(tab_frame, values=["All", "Ready", "Review", "Bad"],
            command=self.on_tab_change, selected_color="#6c5ce7", selected_hover_color="#7c6df7")
        tabs.grid(row=2, column=0, **SML, sticky="ew")

        ctk.CTkLabel(tab_frame, text="Click filename to edit content. Click Queue to add to training session.",
            font=("Times New Roman", 10), text_color="#8b8fa3").grid(row=3, column=0, **SML, sticky="w")

        # File list (scrollable)
        self.file_list_frame = ctk.CTkScrollableFrame(tab_frame, corner_radius=6)
        self.file_list_frame.grid(row=4, column=0, sticky="nsew")

        # Model list
        ctk.CTkLabel(tab_frame, text="LOADED MODELS  \u2014  Local LLM files available for training",
            font=("Times New Roman", 11, "bold"), text_color="#8b8fa3").grid(row=5, column=0, **SML, sticky="w")
        self.model_list_frame = ctk.CTkScrollableFrame(tab_frame, height=70, corner_radius=6)
        self.model_list_frame.grid(row=6, column=0, sticky="ew")

        # ─── Main content ────────────────────────────────────────────────
        main = ctk.CTkFrame(self.root)
        main.grid(row=0, column=1, sticky="nsew", padx=(0, 8), pady=8)
        main.grid_rowconfigure(2, weight=1)
        main.grid_columnconfigure(0, weight=1)

        # ─── Training controls ───────────────────────────────────────────
        train_frame = ctk.CTkFrame(main)
        train_frame.grid(row=0, column=0, **PAD, sticky="ew")
        train_frame.grid_columnconfigure((0,1,2,3,4,5,6,7), weight=1)

        ctk.CTkLabel(train_frame, text="3.  TRAINING CONTROLLER  \u2014  Set parameters, choose model, then run training",
            font=("Times New Roman", 13, "bold")).grid(row=0, column=0, **SML, sticky="w")
        ctk.CTkLabel(train_frame, text="Configure epochs (passes over data), batch size, and learning rate below",
            font=("Times New Roman", 10), text_color="#8b8fa3").grid(row=0, column=3, columnspan=4, **SML, sticky="e")

        # Model selector
        ctk.CTkLabel(train_frame, text="Target Model:").grid(row=1, column=3, **SML, sticky="e")
        self.model_var = ctk.StringVar(value="simulated")
        self.model_dropdown = ctk.CTkOptionMenu(train_frame, values=["simulated", "Loading..."],
            variable=self.model_var, width=160, command=self._on_model_pick)
        self.model_dropdown.grid(row=0, column=4, **SML, sticky="e")
        self.ollama_label = ctk.CTkLabel(train_frame, text="Ollama: --", font=("Times New Roman", 11))
        self.ollama_label.grid(row=0, column=5, **SML, sticky="e")
        real_color = "#00cec9" if HAS_REAL_TRAINING else "#e17055"
        real_text = "Real Training: ON" if HAS_REAL_TRAINING else "Real Training: OFF (pip install torch transformers peft)"
        self.real_train_label = ctk.CTkLabel(train_frame, text=real_text,
            font=("Times New Roman", 10), text_color=real_color)
        self.real_train_label.grid(row=0, column=6, **SML, sticky="e")
        ctk.CTkButton(train_frame, text="\u21bb", width=28, command=self.poll_ollama).grid(row=0, column=7, **SML)

        row1_frame = ctk.CTkFrame(train_frame, fg_color="transparent")
        row1_frame.grid(row=2, column=0, columnspan=8, **SML, sticky="ew")
        row1_frame.grid_columnconfigure((0,1,2,3,4,5,6,7), weight=1)

        ctk.CTkLabel(row1_frame, text="Epochs:").grid(row=0, column=0, **SML, sticky="w")
        self.epoch_var = ctk.StringVar(value="3")
        ctk.CTkEntry(row1_frame, textvariable=self.epoch_var, width=60).grid(row=0, column=1, **SML, sticky="w")

        ctk.CTkLabel(row1_frame, text="Batch:").grid(row=0, column=2, **SML, sticky="w")
        self.batch_var = ctk.StringVar(value="1")
        ctk.CTkEntry(row1_frame, textvariable=self.batch_var, width=60).grid(row=0, column=3, **SML, sticky="w")

        ctk.CTkLabel(row1_frame, text="LR:").grid(row=0, column=4, **SML, sticky="w")
        self.lr_var = ctk.StringVar(value="0.001")
        ctk.CTkEntry(row1_frame, textvariable=self.lr_var, width=80).grid(row=0, column=5, **SML, sticky="w")

        ctk.CTkLabel(row1_frame, text="Grad Accum:").grid(row=0, column=6, **SML, sticky="w")
        self.grad_accum_var = ctk.StringVar(value="4")
        ctk.CTkEntry(row1_frame, textvariable=self.grad_accum_var, width=50).grid(row=0, column=7, **SML, sticky="w")

        # ─── MindSpace RNN config row ──
        ms_frame = ctk.CTkFrame(train_frame, fg_color="transparent")
        ms_frame.grid(row=7, column=0, columnspan=8, **SML, sticky="ew")
        ms_frame.grid_columnconfigure((0,1,2,3,4,5,6,7), weight=1)

        self.ms_config_label = ctk.CTkLabel(ms_frame,
            text="MindSpace RNN Config (only when model = mindspace-rnn)",
            font=("Times New Roman", 10, "italic"), text_color="#a78bfa")
        self.ms_config_label.grid(row=0, column=0, columnspan=8, **SML, sticky="w")

        self.embed_dim_var = ctk.StringVar(value="64")
        self.hidden_dim_var = ctk.StringVar(value="128")
        self.num_layers_var = ctk.StringVar(value="2")
        self.dropout_var = ctk.StringVar(value="0.2")
        self.seq_len_var = ctk.StringVar(value="128")

        ctk.CTkLabel(ms_frame, text="Embed:", font=("Times New Roman", 10), text_color="#a78bfa").grid(row=1, column=0, **SML, sticky="w")
        ctk.CTkEntry(ms_frame, textvariable=self.embed_dim_var, width=50).grid(row=1, column=1, **SML, sticky="w")
        ctk.CTkLabel(ms_frame, text="Hidden:", font=("Times New Roman", 10), text_color="#a78bfa").grid(row=1, column=2, **SML, sticky="w")
        ctk.CTkEntry(ms_frame, textvariable=self.hidden_dim_var, width=50).grid(row=1, column=3, **SML, sticky="w")
        ctk.CTkLabel(ms_frame, text="Layers:", font=("Times New Roman", 10), text_color="#a78bfa").grid(row=1, column=4, **SML, sticky="w")
        ctk.CTkEntry(ms_frame, textvariable=self.num_layers_var, width=35).grid(row=1, column=5, **SML, sticky="w")
        ctk.CTkLabel(ms_frame, text="Dropout:", font=("Times New Roman", 10), text_color="#a78bfa").grid(row=1, column=6, **SML, sticky="w")
        ctk.CTkEntry(ms_frame, textvariable=self.dropout_var, width=45).grid(row=1, column=7, **SML, sticky="w")

        ctk.CTkLabel(ms_frame, text="Seq Len:", font=("Times New Roman", 10), text_color="#a78bfa").grid(row=2, column=0, **SML, sticky="w")
        ctk.CTkEntry(ms_frame, textvariable=self.seq_len_var, width=50).grid(row=2, column=1, **SML, sticky="w")
        ms_status = "MindSpace: Available" if HAS_MINDSPACE else "MindSpace: Unavailable (install torch)"
        ctk.CTkLabel(ms_frame, text=ms_status, font=("Times New Roman", 9),
            text_color="#00cec9" if HAS_MINDSPACE else "#e17055").grid(row=2, column=2, columnspan=4, **SML, sticky="w")

        # ─── Agent box (remote training over HTTP) ──
        agent_frame = ctk.CTkFrame(train_frame, fg_color="transparent")
        agent_frame.grid(row=8, column=0, columnspan=8, **SML, sticky="ew")
        self.use_agent_var = ctk.BooleanVar(value=bool(self.engine.settings.get("use_agent", False)))
        ctk.CTkCheckBox(agent_frame, text="Train on agent box", variable=self.use_agent_var,
            command=self._save_agent_settings, font=("Times New Roman", 11)).pack(side="left", padx=(0, 6))
        self.agent_url_var = ctk.StringVar(value=self.engine.settings.get("agent_url", ""))
        ctk.CTkEntry(agent_frame, textvariable=self.agent_url_var, width=230,
            placeholder_text="http://192.168.1.234:8811").pack(side="left", padx=2)
        ctk.CTkButton(agent_frame, text="Test", width=52, fg_color="#2d3148", hover_color="#6c5ce7",
            command=self.test_agent).pack(side="left", padx=2)
        self.agent_status_label = ctk.CTkLabel(agent_frame, text="remote off",
            font=("Times New Roman", 10), text_color="#8b8fa3")
        self.agent_status_label.pack(side="left", padx=6)

        # Buttons
        btn_frame = ctk.CTkFrame(train_frame, fg_color="transparent")
        btn_frame.grid(row=3, column=0, columnspan=8, **SML, sticky="ew")
        self.start_btn = ctk.CTkButton(btn_frame, text="\u25b6 Start", command=self.start_training,
            fg_color="#6c5ce7", hover_color="#7c6df7", width=100)
        self.start_btn.pack(side="left", padx=2)
        self.pause_btn = ctk.CTkButton(btn_frame, text="\u275a\u275a Pause", command=self.toggle_pause,
            fg_color="#fdcb6e", hover_color="#f9ca24", text_color="#000", width=100, state="disabled")
        self.pause_btn.pack(side="left", padx=2)
        self.reset_btn = ctk.CTkButton(btn_frame, text="\u21ba Reset", command=self.reset_training,
            fg_color="#2d3148", hover_color="#3d4168", width=80)
        self.reset_btn.pack(side="left", padx=2)
        ctk.CTkButton(btn_frame, text="\u2913 Export (JSON+CSV)", command=self.export_data,
            fg_color="#2d3148", hover_color="#3d4168", width=130).pack(side="left", padx=2)

        # Progress
        self.progress_bar = ctk.CTkProgressBar(train_frame, height=6, corner_radius=3,
            progress_color="#6c5ce7")
        self.progress_bar.grid(row=4, column=0, columnspan=8, **SML, sticky="ew")
        self.progress_bar.set(0)

        self.progress_label = ctk.CTkLabel(train_frame, text="Idle  |  Step: 0/0  |  Epoch: 0/0",
            font=("Times New Roman", 12), text_color="#8b8fa3")
        self.progress_label.grid(row=5, column=0, columnspan=8, **SML, sticky="w")

        # Queue info
        ctk.CTkLabel(train_frame, text="4.  TRAINING QUEUE  \u2014  Drag files from sidebar to add. Right-click to remove.",
            font=("Times New Roman", 11, "bold"), text_color="#6c5ce7").grid(row=5, column=4, columnspan=4, **SML, sticky="e")
        import tkinter as tk
        self.queue_drop_zone = tk.Frame(train_frame, bg="#1e2235",
            highlightbackground="#6c5ce7", highlightthickness=2, cursor="hand2",
            padx=10, pady=6)
        self.queue_drop_zone.grid(row=6, column=4, columnspan=4, **SML, sticky="ew")
        self.queue_drop_zone.drop_target_register(DND_TEXT)
        self.queue_drop_zone.dnd_bind("<<Drop>>", self._on_queue_drop)
        self.queue_drop_zone.bind("<Button-1>", lambda e: self.toast("Drop files from sidebar onto this zone to queue them", "info"))

        queue_inner = tk.Frame(self.queue_drop_zone, bg="#1e2235")
        queue_inner.pack(fill="x")
        tk.Label(queue_inner, text="\u2913 Drop Zone", font=("Times New Roman", 12, "bold"),
            fg="#6c5ce7", bg="#1e2235").pack(side="left", padx=(4, 8))
        self.queue_label = tk.Label(queue_inner, text="Queue: 0 files",
            font=("Times New Roman", 13, "bold"), fg="#6c5ce7", bg="#1e2235")
        self.queue_label.pack(side="left")
        tk.Label(queue_inner, text="Drag file rows here to queue",
            font=("Times New Roman", 9), fg="#5a5d70", bg="#1e2235").pack(side="right", padx=4)

        # ─── Compile / Export Model ─────────────────────────────────────
        compile_frame = ctk.CTkFrame(main)
        compile_frame.grid(row=1, column=0, **PAD, sticky="ew")
        compile_frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(compile_frame, text="10.  COMPILE MODEL  \u2014  Export trained model to deployable format",
            font=("Times New Roman", 12, "bold")).grid(row=0, column=0, **SML, sticky="w")

        compile_ctrl = ctk.CTkFrame(compile_frame, fg_color="transparent")
        compile_ctrl.grid(row=1, column=0, sticky="ew", **SML)
        compile_ctrl.grid_columnconfigure((0,1,2,3), weight=1)

        ctk.CTkLabel(compile_ctrl, text="Format:").grid(row=0, column=0, **SML, sticky="w")
        self.compile_format_var = ctk.StringVar(value="pytorch")
        compile_formats = ["pytorch", "safetensors", "onnx", "gguf", "torchscript"]
        if HAS_MINDSPACE_TRANSFORMER:
            compile_formats.append("mindspace-transformer")
        self.compile_format_menu = ctk.CTkOptionMenu(compile_ctrl,
            values=compile_formats,
            variable=self.compile_format_var, width=140,
            command=self._on_compile_format_change)
        self.compile_format_menu.grid(row=0, column=1, **SML, sticky="w")

        ctk.CTkLabel(compile_ctrl, text="Quant:").grid(row=0, column=2, **SML, sticky="w")
        self.compile_quant_var = ctk.StringVar(value="q4_0")
        self.compile_quant_menu = ctk.CTkOptionMenu(compile_ctrl,
            values=["q4_0", "q4_1", "q5_0", "q5_1", "q8_0", "f16"],
            variable=self.compile_quant_var, width=80)
        self.compile_quant_menu.grid(row=0, column=3, **SML, sticky="w")

        ctk.CTkLabel(compile_ctrl, text="Model:").grid(row=1, column=0, **SML, sticky="w")
        self.compile_model_var = ctk.StringVar(value="current")
        compile_models = ["current", "mindspace-rnn"]
        if HAS_MINDSPACE_TRANSFORMER:
            compile_models.append("mindspace-transformer")
        self.compile_model_menu = ctk.CTkOptionMenu(compile_ctrl,
            values=compile_models, variable=self.compile_model_var, width=180)
        self.compile_model_menu.grid(row=1, column=1, **SML, sticky="w")

        self.compile_btn = ctk.CTkButton(compile_ctrl, text="\u2699 Compile Model",
            fg_color="#6c5ce7", hover_color="#7c6df7", width=130, command=self.compile_model_desktop)
        self.compile_btn.grid(row=1, column=2, **SML, sticky="w")
        self.compile_dl_btn = ctk.CTkButton(compile_ctrl, text="\u2913 Download",
            fg_color="#2d3148", hover_color="#6c5ce7", width=100,
            command=self.download_compiled_model)
        self.compile_dl_btn.grid(row=1, column=3, **SML, sticky="w")

        # MindSpace Transformer status label
        self.ms_status_label = ctk.CTkLabel(compile_ctrl,
            text=self._get_ms_status_text(),
            font=("Times New Roman", 9), text_color="#a78bfa")
        self.ms_status_label.grid(row=2, column=0, columnspan=4, **SML, sticky="w")

        self.compile_progress = ctk.CTkProgressBar(compile_frame, height=4,
            corner_radius=2, progress_color="#6c5ce7")
        self.compile_progress.grid(row=3, column=0, **SML, sticky="ew")
        self.compile_progress.set(0)
        self.compile_status_label = ctk.CTkLabel(compile_frame, text="Ready",
            font=("Times New Roman", 10), text_color="#8b8fa3")
        self.compile_status_label.grid(row=4, column=0, **SML, sticky="w")
        self._compiled_file = None

        # ─── Bottom: Charts + Metrics + Experiments ──────────────────────
        bottom = ctk.CTkFrame(main)
        bottom.grid(row=2, column=0, sticky="nsew", **PAD)
        bottom.grid_rowconfigure(0, weight=1)
        bottom.grid_columnconfigure(0, weight=2)
        bottom.grid_columnconfigure(1, weight=1)

        # Left: Charts
        chart_frame = ctk.CTkFrame(bottom)
        chart_frame.grid(row=0, column=0, sticky="nsew", padx=(0,4))
        chart_frame.grid_rowconfigure(1, weight=1)
        chart_frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(chart_frame, text="5.  TRAINING CHARTS  \u2014  Live loss, accuracy & improvement curves",
            font=("Times New Roman", 12, "bold")).grid(row=0, column=0, **SML, sticky="w")
        self.improv_label = ctk.CTkLabel(chart_frame, text="Improvement: 0%",
            font=("Times New Roman", 15, "bold"), text_color="#00cec9")
        self.improv_label.grid(row=2, column=0, **SML, sticky="e")

        # Lower DPI = less memory for chart pixel buffers, less pressure on RAM
        self.fig = Figure(figsize=(10, 3.5), dpi=36, facecolor="#1a1d27", edgecolor="none")
        self.ax_loss = self.fig.add_subplot(131, facecolor="#232738")
        self.ax_acc  = self.fig.add_subplot(132, facecolor="#232738")
        self.ax_improv = self.fig.add_subplot(133, facecolor="#232738")
        for ax in [self.ax_loss, self.ax_acc, self.ax_improv]:
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)
            ax.spines["left"].set_color("#2d3148")
            ax.spines["bottom"].set_color("#2d3148")
            ax.tick_params(colors="#8b8fa3", labelsize=7)
            ax.set_facecolor("#232738")
        self.ax_loss.set_title("Loss (lower is better)", color="#e17055", fontsize=8)
        self.ax_acc.set_title("Accuracy (higher is better)", color="#fdcb6e", fontsize=8)
        self.ax_improv.set_title("Improvement %", color="#00cec9", fontsize=8)
        # Fixed y-limits prevent chart re-layout from shifting the page on every refresh
        self.ax_loss.set_ylim(0, 3)
        self.ax_acc.set_ylim(0, 100)
        self.ax_improv.set_ylim(0, 105)
        (self.loss_line,) = self.ax_loss.plot([], [], color="#e17055", linewidth=1.5)
        (self.acc_line,) = self.ax_acc.plot([], [], color="#fdcb6e", linewidth=1.5)
        (self.improv_line,) = self.ax_improv.plot([], [], color="#00cec9", linewidth=1.5)
        # Fill under the improvement curve
        self.improv_fill = None
        self.fig.tight_layout(pad=1.2)

        self.canvas = FigureCanvasTkAgg(self.fig, master=chart_frame)
        self.canvas.get_tk_widget().grid(row=1, column=0, sticky="nsew")
        # Don't draw until we have data — defers memory allocation for chart buffer
        self._chart_initialized = False

        # Right: Metrics + Experiments
        right = ctk.CTkFrame(bottom)
        right.grid(row=0, column=1, sticky="nsew", padx=(4,0))
        right.grid_rowconfigure(0, weight=0)
        right.grid_rowconfigure(1, weight=0)
        right.grid_rowconfigure(2, weight=0)
        right.grid_rowconfigure(3, weight=0)
        right.grid_rowconfigure(4, weight=1)
        right.grid_columnconfigure(0, weight=1)

        # Metrics cards
        mf = ctk.CTkFrame(right)
        mf.grid(row=0, column=0, **SML, sticky="ew")
        mf.grid_columnconfigure((0,1), weight=1)
        ctk.CTkLabel(mf, text="6.  MODEL MONITORING  \u2014  Size growth & performance metrics",
            font=("Times New Roman", 12, "bold")).grid(row=0, column=0, columnspan=2, **SML, sticky="w")

        self.metrics_labels = {}
        rows = [("Parameters", "param_val", "#74b9ff", 0, 0),
                ("Vector Store", "vector_val", "#00cec9", 0, 1),
                ("Accuracy", "acc_val", "#fdcb6e", 1, 0),
                ("Loss", "loss_val", "#e17055", 1, 1)]
        for label, key, color, r, c in rows:
            card = ctk.CTkFrame(mf, fg_color="#232738", corner_radius=6, border_width=1, border_color="#2d3148")
            card.grid(row=r+1, column=c, **SML, sticky="ew")
            card.grid_columnconfigure(0, weight=1)
            ctk.CTkLabel(card, text=label, font=("Times New Roman", 11), text_color="#8b8fa3").pack(anchor="w", padx=6, pady=(4,0))
            lbl = ctk.CTkLabel(card, text="--", font=("Times New Roman", 18, "bold"), text_color=color)
            lbl.pack(anchor="w", padx=6, pady=(0,4))
            self.metrics_labels[key] = lbl

        # Evaluation
        ef = ctk.CTkFrame(right)
        ef.grid(row=1, column=0, **SML, sticky="ew")
        ef.grid_columnconfigure((0,1), weight=1)
        ctk.CTkLabel(ef, text="7.  AUTONOMOUS EVALUATION  \u2014  Benchmarks measuring what the model learned",
            font=("Times New Roman", 11, "bold"), text_color="#8b8fa3").grid(row=0, column=0, columnspan=2, **SML, sticky="w")
        self.eval_labels = {}
        for i, (k, v, color) in enumerate([("Tokens", "tokens_val", "#00cec9"), ("BLEU", "bleu_val", "#00cec9"),
                                            ("Perplexity", "perp_val", "#00cec9"), ("QA Acc", "qa_val", "#00cec9")]):
            lbl = ctk.CTkLabel(ef, text=f"{k}: --", font=("Times New Roman", 12), text_color=color)
            lbl.grid(row=i//2+1, column=i%2, **SML, sticky="w")
            self.eval_labels[v] = lbl

        # Resource Monitor
        self.resource_frame = ctk.CTkFrame(right)
        self.resource_frame.grid(row=2, column=0, **SML, sticky="ew")
        self.resource_frame.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(self.resource_frame, text="8.  RESOURCE MONITOR  \u2014  CPU/GPU usage & training device",
            font=("Times New Roman", 11, "bold"), text_color="#74b9ff").grid(row=0, column=0, **SML, sticky="w")

        self.resource_labels = {}
        # CPU row
        cpu_r = ctk.CTkFrame(self.resource_frame, fg_color="transparent")
        cpu_r.grid(row=1, column=0, sticky="ew", padx=4, pady=1)
        cpu_r.grid_columnconfigure(1, weight=1)
        ctk.CTkLabel(cpu_r, text="CPU", font=("Times New Roman", 11, "bold"),
            text_color="#74b9ff", width=36).grid(row=0, column=0)
        self.resource_labels["cpu_bar"] = ctk.CTkProgressBar(cpu_r, height=10,
            corner_radius=3, progress_color="#74b9ff")
        self.resource_labels["cpu_bar"].grid(row=0, column=1, sticky="ew", padx=4)
        self.resource_labels["cpu_bar"].set(0)
        self.resource_labels["cpu_text"] = ctk.CTkLabel(cpu_r, text="0%",
            font=("Times New Roman", 10), text_color="#74b9ff", width=40)
        self.resource_labels["cpu_text"].grid(row=0, column=2)
        self.resource_labels["ram_text"] = ctk.CTkLabel(cpu_r, text="RAM: 0/0 GB",
            font=("Times New Roman", 10), text_color="#8b8fa3", width=80)
        self.resource_labels["ram_text"].grid(row=0, column=3, padx=(4,0))

        # GPU rows — pre-create 4 static slots to avoid dynamic create/destroy
        self.resource_gpu_rows = []
        self.resource_gpu_container = ctk.CTkFrame(self.resource_frame, fg_color="transparent")
        self.resource_gpu_container.grid(row=2, column=0, sticky="ew")
        for gpu_idx in range(4):
            frame = ctk.CTkFrame(self.resource_gpu_container, fg_color="transparent")
            frame.grid_columnconfigure(1, weight=1)
            lbl = ctk.CTkLabel(frame, text=f"GPU{gpu_idx}", font=("Times New Roman", 10, "bold"),
                text_color="#a78bfa", width=36)
            lbl.grid(row=0, column=0)
            bar = ctk.CTkProgressBar(frame, height=8, corner_radius=3, progress_color="#a78bfa")
            bar.grid(row=0, column=1, sticky="ew", padx=4)
            bar.set(0)
            txt = ctk.CTkLabel(frame, text="", font=("Times New Roman", 9),
                text_color="#a78bfa", width=80)
            txt.grid(row=0, column=2)
            mem_txt = ctk.CTkLabel(frame, text="", font=("Times New Roman", 9),
                text_color="#8b8fa3", width=60)
            mem_txt.grid(row=0, column=3, padx=(4,0))
            self.resource_gpu_rows.append({"frame": frame, "bar": bar, "txt": txt, "mem": mem_txt})
            # Initially hidden — shown when GPUs are detected
            frame.grid_forget()

        # Training device
        self.resource_labels["device_text"] = ctk.CTkLabel(self.resource_frame,
            text="Training on: idle", font=("Times New Roman", 10), text_color="#8b8fa3")
        self.resource_labels["device_text"].grid(row=3, column=0, **SML, sticky="w")

        # Experiments
        xf = ctk.CTkFrame(right)
        xf.grid(row=4, column=0, **SML, sticky="nsew")
        xf.grid_rowconfigure(1, weight=1)
        xf.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(xf, text="9.  EXPERIMENTS  \u2014  Saved runs. Click to compare loss/accuracy curves.",
            font=("Times New Roman", 12, "bold")).grid(row=0, column=0, **SML, sticky="w")
        self.exp_list_frame = ctk.CTkScrollableFrame(xf, corner_radius=6)
        self.exp_list_frame.grid(row=1, column=0, sticky="nsew")

        ctk.CTkButton(xf, text="\u2716 Clear All Experiments", fg_color="#2d3148", hover_color="#e17055",
            command=self.clear_experiments, width=160, height=24).grid(row=2, column=0, **SML, sticky="e")

        # Periodic memory cleanup timer (runs every 30 seconds — was 60)
        self._memory_cleanup_timer()
        # Start resource polling
        self._poll_resources()

    # ─── Event handlers ──────────────────────────────────────────────────

    def toast(self, msg, type="info"):
        colors = {"info": "#6c5ce7", "success": "#00cec9", "warning": "#fdcb6e", "error": "#e17055"}
        win = ctk.CTkToplevel(self.root)
        win.overrideredirect(True)
        win.attributes("-topmost", True)
        win.configure(fg_color=colors.get(type, "#6c5ce7"))
        lbl = ctk.CTkLabel(win, text=msg, font=("Times New Roman", 12),
            text_color="#000" if type in ("success", "warning") else "#fff")
        lbl.pack(padx=20, pady=8)
        self.root.update_idletasks()
        x = self.root.winfo_x() + self.root.winfo_width() - win.winfo_reqwidth() - 30
        y = self.root.winfo_y() + self.root.winfo_height() - win.winfo_reqheight() - 50
        win.geometry(f"+{x}+{y}")
        win.after(2500, win.destroy)

    def _blink_data_on(self):
        if not self.data_scanning: return
        c = self.data_indicator.cget("text_color")
        new = "#6c5ce7" if c == "#2d3148" else "#2d3148"
        self.data_indicator.configure(text_color=new)
        self._blink_data = self.root.after(500, self._blink_data_on)

    def _blink_data_start(self, msg="Scanning..."):
        self.data_scanning = True
        self.data_scan_label.configure(text=msg, text_color="#6c5ce7")
        self._blink_data_on()

    def _blink_data_stop(self, msg="Done"):
        self.data_scanning = False
        if self._blink_data:
            self.root.after_cancel(self._blink_data)
            self._blink_data = None
        self.data_indicator.configure(text_color="#2d3148")
        self.data_scan_label.configure(text=msg, text_color="#5a5d70")

    def _blink_model_on(self):
        if not self.model_scanning: return
        c = self.model_indicator.cget("text_color")
        new = "#a78bfa" if c == "#2d3148" else "#2d3148"
        self.model_indicator.configure(text_color=new)
        self._blink_model = self.root.after(500, self._blink_model_on)

    def _blink_model_start(self, msg="Scanning..."):
        self.model_scanning = True
        self.model_scan_label.configure(text=msg, text_color="#a78bfa")
        self._blink_model_on()

    def _blink_model_stop(self, msg="Done"):
        self.model_scanning = False
        if self._blink_model:
            self.root.after_cancel(self._blink_model)
            self._blink_model = None
        self.model_indicator.configure(text_color="#2d3148")
        self.model_scan_label.configure(text=msg, text_color="#5a5d70")

    def on_tab_change(self, val):
        self.filter_files()

    def _pick_drive_or_path(self, title="Select location"):
        import platform, os
        if platform.system() == "Windows":
            try:
                import string, ctypes
                bitmask = ctypes.windll.kernel32.GetLogicalDrives()
                letters = [letter for letter in string.ascii_uppercase if bitmask >> (ord(letter)-65) & 1]
                return (letters[0] + ":\\") if letters else "C:\\"
            except: return "C:\\"

        # Linux: detect all accessible mount points
        mounts = []
        seen = set()
        for base in ["/mnt", "/media", "/run/media"]:
            if os.path.isdir(base):
                try:
                    for name in sorted(os.listdir(base)):
                        p = os.path.join(base, name)
                        if os.path.isdir(p) and p not in seen:
                            seen.add(p); mounts.append(p)
                except: pass
        for extra in ["/home", "/data", "/storage", "/srv", "/nas", "/export"]:
            if os.path.isdir(extra) and extra not in seen:
                seen.add(extra); mounts.append(extra)
        skip_prefixes = ("/snap/", "/run/user/", "/proc/", "/sys/", "/dev/")
        skip_fstypes = {"proc","sysfs","tmpfs","devtmpfs","devpts","cgroup","cgroup2",
                        "pstore","efivarfs","bpf","hugetlbfs","mqueue","configfs",
                        "debugfs","tracefs","securityfs","autofs","overlay","fuse.gvfsd-fuse"}
        try:
            with open("/proc/mounts") as fh:
                for line in fh:
                    parts = line.split()
                    if len(parts) >= 2:
                        mp = parts[1]; fstype = parts[2] if len(parts) > 2 else ""
                        if fstype in skip_fstypes: continue
                        if any(mp.startswith(p) for p in skip_prefixes): continue
                        if mp and mp not in seen and os.path.isdir(mp):
                            seen.add(mp); mounts.append(mp)
        except: pass
        mounts.sort()
        if not mounts: return "/"

        import tkinter.simpledialog as sd
        lines = [f"0.  /  (System Root)"]
        import shutil
        for i, m in enumerate(mounts, 1):
            if m == "/": continue
            try: usage = shutil.disk_usage(m)
            except: usage = None
            label = m
            if m.startswith("/mnt/"): label = f"💾 {m[5:]}  (/mnt)"
            elif m.startswith("/media/"): label = f"📀 {m[7:]}  (/media)"
            elif m == "/home": label = "🏠 /home"
            if usage:
                tg = usage.total / (1024**3)
                up = usage.used / usage.total * 100
                lines.append(f"{i}. {label}   [{tg:.0f}G  {up:.0f}% used]")
            else:
                lines.append(f"{i}. {label}")

        prompt = ("Enter a path to browse, or type the number of a drive above:\n\n"
                  + "\n".join(lines[:18]) +
                  "\n\nPath or number:")
        ans = sd.askstring(title, prompt, initialvalue="")
        if ans:
            ans = ans.strip()
            try:
                idx = int(ans)
                if idx == 0: return "/"
                if 1 <= idx <= len(mounts): return mounts[idx-1]
                return "/"
            except ValueError:
                return ans if os.path.isdir(ans) else "/"
        return "/"

    def browse_data(self):
        paths = filedialog.askopenfilenames(title="Select training data files (multi-select)",
            filetypes=[("Data files", " ".join(f"*{e}" for e in ALLOWED_EXTENSIONS)),
                       ("All files", "*.*")])
        if paths:
            self._import_files_threaded([Path(p) for p in paths])

    def upload_files(self):
        paths = filedialog.askopenfilenames(title="Select training data files (multi-select)",
            filetypes=[("Data files", " ".join(f"*{e}" for e in ALLOWED_EXTENSIONS)),
                       ("All files", "*.*")])
        if paths:
            self._import_files_threaded([Path(p) for p in paths])

    def on_drop_data(self, event):
        # Guard: on some platforms a Button-1 follows the drop, which would
        # trigger the "click to browse" handler and open the drive picker.
        self._ignore_clicks = True
        self.root.after(500, lambda: setattr(self, '_ignore_clicks', False))
        items = self.root.tk.splitlist(event.data)
        folders = []
        files = []
        for item in items:
            p = Path(item)
            if p.is_dir():
                folders.append(p)
            elif p.suffix.lower() in ALLOWED_EXTENSIONS:
                files.append(p)
        for f in folders:
            self._import_folder_threaded(f)
        if files:
            self._import_files_threaded(files)

    def _import_folder_threaded(self, folder: Path):
        """Walk a folder tree and import every supported file one-by-one."""
        self._blink_data_start("Importing folder...")
        win = ctk.CTkToplevel(self.root)
        win.title("Importing folder...")
        win.geometry("420x160")
        win.transient(self.root)
        x = self.root.winfo_x() + self.root.winfo_width() // 2 - 210
        y = self.root.winfo_y() + self.root.winfo_height() // 2 - 80
        win.geometry(f"+{x}+{y}")

        ctk.CTkLabel(win, text=f"Importing folder: {folder.name}",
            font=("Times New Roman", 13, "bold")).pack(pady=(8, 2))
        status = ctk.CTkLabel(win, text="Counting files...",
            font=("Times New Roman", 11), text_color="#8b8fa3")
        status.pack()
        prog = ctk.CTkProgressBar(win, width=360, height=8)
        prog.pack(pady=6)
        prog.set(0)
        file_label = ctk.CTkLabel(win, text="", font=("Times New Roman", 9), text_color="#6c5ce7")
        file_label.pack()

        def cleanup(results_count):
            win.destroy()
            self._blink_data_stop(
                f"{results_count} files" if results_count else "Error")
            gc.collect()
            self.refresh_ui()

        def worker():
            try:
                def progress_cb(current, total, name):
                    if total == 0:
                        return
                    pct = current / total
                    self.root.after(0, lambda: [
                        prog.set(pct),
                        file_label.configure(text=f"{name[:55]}"),
                        status.configure(text=f"Importing {current} / {total} files"),
                    ])

                results = self.engine.ingest_data_folder(folder, progress_cb=progress_cb)
                n = len(results)
                self.root.after(0, lambda r=n: [
                    prog.set(1),
                    status.configure(text=f"Imported {r} file{'s' if r != 1 else ''}"),
                    file_label.configure(text=""),
                    win.after(800, lambda: cleanup(r)),
                ])
            except Exception as e:
                self.root.after(0, lambda: [
                    status.configure(text=f"Error: {e}"),
                    self.toast(f"Folder import failed: {e}", "error"),
                    win.after(1500, lambda: cleanup(0)),
                ])

        threading.Thread(target=worker, daemon=True).start()

    def _import_files_threaded(self, paths: list):
        """Import multiple files in a background thread with progress UI."""
        if not paths:
            return
        # Warn if memory is already high
        current_count = len(self.engine.files)
        if current_count > 3000:
            self.toast(f"⚠ Already {current_count} files loaded — watch RAM", "warning")
        elif current_count + len(paths) > 5000:
            proceed = messagebox.askokcancel(
                "High Memory Warning",
                f"You already have {current_count} files loaded.\n"
                f"Adding {len(paths)} more may use significant RAM.\n\n"
                "Consider using smaller batches. Continue?")
            if not proceed:
                return
        self._blink_data_start("Importing...")
        win = ctk.CTkToplevel(self.root)
        win.title("Importing files...")
        win.geometry("400x120")
        win.transient(self.root)
        x = self.root.winfo_x() + self.root.winfo_width() // 2 - 200
        y = self.root.winfo_y() + self.root.winfo_height() // 2 - 60
        win.geometry(f"+{x}+{y}")

        ctk.CTkLabel(win, text="Importing files...",
            font=("Times New Roman", 13, "bold")).pack(pady=(8, 2))
        status = ctk.CTkLabel(win, text="",
            font=("Times New Roman", 11), text_color="#8b8fa3")
        status.pack()
        prog = ctk.CTkProgressBar(win, width=360, height=8)
        prog.pack(pady=8)
        prog.set(0)
        file_label = ctk.CTkLabel(win, text="", font=("Times New Roman", 9),
            text_color="#6c5ce7")
        file_label.pack()

        def cleanup(results_or_none):
            win.destroy()
            self._blink_data_stop(
                f"{results_or_none} files" if results_or_none else "Error")
            gc.collect()
            self.refresh_ui()

        def worker():
            try:
                n = len(paths)
                self.root.after(0, lambda: [
                    status.configure(text=f"Importing 0 / {n} files"),
                    prog.configure(mode="determinate"),
                    prog.set(0),
                ])

                _last = [0]
                def progress_cb(current, total, name):
                    if total == 0:
                        return
                    pct = current / total
                    self.root.after(0, lambda: [
                        prog.set(pct),
                        file_label.configure(text=f"{name[:55]}"),
                        status.configure(text=f"Importing {current} / {total} files"),
                    ])

                results = self.engine.ingest_files_batch(paths, progress_cb=progress_cb)
                self.root.after(0, lambda r=len(results): [
                    prog.set(1),
                    status.configure(text=f"Imported {r} file{'s' if r != 1 else ''}"),
                    file_label.configure(text=""),
                    win.after(800, lambda: cleanup(r)),
                ])
            except Exception as e:
                self.root.after(0, lambda: [
                    status.configure(text=f"Error: {e}"),
                    self.toast(f"Import failed: {e}", "error"),
                    win.after(1500, lambda: cleanup(None)),
                ])

        threading.Thread(target=worker, daemon=True).start()

    def open_app_folder(self):
        import subprocess, platform
        path = os.path.dirname(os.path.abspath(__file__))
        try:
            if platform.system() == "Windows":
                os.startfile(path)
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
        except Exception as e:
            self.toast(f"Could not open folder: {e}", "error")

    # ─── Settings dialog ──────────────────────────────────────────────────

    def open_settings(self):
        s = self.engine.settings
        hw = self.engine.cpu_info()
        gpus = self.engine.detect_gpus()

        win = ctk.CTkToplevel(self.root)
        win.title("Training Settings")
        win.geometry("520x400")
        win.transient(self.root)
        win.update_idletasks()
        try:
            win.grab_set()
        except Exception:
            pass
        x = self.root.winfo_x() + self.root.winfo_width() // 2 - 260
        y = self.root.winfo_y() + self.root.winfo_height() // 2 - 200
        win.geometry(f"+{x}+{y}")

        ctk.CTkLabel(win, text="Resource Allocation",
            font=("Times New Roman", 16, "bold")).pack(pady=(12, 4))

        # GPU
        gpu_frame = ctk.CTkFrame(win)
        gpu_frame.pack(fill="x", padx=20, pady=8)
        ctk.CTkLabel(gpu_frame, text="GPU Devices",
            font=("Times New Roman", 12, "bold")).pack(anchor="w", pady=(4, 2))

        gpu_vars = {}
        if gpus:
            selected_gpus = s.get("gpu_devices", [])
            if not selected_gpus:
                selected_gpus = [g["index"] for g in gpus]
            for g in gpus:
                var = ctk.BooleanVar(value=g["index"] in selected_gpus)
                cb = ctk.CTkCheckBox(gpu_frame, text=f"GPU {g['index']}: {g['name']} ({g['vram_gb']} GB)",
                    variable=var, font=("Times New Roman", 11))
                cb.pack(anchor="w", padx=10, pady=1)
                gpu_vars[g["index"]] = var
            cpu_var = ctk.BooleanVar(value="cpu" in s.get("gpu_devices", []))
            ctk.CTkCheckBox(gpu_frame, text="CPU (fallback)", variable=cpu_var,
                font=("Times New Roman", 11)).pack(anchor="w", padx=10, pady=1)
        else:
            ctk.CTkLabel(gpu_frame, text="No GPU detected",
                font=("Times New Roman", 11), text_color="#e17055").pack(anchor="w", padx=10)
            cpu_var = ctk.BooleanVar(value=True)
            ctk.CTkCheckBox(gpu_frame, text="CPU only", variable=cpu_var,
                font=("Times New Roman", 11)).pack(anchor="w", padx=10)

        # Buttons
        btn_frame = ctk.CTkFrame(win, fg_color="transparent")
        btn_frame.pack(fill="x", padx=20, pady=(12, 16))
        ctk.CTkButton(btn_frame, text="Cancel", fg_color="#2d3148",
            command=win.destroy).pack(side="left", padx=2)
        ctk.CTkButton(btn_frame, text="Save", fg_color="#6c5ce7",
            command=lambda: self._save_settings(win,
                gpu_vars if gpus else {}, cpu_var if not gpus else None)
        ).pack(side="right", padx=2)

    def _save_settings(self, win, gpu_vars, cpu_fallback_var):
        devices = [idx for idx, var in gpu_vars.items() if var.get()]
        if cpu_fallback_var is not None and cpu_fallback_var.get():
            devices.append("cpu")
        elif not gpu_vars and (cpu_fallback_var is None or cpu_fallback_var.get()):
            devices.append("cpu")
        self.engine.settings["gpu_devices"] = devices
        self.engine.save_metadata()
        self.toast("Settings saved", "success")
        win.destroy()

    def _scan_model_folder_threaded(self, folder: Path):
        self._blink_model_start("Loading...")
        win = ctk.CTkToplevel(self.root)
        win.title("Scanning model folder...")
        win.geometry("360x100")
        win.transient(self.root)
        x = self.root.winfo_x() + self.root.winfo_width() // 2 - 180
        y = self.root.winfo_y() + self.root.winfo_height() // 2 - 50
        win.geometry(f"+{x}+{y}")

        status = ctk.CTkLabel(win, text=f"Scanning model folder...",
            font=("Times New Roman", 13, "bold"))
        status.pack(pady=(12, 4))
        lbl = ctk.CTkLabel(win, text="Searching for model files in subfolders...",
            font=("Times New Roman", 11), text_color="#8b8fa3")
        lbl.pack()

        def scan():
            r = self.engine.ingest_model_folder(folder)
            self.root.after(0, lambda: [
                self._blink_model_stop(f"Loaded ({r['file_count']} files, {r['size_gb']} GB)" if r else "Failed"),
                self.refresh_ui(),
                win.destroy(),
            ])

        threading.Thread(target=scan, daemon=True).start()

    def browse_models(self):
        location = self._pick_drive_or_path("Select drive for model files")
        if not location: return
        paths = filedialog.askopenfilenames(title="Select model files (or cancel to pick a model folder)",
            initialdir=location,
            filetypes=[("Model files", " ".join(f"*{e}" for e in MODEL_EXTENSIONS)),
                       ("All files", "*.*")])
        if paths:
            for fp in paths:
                p = Path(fp)
                if p.suffix.lower() in MODEL_EXTENSIONS:
                    r = self.engine.ingest_model_file(p)
                    if r: self.toast(f"Loaded: {r['name']}", "success")
            return
        path = filedialog.askdirectory(title="Select model folder to scan for LLM files",
            initialdir=location)
        if path:
            self._scan_model_folder_threaded(Path(path))

    def upload_models(self):
        location = self._pick_drive_or_path("Select drive for model files")
        if not location: return
        path = filedialog.askdirectory(title="Select LLM model folder (or cancel for single file)",
            initialdir=location)
        if path:
            p = Path(path)
            if p.is_dir():
                self._scan_model_folder_threaded(p)
                return
        paths = filedialog.askopenfilenames(title="Select LLM model files",
            initialdir=location,
            filetypes=[("Model files", " ".join(f"*{e}" for e in MODEL_EXTENSIONS)),
                       ("All files", "*.*")])
        for p in paths:
            r = self.engine.ingest_model_file(Path(p))
            if r: self.toast(f"Loaded model: {r['name']}", "success")

    def on_drop_model(self, event):
        self._ignore_clicks = True
        self.root.after(500, lambda: setattr(self, '_ignore_clicks', False))
        items = self.root.tk.splitlist(event.data)
        for item in items:
            p = Path(item)
            if p.is_dir():
                self._scan_model_folder_threaded(p)
            elif p.suffix.lower() in MODEL_EXTENSIONS:
                r = self.engine.ingest_model_file(p)
                if r: self.toast(f"Loaded model: {r['name']}", "success")

    def _on_queue_drop(self, event):
        raw = event.data
        if not raw:
            return
        # DND_TEXT passes raw text; trim braces/quotes from tkinterdnd2 wrapping
        fid = raw.strip("{} '\"")
        if fid and fid in self.engine.files:
            self.engine.queue_add(file_id=fid)
            self.refresh_ui()
            self.toast("Added to queue", "success")

    def filter_files(self, *_):
        self._render_files()

    def _toggle_select(self, fid):
        if fid in self.selected_files:
            self.selected_files.discard(fid)
        else:
            self.selected_files.add(fid)
        self._render_files()

    def _queue_selected(self):
        for fid in list(self.selected_files):
            self.engine.queue_add(file_id=fid)
        n = len(self.selected_files)
        self.selected_files.clear()
        self.refresh_ui()
        self.toast(f"Queued {n} file{'s' if n!=1 else ''}", "success")

    def _remove_selected_from_queue(self):
        for fid in list(self.selected_files):
            self.engine.queue_remove(fid)
        n = len(self.selected_files)
        self.selected_files.clear()
        self.refresh_ui()
        self.toast(f"Removed {n} file{'s' if n!=1 else ''} from queue", "info")

    def _render_files(self):
        for w in self.file_list_frame.winfo_children():
            w.destroy()

        tab = self.tab_var.get().lower()
        search = self.search_var.get().lower()

        # Use SQLite-backed query — streams file metadata from disk, no full RAM load
        category_map = {"all": None, "ready": "Ready for Training",
                        "review": "Needs Review", "bad": "Unusable"}
        cat_filter = category_map.get(tab)
        files = self.engine.files.query(
            category=cat_filter,
            search=search if search else None,
            limit=200)  # was 1000 — fewer files = less scrolling

        # Batch action bar when items are selected
        sel = [f for f in files if f["id"] in self.selected_files]
        if sel:
            batch = ctk.CTkFrame(self.file_list_frame, fg_color="#1e2235", corner_radius=4)
            batch.pack(fill="x", pady=(0, 4), padx=2)
            ctk.CTkLabel(batch, text=f"{len(sel)} selected",
                font=("Times New Roman", 12), text_color="#6c5ce7").pack(side="left", padx=6)
            any_in_queue = any(f["in_queue"] for f in sel)
            if any_in_queue:
                ctk.CTkButton(batch, text="\u2716 Remove selected from queue",
                    font=("Times New Roman", 11), fg_color="#2d3148", hover_color="#e17055",
                    width=180, height=22, command=self._remove_selected_from_queue
                ).pack(side="right", padx=2)
            else:
                ctk.CTkButton(batch, text="\u2795 Queue selected",
                    font=("Times New Roman", 11), fg_color="#6c5ce7", hover_color="#7c6df7",
                    width=140, height=22, command=self._queue_selected
                ).pack(side="right", padx=2)
            ctk.CTkButton(batch, text="\u2716 Clear selection",
                font=("Times New Roman", 11), fg_color="#2d3148", hover_color="#5a5d70",
                width=110, height=22, command=lambda: [self.selected_files.clear(), self._render_files()]
            ).pack(side="right", padx=2)

        import tkinter as tk

        for f in files:
            cat_colors = {"Ready for Training": "#00cec9", "Needs Review": "#fdcb6e", "Unusable": "#e17055"}
            color = cat_colors.get(f["category"], "#8b8fa3")
            icon = {"txt":"\U0001f4c4", "jsonl":"\U0001f4cb", "pdf":"\U0001f4d5", "csv":"\U0001f4ca", "md":"\U0001f4dd", "json":"\U0001f4e6"}
            ic = icon.get(f["name"].split(".")[-1].lower(), "\U0001f4c4")

            is_sel = f["id"] in self.selected_files
            bg = "#2d3148" if is_sel else "#232738"
            frame = tk.Frame(self.file_list_frame, bg=bg, highlightbackground="#2d3148",
                highlightthickness=1, padx=4, pady=2, cursor="fleur")
            frame.pack(fill="x", pady=1, padx=2)
            frame.file_id = f["id"]
            frame.bind("<Button-1>", lambda e, fid=f["id"]: self._toggle_select(fid), add="+")
            # Register as drag source — pass file_id as DND_TEXT
            try:
                frame.drag_source_register(typ="DND_TEXT")
                frame.dnd_bind("<<DragInitCmd>>", lambda e, fid=f["id"]: e.data or fid)
            except Exception:
                pass

            row = tk.Frame(frame, bg=bg)
            row.pack(fill="x")
            row.grid_columnconfigure(0, weight=0)
            row.grid_columnconfigure(1, weight=1)
            row.grid_columnconfigure(2, weight=0)

            # Drag handle icon
            handle = tk.Label(row, text="⠿", font=("Times New Roman", 12),
                fg="#5a5d70", bg=bg, cursor="fleur")
            handle.grid(row=0, column=0, padx=(0, 4), rowspan=2)
            handle.bind("<Button-1>", lambda e, fid=f["id"]: [None])
            try:
                handle.drag_source_register(typ="DND_TEXT")
                handle.dnd_bind("<<DragInitCmd>>", lambda e, fid=f["id"]: fid)
            except Exception:
                pass

            tk.Label(row, text=ic, font=("Times New Roman", 15), bg=bg, fg="#e1e4ec"
                ).grid(row=0, column=1, padx=(0,4), sticky="w")
            name_lbl = tk.Label(row, text=f["name"], font=("Times New Roman", 13),
                anchor="w", cursor="hand2", bg=bg, fg="#e1e4ec")
            name_lbl.grid(row=0, column=2, sticky="w")
            name_lbl.bind("<Button-1>", lambda e, fid=f["id"]: self.open_editor(fid))

            cat_lbl = tk.Label(row, text=f["category"][:5], font=("Times New Roman", 11),
                fg=color, bg=bg)
            cat_lbl.grid(row=0, column=3, padx=2)

            themes = f.get("themes", [])
            themes_text = ", ".join(themes[:2]) if themes else ""
            meta = f"{(f['size']/1024):.1f} KB" + (f"  |  {themes_text}" if themes_text else "")
            tk.Label(row, text=meta, font=("Times New Roman", 10), fg="#8b8fa3",
                anchor="w", bg=bg).grid(row=1, column=2, sticky="w")

            # Queue / remove / delete buttons (compact — was synopsis row here)
            btn_row = ctk.CTkFrame(frame, fg_color="transparent")
            btn_row.pack(fill="x", padx=4, pady=(0, 1))
            if f["in_queue"]:
                ctk.CTkButton(btn_row, text="\u2716 Remove from queue", font=("Times New Roman", 11),
                    fg_color="#2d3148", hover_color="#e17055", width=140, height=20,
                    command=lambda fid=f["id"]: [self.engine.queue_remove(fid), self.refresh_ui()]
                ).pack(side="left", padx=2)
            else:
                ctk.CTkButton(btn_row, text="\u2795 Queue", font=("Times New Roman", 11),
                    fg_color="#2d3148", hover_color="#6c5ce7", width=80, height=20,
                    command=lambda fid=f["id"]: [self.engine.queue_add(file_id=fid), self.refresh_ui()]
                ).pack(side="left", padx=2)
            ctk.CTkButton(btn_row, text="\u2716 Delete", font=("Times New Roman", 11),
                fg_color="#2d3148", hover_color="#d63031", width=70, height=20,
                command=lambda fid=f["id"], name=f.get("name",""): [
                    messagebox.askyesno("Delete", f"Permanently delete '{name}'?") and
                    (self.engine.delete_file(fid), self.refresh_ui())
                ]
            ).pack(side="right", padx=2)

        if not files:
            ctk.CTkLabel(self.file_list_frame, text="No files", text_color="#8b8fa3",
                font=("Times New Roman", 13)).pack(pady=20)

        # No mouse wheel binding needed — CTkScrollableFrame handles it natively.
        # The old bind_all() approach accumulated stale global bindings that
        # crashed with TclError when widgets were destroyed mid-callback.

    def _render_models(self):
        for w in self.model_list_frame.winfo_children():
            w.destroy()
        for m in self.engine.models.values():
            frame = ctk.CTkFrame(self.model_list_frame, fg_color="#232738", corner_radius=4)
            frame.pack(fill="x", pady=1, padx=2)
            row = ctk.CTkFrame(frame, fg_color="transparent")
            row.pack(fill="x", padx=4, pady=2)
            icon = "\U0001f4c1" if m.get("is_folder") else "\U0001f4c4"
            extra = f"  ({m['file_count']} files)" if m.get("is_folder") else f"  ({m.get('format','?')})"
            ctk.CTkLabel(row, text=f"{icon}  {m['name']}{extra}", font=("Times New Roman", 13)).pack(side="left")
            ctk.CTkLabel(row, text=f"{m.get('size_gb','?')} GB", font=("Times New Roman", 11),
                text_color="#8b8fa3").pack(side="right", padx=4)

    def _render_experiments(self):
        for w in self.exp_list_frame.winfo_children():
            w.destroy()
        exps = sorted(self.engine.experiments.values(), key=lambda x: x["timestamp"], reverse=True)
        for e in exps:
            acc = e["metrics_snapshot"].get("accuracy", 0)
            loss = e["metrics_snapshot"].get("loss", 0)
            frame = ctk.CTkFrame(self.exp_list_frame, fg_color="#232738", corner_radius=4)
            frame.pack(fill="x", pady=1, padx=2)
            frame.bind("<Button-1>", lambda _, eid=e["id"]: self.show_experiment(eid))
            ctk.CTkLabel(frame, text=f"Run {e['id']}  acc:{acc:.1f}% loss:{loss:.4f}",
                font=("Times New Roman", 11)).pack(anchor="w", padx=4, pady=2)

    def open_editor(self, file_id):
        content = self.engine.get_file_content(file_id)
        fd = self.engine.files.get(file_id, {})
        win = ctk.CTkToplevel(self.root)
        win.title(f"Edit: {fd.get('name','')}")
        win.geometry("700x500")
        win.transient(self.root)
        win.grab_set()

        ctk.CTkLabel(win, text=f"Editing: {fd.get('name','')}", font=("Times New Roman", 14, "bold")).pack(padx=10, pady=5)

        textbox = ctk.CTkTextbox(win, wrap="none", font=("Times New Roman", 13))
        textbox.pack(fill="both", expand=True, padx=10, pady=5)
        textbox.insert("1.0", content)

        info = ctk.CTkLabel(win, text=f"Themes: {', '.join(fd.get('themes',[]))} | "
            f"{fd.get('category','')}", font=("Times New Roman", 11), text_color="#8b8fa3")
        info.pack(padx=10, pady=(0,5))

        def save():
            new_content = textbox.get("1.0", "end-1c")
            self.engine.update_file_content(file_id, new_content)
            win.destroy()
            self.refresh_ui()

        btn_frame = ctk.CTkFrame(win, fg_color="transparent")
        btn_frame.pack(fill="x", padx=10, pady=5)
        ctk.CTkButton(btn_frame, text="Cancel", fg_color="#2d3148", command=win.destroy).pack(side="left", padx=2)
        ctk.CTkButton(btn_frame, text="\u2713 Save", fg_color="#6c5ce7", command=save).pack(side="right", padx=2)

    def show_experiment(self, exp_id):
        exp = self.engine.experiments.get(exp_id)
        if not exp: return
        history = exp.get("history", [])
        if not history: return
        steps = [h["step"] for h in history]
        losses = [h["loss"] for h in history]
        accs = [h["accuracy"] for h in history]

        win = ctk.CTkToplevel(self.root)
        win.title(f"Experiment: Run {exp_id}")
        win.geometry("600x400")
        win.transient(self.root)

        fig = Figure(figsize=(6, 3.2), dpi=90, facecolor="#1a1d27")
        ax1 = fig.add_subplot(121, facecolor="#232738")
        ax2 = fig.add_subplot(122, facecolor="#232738")
        for ax in [ax1, ax2]:
            ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
            ax.spines["left"].set_color("#2d3148"); ax.spines["bottom"].set_color("#2d3148")
            ax.tick_params(colors="#8b8fa3", labelsize=8)
        ax1.plot(steps, losses, color="#e17055", linewidth=1.5)
        ax1.set_title("Loss", color="#e17055", fontsize=10)
        ax2.plot(steps, accs, color="#fdcb6e", linewidth=1.5)
        ax2.set_title("Accuracy", color="#fdcb6e", fontsize=10)
        fig.tight_layout(pad=2)

        canvas = FigureCanvasTkAgg(fig, master=win)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True, padx=10, pady=10)

        ms = exp.get("metrics_snapshot", {})
        ctk.CTkLabel(win, text=f"Final: Acc={ms.get('accuracy',0):.1f}%  Loss={ms.get('loss',0):.4f}  "
            f"Params={ms.get('parameters',0):,}  Tokens={ms.get('tokens_processed',0):,}",
            font=("Times New Roman", 12), text_color="#8b8fa3").pack()

    # ─── Training ─────────────────────────────────────────────────────────

    def start_training(self):
        try:
            epochs = int(self.epoch_var.get())
        except:
            epochs = 3
        try:
            batch = int(self.batch_var.get())
        except:
            batch = 1
        try:
            lr = float(self.lr_var.get())
        except:
            lr = 0.001
        try:
            grad_accum = int(self.grad_accum_var.get())
        except:
            grad_accum = 4
        raw = self.model_var.get()
        use_ollama = raw.startswith("ollama/")
        model_name = raw.split("/", 1)[1] if "/" in raw else raw
        config = {"epochs": epochs, "batch_size": batch, "learning_rate": lr,
                  "model_name": model_name, "use_ollama": use_ollama,
                  "gradient_accumulation_steps": grad_accum, "max_length": 1024,
                  "use_mixed_precision": True,
                  "cpu_cores": self.engine.settings.get("cpu_cores", os.cpu_count() or 1),
                  "ram_percent": self.engine.settings.get("ram_percent", 50),
                  "gpu_devices": list(self.engine.settings.get("gpu_devices", []))}

        # ── Remote: hand the job to the agent box instead of training here ──
        if self.use_agent_var.get() and self.agent_url_var.get().strip():
            self._start_remote_training(config)
            return

        # ── MindSpace-specific config ──
        if model_name == "mindspace-rnn":
            try:
                config["embed_dim"] = int(self.embed_dim_var.get())
            except:
                config["embed_dim"] = 64
            try:
                config["hidden_dim"] = int(self.hidden_dim_var.get())
            except:
                config["hidden_dim"] = 128
            try:
                config["num_layers"] = int(self.num_layers_var.get())
            except:
                config["num_layers"] = 2
            try:
                config["dropout"] = float(self.dropout_var.get())
            except:
                config["dropout"] = 0.2
            try:
                config["max_seq_len"] = int(self.seq_len_var.get())
            except:
                config["max_seq_len"] = 128

        # ── RAG config (passed through engine settings) ──
        config["rag_enabled"] = self.engine.settings.get("rag_enabled", False)
        config["rag_top_k"] = self.engine.settings.get("rag_top_k", 5)
        config["rag_chunk_size"] = self.engine.settings.get("rag_chunk_size", 512)
        config["rag_chunk_overlap"] = self.engine.settings.get("rag_chunk_overlap", 128)
        config["rag_embedding_model"] = self.engine.settings.get("rag_embedding_model", "all-MiniLM-L6-v2")

        ok, msg = self.engine.start_training(config)
        if ok:
            self.start_btn.configure(state="disabled")
            self.pause_btn.configure(state="normal", text="\u275a\u275a Pause")
            self.kill_btn.configure(state="normal")
        else:
            messagebox.showwarning("Training", msg)

    def toggle_pause(self):
        if self.engine.training_paused:
            self.engine.resume_training()
            self.pause_btn.configure(text="\u275a\u275a Pause")
        else:
            self.engine.pause_training()
            self.pause_btn.configure(text="\u25b6 Resume")

    def kill_training(self):
        self.engine.stop_training()
        self.start_btn.configure(state="normal")
        self.pause_btn.configure(state="disabled", text="\u275a\u275a Pause")

    def reset_training(self):
        self.engine.reset_training()
        gc.collect()
        self.start_btn.configure(state="normal")
        self.pause_btn.configure(state="disabled", text="\u275a\u275a Pause")
        self.loss_line.set_data([], [])
        self.acc_line.set_data([], [])
        self.improv_line.set_data([], [])
        self.improv_label.configure(text="Improvement: 0%")
        self.ax_loss.cla(); self.ax_acc.cla(); self.ax_improv.cla()
        self._chart_initialized = False
        self.canvas.draw_idle()

    def export_data(self):
        try:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            json_str = self.engine.export_json()
            p1 = Path.home() / f"training_metrics_{ts}.json"
            p1.write_text(json_str)
            csv_str = self.engine.export_csv()
            p2 = Path.home() / f"training_history_{ts}.csv"
            p2.write_text(csv_str)
            messagebox.showinfo("Export", f"Exported to:\n{p1}\n{p2}")
        except Exception as e:
            messagebox.showerror("Export", str(e))

    def compile_model_desktop(self):
        """Open compile dialog for desktop app.
        Supports both HF models and MindSpace Transformer.
        """
        model_id = self.compile_model_var.get()
        fmt = self.compile_format_var.get()
        quant = self.compile_quant_var.get() if fmt == "gguf" else None

        # ── MindSpace Transformer compile (special path) ──
        if fmt == "mindspace-transformer" or model_id == "mindspace-transformer":
            self._compile_mindspace_transformer_desktop()
            return

        win = ctk.CTkToplevel(self.root)
        win.title("Compile Model")
        win.geometry("440x200")
        win.transient(self.root)

        format_label = self.engine.COMPILE_FORMATS.get(fmt, {}).get("name", fmt.upper())
        ctk.CTkLabel(win, text=f"Compiling to {format_label}...",
            font=("Times New Roman", 14, "bold")).pack(pady=(12, 4))
        ctk.CTkLabel(win, text=f"Model: {model_id}", font=("Times New Roman", 11),
            text_color="#8b8fa3").pack()
        if quant:
            ctk.CTkLabel(win, text=f"Quantization: {quant}", font=("Times New Roman", 11),
                text_color="#8b8fa3").pack()

        prog = ctk.CTkProgressBar(win, width=380, height=8)
        prog.pack(pady=10)
        prog.set(0)
        status = ctk.CTkLabel(win, text="Starting...",
            font=("Times New Roman", 11), text_color="#8b8fa3")
        status.pack()
        result_frame = ctk.CTkFrame(win, fg_color="transparent")
        result_frame.pack(pady=8)

        def cb(pct, msg):
            self.root.after(0, lambda: [prog.set(pct), status.configure(text=msg)])

        def worker():
            r = self.engine.compile_model(
                model_id=model_id, output_format=fmt, quantization=quant, progress_cb=cb)
            self.root.after(0, lambda: self._compile_result(win, r, fmt, result_frame))

        threading.Thread(target=worker, daemon=True).start()

    def _compile_mindspace_transformer_desktop(self):
        """Compile MindSpace Transformer model (separate flow from standard models).
        Uses the dedicated Transformer compile pipeline that produces the full
        inference bundle (compiled_model.pt, bpe_tokenizer, inference.py, info.json).
        """
        from pathlib import Path
        from datetime import datetime

        win = ctk.CTkToplevel(self.root)
        win.title("Compile MindSpace Transformer")
        win.geometry("480x240")
        win.transient(self.root)

        ctk.CTkLabel(win, text="Compiling MindSpace Transformer to TorchScript...",
            font=("Times New Roman", 14, "bold")).pack(pady=(12, 4))
        ctk.CTkLabel(win, text="This will export a self-contained inference bundle",
            font=("Times New Roman", 11), text_color="#8b8fa3").pack()
        ctk.CTkLabel(win, text="(compiled_model.pt + BPE tokenizer + inference.py)",
            font=("Times New Roman", 11), text_color="#8b8fa3").pack()

        prog = ctk.CTkProgressBar(win, width=400, height=8)
        prog.pack(pady=12)
        prog.set(0)
        status = ctk.CTkLabel(win, text="Preparing...",
            font=("Times New Roman", 11), text_color="#8b8fa3")
        status.pack()
        result_frame = ctk.CTkFrame(win, fg_color="transparent")
        result_frame.pack(pady=6)

        def cb(pct, msg):
            self.root.after(0, lambda: [prog.set(pct), status.configure(text=msg)])

        def worker():
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_dir = EXPORTS_DIR / f"mindspace-transformer-compiled-{timestamp}"

            r = self.engine.compile_mindspace_transformer(
                output_dir=output_dir, progress_cb=cb)
            self.root.after(0, lambda: self._compile_result(win, r, "mindspace-transformer", result_frame))

        threading.Thread(target=worker, daemon=True).start()

    def _compile_result(self, win, result, fmt, result_frame):
        if result.get("success"):
            for w in win.winfo_children():
                if isinstance(w, (ctk.CTkButton,)): continue
            ctk.CTkLabel(result_frame, text=f"Complete: {result.get('output_name', '')}",
                font=("Times New Roman", 13, "bold"), text_color="#00cec9").pack()
            ctk.CTkLabel(result_frame, text=f"Size: {result.get('size_bytes', 0) / 1024:.1f} KB",
                font=("Times New Roman", 11), text_color="#8b8fa3").pack()
            self._compiled_file = result
            self.compile_dl_btn.configure(state="normal", text=f"\u2913 Download {result.get('output_name', '')[:20]}...")
            ctk.CTkButton(win, text="OK", fg_color="#6c5ce7", command=win.destroy,
                width=100).pack(pady=8)
        else:
            ctk.CTkLabel(result_frame, text=f"Error: {result.get('error', 'Unknown')}",
                font=("Times New Roman", 12), text_color="#e17055").pack()
            ctk.CTkButton(win, text="Close", fg_color="#2d3148",
                command=win.destroy, width=100).pack(pady=8)

    def download_compiled_model(self):
        from tkinter import filedialog
        if not self._compiled_file:
            self.toast("No compiled model available", "warning")
            return
        src = Path(self._compiled_file["output_path"])
        if not src.exists():
            self.toast("Compiled file not found", "error")
            return
        dst = filedialog.asksaveasfilename(
            title="Save compiled model",
            initialfile=self._compiled_file.get("output_name", "model.pt"),
            defaultextension=src.suffix)
        if dst:
            import shutil
            shutil.copy2(src, dst)
            self.toast(f"Saved to {dst}", "success")

    def _show_training_summary(self, s: dict):
        win = ctk.CTkToplevel(self.root)
        win.title("Training Complete")
        win.geometry("480x340")
        win.transient(self.root)
        win.grab_set()
        x = self.root.winfo_x() + self.root.winfo_width() // 2 - 240
        y = self.root.winfo_y() + self.root.winfo_height() // 2 - 170
        win.geometry(f"+{x}+{y}")

        ctk.CTkLabel(win, text="Training Summary",
            font=("Times New Roman", 18, "bold")).pack(pady=(14, 4))

        frame = ctk.CTkFrame(win, fg_color="transparent")
        frame.pack(fill="both", expand=True, padx=20)

        def row(label, val, color="#8b8fa3"):
            r = ctk.CTkFrame(frame, fg_color="transparent")
            r.pack(fill="x", pady=2)
            ctk.CTkLabel(r, text=label, font=("Times New Roman", 13),
                text_color="#8b8fa3").pack(side="left")
            ctk.CTkLabel(r, text=val, font=("Times New Roman", 13, "bold"),
                text_color=color).pack(side="right")

        status_color = "#00cec9" if s["status"] == "completed" else "#e17055"
        row("Status", s["status"].title(), status_color)
        row("Steps Completed", str(s["steps_completed"]), "#74b9ff")
        row("Epochs Completed", str(s["epochs_completed"]), "#74b9ff")

        # Spacer
        ctk.CTkLabel(frame, text="", font=("Times New Roman", 6)).pack()

        ctk.CTkLabel(frame, text="Loss", font=("Times New Roman", 12, "bold"),
            text_color="#e17055").pack(anchor="w")
        row(f"  Before: {s['pre_loss']}  \u2192  After: {s['post_loss']}",
            f"{s['loss_delta']:+.4f}  ({s['loss_pct']:+.1f}%)",
            "#e17055" if s["loss_delta"] > 0 else "#fdcb6e")

        ctk.CTkLabel(frame, text="Accuracy", font=("Times New Roman", 12, "bold"),
            text_color="#fdcb6e").pack(anchor="w")
        row(f"  Before: {s['pre_accuracy']}%  \u2192  After: {s['post_accuracy']}%",
            f"{s['acc_delta']:+.2f}%",
            "#00cec9" if s["acc_delta"] > 0 else "#e17055")

        ctk.CTkLabel(frame, text="", font=("Times New Roman", 6)).pack()
        row("Parameters", f"{s['pre_params']:,}  \u2192  {s['post_params']:,}", "#8b8fa3")
        row("Tokens Processed", f"{s['tokens_processed']:,}", "#00cec9")

        ctk.CTkButton(win, text="OK", fg_color="#6c5ce7",
            hover_color="#7c6df7", command=win.destroy,
            width=120).pack(pady=(10, 14))

    def clear_all_data(self):
        if self.engine.training_active:
            messagebox.showwarning("Training Active", "Stop training first before clearing data.")
            return
        ans = messagebox.askyesno(
            "Clear All Training Data",
            "This will permanently delete:\n"
            "\u2022 All uploaded files and datasets\n"
            "\u2022 All loaded models\n"
            "\u2022 The training queue\n"
            "\u2022 Training history and metrics\n"
            "\u2022 All saved experiments\n\n"
            "This cannot be undone. Continue?",
            icon="warning")
        if ans:
            self.engine.clear_training_data()
            self.refresh_ui()
            messagebox.showinfo("Cleared", "All training data has been cleared.")

    def clear_experiments(self):
        self.engine.experiments.clear()
        self.engine.save_metadata()
        self.refresh_ui()

    def recategorize(self):
        self.engine.recategorize_all()
        self.refresh_ui()
        messagebox.showinfo("Rescan", "All files re-scanned and re-categorized.")

    # ─── Ollama ──────────────────────────────────────────────────────────

    def poll_ollama(self):
        def _check():
            info = self.engine.check_ollama()
            self.root.after(0, lambda: [setattr(self, '_ollama_info', info), self._rebuild_model_dropdown()])
        threading.Thread(target=_check, daemon=True).start()

    # ─── Memory Cleanup ───────────────────────────────────────────────────

    def _memory_cleanup_timer(self):
        """Periodic memory cleanup — runs every 30 seconds (was 60).
        Triggers eviction at lower thresholds for tighter RAM control."""
        try:
            import psutil
            ram_pct = psutil.virtual_memory().percent
            if ram_pct > 55:  # was 75 — trigger earlier
                self.engine._evict_old_previews()
                gc.collect()
            elif ram_pct > 40 and len(self.engine.files) > 300:
                # Moderate pressure — evict but skip full GC
                self.engine._evict_old_previews()
        except Exception:
            pass
        try:
            import ctypes
            libc = ctypes.CDLL("libc.so.6", use_errno=True)
            libc.malloc_trim(0)
        except Exception:
            pass
        self.root.after(30000, self._memory_cleanup_timer)

    # ─── Resource Monitor ─────────────────────────────────────────────────

    def _poll_resources(self):
        def _fetch():
            try:
                stats = self.engine.get_resource_stats(
                    training_active=self.engine.training_status == "running")
                self.root.after(0, lambda: self._update_resource_display(stats))
                self._check_memory_pressure(stats)
            except Exception:
                pass
        threading.Thread(target=_fetch, daemon=True).start()
        # Longer poll intervals = less CPU time = less heap churn = better swap
        # When idle, poll every 30s; when training, poll every 10s
        interval = 10000 if self.engine.training_status == "running" else 30000
        self.root.after(interval, self._poll_resources)

    _last_mem_warning = 0
    def _check_memory_pressure(self, stats):
        cpu = stats.get("cpu", {})
        ram_pct = cpu.get("ram_percent", 0)
        now = time.time()
        if ram_pct > 90 and now - self._last_mem_warning > 30:
            self._last_mem_warning = now
            self.root.after(0, lambda: self.toast(
                f"\u26a0 RAM at {ram_pct:.0f}% — system may become unstable. "
                "Remove files from queue or restart.", "warning"))
            # Auto-evict old previews to free memory
            self.engine._evict_old_previews()
            gc.collect()

    def _update_resource_display(self, stats: dict):
        cpu = stats.get("cpu", {})
        self.resource_labels["cpu_bar"].set(min(1.0, cpu.get("percent", 0) / 100))
        self.resource_labels["cpu_text"].configure(text=f"{cpu.get('percent', 0):.0f}%")
        ram = f"RAM: {cpu.get('ram_used_gb', 0):.0f}/{cpu.get('ram_total_gb', 0):.0f} GB"
        self.resource_labels["ram_text"].configure(text=ram)

        gpus = stats.get("gpus", [])
        # Static GPU rows — no create/destroy, just show/hide and update
        for i, row in enumerate(self.resource_gpu_rows):
            if i < len(gpus):
                row["frame"].grid(row=i, column=0, sticky="ew", padx=4, pady=1)
                g = gpus[i]
                row["bar"].set(min(1.0, g.get("util_pct", 0) / 100))
                short = g["name"][:20]
                row["txt"].configure(text=f"{short}: {g.get('util_pct', 0)}%")
                row["mem"].configure(
                    text=f"{g.get('mem_used_gb', 0):.0f}/{g.get('mem_total_gb', 0):.0f} GB")
            else:
                row["frame"].grid_forget()

        dev = stats.get("training_device", "idle")
        dcolor = "#00cec9" if dev != "idle" else "#8b8fa3"
        self.resource_labels["device_text"].configure(text=f"Training on: {dev}", text_color=dcolor)

    def _rebuild_model_dropdown(self):
        """Populate model dropdown: local files + Ollama + MindSpace + simulated."""
        values = []
        # Local loaded models first (preferred default)
        # Skip MindSpace checkpoints — they're not HF models and would fail loading
        for m in self.engine.models.values():
            if m.get("architecture") == "mindspace-rnn":
                continue
            values.append(f"local/{m['name']}")
        # Ollama models
        info = getattr(self, '_ollama_info', None)
        if info and info.get("available"):
            self.ollama_label.configure(text=f"Ollama: {len(info['models'])} model(s)", text_color="#00cec9")
            for m in info["models"]:
                values.append(f"ollama/{m}")
        else:
            self.ollama_label.configure(text="Ollama: offline", text_color="#e17055")
        # MindSpace RNN — actual real training, not simulated
        if HAS_MINDSPACE:
            values.append("mindspace-rnn")
        # Hugging Face repo ids the user added (persisted in settings), then the entry
        # that opens the "type a repo id" dialog. Any HF base works here, including
        # Mixture-of-Experts ones — those automatically get all-linear LoRA so the
        # expert layers train too (see engine._detect_moe).
        for repo_id in self.engine.settings.get("hf_models", []):
            values.append(f"hf/{repo_id}")
        values.append(HF_ADD_ENTRY)
        # Simulation opt-in at the end
        values.append("simulated")

        current = self.model_var.get()
        self.model_dropdown.configure(values=values)
        first_real = next((v for v in values
                           if v != HF_ADD_ENTRY and not v.startswith("simulated")), "simulated")
        # HF_ADD_ENTRY is an action, not a model — never leave it selected, and never
        # leave a name selected that no longer exists in the list.
        if (current not in values or current == HF_ADD_ENTRY
                or (current.startswith("simulated") and first_real != "simulated")):
            self.model_var.set(first_real)

    def _on_model_pick(self, choice: str):
        """Model dropdown callback — handles the 'add a Hugging Face repo id' entry."""
        if choice != HF_ADD_ENTRY:
            return
        repo_id = self._ask_hf_repo_id()
        if repo_id:
            ids = self.engine.settings.setdefault("hf_models", [])
            if repo_id not in ids:
                ids.append(repo_id)
            self.engine.save_metadata(force=True)
            self._rebuild_model_dropdown()
            self.model_var.set(f"hf/{repo_id}")
        else:
            # Cancelled — drop the sentinel so it does not sit there looking like a model.
            self._rebuild_model_dropdown()

    def _ask_hf_repo_id(self):
        """Ask for a Hugging Face repo id. Returns a normalised id, or None."""
        import tkinter.simpledialog as sd
        prompt = (
            "Hugging Face repo id of the base model to fine-tune\n"
            "(a leading 'hf/' is optional):\n\n"
            "Dense models\n"
            "  Qwen/Qwen2.5-Coder-7B-Instruct\n"
            "  google/gemma-2-2b\n"
            "  gpt2\n\n"
            "Mixture-of-Experts models\n"
            "  allenai/OLMoE-1B-7B-0924\n"
            "  Qwen/Qwen1.5-MoE-A2.7B\n\n"
            "The repo is downloaded on first use and must fit the GPU in 4-bit.")
        ans = sd.askstring("Fine-tune a Hugging Face model", prompt,
                           initialvalue="", parent=self.root)
        if not ans:
            return None
        repo_id = ans.strip()
        if repo_id.startswith("hf/"):
            repo_id = repo_id[len("hf/"):]
        repo_id = repo_id.strip().strip("/")
        parts = [p for p in repo_id.split("/") if p]
        if not repo_id or any(ch.isspace() for ch in repo_id) or len(parts) > 2:
            messagebox.showerror(
                "Invalid repo id",
                f"'{ans.strip()}' is not a Hugging Face repo id.\n\n"
                "Use 'namespace/name' (or a bare name such as 'gpt2').")
            return None

        # A mistyped repo id is worse than a rejected one: the engine falls back to
        # *simulated* training when a model fails to load, so a typo would look like a
        # successful run. Catch a definite 404 here. Anything else (offline, gated,
        # rate-limited) is let through — the loader reports it properly.
        try:
            from huggingface_hub import HfApi
            HfApi().model_info(repo_id)
        except Exception as e:
            if type(e).__name__ == "RepositoryNotFoundError":
                messagebox.showerror(
                    "Repo not found",
                    f"Hugging Face has no model repo '{repo_id}'.\n\n"
                    "Check the spelling, or paste the id from the model page.")
                return None
        return repo_id

    # ─── Remote (agent box) ───────────────────────────────────────────────

    def _save_agent_settings(self):
        self.engine.settings["use_agent"] = bool(self.use_agent_var.get())
        self.engine.settings["agent_url"] = self.agent_url_var.get().strip()
        self.engine.save_metadata(force=True)

    def test_agent(self):
        """Check the agent worker is up and can really train."""
        url = self.agent_url_var.get().strip()
        if not url:
            messagebox.showwarning("Agent box",
                "Enter the agent box URL first, e.g. http://192.168.1.234:8811")
            return
        try:
            import remote_job
        except ImportError:
            messagebox.showerror("Agent box", "training/remote/remote_job.py was not found.")
            return
        try:
            info = remote_job.health(url)
        except Exception as exc:
            self.agent_status_label.configure(text=f"unreachable", text_color="#e17055")
            messagebox.showerror("Agent box", f"Cannot reach {url}\n\n{exc}\n\nStart it there with:\n"
                                             f"  training/remote/start-agent.sh")
            return
        gpus = 0
        try:
            gpus = len(remote_job.gpus(url).get("gpus", []))
        except Exception:
            pass
        ok = bool(info.get("trainer"))
        self.agent_status_label.configure(
            text=f"{'ready' if ok else 'NO TRAINER'} · {gpus} GPU(s) · "
                 f"{'busy' if info.get('busy') else 'idle'}",
            text_color="#00cec9" if ok else "#e17055")
        self._save_agent_settings()
        if not ok:
            messagebox.showwarning("Agent box",
                "That worker cannot train for real (torch/transformers/peft missing), so jobs "
                "would run in simulated mode. Install llm-training-app/requirements.txt there.")

    def _start_remote_training(self, config: dict):
        """Upload the queued files + config to the agent box and follow the job."""
        try:
            import remote_job
        except ImportError:
            messagebox.showerror("Agent box", "training/remote/remote_job.py was not found.")
            return
        url = self.agent_url_var.get().strip()
        self._save_agent_settings()

        if not self.engine.training_queue:
            messagebox.showwarning("Train", "The queue is empty — add datasheets first.")
            return

        uploads = DATA_DIR / "uploads"
        files = []
        for fid in self.engine.training_queue:
            fd = self.engine.files.get(fid) or {}
            p = uploads / fd.get("saved_name", "")
            if p.is_file():
                files.append(str(p))
        if not files:
            messagebox.showerror("Train", "None of the queued files still exist on disk.")
            return

        out_name = f"agent-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        try:
            res = remote_job.submit(url, config["model_name"], files, out_name,
                                    epochs=config.get("epochs"),
                                    learning_rate=config.get("learning_rate"),
                                    batch_size=config.get("batch_size"),
                                    gradient_accumulation_steps=config.get("gradient_accumulation_steps"),
                                    max_length=config.get("max_length"))
        except Exception as exc:
            messagebox.showerror("Agent box", f"Could not submit the job:\n\n{exc}")
            return

        self.engine.training_active = True
        self.engine.training_status = "running"
        self.engine.current_epoch = 0
        self.engine.current_step = 0
        self.engine.total_steps = 0
        print(f"[remote] job {res.get('job_id')} submitted to {url} "
              f"({len(files)} file(s), output {res.get('output_name')})")
        threading.Thread(target=self._follow_remote_job,
                         args=(url, res.get("job_id"), res.get("output_name") or out_name),
                         daemon=True).start()

    def _ui_alert(self, title: str, text: str):
        """Raise an error dialog from a worker thread, via the Tk main loop.

        Touching Tk from a non-main thread raises "main thread is not in main loop",
        so dialogs and refreshes are handed to the event loop instead.
        """
        if getattr(self, "root", None) is None:
            print(f"[ui] {title}: {text}")
            return
        try:
            self.root.after(0, lambda: messagebox.showerror(title, text))
        except Exception:
            print(f"[ui] {title}: {text}")

    def _follow_remote_job(self, url: str, job_id: str, out_name: str):
        """Mirror the remote job's progress onto the local charts, then fetch the adapter."""
        import remote_job
        try:
            while True:
                js = remote_job.status(url, job_id)
                prog = js.get("progress") or {}
                self.engine.current_epoch = prog.get("epoch", 0)
                self.engine.current_step = prog.get("step", 0)
                self.engine.total_steps = prog.get("total_steps", 0)
                if js.get("metrics"):
                    self.engine.model_metrics.update(js["metrics"])
                if js["status"] in ("completed", "failed", "stopped"):
                    break
                time.sleep(3)
        except Exception as exc:
            self.engine.training_active = False
            self.engine.training_status = "failed"
            self._ui_alert("Agent box", f"Lost contact with the worker:\n\n{exc}")
            return

        if js["status"] != "completed":
            self.engine.training_active = False
            self.engine.training_status = js["status"]
            self._ui_alert("Agent box",
                f"Job {job_id} {js['status']}:\n\n{js.get('error') or '(no detail)'}")
            return

        try:
            target = remote_job.fetch(url, job_id, str(EXPORTS_DIR))
            entry = self.engine.ingest_model_folder(target)
            self.engine.training_status = "completed"
            if entry:
                print(f"[remote] adapter fetched to {target} — registered as local/{entry['name']}")
        except Exception as exc:
            self.engine.training_status = "failed"
            self._ui_alert("Agent box",
                f"Training finished but the adapter could not be fetched:\n\n{exc}")
        finally:
            self.engine.training_active = False
            # save_metadata() fires on_update -> refresh_ui, so it has to run on the
            # main thread, not this worker thread.
            try:
                self.root.after(0, lambda: self.engine.save_metadata(force=True))
            except Exception:
                self.engine.save_metadata(force=True)

    def _get_ms_status_text(self) -> str:
        """Return a status string about available MindSpace Transformer checkpoints."""
        parts = []
        if HAS_MINDSPACE:
            parts.append("MindSpace RNN available")
        if HAS_MINDSPACE_TRANSFORMER:
            mindspace_dir = Path(__file__).parent.parent / "MindSpace"
            best_path = mindspace_dir / "weights" / "best" / "best.pt"
            ckpt_dir = mindspace_dir / "weights" / "checkpoints"
            ckpt_count = len(list(ckpt_dir.glob("*.pt"))) if ckpt_dir.exists() else 0
            parts.append(f"MindSpace Transformer available ({ckpt_count} checkpoints)")
        return " | ".join(parts) if parts else "MindSpace: No checkpoints found"

    def _on_compile_format_change(self, val):
        """Update UI when compile format changes.
        When 'mindspace-transformer' is selected, auto-select the model too.
        """
        if val == "mindspace-transformer":
            self.compile_model_var.set("mindspace-transformer")
            self.compile_quant_menu.configure(state="disabled")
        else:
            self.compile_quant_menu.configure(state="normal")
        self.ms_status_label.configure(text=self._get_ms_status_text())

    def _rebuild_compile_model_dropdown(self):
        values = ["current", "mindspace-rnn"]
        if HAS_MINDSPACE_TRANSFORMER:
            values.append("mindspace-transformer")
        for m in self.engine.models.values():
            if m.get("architecture") != "mindspace-transformer":
                values.append(m["name"])
        current = self.compile_model_var.get()
        self.compile_model_menu.configure(values=values)
        if current not in values:
            self.compile_model_var.set("current")

    # ─── MindSpace API Server (background) ───────────────────────────────

    def _start_api_server(self):
        """Start the MindSpace REST API server in a background thread.
        Serves compiled models (RNN + Transformer) on localhost:8000.
        """
        if not HAS_MINDSPACE_API:
            print("[MindSpace API] fastapi/uvicorn not installed — skipping API server")
            return

        try:
            script_dir = Path(__file__).parent.resolve()

            # Dynamically resolve transformer export directory (supports
            # timestamped bundles from the engine compile and the fixed
            # path from standalone compile_mindspace.py)
            transformer_dir = _resolve_transformer_export_dir()

            model_dirs = {
                "rnn": script_dir / "data" / "exports" / "mindspace-compiled",
                "transformer": transformer_dir,
            }

            # Check if at least one model dir exists
            existing = {k: v for k, v in model_dirs.items() if v.exists()}
            if not existing:
                print("[MindSpace API] No compiled model directories found — API server not started")
                return

            app = _create_mindspace_api(existing)

            def _run():
                try:
                    _uvicorn.run(
                        app,
                        host="127.0.0.1",
                        port=8000,
                        log_level="warning",
                        access_log=False,
                    )
                except Exception as e:
                    print(f"[MindSpace API] Server stopped: {e}")

            self._api_server = threading.Thread(target=_run, daemon=True)
            self._api_server.start()
            names = " + ".join(existing.keys())
            print(f"[MindSpace API] Started on http://127.0.0.1:8000  ({names})")
        except Exception as e:
            print(f"[MindSpace API] Failed to start: {e}")

    def _on_close(self):
        """Gracefully shut down the app and background API server."""
        # The API server runs in a daemon thread — it will be terminated when
        # the main thread exits. No explicit shutdown needed.
        self.root.destroy()

    # ─── UI refresh ──────────────────────────────────────────────────────

    def refresh_ui(self):
        # Thread lock prevents background training threads from racing
        # with the main thread on Tkinter widget modifications
        if not self._refresh_lock.acquire(blocking=False):
            return
        is_training = self.engine.training_status == "running"
        try:
            if not is_training:
                # Full refresh — only when not actively training
                # Stats — uses SQL GROUP BY instead of loading all file entries into RAM
                counts = self.engine.files.count_by_category()
                self.file_stats.configure(text=f"Total: {len(self.engine.files)}  |  "
                    f"Ready: {counts['Ready for Training']}  |  "
                    f"Review: {counts['Needs Review']}  |  "
                    f"Bad: {counts['Unusable']}")

                # Files
                self._render_files()
                self._render_models()
                self._rebuild_model_dropdown()
                self._rebuild_compile_model_dropdown()
                self._render_experiments()

                # Queue
                qsize = len(self.engine.training_queue)
                self.queue_label.configure(text=f"Queue: {qsize} file{'s' if qsize!=1 else ''}")

                # Training button state
                if self.engine.training_status in ("idle", "completed", "stopped"):
                    self.start_btn.configure(state="normal")
                    self.pause_btn.configure(state="disabled", text="\u275a\u275a Pause")
                    self.kill_btn.configure(state="disabled")

                # Training summary popup (shown once when training finishes)
                if self.engine.training_status in ("completed", "stopped") and self.engine.training_summary is not None:
                    summary = self.engine.get_training_summary()
                    if summary:
                        self.root.after(100, lambda s=summary: self._show_training_summary(s))

            # ── Live training display — always update during training ──
            # Progress
            total = self.engine.total_steps
            cur = self.engine.current_step
            pct = cur / max(total, 1)
            self.progress_bar.set(pct)
            self.progress_label.configure(
                text=f"{self.engine.training_status.title()}  |  Step: {cur}/{total}  |  "
                f"Epoch: {self.engine.current_epoch}/{self.engine.epochs_config}")

            # Metrics
            m = self.engine.model_metrics
            self.metrics_labels["param_val"].configure(
                text=f"{m['parameters']/1e6:.0f}M" if m["parameters"] < 1e9 else f"{m['parameters']/1e9:.2f}B")
            self.metrics_labels["vector_val"].configure(text=f"{m['vector_store_size_mb']} MB")
            self.metrics_labels["acc_val"].configure(text=f"{m['accuracy']:.1f}%")
            self.metrics_labels["loss_val"].configure(text=f"{m['loss']:.4f}")

            # Eval
            acc_ratio = m["accuracy"] / 100
            self.eval_labels["tokens_val"].configure(text=f"Tokens: {m['tokens_processed']:,}")
            self.eval_labels["bleu_val"].configure(text=f"BLEU: {min(1, acc_ratio*0.9):.2f}")
            perp = f"{math.exp(m['loss']):.1f}" if m["loss"] > 0 else "--"
            self.eval_labels["perp_val"].configure(text=f"Perplexity: {perp}")
            self.eval_labels["qa_val"].configure(text=f"QA Acc: {min(100, m['accuracy']):.1f}%")

            # Charts — only draw when we have data, thin to at most 100 points for speed (was 200)
            hist = self.engine.training_history
            if hist:
                thin = max(1, len(hist) // 100)
                thinned = hist[::thin]
                if thinned[-1] != hist[-1]:
                    thinned.append(hist[-1])
                steps = [h["step"] for h in thinned]
                losses = [h["loss"] for h in thinned]
                accs = [h["accuracy"] for h in thinned]
                self.loss_line.set_data(steps, losses)
                self.acc_line.set_data(steps, accs)

                init_loss = losses[0] if losses else 2.5
                imp_vals = []
                for h in thinned:
                    norm_acc = h["accuracy"] / 100.0
                    norm_loss = 1 - (h["loss"] / max(init_loss, 0.01))
                    imp = max(0, min(100, ((norm_acc + max(0, norm_loss)) / 2) * 100))
                    imp_vals.append(imp)
                self.improv_line.set_data(steps, imp_vals)

                if self.improv_fill:
                    self.improv_fill.remove()
                self.improv_fill = self.ax_improv.fill_between(steps, imp_vals,
                    alpha=0.15, color="#00cec9")

                final_imp = imp_vals[-1] if imp_vals else 0
                self.improv_label.configure(text=f"Improvement: {final_imp:.0f}%")

                # Fixed y-limits prevent layout shifts on every draw
                # Re-apply in case reset_training() called cla() which removes them
                self.ax_loss.set_ylim(0, 3)
                self.ax_acc.set_ylim(0, 100)
                self.ax_improv.set_ylim(0, 105)
                # Use draw_idle() exclusively — defers to the event loop,
                # avoids the full synchronous redraw that causes flickering
                if not self._chart_initialized:
                    self.canvas.draw_idle()
                    self._chart_initialized = True
                else:
                    self.canvas.draw_idle()
        finally:
            self._refresh_lock.release()

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    app = LLMTrainingStudio()
    app.run()
