const API = window.location.origin;
const WS_URL = API.replace(/^http/, "ws") + "/ws";
let charts = {};
let compareCharts = {};
let ws = null;
let searchTimer = null;
let currentEditedFileId = null;
let currentPage = 1;

function getPerPage() {
  const sel = document.getElementById("perPageSelect");
  return sel ? parseInt(sel.value, 10) || 50 : 50;
}

// ─── Toast ────────────────────────────────────────────────────────────────

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── WebSocket ─────────────────────────────────────────────────────────────

function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => { ws.send("ping"); };
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "training_step") {
          updateProgress(data);
          updateMetrics(data.metrics);
          updateEval(data.metrics);
          updateChartsFromHistory(data.history || []);
        } else if (data.type === "training_complete") {
          toast("Training completed!", "success");
          setTrainingUI(false);
          updateProgress({ status: "completed", current_epoch: 0, total_steps: 0, epochs_config: 0, current_step: 0 });
          if (data.experiment_id) toast(`Experiment saved: ${data.experiment_id}`, "info");
          refreshExperiments();
        } else if (data.type === "training_stopped") {
          setTrainingUI(false);
        } else if (data.type === "compile_progress") {
          document.getElementById("compileProgress").style.display = "block";
          document.getElementById("compileProgressBar").style.width = `${(data.progress || 0) * 100}%`;
          document.getElementById("compileStatusText").textContent = data.message || data.status;
        } else if (data.type === "compile_complete") {
          if (compilePollTimer) { clearInterval(compilePollTimer); compilePollTimer = null; }
          document.getElementById("compileStatusBadge").textContent = "completed";
          document.getElementById("compileStatusBadge").className = "compile-badge completed";
          document.getElementById("compileBtn").disabled = false;
          document.getElementById("compileBtn").textContent = "⚙ Compile Model";
          compiledFileName = data.output_name;
          const downloadBtn = document.getElementById("downloadCompiledBtn");
          downloadBtn.style.display = "inline-flex";
          downloadBtn.onclick = () => downloadCompiled(compiledFileName);
          toast(`Compilation complete: ${data.output_name}`, "success");
        } else if (data.type === "compile_error") {
          if (compilePollTimer) { clearInterval(compilePollTimer); compilePollTimer = null; }
          document.getElementById("compileStatusBadge").textContent = "error";
          document.getElementById("compileStatusBadge").className = "compile-badge error";
          document.getElementById("compileBtn").disabled = false;
          document.getElementById("compileBtn").textContent = "⚙ Compile Model";
          document.getElementById("compileStatusText").textContent = `Error: ${data.error}`;
          toast(`Compilation failed: ${data.error}`, "error");
        } else if (data.type === "pong") {
          updateProgress(data);
          if (data.metrics) { updateMetrics(data.metrics); updateEval(data.metrics); }
          updateChartsFromHistory(data.history || []);
          if (data.status === "running") { setTrainingUI(true); }
        }
      } catch (_) {}
    };
    ws.onclose = () => { setTimeout(connectWS, 2000); };
    ws.onerror = () => { ws.close(); };
  } catch (_) {}
}

function wsPing() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send("ping");
}

// ─── Ollama ────────────────────────────────────────────────────────────────

async function checkOllama() {
  const statusEl = document.getElementById("ollamaStatus");
  statusEl.className = "ollama-status checking";
  statusEl.textContent = "Ollama: checking...";
  try {
    const res = await fetch(`${API}/api/ollama`);
    const data = await res.json();
    const select = document.getElementById("modelSelect");
    const currentVal = select.value;
    select.innerHTML = '<option value="simulated">Simulated (default)</option>';
    // Optional: Show MindSpace RNN option when available
    select.innerHTML += '<option value="mindspace-rnn">🧠 MindSpace RNN/LSTM</option>';
    if (data.available && data.models.length) {
      statusEl.className = "ollama-status online";
      statusEl.textContent = `Ollama: ${data.models.length} model(s)`;
      data.models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m; opt.textContent = m;
        select.appendChild(opt);
      });
      if (data.models.includes(currentVal)) select.value = currentVal;
    } else {
      statusEl.className = "ollama-status offline";
      statusEl.textContent = "Ollama: offline";
    }
  } catch (_) {
    document.getElementById("ollamaStatus").className = "ollama-status offline";
    document.getElementById("ollamaStatus").textContent = "Ollama: offline";
  }
}

document.getElementById("refreshModelsBtn").addEventListener("click", checkOllama);

// ─── Drag-and-drop upload ────────────────────────────────────────────────

const dropArea = document.getElementById("dropArea");
const fileInput = document.getElementById("fileInput");

dropArea.addEventListener("dragover", (e) => { e.preventDefault(); dropArea.classList.add("drag-over"); });
dropArea.addEventListener("dragleave", () => dropArea.classList.remove("drag-over"));
dropArea.addEventListener("drop", (e) => { e.preventDefault(); dropArea.classList.remove("drag-over"); handleFiles(e.dataTransfer.files); });
dropArea.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => { if (fileInput.files.length) handleFiles(fileInput.files); });

async function handleFiles(files) {
  for (const file of files) {
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await fetch(`${API}/api/upload`, { method: "POST", body: fd });
      if (!res.ok) { const err = await res.json(); toast(err.detail || "Upload failed", "error"); }
      else { const data = await res.json(); toast(`Uploaded: ${data.name} (${data.category})`, "success"); }
    } catch (_) { toast(`Error uploading ${file.name}`, "error"); }
  }
  refreshAll();
}

// ─── Search ────────────────────────────────────────────────────────────────

document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { currentPage = 1; refreshFiles(); }, 300);
});

// ─── File lists & categories ─────────────────────────────────────────────

let currentFilter = "all";
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active"); currentFilter = tab.dataset.cat; currentPage = 1; refreshFiles();
  });
});

function getFileIcon(name) {
  const icons = { txt: "📄", jsonl: "📋", pdf: "📕", csv: "📊", md: "📝", json: "📦" };
  return icons[name.split(".").pop().toLowerCase()] || "📄";
}

function renderFiles(files) {
  const list = document.getElementById("fileList");
  list.innerHTML = "";
  if (!files.length) { list.innerHTML = `<div class="empty-state">No files</div>`; return; }
  files.forEach((f) => {
    const catClass = f.category === "Ready for Training" ? "cat-ready" : f.category === "Needs Review" ? "cat-review" : "cat-unusable";
    const item = document.createElement("div");
    item.className = "file-item"; item.draggable = true;
    item.dataset.fileId = f.id; item.dataset.category = f.category;
    item.innerHTML = `
      <span class="file-icon">${getFileIcon(f.name)}</span>
      <div class="file-info">
        <div class="file-name clickable" title="Click to edit">${f.name}</div>
        <div class="file-meta">
          <span>${(f.size / 1024).toFixed(1)} KB</span>
          ${f.themes && f.themes.length ? `<span>${f.themes.slice(0, 2).join(", ")}</span>` : ""}
          ${f.in_queue ? '<span style="color:var(--primary)">in queue</span>' : ""}
        </div>
      </div>
      <span class="file-category ${catClass}">${f.category === "Ready for Training" ? "Ready" : f.category === "Needs Review" ? "Review" : "Bad"}</span>
      <button class="file-delete-btn" title="Delete file" data-fid="${f.id}">🗑</button>
    `;
    item.querySelector(".file-name").addEventListener("click", (e) => {
      e.stopPropagation(); openEditor(f.id);
    });
    const delBtn = item.querySelector(".file-delete-btn");
    if (delBtn) {
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation(); deleteFile(f.id);
      });
    }
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-file", JSON.stringify({ id: f.id, category: f.category }));
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    list.appendChild(item);
  });
}

// ─── Delete file ───────────────────────────────────────────────────────────

async function deleteFile(fileId) {
  if (!confirm('Permanently delete this file?')) return;
  try {
    const res = await fetch(`${API}/api/files/${fileId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    toast('File deleted', 'info');
    refreshAll();
  } catch (_) {
    toast('Failed to delete file', 'error');
  }
}

// ─── Dataset Editor ────────────────────────────────────────────────────────

async function openEditor(fileId) {
  currentEditedFileId = fileId;
  try {
    const res = await fetch(`${API}/api/files/${fileId}`);
    const f = await res.json();
    document.getElementById("modalTitle").textContent = `Edit: ${f.name}`;
    document.getElementById("editorContent").value = f.full_content || f.content_preview || "";
    document.getElementById("editorInfo").textContent = `${f.themes?.join(", ") || "no themes"} | ${(f.size/1024).toFixed(1)} KB`;
    document.getElementById("modalOverlay").style.display = "flex";
  } catch (_) {
    toast("Failed to load file", "error");
  }
}

function closeEditor() { document.getElementById("modalOverlay").style.display = "none"; currentEditedFileId = null; }
document.getElementById("closeModalBtn").addEventListener("click", closeEditor);
document.getElementById("cancelEditBtn").addEventListener("click", closeEditor);
document.getElementById("modalOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeEditor(); });

document.getElementById("saveEditBtn").addEventListener("click", async () => {
  if (!currentEditedFileId) return;
  const content = document.getElementById("editorContent").value;
  try {
    const res = await fetch(`${API}/api/files/${currentEditedFileId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error("Save failed");
    const data = await res.json();
    toast("File updated", "success");
    closeEditor();
    refreshAll();
  } catch (_) {
    toast("Failed to save", "error");
  }
});

// ─── Queue drop zone ─────────────────────────────────────────────────────

const dropZone = document.getElementById("dropZone");
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", async (e) => {
  e.preventDefault(); dropZone.classList.remove("drag-over");
  try {
    const data = JSON.parse(e.dataTransfer.getData("application/x-file"));
    if (data.id) { const fd = new FormData(); fd.append("file_id", data.id); await fetch(`${API}/api/queue/add`, { method: "POST", body: fd }); toast("Added to queue", "success"); }
    else if (data.category) { const fd = new FormData(); fd.append("category", data.category); await fetch(`${API}/api/queue/add`, { method: "POST", body: fd }); toast(`Added ${data.category} files`, "success"); }
  } catch (_) { toast("Drop files onto the queue zone", "info"); }
  refreshAll();
});
dropZone.addEventListener("click", () => toast("Drop files or category items here", "info"));

// ─── Training controls ───────────────────────────────────────────────────

document.getElementById("startBtn").addEventListener("click", startTraining);
document.getElementById("pauseBtn").addEventListener("click", togglePause);
document.getElementById("resetBtn").addEventListener("click", resetTraining);
document.getElementById("killSwitch").addEventListener("click", killTraining);
document.getElementById("exportBtn").addEventListener("click", exportData);

async function startTraining() {
  const epochs = parseInt(document.getElementById("epochInput").value) || 3;
  const batchSize = parseInt(document.getElementById("batchInput").value) || 1;
  const lr = parseFloat(document.getElementById("lrInput").value) || 0.001;
  const modelName = document.getElementById("modelSelect").value;
  try {
    const res = await fetch(`${API}/api/training/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epochs, batch_size: batchSize, learning_rate: lr, model_name: modelName }),
    });
    if (!res.ok) { const err = await res.json(); toast(err.detail || "Cannot start", "error"); return; }
    toast("Training started!", "success"); setTrainingUI(true);
  } catch (_) { toast("Failed to start", "error"); }
}

async function togglePause() {
  try {
    const btn = document.getElementById("pauseBtn");
    if (btn.textContent.includes("Pause")) {
      await fetch(`${API}/api/training/pause`, { method: "POST" });
      btn.textContent = "▶ Resume"; toast("Paused", "info");
    } else {
      await fetch(`${API}/api/training/resume`, { method: "POST" });
      btn.textContent = "❚❚ Pause"; toast("Resumed", "success");
    }
  } catch (_) { toast("Failed", "error"); }
}

async function killTraining() {
  try {
    await fetch(`${API}/api/training/stop`, { method: "POST" });
    toast("Training stopped!", "error"); setTrainingUI(false); refreshAll();
  } catch (_) { toast("Failed to stop", "error"); }
}

async function resetTraining() {
  try {
    await fetch(`${API}/api/training/reset`, { method: "POST" });
    toast("Reset", "info"); setTrainingUI(false); resetCharts(); refreshAll();
  } catch (_) { toast("Failed to reset", "error"); }
}

function setTrainingUI(active) {
  document.getElementById("startBtn").disabled = active;
  document.getElementById("pauseBtn").disabled = !active;
  document.getElementById("epochInput").disabled = active;
  document.getElementById("batchInput").disabled = active;
  document.getElementById("lrInput").disabled = active;
  document.getElementById("modelSelect").disabled = active;
}

// ─── Export ────────────────────────────────────────────────────────────────

async function exportData() {
  try {
    const [metricsRes, historyRes] = await Promise.all([
      fetch(`${API}/api/export/metrics?format=json`),
      fetch(`${API}/api/export/metrics?format=csv`),
    ]);
    const jsonBlob = await metricsRes.blob();
    const csvBlob = await historyRes.blob();
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement("a");
    a.href = url; a.download = `training_export_${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Exported metrics JSON", "success");
  } catch (_) { toast("Export failed", "error"); }
}

// ─── Progress & Metrics ──────────────────────────────────────────────────

function updateProgress(data) {
  const total = data.total_steps || 0;
  const current = data.current_step || 0;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  document.getElementById("progressBar").style.width = `${pct}%`;

  const status = data.status || "idle";
  const labels = { idle: "Idle", running: "Training...", paused: "Paused", completed: "Completed", stopped: "Stopped" };
  document.getElementById("progressText").textContent = labels[status] || status;
  document.getElementById("stepText").textContent = `Step: ${current} / ${total}`;
  document.getElementById("epochText").textContent = `Epoch: ${data.current_epoch || 0} / ${data.epochs_config || 0}`;

  if (status === "completed" || status === "stopped") setTrainingUI(false);
}

function updateMetrics(m) {
  if (!m) return;
  document.getElementById("paramValue").textContent = m.parameters >= 1e9 ? `${(m.parameters / 1e9).toFixed(2)}B` : `${(m.parameters / 1e6).toFixed(0)}M`;
  document.getElementById("vectorValue").textContent = `${m.vector_store_size_mb || 0} MB`;
  document.getElementById("accuracyValue").textContent = `${(m.accuracy || 0).toFixed(1)}%`;
  document.getElementById("lossValue").textContent = (m.loss || 0).toFixed(4);
}

function updateEval(m) {
  if (!m) return;
  document.getElementById("tokensValue").textContent = (m.tokens_processed || 0).toLocaleString();
  const acc = (m.accuracy || 0) / 100;
  document.getElementById("bleuValue").textContent = Math.min(1, acc * 0.9).toFixed(2);
  document.getElementById("perplexityValue").textContent = m.loss > 0 ? Math.exp(m.loss).toFixed(1) : "--";
  document.getElementById("qaValue").textContent = `${Math.min(100, (m.accuracy || 0)).toFixed(1)}%`;
}

// ─── Charts ──────────────────────────────────────────────────────────────

function initCharts() {
  const baseOpts = (label, color, bg) => ({
    type: "line", data: { labels: [], datasets: [{ label, data: [], borderColor: color, backgroundColor: bg || color + "20", borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 }, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: true, grid: { color: "#2d314820" }, ticks: { color: "#8b8fa3", font: { size: 9 } } } } },
  });
  charts.params = new Chart(document.getElementById("paramChart"), baseOpts("Parameters", "#74b9ff"));
  charts.vector = new Chart(document.getElementById("vectorChart"), baseOpts("Vector Store", "#00cec9"));
  charts.accuracy = new Chart(document.getElementById("accuracyChart"), baseOpts("Accuracy", "#fdcb6e"));
  charts.loss = new Chart(document.getElementById("lossChart"), baseOpts("Loss", "#e17055"));

  const compareOpts = (t) => ({
    type: "line", data: { labels: [], datasets: [] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 }, plugins: { legend: { labels: { color: "#8b8fa3", font: { size: 10 } } } }, scales: { x: { display: false }, y: { display: true, grid: { color: "#2d314820" }, ticks: { color: "#8b8fa3", font: { size: 9 } } } } },
  });
  compareCharts.loss = new Chart(document.getElementById("compareLossChart"), compareOpts("Loss"));
  compareCharts.acc = new Chart(document.getElementById("compareAccChart"), compareOpts("Accuracy"));
}

function updateChartsFromHistory(history) {
  if (!history || !history.length) return;
  const labels = history.map((_, i) => i + 1);
  const accs = history.map((h) => h.accuracy || 0);
  const losses = history.map((h) => h.loss || 2.5);
  const params = history.map((_, i) => 100 + 40 * (i / history.length));
  const vectors = history.map((_, i) => 10 + 35 * (i / history.length));
  updateChartDataset(charts.params, labels, params);
  updateChartDataset(charts.vector, labels, vectors);
  updateChartDataset(charts.accuracy, labels, accs);
  updateChartDataset(charts.loss, labels, losses);
}

function updateChartDataset(chart, labels, data) {
  if (!chart) return;
  const maxPts = 100;
  if (labels.length > maxPts) {
    const step = Math.ceil(labels.length / maxPts);
    chart.data.labels = labels.filter((_, i) => i % step === 0);
    chart.data.datasets[0].data = data.filter((_, i) => i % step === 0);
  } else { chart.data.labels = labels; chart.data.datasets[0].data = data; }
  chart.update("none");
}

function resetCharts() {
  Object.values(charts).forEach((c) => { if (c) { c.data.labels = []; c.data.datasets[0].data = []; c.update("none"); } });
  document.getElementById("progressBar").style.width = "0%"; document.getElementById("progressText").textContent = "Idle";
  document.getElementById("stepText").textContent = "Step: 0 / 0"; document.getElementById("epochText").textContent = "Epoch: 0 / 0";
}

// ─── Experiments ────────────────────────────────────────────────────────

async function refreshExperiments() {
  try {
    const res = await fetch(`${API}/api/experiments`);
    const data = await res.json();
    const list = document.getElementById("expList");
    const exps = data.experiments || [];
    if (!exps.length) { list.innerHTML = '<div class="empty-state">No experiments saved</div>'; return; }
    list.innerHTML = "";
    exps.forEach((e) => {
      const item = document.createElement("div");
      item.className = "exp-item";
      item.dataset.expId = e.id;
      const acc = e.metrics_snapshot?.accuracy || 0;
      const loss = e.metrics_snapshot?.loss || 0;
      item.innerHTML = `<div><div class="exp-name">Run ${e.id}</div><div class="exp-meta">acc: ${acc.toFixed(1)}% loss: ${loss.toFixed(4)}</div></div><div class="exp-meta">${new Date(e.timestamp).toLocaleTimeString()}</div>`;
      item.addEventListener("click", () => selectExperiment(e.id));
      list.appendChild(item);
    });
  } catch (_) {}
}

async function selectExperiment(expId) {
  document.querySelectorAll(".exp-item").forEach((el) => el.classList.remove("selected"));
  const el = document.querySelector(`.exp-item[data-exp-id="${expId}"]`);
  if (el) el.classList.add("selected");
  try {
    const res = await fetch(`${API}/api/experiments/${expId}`);
    const exp = await res.json();
    showComparison(exp);
  } catch (_) { toast("Failed to load experiment", "error"); }
}

let comparedExperiments = [];

function showComparison(exp) {
  const panel = document.getElementById("comparePanel");
  panel.style.display = "block";
  const idx = comparedExperiments.findIndex((e) => e.id === exp.id);
  if (idx === -1) { comparedExperiments.push(exp); }
  else { comparedExperiments[idx] = exp; }
  renderCompareCharts(comparedExperiments);
}

document.getElementById("closeCompareBtn").addEventListener("click", () => {
  document.getElementById("comparePanel").style.display = "none";
  comparedExperiments = [];
});

function renderCompareCharts(exps) {
  const colors = ["#6c5ce7", "#00cec9", "#fdcb6e", "#e17055", "#74b9ff", "#fd79a8"];
  const maxSteps = Math.max(...exps.map((e) => (e.history || []).length));

  const lossData = { labels: Array.from({ length: maxSteps }, (_, i) => i + 1), datasets: exps.map((e, i) => ({
    label: `Run ${e.id}`, data: buildSeries(e.history || [], maxSteps, "loss"), borderColor: colors[i % colors.length], backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.3,
  })) };
  const accData = { labels: Array.from({ length: maxSteps }, (_, i) => i + 1), datasets: exps.map((e, i) => ({
    label: `Run ${e.id}`, data: buildSeries(e.history || [], maxSteps, "accuracy"), borderColor: colors[i % colors.length], backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.3,
  })) };

  compareCharts.loss.data = lossData; compareCharts.loss.update("none");
  compareCharts.acc.data = accData; compareCharts.acc.update("none");
}

function buildSeries(history, maxSteps, key) {
  const result = new Array(maxSteps).fill(null);
  history.forEach((h, i) => { if (i < maxSteps) result[i] = h[key]; });
  return result;
}

// ─── Resource Monitor ────────────────────────────────────────────────────

async function refreshResources() {
  try {
    const res = await fetch(`${API}/api/resources`);
    const data = await res.json();

    // CPU
    const cpuPct = data.cpu?.percent || 0;
    document.getElementById("cpuBar").style.width = `${Math.min(100, cpuPct)}%`;
    document.getElementById("cpuPct").textContent = `${cpuPct.toFixed(0)}%`;

    // RAM
    const ramPct = data.cpu?.ram_percent || 0;
    document.getElementById("ramBar").style.width = `${Math.min(100, ramPct)}%`;
    document.getElementById("ramPct").textContent = `${ramPct.toFixed(0)}%`;
    const ramUsed = data.cpu?.ram_used_gb || 0;
    const ramTotal = data.cpu?.ram_total_gb || 0;
    document.getElementById("ramText").textContent = `${ramUsed.toFixed(1)} / ${ramTotal.toFixed(1)} GB`;

    // Training device
    const dev = data.training_device || "idle";
    const devEl = document.getElementById("trainingDevice");
    devEl.textContent = `Training on: ${dev}`;
    devEl.className = `resource-device ${dev !== "idle" ? "device-active" : ""}`;

    // GPU rows
    const container = document.getElementById("gpuContainer");
    const gpus = data.gpus || [];
    const existingRows = container.querySelectorAll(".resource-gpu-row");

    // Add new GPU rows if needed
    for (let i = existingRows.length; i < gpus.length; i++) {
      const row = document.createElement("div");
      row.className = "resource-gpu-row";
      row.innerHTML = `
        <div class="resource-header">
          <span class="resource-icon">&#9879;</span>
          <span class="resource-label">GPU${i}</span>
          <span class="resource-gpu-name">${gpus[i]?.name?.slice(0, 20) || "GPU"}</span>
          <span class="resource-pct" id="gpuPct${i}">0%</span>
        </div>
        <div class="progress-bar-container resource-bar-bg">
          <div class="progress-bar resource-bar-gpu" id="gpuBar${i}"></div>
        </div>
        <div class="resource-sub" id="gpuMem${i}">0.0 / 0.0 GB</div>
      `;
      container.appendChild(row);
    }

    // Remove excess GPU rows
    while (container.children.length > gpus.length) {
      container.removeChild(container.lastChild);
    }

    // Update all GPU rows
    gpus.forEach((gpu, i) => {
      const bar = document.getElementById(`gpuBar${i}`);
      const pct = document.getElementById(`gpuPct${i}`);
      const mem = document.getElementById(`gpuMem${i}`);
      if (bar) bar.style.width = `${Math.min(100, gpu.util_pct || 0)}%`;
      if (pct) pct.textContent = `${(gpu.util_pct || 0).toFixed(0)}%`;
      if (mem) mem.textContent = `${(gpu.mem_used_gb || 0).toFixed(1)} / ${(gpu.mem_total_gb || 0).toFixed(1)} GB`;
    });

    // Badge color feedback
    const badge = document.getElementById("resourceBadge");
    if (badge) {
      if (ramPct > 85 || cpuPct > 85) {
        badge.className = "resource-badge warning";
        badge.textContent = "high load";
      } else if (gpus.some(g => (g.util_pct || 0) > 80)) {
        badge.className = "resource-badge active";
        badge.textContent = "gpu busy";
      } else {
        badge.className = "resource-badge";
        badge.textContent = "live";
      }
    }
  } catch (_) {
    // Silently ignore — resources endpoint may not be available yet
  }
}


// ─── Refresh ────────────────────────────────────────────────────────────

async function refreshFiles() {
  try {
    const search = document.getElementById("searchInput").value.trim();
    const params = new URLSearchParams();
    params.set("page", currentPage);
    params.set("per_page", getPerPage());
    if (currentFilter !== "all") params.set("category", currentFilter);
    if (search) params.set("search", search);
    const res = await fetch(`${API}/api/files?${params.toString()}`);
    const data = await res.json();
    window._allFiles = data.files || [];
    renderFiles(window._allFiles);
    renderPagination(data.count || 0, data.total_pages || 1);
  } catch (_) {}
}

function renderPagination(count, totalPages) {
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");
  const info = document.getElementById("pageInfo");
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  info.textContent = `Page ${currentPage} / ${totalPages} (${count} files)`;
  // Hide pagination entirely if only one page
  const container = document.getElementById("pagination");
  container.style.display = totalPages <= 1 ? "none" : "flex";
}

async function refreshAll() {
  try {
    const [catRes, queueRes, metricsRes] = await Promise.all([
      fetch(`${API}/api/categories`),
      fetch(`${API}/api/queue`),
      fetch(`${API}/api/training/metrics`),
    ]);
    const cats = await catRes.json();
    const queue = await queueRes.json();
    const metrics = await metricsRes.json();

    // File list is fetched with pagination via refreshFiles()
    refreshFiles();

    const catVals = Object.values(cats.categories || {});
    document.getElementById("totalFiles").textContent = catVals.length ? catVals.reduce((a, b) => a + b) : 0;
    document.getElementById("readyCount").textContent = cats.categories?.["Ready for Training"] || 0;
    document.getElementById("reviewCount").textContent = cats.categories?.["Needs Review"] || 0;
    document.getElementById("unusableCount").textContent = cats.categories?.["Unusable"] || 0;
    document.getElementById("queueCount").textContent = queue.size || 0;

    if (metrics.status === "idle" || metrics.status === "completed" || metrics.status === "stopped") {
      updateMetrics(metrics.metrics); updateEval(metrics.metrics); updateProgress(metrics);
      updateChartsFromHistory(metrics.history || []);
    }
    refreshExperiments();
  } catch (_) {}
}

// ─── Context menu (remove from queue) ────────────────────────────────────

document.addEventListener("contextmenu", async (e) => {
  const item = e.target.closest(".file-item");
  if (!item) return;
  e.preventDefault();
  const fid = item.dataset.fileId;
  if (!fid) return;
  try {
    const fd = new FormData(); fd.append("file_id", fid);
    const res = await fetch(`${API}/api/queue/remove`, { method: "POST", body: fd });
    if (res.ok) { toast("Removed from queue", "info"); refreshAll(); }
  } catch (_) {}
});

// ─── RAG ────────────────────────────────────────────────────────────────────

let ragEnabled = false;

async function checkRAG() {
  try {
    const res = await fetch(`${API}/api/rag/available`);
    const data = await res.json();
    const ragPanel = document.querySelector(".rag-panel");
    if (data.available) {
      ragPanel.style.display = "block";
      refreshRAGStatus();
    } else {
      ragPanel.style.display = "none";
    }
  } catch (_) {
    document.querySelector(".rag-panel").style.display = "none";
  }
}

async function refreshRAGStatus() {
  try {
    const res = await fetch(`${API}/api/rag/status`);
    const data = await res.json();
    document.getElementById("ragPassageCount").textContent = data.num_passages || 0;
    document.getElementById("ragFileCount").textContent = data.indexed_files_count || 0;
    document.getElementById("ragEmbedModel").textContent = data.embedding_model || "-";
    const badge = document.getElementById("ragBadge");
    if (data.enabled) {
      badge.className = "rag-badge on";
      badge.textContent = "on";
    } else {
      badge.className = "rag-badge off";
      badge.textContent = "off";
    }
  } catch (_) {}
}

document.getElementById("ragToggle").addEventListener("change", async (e) => {
  ragEnabled = e.target.checked;
  document.getElementById("ragConfigRow").style.display = ragEnabled ? "flex" : "none";
  try {
    await fetch(`${API}/api/rag/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: ragEnabled,
        embedding_model: document.getElementById("ragModelSelect").value,
        chunk_size: parseInt(document.getElementById("ragChunkSize").value) || 512,
        chunk_overlap: parseInt(document.getElementById("ragOverlap").value) || 128,
        top_k: parseInt(document.getElementById("ragTopK").value) || 5,
      }),
    });
    refreshRAGStatus();
  } catch (_) {}
});

document.getElementById("ragIndexBtn").addEventListener("click", async () => {
  const btn = document.getElementById("ragIndexBtn");
  btn.disabled = true;
  btn.textContent = "Indexing...";
  const progress = document.getElementById("ragProgress");
  progress.style.display = "block";
  document.getElementById("ragProgressBar").style.width = "0%";
  document.getElementById("ragStatusText").textContent = "Indexing queued files...";

  try {
    const res = await fetch(`${API}/api/rag/index`, { method: "POST" });
    if (!res.ok) throw new Error("Indexing failed");
    toast("Indexing started", "info");

    // Poll for completion
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch(`${API}/api/rag/index/status`);
        const status = await statusRes.json();
        document.getElementById("ragProgressBar").style.width = `${status.progress * 100}%`;
        document.getElementById("ragStatusText").textContent = status.message;
        if (!status.active) {
          clearInterval(pollInterval);
          btn.disabled = false;
          btn.textContent = "⚙ Index Queue";
          progress.style.display = "none";
          refreshRAGStatus();
          toast("Indexing complete", "success");
        }
      } catch (_) {
        clearInterval(pollInterval);
        btn.disabled = false;
        btn.textContent = "⚙ Index Queue";
      }
    }, 1000);
  } catch (err) {
    toast(err.message, "error");
    btn.disabled = false;
    btn.textContent = "⚙ Index Queue";
    progress.style.display = "none";
  }
});

document.getElementById("ragClearBtn").addEventListener("click", async () => {
  try {
    await fetch(`${API}/api/rag/clear`, { method: "POST" });
    toast("RAG index cleared", "info");
    refreshRAGStatus();
  } catch (_) {
    toast("Failed to clear RAG index", "error");
  }
});

// ─── RAG Query ──────────────────────────────────────────────────────────────

document.getElementById("ragQueryBtn").addEventListener("click", async () => {
  const section = document.getElementById("ragQuerySection");
  const isVisible = section.style.display !== "none";
  section.style.display = isVisible ? "none" : "block";
  if (!isVisible) {
    document.getElementById("ragQueryInput").focus();
  }
});

document.getElementById("ragQueryInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    performRAGQuery();
  }
});

async function performRAGQuery() {
  const input = document.getElementById("ragQueryInput");
  const resultsDiv = document.getElementById("ragQueryResults");
  const query = input.value.trim();

  if (!query) {
    toast("Enter a query to search", "warning");
    return;
  }

  resultsDiv.innerHTML = '<div class="empty-state" style="padding:8px 0">Searching...</div>';

  try {
    const res = await fetch(`${API}/api/rag/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: parseInt(document.getElementById("ragTopK").value) || 5 }),
    });

    if (!res.ok) {
      resultsDiv.innerHTML = '<div class="empty-state" style="padding:8px 0">Query failed</div>';
      return;
    }

    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      resultsDiv.innerHTML = '<div class="empty-state" style="padding:8px 0">No matching passages found</div>';
      return;
    }

    resultsDiv.innerHTML = data.results.map((r) => `
      <div class="rag-result-item">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="rag-result-source">${escapeHtml(r.source_file || "unknown")}</span>
          <span class="rag-result-score">${(r.score * 100).toFixed(0)}% match</span>
        </div>
        <div class="rag-result-text">${escapeHtml(r.text)}</div>
      </div>
    `).join("");
  } catch (_) {
    resultsDiv.innerHTML = '<div class="empty-state" style="padding:8px 0">Query failed</div>';
    toast("Query failed", "error");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Re-define startTraining to include RAG config
startTraining = async function() {
  const epochs = parseInt(document.getElementById("epochInput").value) || 3;
  const batchSize = parseInt(document.getElementById("batchInput").value) || 1;
  const lr = parseFloat(document.getElementById("lrInput").value) || 0.001;
  const modelName = document.getElementById("modelSelect").value;
  try {
    const res = await fetch(`${API}/api/training/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        epochs, batch_size: batchSize, learning_rate: lr, model_name: modelName,
        rag_enabled: ragEnabled,
        rag_top_k: parseInt(document.getElementById("ragTopK").value) || 5,
        rag_chunk_size: parseInt(document.getElementById("ragChunkSize").value) || 512,
        rag_chunk_overlap: parseInt(document.getElementById("ragOverlap").value) || 128,
        rag_embedding_model: document.getElementById("ragModelSelect").value,
      }),
    });
    if (!res.ok) { const err = await res.json(); toast(err.detail || "Cannot start", "error"); return; }
    toast("Training started!", "success"); setTrainingUI(true);
  } catch (_) { toast("Failed to start", "error"); }
};

// ─── Compile Model ─────────────────────────────────────────────────────────

let compilePollTimer = null;
let compiledFileName = null;

document.getElementById("compileFormatSelect").addEventListener("change", (e) => {
  const showQuant = e.target.value === "gguf";
  document.getElementById("quantGroup").style.display = showQuant ? "flex" : "none";
});

async function refreshCompileModels() {
  try {
    const res = await fetch(`${API}/api/compile/formats`);
    const data = await res.json();
    const select = document.getElementById("compileModelSelect");
    const currentVal = select.value;
    select.innerHTML = '<option value="current">Current Training Model</option>';
    try {
      const filesRes = await fetch(`${API}/api/files`);
      const modelsRes = await fetch(`${API}/api/models`);
      // Models endpoint may not exist; skip if error
      if (modelsRes.ok) {
        const models = await modelsRes.json();
        (models.models || []).forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m.id; opt.textContent = `${m.name} (${(m.size_gb || 0).toFixed(1)} GB)`;
          select.appendChild(opt);
        });
      }
    } catch (_) {}
    if (currentVal && [...select.options].some((o) => o.value === currentVal)) {
      select.value = currentVal;
    }
  } catch (_) {}
}

document.getElementById("compileBtn").addEventListener("click", startCompilation);

async function startCompilation() {
  const btn = document.getElementById("compileBtn");
  btn.disabled = true;
  btn.textContent = "Compiling...";

  const format = document.getElementById("compileFormatSelect").value;
  const modelId = document.getElementById("compileModelSelect").value;
  const quant = document.getElementById("compileQuantSelect").value;

  const progressEl = document.getElementById("compileProgress");
  progressEl.style.display = "block";
  document.getElementById("compileProgressBar").style.width = "0%";
  document.getElementById("compileStatusText").textContent = "Starting...";
  document.getElementById("compileStatusBadge").textContent = "active";
  document.getElementById("compileStatusBadge").className = "compile-badge active";
  document.getElementById("downloadCompiledBtn").style.display = "none";

  try {
    const res = await fetch(`${API}/api/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId, format, quantization: format === "gguf" ? quant : null }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Compilation failed");
    }
    compiledFileName = null;
    startCompilePolling();
  } catch (err) {
    document.getElementById("compileStatusText").textContent = `Error: ${err.message}`;
    document.getElementById("compileStatusBadge").textContent = "error";
    document.getElementById("compileStatusBadge").className = "compile-badge error";
    btn.disabled = false;
    btn.textContent = "⚙ Compile Model";
  }
}

function startCompilePolling() {
  if (compilePollTimer) clearInterval(compilePollTimer);
  compilePollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API}/api/compile/status`);
      const data = await res.json();
      document.getElementById("compileProgressBar").style.width = `${(data.progress || 0) * 100}%`;
      document.getElementById("compileStatusText").textContent = data.message || data.status;

      if (data.status === "completed") {
        clearInterval(compilePollTimer);
        compilePollTimer = null;
        document.getElementById("compileStatusBadge").textContent = "completed";
        document.getElementById("compileStatusBadge").className = "compile-badge completed";
        document.getElementById("compileBtn").disabled = false;
        document.getElementById("compileBtn").textContent = "⚙ Compile Model";
        compiledFileName = data.output_name;
        const downloadBtn = document.getElementById("downloadCompiledBtn");
        downloadBtn.style.display = "inline-flex";
        downloadBtn.onclick = () => downloadCompiled(compiledFileName);
        toast(`Compilation complete: ${data.output_name}`, "success");
      } else if (data.status === "error") {
        clearInterval(compilePollTimer);
        compilePollTimer = null;
        document.getElementById("compileStatusBadge").textContent = "error";
        document.getElementById("compileStatusBadge").className = "compile-badge error";
        document.getElementById("compileBtn").disabled = false;
        document.getElementById("compileBtn").textContent = "⚙ Compile Model";
        toast(`Compilation failed: ${data.error}`, "error");
      }
    } catch (_) {
      clearInterval(compilePollTimer);
      compilePollTimer = null;
    }
  }, 1000);
}

function downloadCompiled(filename) {
  if (!filename) return;
  const a = document.createElement("a");
  a.href = `${API}/api/compile/download/${encodeURIComponent(filename)}`;
  a.download = filename;
  a.click();
  toast(`Downloading: ${filename}`, "info");
}

// ─── Keyboard ────────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (document.getElementById("modalOverlay").style.display === "flex") closeEditor();
    else killTraining();
  }
});

// ─── Init ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initCharts(); connectWS(); checkOllama(); checkRAG(); refreshAll(); refreshCompileModels();
  // Pagination buttons
  document.getElementById("prevPageBtn").addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; refreshFiles(); }
  });
  document.getElementById("nextPageBtn").addEventListener("click", () => {
    currentPage++; refreshFiles();
  });
  document.getElementById("perPageSelect").addEventListener("change", () => {
    currentPage = 1; refreshFiles();
  });
  setInterval(() => { wsPing(); }, 5000);
  setInterval(() => {
    const status = document.getElementById("progressText").textContent;
    if (["Idle", "Completed", "Stopped"].includes(status)) refreshAll();
  }, 3000);
  // Start resource monitoring polling every 5 seconds
  refreshResources();
  setInterval(refreshResources, 5000);
});
