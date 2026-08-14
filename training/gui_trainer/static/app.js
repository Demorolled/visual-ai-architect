/* ═══════════════════════════════════════════════════════════════════════════
   🎨 GUI GGUF Trainer — Frontend Application
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────────────

const state = {
  datasets: [],
  selectedDatasets: [],
  isTraining: false,
  trainingConfig: {},
  progressData: {
    losses: [],
    steps: [],
  },
  history: [],
  eventSource: null,
};

// ─── DOM References ───────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

// ─── Initialization ───────────────────────────────────────────────────────

async function init() {
  await Promise.all([
    loadDatasets(),
    loadGpuInfo(),
    loadModels(),
    loadDefaultConfig(),
    loadHistory(),
  ]);
  setupSSE();
  addLog('info', '🚀 GUI GGUF Trainer ready. Select datasets and configure training.');
}

document.addEventListener('DOMContentLoaded', init);

// ─── API Helpers ──────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function apiPost(path, body = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json();
}

// ─── Dataset Management ───────────────────────────────────────────────────

async function loadDatasets() {
  try {
    const data = await apiGet('/api/datasets');
    state.datasets = data.datasets || [];
    renderDatasets();
  } catch (e) {
    addLog('error', `Failed to load datasets: ${e.message}`);
  }
}

function renderDatasets() {
  const list = $('datasetList');
  if (!list) return;
  
  if (state.datasets.length === 0) {
    list.innerHTML = '<div class="loading">No datasets found. Click "Generate" to create GUI datasets.</div>';
    return;
  }
  
  list.innerHTML = state.datasets.map((ds, i) => `
    <div class="dataset-item ${state.selectedDatasets.includes(ds.path) ? 'selected' : ''}"
         onclick="toggleDataset('${ds.path.replace(/'/g, "\\'")}')">
      <input type="checkbox" class="dataset-checkbox"
             ${state.selectedDatasets.includes(ds.path) ? 'checked' : ''}
             onchange="toggleDataset('${ds.path.replace(/'/g, "\\'")}')">
      <div class="dataset-info">
        <div class="dataset-name">${ds.name}</div>
        <div class="dataset-meta">${ds.entries.toLocaleString()} entries · ${ds.size_kb} KB</div>
      </div>
      <span class="dataset-type ${ds.type}">${ds.type}</span>
    </div>
  `).join('');
  
  updateSelectedCount();
}

function toggleDataset(path) {
  const idx = state.selectedDatasets.indexOf(path);
  if (idx >= 0) {
    state.selectedDatasets.splice(idx, 1);
  } else {
    state.selectedDatasets.push(path);
  }
  renderDatasets();
}

function updateSelectedCount() {
  const el = $('selectedCount');
  if (el) el.textContent = state.selectedDatasets.length;
}

async function generateDatasets() {
  const btn = $('genBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
  addLog('info', '🔄 Generating GUI training datasets from projects...');
  
  try {
    const result = await apiPost('/api/datasets/generate');
    if (result.success) {
      addLog('success', `✅ Generated ${result.total} GUI training entries!`);
      await loadDatasets();
    } else {
      addLog('error', `❌ Generation failed: ${result.detail || 'Unknown error'}`);
    }
  } catch (e) {
    addLog('error', `❌ Generation error: ${e.message}`);
  }
  
  btn.disabled = false;
  btn.innerHTML = '<span class="btn-icon">🔄</span> Generate';
}

// ─── GPU Info ─────────────────────────────────────────────────────────────

async function loadGpuInfo() {
  try {
    const data = await apiGet('/api/gpu-info');
    const gpus = data.gpus || [];
    const badge = $('gpuBadge');
    if (gpus.length > 0) {
      const info = gpus.map(g => `${g.name.split(' ').slice(0,2).join(' ')} (${g.utilization}%)`).join(', ');
      badge.textContent = `🎮 ${gpus.length} GPU · ${info}`;
    } else {
      badge.textContent = '⚠️ No GPU detected';
    }
  } catch {
    $('gpuBadge').textContent = '⚠️ GPU check failed';
  }
}

// ─── Default Config ───────────────────────────────────────────────────────

async function loadDefaultConfig() {
  try {
    const data = await apiGet('/api/config/defaults');
    const cfg = data.config || {};
    setConfigValue('cfg_lr', cfg.learning_rate || '2e-4');
    setConfigValue('cfg_lora_r', cfg.lora_r || 8);
    setConfigValue('cfg_seq', cfg.max_seq_length || 512);
    setConfigValue('cfg_epochs', cfg.num_epochs || 2);
    setConfigValue('cfg_rounds', cfg.max_rounds || 10);
    setConfigValue('cfg_batch', cfg.batch_size || 1);
    setConfigValue('cfg_grad', cfg.gradient_accumulation || 8);
    setConfigValue('cfg_quant', cfg.gguf_quantization || 'q4_k_m');
  } catch {}
}

function setConfigValue(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

function getConfig() {
  return {
    learning_rate: parseScientific($('cfg_lr')?.value || '2e-4'),
    lora_r: parseInt($('cfg_lora_r')?.value || '8'),
    max_seq_length: parseInt($('cfg_seq')?.value || '512'),
    num_epochs: parseInt($('cfg_epochs')?.value || '2'),
    max_rounds: parseInt($('cfg_rounds')?.value || '10'),
    batch_size: parseInt($('cfg_batch')?.value || '1'),
    gradient_accumulation: parseInt($('cfg_grad')?.value || '8'),
    gguf_quantization: $('cfg_quant')?.value || 'q4_k_m',
  };
}

function parseScientific(str) {
  const val = parseFloat(str);
  return isNaN(val) ? 0.0002 : val;
}

function resetConfig() {
  loadDefaultConfig();
  addLog('info', '↻ Config reset to defaults');
}

// ─── Training Controls ────────────────────────────────────────────────────

async function startTraining() {
  if (state.selectedDatasets.length === 0) {
    addLog('warn', '⚠️ Please select at least one dataset');
    return;
  }
  
  const config = getConfig();
  const totalEntries = state.selectedDatasets.reduce((sum, path) => {
    const ds = state.datasets.find(d => d.path === path);
    return sum + (ds ? ds.entries : 0);
  }, 0);
  
  $('startBtn').disabled = true;
  $('stopBtn').disabled = false;
  state.isTraining = true;
  
  addLog('training', `▶️ Training started with ${state.selectedDatasets.length} datasets (${totalEntries.toLocaleString()} total entries)`);
  addLog('info', `   Config: LR=${config.learning_rate}, R=${config.lora_r}, Seq=${config.max_seq_length}, Epochs=${config.num_epochs}, Rounds=${config.max_rounds}`);
  
  try {
    const result = await apiPost('/api/train/start', {
      datasets: state.selectedDatasets,
      config: config,
    });
    
    if (!result.success) {
      addLog('error', `❌ ${result.message}`);
      $('startBtn').disabled = false;
      $('stopBtn').disabled = true;
      state.isTraining = false;
    }
  } catch (e) {
    addLog('error', `❌ Failed to start training: ${e.message}`);
    $('startBtn').disabled = false;
    $('stopBtn').disabled = true;
    state.isTraining = false;
  }
}

async function stopTraining() {
  try {
    await apiPost('/api/train/stop');
    addLog('warn', '⏹️ Stop requested...');
  } catch (e) {
    addLog('error', `❌ Stop failed: ${e.message}`);
  }
}

// ─── SSE Progress Monitoring ──────────────────────────────────────────────

function setupSSE() {
  if (state.eventSource) {
    state.eventSource.close();
  }
  
  const es = new EventSource('/api/train/progress');
  state.eventSource = es;
  
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      updateUI(data);
    } catch {}
  };
  
  es.onerror = () => {
    // Reconnect after 3s
    setTimeout(() => {
      if (state.eventSource) {
        state.eventSource.close();
        setupSSE();
      }
    }, 3000);
  };
}

function updateUI(data) {
  if (!data) return;
  
  // Status
  const status = data.status || 'idle';
  const dot = $('statusDot');
  const text = $('statusText');
  
  if (dot) {
    dot.className = 'status-dot';
    if (status === 'training') dot.classList.add('training');
    else if (status === 'done') dot.classList.add('active');
    else if (status === 'error') dot.classList.add('error');
    else if (status === 'exporting') dot.classList.add('exporting');
    else if (status === 'loading' || status === 'evaluating') dot.classList.add('training');
    else if (status === 'idle') dot.className = 'status-dot';
  }
  
  if (text) {
    const labels = {
      idle: 'Idle',
      loading: 'Loading...',
      training: 'Training...',
      evaluating: 'Evaluating...',
      exporting: 'Exporting to GGUF...',
      done: '✅ Complete',
      error: '❌ Error',
    };
    text.textContent = labels[status] || status;
  }
  
  // Training metrics
  if (status === 'training' || status === 'evaluating' || status === 'exporting') {
    $('mRound').textContent = `${data.current_round || 0}/${data.total_rounds || 0}`;
    $('mStep').textContent = `${data.current_step || 0}/${data.total_steps || 0}`;
    $('mLoss').textContent = data.loss ? data.loss.toFixed(4) : '--';
    $('mAcc').textContent = data.accuracy ? `${(data.accuracy * 100).toFixed(1)}%` : '--';
    $('mBestAcc').textContent = data.best_accuracy ? `${(data.best_accuracy * 100).toFixed(1)}%` : '--';
    $('mGpu').textContent = data.gpu_util ? `${data.gpu_util}%` : '--';
    
    // ETA
    const eta = data.eta_seconds || 0;
    if (eta > 0) {
      const h = Math.floor(eta / 3600);
      const m = Math.floor((eta % 3600) / 60);
      $('mEta').textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    } else {
      $('mEta').textContent = '--';
    }
    
    // Elapsed
    const elapsed = data.elapsed_seconds || 0;
    const eh = Math.floor(elapsed / 3600);
    const em = Math.floor((elapsed % 3600) / 60);
    const es = elapsed % 60;
    $('elapsedInfo').textContent = `⏱ ${eh > 0 ? `${eh}:` : ''}${String(em).padStart(2, '0')}:${String(es).padStart(2, '0')}`;
    
    // Progress bar
    const progress = data.total_steps > 0 ? (data.current_step / data.total_steps) * 100 : 0;
    $('progressFill').style.width = `${Math.min(progress, 100)}%`;
    
    // Loss chart
    if (data.loss && data.loss > 0) {
      state.progressData.losses.push(data.loss);
      state.progressData.steps.push(data.current_step || state.progressData.steps.length);
      drawLossChart();
    }
    
    // Progress text
    $('progressText').textContent = data.message || `${status}...`;
  }
  
  // Training complete
  if (status === 'done') {
    $('startBtn').disabled = false;
    $('stopBtn').disabled = true;
    state.isTraining = false;
    addLog('success', `✅ Training complete! Best accuracy: ${data.best_accuracy ? (data.best_accuracy * 100).toFixed(1) + '%' : 'N/A'}`);
    loadModels();
    updateHistory(data);
  }
  
  // Error
  if (status === 'error') {
    $('startBtn').disabled = false;
    $('stopBtn').disabled = true;
    state.isTraining = false;
    addLog('error', `❌ Training error: ${data.error || 'Unknown error'}`);
  }
  
  // GPU info
  if (data.gpus && data.gpus.length > 0) {
    const gpu = data.gpus[0];
    if (gpu) {
      $('gpuBadge').textContent = `🎮 ${gpu.name?.split(' ').slice(0,2).join(' ') || 'GPU'} · ${gpu.util}% · ${gpu.mem_used}MB`;
    }
  }
}

// ─── Loss Chart ───────────────────────────────────────────────────────────

function drawLossChart() {
  const canvas = $('lossChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
  canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const padding = { top: 10, right: 15, bottom: 15, left: 15 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;
  
  const losses = state.progressData.losses;
  if (losses.length < 2) {
    ctx.fillStyle = '#484860';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loss curve will appear during training', w / 2, h / 2);
    return;
  }
  
  const minLoss = Math.min(...losses);
  const maxLoss = Math.max(...losses);
  const range = maxLoss - minLoss || 1;
  
  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = padding.top + (plotH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
  }
  
  // Loss line
  ctx.strokeStyle = '#00d9ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  losses.forEach((loss, i) => {
    const x = padding.left + (i / (losses.length - 1)) * plotW;
    const y = padding.top + (1 - (loss - minLoss) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  
  ctx.stroke();
  
  // Glow effect
  ctx.strokeStyle = 'rgba(0,217,255,0.15)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  losses.forEach((loss, i) => {
    const x = padding.left + (i / (losses.length - 1)) * plotW;
    const y = padding.top + (1 - (loss - minLoss) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Labels
  ctx.fillStyle = '#484860';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(maxLoss.toFixed(2), padding.left - 4, padding.top + 10);
  ctx.fillText(minLoss.toFixed(2), padding.left - 4, h - padding.bottom);
}

function clearChart() {
  state.progressData.losses = [];
  state.progressData.steps = [];
  drawLossChart();
}

// ─── Model Management ─────────────────────────────────────────────────────

async function loadModels() {
  try {
    const data = await apiGet('/api/models');
    const models = data.models || [];
    renderModels(models);
  } catch {}
}

function renderModels(models) {
  const list = $('modelList');
  if (!list) return;
  
  if (models.length === 0) {
    list.innerHTML = '<div class="loading">No trained models yet</div>';
    return;
  }
  
  list.innerHTML = models.map(m => `
    <div class="model-item">
      <div class="model-name">${m.name}</div>
      <div class="model-size">${m.size_gb ? `${m.size_gb} GB · ` : ''}${m.type}</div>
      <div class="model-actions">
        ${m.type === 'gguf' ? `
          <a href="/api/models/${m.filename}" download class="btn-xs">⬇️ Download</a>
        ` : ''}
      </div>
    </div>
  `).join('');
}

async function refreshModels() {
  await loadModels();
  addLog('info', '🔄 Refreshed model list');
}

// ─── History ──────────────────────────────────────────────────────────────

async function loadHistory() {
  try {
    const data = await apiGet('/api/status');
    state.history = data.history || [];
  } catch {}
}

function updateHistory(data) {
  // History is loaded from server-side
}

// ─── Logging ──────────────────────────────────────────────────────────────

function addLog(type, message) {
  const container = $('logContainer');
  if (!container) return;
  
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
  
  // Keep only last 200 entries
  while (container.children.length > 200) {
    container.removeChild(container.firstChild);
  }
}

function clearLog() {
  const container = $('logContainer');
  if (container) {
    container.innerHTML = '';
  }
}

// ─── Window Resize Handling ──────────────────────────────────────────────

let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(drawLossChart, 200);
});
