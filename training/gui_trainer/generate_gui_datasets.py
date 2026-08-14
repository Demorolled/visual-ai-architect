#!/usr/bin/env python3
"""
=============================================================================
  🎨 GUI Training Dataset Generator
  =================================
  Generates comprehensive GUI-focused training datasets for GGUF LLM fine-tuning.

  Produces 5 dataset categories:
    1. gui-projects.jsonl    — Full project code + explanations from 92 HTML apps
    2. gui-components.jsonl  — UI component patterns (forms, tables, modals, etc.)
    3. gui-css-patterns.jsonl — CSS layout, animation, theme patterns
    4. gui-js-patterns.jsonl  — JavaScript interaction patterns
    5. gui-design.jsonl       — Design decisions & UX patterns

  All datasets follow the existing instruction-input-output JSONL format.
=============================================================================
"""

import json, os, re, sys, glob, time, math
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path(__file__).parent.parent.parent  # visual-ai-architect/
PROJECTS_DIR = PROJECT_ROOT / "projects"
OUTPUT_DIR = PROJECT_ROOT / "training" / "gui_trainer" / "datasets"
EXISTING_DATASET = PROJECT_ROOT / "training" / "dataset"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─── HTML Project Parsing ───────────────────────────────────────────────────

def parse_html_project(filepath):
    """Parse an HTML project file, extracting title, CSS, JS, and structure."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Extract title
    title_match = re.search(r'<title>(.*?)</title>', content, re.DOTALL)
    title = title_match.group(1).strip() if title_match else Path(filepath).stem.replace('-', ' ').title()

    # Extract description from h1 or meta
    desc_match = re.search(r'<h1[^>]*>(.*?)</h1>', content, re.DOTALL)
    description = desc_match.group(1).strip() if desc_match else title
    # Clean HTML from description
    description = re.sub(r'<[^>]+>', '', description).strip()

    # Extract CSS (between <style> and </style>)
    css_matches = re.findall(r'<style>(.*?)</style>', content, re.DOTALL)
    css = '\n'.join(css_matches) if css_matches else ''

    # Extract JS (between <script> and </script>, but not external scripts)
    js_matches = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
    js = '\n'.join(js_matches) if js_matches else ''

    # Extract HTML body (between <body> and </body>)
    body_match = re.search(r'<body[^>]*>(.*?)</body>', content, re.DOTALL)
    html_body = body_match.group(1).strip() if body_match else ''

    # Detect features from code
    features = detect_features(content, css, js)

    # Extract key UI patterns
    ui_patterns = extract_ui_patterns(html_body)

    return {
        'title': title,
        'description': description,
        'filename': Path(filepath).name,
        'size': len(content),
        'css_len': len(css),
        'js_len': len(js),
        'features': features,
        'ui_patterns': ui_patterns,
        'has_css': bool(css.strip()),
        'has_js': bool(js.strip()),
        'first_h1': description,
    }


def detect_features(content, css, js):
    """Detect features present in the project from code patterns."""
    features = set()
    content_lower = content.lower()

    # Layout features
    if 'grid' in css: features.add('CSS Grid')
    if 'flex' in css: features.add('Flexbox')
    if '@media' in css: features.add('Responsive')
    if 'animation' in css or '@keyframes' in css: features.add('Animations')
    if 'transition' in css: features.add('Transitions')
    if 'gradient' in css or 'linear-gradient' in css: features.add('Gradients')
    if 'transform' in css: features.add('Transforms')
    if 'filter' in css: features.add('CSS Filters')
    if 'box-shadow' in css: features.add('Box Shadows')

    # JS features
    if 'class ' in js: features.add('Classes')
    if 'addEventListener' in js or 'onclick' in js or 'oninput' in js: features.add('Event Handling')
    if 'fetch' in js or 'XMLHttpRequest' in js: features.add('API Calls')
    if 'localStorage' in js: features.add('Local Storage')
    if 'setInterval' in js or 'setTimeout' in js: features.add('Timers')
    if 'canvas' in js or 'getContext' in js: features.add('Canvas')
    if 'Audio' in js or 'audio' in js: features.add('Audio')
    if 'drag' in content_lower: features.add('Drag & Drop')
    if 'chart' in content_lower or 'graph' in content_lower: features.add('Charts')
    if 'Notification' in js: features.add('Notifications')
    if 'Math.random' in js: features.add('Randomization')
    if 'sort' in js: features.add('Sorting')
    if 'WebSocket' in js or 'socket' in js: features.add('WebSockets')
    if 'file' in content_lower: features.add('File Handling')

    return sorted(features)


def extract_ui_patterns(html_body):
    """Extract UI component patterns from HTML body."""
    patterns = set()
    if '<form' in html_body or '<input' in html_body: patterns.add('Forms')
    if '<table' in html_body: patterns.add('Tables')
    if '<canvas' in html_body: patterns.add('Canvas')
    if '<svg' in html_body: patterns.add('SVG')
    if '<video' in html_body: patterns.add('Video')
    if '<audio' in html_body: patterns.add('Audio')
    if '<iframe' in html_body: patterns.add('Iframe')
    if 'modal' in html_body.lower(): patterns.add('Modal')
    if 'nav' in html_body.lower() or '<a' in html_body: patterns.add('Navigation')
    if 'list' in html_body.lower() or '<li>' in html_body: patterns.add('Lists')
    if 'card' in html_body.lower(): patterns.add('Cards')
    if 'progress' in html_body.lower(): patterns.add('Progress')
    if 'range' in html_body.lower() or 'slider' in html_body.lower(): patterns.add('Sliders')
    if 'dropdown' in html_body.lower() or 'select' in html_body.lower(): patterns.add('Dropdowns')
    if 'chart' in html_body.lower(): patterns.add('Charts')
    if 'grid' in html_body.lower(): patterns.add('Grid Layout')
    if 'tab' in html_body.lower(): patterns.add('Tabs')
    if 'accordion' in html_body.lower(): patterns.add('Accordion')
    return sorted(patterns)


# ─── Instruction Generation ───────────────────────────────────────────────

def generate_project_instructions(project):
    """Generate diverse instruction-output pairs for a single HTML project."""
    entries = []
    name = project['title']
    filename = project['filename']
    features = ', '.join(project['features'][:5])
    patterns = ', '.join(project['ui_patterns'][:5])

    with open(PROJECTS_DIR / filename, 'r', encoding='utf-8', errors='replace') as f:
        full_code = f.read()

    # 1. Build instruction: produce the full app
    entries.append({
        "instruction": f"Build a {name} application",
        "input": f"I need a complete {name} app. Create HTML, CSS, and JavaScript. Features should include: {features}. UI patterns: {patterns}.",
        "output": full_code,
        "source": f"gui-projects/{filename}",
        "category": "full-build",
    })

    # 2. Explain instruction: describe the app architecture
    entries.append({
        "instruction": f"Explain the {name} application architecture",
        "input": f"How does the {name} app work? Describe its UI structure, key features, and interaction patterns.",
        "output": generate_architecture_explanation(project, features, patterns),
        "source": f"gui-projects/{filename}",
        "category": "explain",
    })

    # 3. Feature-specific instructions
    for feature in project['features'][:3]:
        entries.append({
            "instruction": f"Implement {feature} for a web application",
            "input": f"How do I implement {feature} in a web app? Show me a code example.",
            "output": generate_feature_example(feature, project),
            "source": f"gui-projects/{filename}",
            "category": "feature",
        })

    # 4. CSS-specific instruction
    if project['has_css']:
        entries.append({
            "instruction": f"Style a {name} application",
            "input": f"What CSS patterns and styling approach would you use for a {name} app? Show key CSS.",
            "output": generate_css_explanation(project),
            "source": f"gui-projects/{filename}",
            "category": "css-pattern",
        })

    # 5. JS-specific instruction
    if project['has_js']:
        entries.append({
            "instruction": f"Write JavaScript logic for {name}",
            "input": f"Write the core JavaScript functionality for a {name} application.",
            "output": extract_js_and_explain(filename),
            "source": f"gui-projects/{filename}",
            "category": "js-pattern",
        })

    return entries


def generate_architecture_explanation(project, features, patterns):
    """Generate natural language explanation of an app's architecture."""
    name = project['title']
    return f"""A {name} application is a single-page web app built with vanilla HTML, CSS, and JavaScript.

## UI Structure
The app follows a container layout pattern with these key elements:
- A main container with centered content using flexbox
- Dark theme with accent colors (#00d9ff cyan, #1a1a2e background)
- Responsive design with media queries for mobile support

## Key Features
{features}

## UI Components
{patterns}

## Interaction Patterns
- Event-driven user interactions via onclick handlers or addEventListener
- Real-time UI updates through DOM manipulation
- State management through JavaScript variables

## Styling Approach
- CSS Grid and Flexbox for layout
- CSS custom properties for consistent theming
- Gradient backgrounds and box shadows for depth
- Hover states and transitions for interactivity
- Mobile-first responsive design

The app demonstrates clean separation of HTML structure, CSS styling, and JavaScript behavior in a single file making it easy to deploy and maintain."""


def generate_feature_example(feature, project):
    """Generate a focused code example for a specific feature."""
    examples = {
        'CSS Grid': """```css
.container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 20px;
}
.item {
  background: linear-gradient(145deg, #1a1a2e, #1e1e3a);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px;
  transition: transform 0.2s, box-shadow 0.2s;
}
.item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,217,255,0.15);
}
```""",
        'Flexbox': """```css
.layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.sidebar {
  flex: 0 0 280px;
}
.main {
  flex: 1;
  min-width: 0;
}
@media (max-width: 768px) {
  .layout {
    flex-direction: column;
  }
  .sidebar {
    flex: none;
    width: 100%;
  }
}
```""",
        'Animations': """```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.animate-in {
  animation: fadeIn 0.3s ease forwards;
}
.pulse {
  animation: pulse 2s ease-in-out infinite;
}
```""",
        'Event Handling': """```javascript
// Event delegation pattern for dynamic elements
document.querySelector('.container').addEventListener('click', (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  
  const action = btn.dataset.action;
  switch(action) {
    case 'delete':
      deleteItem(btn.dataset.id);
      break;
    case 'edit':
      openEditor(btn.dataset.id);
      break;
    case 'toggle':
      toggleState(btn.dataset.id);
      break;
  }
});

// Input handling with debounce
let debounceTimer;
searchInput.addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    performSearch(e.target.value);
  }, 300);
});
```""",
        'Local Storage': """```javascript
// Persistent state management
const Store = {
  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(`app_${key}`);
      return data ? JSON.parse(data) : defaultValue;
    } catch { return defaultValue; }
  },
  set(key, value) {
    try {
      localStorage.setItem(`app_${key}`, JSON.stringify(value));
      return true;
    } catch { return false; }
  },
  remove(key) {
    localStorage.removeItem(`app_${key}`);
  },
  clear() {
    // Only clear app-specific keys
    Object.keys(localStorage)
      .filter(k => k.startsWith('app_'))
      .forEach(k => localStorage.removeItem(k));
  }
};

// Auto-save pattern
function autoSave(state) {
  Store.set('app_state', state);
}

// Load on init
const savedState = Store.get('app_state', {});
""",
        'Canvas': """```javascript
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Resize canvas
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
}

// Drawing loop
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw shapes
  ctx.fillStyle = '#00d9ff';
  ctx.shadowColor = 'rgba(0,217,255,0.3)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw text
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.fillText('Hello Canvas!', 20, 40);
  
  requestAnimationFrame(draw);
}

draw();
""",
        'Responsive': """```css
/* Mobile-first responsive design */
* { box-sizing: border-box; }

.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}

/* Tablet */ 
@media (min-width: 768px) {
  .container { padding: 24px; }
  .grid { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop */
@media (min-width: 1024px) {
  .container { padding: 32px; }
  .grid { grid-template-columns: repeat(3, 1fr); }
}

/* Large Desktop */
@media (min-width: 1440px) {
  .container { max-width: 1400px; }
  .grid { grid-template-columns: repeat(4, 1fr); }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  body { background: #0f0f1a; color: #ccc; }
}
""",
        'Transitions': """```css
/* Smooth interaction transitions */
.button {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #00d9ff;
  color: #0f0f1a;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,217,255,0.3);
}
.button:active {
  transform: translateY(0);
}

/* Card hover effect */
.card {
  transition: transform 0.2s, box-shadow 0.2s;
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.3);
}
```""",
    }
    return examples.get(feature, f"// {feature} implementation pattern for {project['title']}\n// This pattern is commonly used in modern web applications.\n// See the {project['filename']} project for a complete example.")


def generate_css_explanation(project):
    """Generate CSS explanation focused on the project's styling approach."""
    name = project['title']
    return f"""The {name} app uses a modern dark-themed design system with these key CSS patterns:

## Color Palette
- Background: #0f0f1a, #1a1a2e (dark layers)
- Accent: #00d9ff (cyan), #0099ff (blue)
- Text: #ffffff, #ccc, #888 (hierarchy)
- Surface: rgba(255,255,255,0.02-0.08) (cards/borders)

## Typography
- Font family: 'Segoe UI', Arial, sans-serif
- Size hierarchy: h1 (1.5rem), body (0.85rem), small (0.7-0.8rem)
- Monospace for code/data displays

## Layout
- Flexbox for centering and side-by-side layouts
- CSS Grid for multi-column arrangements
- Max-width containers (520px-1000px) with auto margins

## Visual Effects
- Background gradients for depth: linear-gradient(135deg, ...)
- Box shadows for elevation
- Border-radius for softer UI (8px-16px)
- Transition on interactive elements (0.2s ease)
- Box-shadow on hover for interactive feedback

## Responsive Design
- Media queries at 500px-768px breakpoints
- Stack layout vertically on mobile
- Scale down fonts and spacing

This creates a cohesive, professional dark UI that's both functional and visually appealing."""


def extract_js_and_explain(filename):
    """Extract JS from a project file and provide explanation."""
    with open(PROJECTS_DIR / filename, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
        
    js_matches = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
    js = '\n\n'.join(js_matches) if js_matches else '// No JavaScript found'
    
    # If JS is too long, truncate and summarize
    if len(js) > 3000:
        js = js[:3000] + '\n// ... (truncated)'
    
    return js


# ─── Synthetic GUI Knowledge Datasets ──────────────────────────────────────

def generate_component_patterns():
    """Generate synthetic dataset about UI component patterns (25+ components)."""
    return [
        {
            "instruction": "Build a modal dialog component",
            "input": "Create a reusable modal dialog with overlay, close button, and smooth animations.",
            "output": """```html
<div class="modal-overlay" id="modalOverlay" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h3>Modal Title</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body"><p>Modal content goes here</p></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmAction()">Confirm</button>
    </div>
  </div>
</div>
<style>
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;z-index:1000;animation:fadeIn .2s ease}
.modal-overlay.open{display:flex}
.modal{background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:0;min-width:400px;max-width:90vw;box-shadow:0 24px 48px rgba(0,0,0,0.4);animation:slideUp .2s ease}
.modal-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)}
.modal-header h3{color:#e0e0f0;font-size:1rem}
.modal-close{background:none;border:none;color:#666;font-size:1.5rem;cursor:pointer;padding:0 4px}
.modal-close:hover{color:#f87171}
.modal-body{padding:20px;color:#aaa;font-size:.85rem}
.modal-footer{display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid rgba(255,255,255,0.06)}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
</style>
<script>
function openModal(){document.getElementById('modalOverlay').classList.add('open')}
function closeModal(){document.getElementById('modalOverlay').classList.remove('open')}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a tabs component",
            "input": "Create a tabbed interface with smooth content switching, active state highlighting, and keyboard navigation.",
            "output": """```html
<div class="tabs-container">
  <div class="tabs-header" role="tablist">
    <button class="tab-btn active" data-tab="tab1" role="tab" onclick="switchTab('tab1', this)">📄 Overview</button>
    <button class="tab-btn" data-tab="tab2" role="tab" onclick="switchTab('tab2', this)">⚙️ Settings</button>
    <button class="tab-btn" data-tab="tab3" role="tab" onclick="switchTab('tab3', this)">📊 Analytics</button>
    <div class="tab-indicator" id="tabIndicator"></div>
  </div>
  <div class="tab-panel active" id="tab1"><h3>Overview</h3><p>Main content panel with key information and summary statistics.</p></div>
  <div class="tab-panel" id="tab2"><h3>Settings</h3><p>Configuration options and preference controls.</p></div>
  <div class="tab-panel" id="tab3"><h3>Analytics</h3><p>Charts, graphs, and data-driven insights.</p></div>
</div>
<style>
.tabs-container{background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden}
.tabs-header{display:flex;position:relative;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.06)}
.tab-btn{padding:12px 20px;border:none;background:transparent;color:#666;cursor:pointer;font-size:.8rem;font-weight:500;transition:.15s;position:relative;z-index:1}
.tab-btn:hover{color:#aaa}
.tab-btn.active{color:#00d9ff}
.tab-indicator{position:absolute;bottom:0;height:2px;background:#00d9ff;transition:all .25s ease;border-radius:2px 2px 0 0}
.tab-panel{display:none;padding:20px;color:#aaa;font-size:.85rem;animation:fadeIn .2s ease}
.tab-panel.active{display:block}
.tab-panel h3{color:#e0e0f0;font-size:1rem;margin-bottom:8px}
</style>
<script>
function switchTab(tabId, btn){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
  const indicator=document.getElementById('tabIndicator');
  const tabs=document.querySelector('.tabs-header');
  indicator.style.left=btn.offsetLeft+'px';
  indicator.style.width=btn.offsetWidth+'px';
}
document.querySelector('.tab-btn.active')&&switchTab(
  document.querySelector('.tab-btn.active').dataset.tab,
  document.querySelector('.tab-btn.active')
);
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build an accordion component",
            "input": "Create a collapsible accordion with smooth expand/collapse animations, multiple items, and keyboard support.",
            "output": """```html
<div class="accordion">
  <div class="accordion-item">
    <button class="accordion-header" onclick="toggleAccordion(this)">
      <span>📦 Getting Started</span>
      <span class="accordion-icon">▾</span>
    </button>
    <div class="accordion-body"><div class="accordion-content">Quick start guide with installation steps and basic configuration for new users.</div></div>
  </div>
  <div class="accordion-item active">
    <button class="accordion-header" onclick="toggleAccordion(this)">
      <span>⚙️ Configuration</span>
      <span class="accordion-icon">▾</span>
    </button>
    <div class="accordion-body"><div class="accordion-content">Detailed configuration options including environment variables, feature flags, and customization settings.</div></div>
  </div>
  <div class="accordion-item">
    <button class="accordion-header" onclick="toggleAccordion(this)">
      <span>🔌 API Reference</span>
      <span class="accordion-icon">▾</span>
    </button>
    <div class="accordion-body"><div class="accordion-content">Complete API documentation with endpoints, request/response formats, authentication, and rate limiting details.</div></div>
  </div>
</div>
<style>
.accordion{background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden}
.accordion-item{border-bottom:1px solid rgba(255,255,255,0.04)}
.accordion-item:last-child{border-bottom:none}
.accordion-header{width:100%;display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:transparent;border:none;color:#ccc;font-size:.85rem;cursor:pointer;transition:.15s;font-family:inherit;text-align:left}
.accordion-header:hover{background:rgba(255,255,255,0.03);color:#fff}
.accordion-icon{transition:transform .25s ease;font-size:.8rem;color:#666}
.accordion-item.active .accordion-icon{transform:rotate(180deg)}
.accordion-body{max-height:0;overflow:hidden;transition:max-height .3s ease}
.accordion-item.active .accordion-body{max-height:200px}
.accordion-content{padding:0 18px 14px;color:#888;font-size:.8rem;line-height:1.6}
</style>
<script>
function toggleAccordion(btn){
  const item=btn.parentElement;
  const isActive=item.classList.contains('active');
  document.querySelectorAll('.accordion-item').forEach(i=>i.classList.remove('active'));
  if(!isActive)item.classList.add('active');
}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a toast notification component",
            "input": "Create a toast notification system with success, error, warning, info variants, auto-dismiss, and stacking.",
            "output": """```html
<div class="toast-container" id="toastContainer"></div>
<button class="btn btn-primary" onclick="showToast('success','Saved successfully!','The changes have been saved.','👍')">Show Success</button>
<button class="btn btn-sm" onclick="showToast('error','Connection failed!','Check your internet connection.','❌')" style="margin-left:8px">Show Error</button>
<style>
.toast-container{position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.toast{display:flex;align-items:center;gap:12px;padding:14px 18px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);min-width:320px;max-width:420px;animation:slideInRight .3s ease;pointer-events:all;transition:opacity .3s,transform .3s}
.toast.removing{opacity:0;transform:translateX(100%)}
.toast-icon{font-size:1.3rem;flex-shrink:0}
.toast-content{flex:1}
.toast-title{font-size:.85rem;font-weight:600;color:#e0e0f0;margin-bottom:2px}
.toast-msg{font-size:.75rem;color:#888}
.toast-close{background:none;border:none;color:#555;cursor:pointer;font-size:1rem;padding:2px}
.toast-close:hover{color:#aaa}
.toast.success .toast-icon{color:#4ade80}
.toast.error .toast-icon{color:#f87171}
.toast.warning .toast-icon{color:#facc15}
.toast.info .toast-icon{color:#60a5fa}
.toast.success{border-left:3px solid #4ade80}
.toast.error{border-left:3px solid #f87171}
.toast.warning{border-left:3px solid #facc15}
.toast.info{border-left:3px solid #60a5fa}
@keyframes slideInRight{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}
</style>
<script>
function showToast(type,title,msg,icon){
  const container=document.getElementById('toastContainer');
  const toast=document.createElement('div');
  toast.className='toast '+type;
  toast.innerHTML='<span class="toast-icon">'+(icon||'ℹ️')+'</span><div class="toast-content"><div class="toast-title">'+title+'</div><div class="toast-msg">'+msg+'</div></div><button class="toast-close" onclick="this.parentElement.classList.add(\'removing\');setTimeout(()=>this.parentElement.remove(),300)">✕</button>';
  container.appendChild(toast);
  setTimeout(()=>{toast.classList.add('removing');setTimeout(()=>toast.remove(),300)},4000);
}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a tooltip component",
            "input": "Create a CSS-only tooltip component with positioning (top, bottom, left, right), animations, and custom content.",
            "output": """```html
<div style="display:flex;gap:40px;justify-content:center;padding:40px">
  <div class="tooltip-wrap"><button class="btn btn-sm">Hover Top</button><div class="tooltip tooltip-top">Tooltip on top</div></div>
  <div class="tooltip-wrap"><button class="btn btn-sm">Hover Bottom</button><div class="tooltip tooltip-bottom">Tooltip on bottom</div></div>
  <div class="tooltip-wrap"><button class="btn btn-sm">Hover Left</button><div class="tooltip tooltip-left">Tooltip on left</div></div>
  <div class="tooltip-wrap"><button class="btn btn-sm">Hover Right</button><div class="tooltip tooltip-right">Tooltip on right</div></div>
</div>
<style>
.tooltip-wrap{position:relative;display:inline-block}
.tooltip{position:absolute;background:#1a1a2e;color:#ccc;padding:6px 12px;border-radius:6px;font-size:.7rem;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .2s ease,transform .2s ease;border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:100}
.tooltip::after{content:'';position:absolute;width:6px;height:6px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);transform:rotate(45deg)}
.tooltip-top{bottom:calc(100% + 8px);left:50%;transform:translateX(-50%) translateY(4px)}
.tooltip-top::after{bottom:-4px;left:50%;margin-left:-3px;border-top:none;border-left:none}
.tooltip-bottom{top:calc(100% + 8px);left:50%;transform:translateX(-50%) translateY(-4px)}
.tooltip-bottom::after{top:-4px;left:50%;margin-left:-3px;border-bottom:none;border-right:none}
.tooltip-left{right:calc(100% + 8px);top:50%;transform:translateY(-50%) translateX(4px)}
.tooltip-left::after{right:-4px;top:50%;margin-top:-3px;border-left:none;border-bottom:none}
.tooltip-right{left:calc(100% + 8px);top:50%;transform:translateY(-50%) translateX(-4px)}
.tooltip-right::after{left:-4px;top:50%;margin-top:-3px;border-right:none;border-top:none}
.tooltip-wrap:hover .tooltip{opacity:1;transform:translateX(-50%) translateY(0)}
.tooltip-wrap:hover .tooltip-left,.tooltip-wrap:hover .tooltip-right{transform:translateY(-50%) translateX(0)}
</style>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a toggle switch component",
            "input": "Create an accessible toggle switch with smooth animation, disabled state, and ARIA support.",
            "output": """```html
<div class="toggle-group">
  <label class="toggle">
    <input type="checkbox" checked onchange="toggleChanged(this)">
    <span class="toggle-slider"></span>
    <span class="toggle-label">Enable notifications</span>
  </label>
  <label class="toggle">
    <input type="checkbox" onchange="toggleChanged(this)">
    <span class="toggle-slider"></span>
    <span class="toggle-label">Dark mode</span>
  </label>
  <label class="toggle">
    <input type="checkbox" disabled>
    <span class="toggle-slider"></span>
    <span class="toggle-label">Premium feature (disabled)</span>
  </label>
</div>
<style>
.toggle-group{display:flex;flex-direction:column;gap:14px;padding:16px}
.toggle{display:flex;align-items:center;gap:12px;cursor:pointer;user-select:none}
.toggle input{position:absolute;opacity:0;width:0;height:0}
.toggle-slider{position:relative;width:44px;height:24px;background:rgba(255,255,255,0.08);border-radius:12px;transition:.2s;flex-shrink:0}
.toggle-slider::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;background:#666;border-radius:50%;transition:.25s cubic-bezier(0.4,0,0.2,1)}
.toggle input:checked+.toggle-slider{background:rgba(0,217,255,0.3)}
.toggle input:checked+.toggle-slider::after{background:#00d9ff;transform:translateX(20px)}
.toggle input:disabled+.toggle-slider{opacity:.4;cursor:not-allowed}
.toggle input:focus-visible+.toggle-slider{box-shadow:0 0 0 2px rgba(0,217,255,0.3)}
.toggle-label{font-size:.8rem;color:#aaa}
</style>
<script>
function toggleChanged(el){console.log('Toggle:',el.checked)}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a progress bar component",
            "input": "Create animated progress bars with label, percentage, color variants, and indeterminate state.",
            "output": """```html
<div class="progress-group">
  <div class="progress-item">
    <div class="progress-header"><span>Downloading...</span><span class="progress-pct" id="pct1">0%</span></div>
    <div class="progress-bar"><div class="progress-fill" id="fill1" style="width:0%"></div></div>
  </div>
  <div class="progress-item">
    <div class="progress-header"><span>Task progress</span><span class="progress-pct">64%</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:64%"></div></div>
  </div>
  <div class="progress-item">
    <div class="progress-header"><span>Upload</span><span class="progress-pct success">100%</span></div>
    <div class="progress-bar"><div class="progress-fill success" style="width:100%"></div></div>
  </div>
  <div class="progress-item">
    <div class="progress-header"><span>Indeterminate</span></div>
    <div class="progress-bar"><div class="progress-fill indeterminate"></div></div>
  </div>
</div>
<button class="btn btn-sm" onclick="animateProgress()">▶ Animate</button>
<style>
.progress-group{display:flex;flex-direction:column;gap:14px;padding:16px}
.progress-item{display:flex;flex-direction:column;gap:4px}
.progress-header{display:flex;justify-content:space-between;font-size:.75rem;color:#888}
.progress-pct{color:#888;font-family:monospace}
.progress-pct.success{color:#4ade80}
.progress-bar{height:6px;background:rgba(255,255,255,0.04);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,#00d9ff,#0099ff);border-radius:3px;transition:width .5s ease}
.progress-fill.success{background:linear-gradient(90deg,#4ade80,#22c55e)}
.progress-fill.indeterminate{width:40%;animation:indeterminate 1.5s ease infinite}
@keyframes indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
</style>
<script>
function animateProgress(){
  let p=0;
  const fill=document.getElementById('fill1');
  const pct=document.getElementById('pct1');
  const interval=setInterval(()=>{p+=2;fill.style.width=p+'%';pct.textContent=p+'%';if(p>=100)clearInterval(interval)},30);
}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a pagination component",
            "input": "Create a page navigation component with previous/next buttons, page numbers, ellipsis truncation, and active state.",
            "output": """```html
<div class="pagination">
  <button class="page-btn" onclick="goToPage(1)" disabled id="prevBtn">‹ Prev</button>
  <div class="page-numbers" id="pageNumbers"></div>
  <button class="page-btn" onclick="goToPage(10)" id="nextBtn">Next ›</button>
</div>
<div class="page-info" id="pageInfo" style="text-align:center;color:#666;font-size:.75rem;margin-top:8px">Page 1 of 10</div>
<style>
.pagination{display:flex;align-items:center;justify-content:center;gap:4px;padding:12px}
.page-btn{padding:6px 14px;border:1px solid rgba(255,255,255,0.06);border-radius:6px;background:transparent;color:#888;cursor:pointer;font-size:.75rem;transition:.15s}
.page-btn:hover:not(:disabled){border-color:#00d9ff;color:#00d9ff}
.page-btn:disabled{opacity:.3;cursor:not-allowed}
.page-numbers{display:flex;gap:2px}
.page-num{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:#888;cursor:pointer;border-radius:6px;font-size:.8rem;transition:.15s}
.page-num:hover{background:rgba(255,255,255,0.04);color:#ccc}
.page-num.active{background:rgba(0,217,255,0.1);color:#00d9ff;font-weight:600}
.page-num.ellipsis{color:#555;cursor:default}
</style>
<script>
let currentPage=1,totalPages=10;
function renderPagination(){
  const container=document.getElementById('pageNumbers');
  let html='';
  const range=2,start=Math.max(1,currentPage-range),end=Math.min(totalPages,currentPage+range);
  if(currentPage>1){html+='<button class="page-num" onclick="goToPage(1)">1</button>';if(start>2)html+='<span class="page-num ellipsis">…</span>'}
  for(let i=start;i<=end;i++)html+='<button class="page-num'+(i===currentPage?' active':'')+'" onclick="goToPage('+i+')">'+i+'</button>'
  if(currentPage<totalPages-1){if(end<totalPages-1)html+='<span class="page-num ellipsis">…</span>';html+='<button class="page-num" onclick="goToPage('+totalPages+')">'+totalPages+'</button>'}
  container.innerHTML=html;
  document.getElementById('prevBtn').disabled=currentPage===1;
  document.getElementById('nextBtn').disabled=currentPage===totalPages;
  document.getElementById('pageInfo').textContent='Page '+currentPage+' of '+totalPages;
}
function goToPage(p){currentPage=p;renderPagination()}
renderPagination();
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a breadcrumb component",
            "input": "Create a breadcrumb navigation trail with clickable segments, separators, and active page highlighting.",
            "output": """```html
<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="#" class="crumb" onclick="return false">🏠 Home</a>
  <span class="crumb-sep">›</span>
  <a href="#" class="crumb" onclick="return false">Products</a>
  <span class="crumb-sep">›</span>
  <a href="#" class="crumb" onclick="return false">Category</a>
  <span class="crumb-sep">›</span>
  <span class="crumb current">Current Item</span>
</nav>
<style>
.breadcrumb{display:flex;align-items:center;gap:4px;padding:10px 16px;background:rgba(255,255,255,0.02);border-radius:8px;font-size:.8rem;flex-wrap:wrap}
.crumb{color:#888;text-decoration:none;padding:4px 8px;border-radius:4px;transition:.15s}
.crumb:hover{color:#00d9ff;background:rgba(0,217,255,0.06)}
.crumb.current{color:#e0e0f0;cursor:default;font-weight:500}
.crumb-sep{color:#444;font-size:1.1rem;padding:0 2px;user-select:none}
</style>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a badge component",
            "input": "Create notification badges with size variants, color themes, dot mode, and positioning for icons.",
            "output": """```html
<div style="display:flex;gap:24px;align-items:center;padding:24px;flex-wrap:wrap">
  <div class="badge-wrap"><button class="btn btn-sm">Inbox</button><span class="badge">3</span></div>
  <div class="badge-wrap"><button class="btn btn-sm">Notifications</button><span class="badge dot"></span></div>
  <div class="badge-wrap"><span class="badge badge-lg">99+</span><span style="color:#888;font-size:.8rem;margin-left:8px">Large</span></div>
  <span class="badge badge-success">Active</span>
  <span class="badge badge-warning">Pending</span>
  <span class="badge badge-error">Failed</span>
  <span class="badge badge-info">Draft</span>
</div>
<style>
.badge-wrap{position:relative;display:inline-block}
.badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 6px;border-radius:9px;background:linear-gradient(135deg,#f87171,#ef4444);color:#fff;font-size:.6rem;font-weight:700;line-height:1}
.badge.dot{width:8px;min-width:8px;height:8px;padding:0;border-radius:50%;position:absolute;top:2px;right:2px}
.badge-lg{min-width:24px;height:24px;padding:0 8px;border-radius:12px;font-size:.7rem}
.badge-success{background:linear-gradient(135deg,#4ade80,#22c55e)}
.badge-warning{background:linear-gradient(135deg,#facc15,#eab308);color:#000}
.badge-error{background:linear-gradient(135deg,#f87171,#ef4444)}
.badge-info{background:linear-gradient(135deg,#60a5fa,#3b82f6)}
</style>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a star rating component",
            "input": "Create an interactive star rating with hover preview, click-to-rate, half-star support, and display mode.",
            "output": """```html
<div class="rating-group">
  <div style="margin-bottom:8px;color:#aaa;font-size:.8rem">Rate your experience:</div>
  <div class="stars" id="starRating" data-rating="0">
    <span class="star" data-value="1" onmouseenter="hoverStar(1)" onmouseleave="resetStars()" onclick="setRating(1)">☆</span>
    <span class="star" data-value="2" onmouseenter="hoverStar(2)" onmouseleave="resetStars()" onclick="setRating(2)">☆</span>
    <span class="star" data-value="3" onmouseenter="hoverStar(3)" onmouseleave="resetStars()" onclick="setRating(3)">☆</span>
    <span class="star" data-value="4" onmouseenter="hoverStar(4)" onmouseleave="resetStars()" onclick="setRating(4)">☆</span>
    <span class="star" data-value="5" onmouseenter="hoverStar(5)" onmouseleave="resetStars()" onclick="setRating(5)">☆</span>
  </div>
  <div id="ratingText" style="font-size:.75rem;color:#666;margin-top:4px">Click to rate</div>
</div>
<div style="margin-top:16px;color:#888;font-size:.8rem">Read-only display: <span class="stars-display" data-rating="3.5">★★★½☆</span></div>
<style>
.rating-group{padding:16px}
.stars,.stars-display{display:inline-flex;gap:4px;font-size:1.5rem;cursor:pointer}
.stars-display{font-size:1.2rem;cursor:default;color:#facc15}
.star{color:#444;transition:color .15s,transform .15s;cursor:pointer}
.star:hover{transform:scale(1.2)}
.star.active,.star.hover{color:#facc15}
.star.active{text-shadow:0 0 8px rgba(250,204,21,0.3)}
</style>
<script>
let userRating=0;
function setRating(v){userRating=v;document.querySelectorAll('.star').forEach(s=>s.classList.toggle('active',s.dataset.value<=v));document.getElementById('ratingText').textContent=v?'Rated '+v+'/5':'Click to rate'}
function hoverStar(v){document.querySelectorAll('.star').forEach(s=>s.classList.toggle('hover',s.dataset.value<=v&&s.dataset.value>userRating))}
function resetStars(){document.querySelectorAll('.star').forEach(s=>s.classList.remove('hover'))}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a chip/tag component",
            "input": "Create removable tag chips with input, color variants, autocomplete suggestions, and keyboard support.",
            "output": """```html
<div class="chips-container">
  <div class="chips" id="chipContainer">
    <span class="chip">JavaScript ✕</span>
    <span class="chip chip-primary">React ✕</span>
    <span class="chip chip-success">TypeScript ✕</span>
    <span class="chip chip-warning">beta</span>
    <input class="chip-input" id="chipInput" placeholder="Add tag..." onkeydown="addChip(event)">
  </div>
  <div class="chip-suggestions" id="chipSuggestions"></div>
</div>
<style>
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:10px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.08);border-radius:8px;align-items:center}
.chips:focus-within{border-color:rgba(0,217,255,0.3)}
.chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,0.06);color:#aaa;border-radius:20px;font-size:.75rem;cursor:default;transition:.15s}
.chip:hover{background:rgba(255,255,255,0.1)}
.chip-primary{background:rgba(0,217,255,0.1);color:#00d9ff}
.chip-success{background:rgba(74,222,128,0.1);color:#4ade80}
.chip-warning{background:rgba(250,204,21,0.1);color:#facc15}
.chip-input{border:none;background:transparent;color:#ccc;font-size:.8rem;outline:none;min-width:100px;flex:1;padding:4px}
.chip-input::placeholder{color:#444}
.chip-suggestions{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;padding:4px}
.chip-suggestion{padding:3px 10px;background:rgba(255,255,255,0.03);color:#888;border-radius:4px;font-size:.7rem;cursor:pointer;transition:.1s}
.chip-suggestion:hover{background:rgba(0,217,255,0.08);color:#00d9ff}
</style>
<script>
const suggestions=['vue','angular','svelte','node','python','rust'];
function addChip(e){if(e.key!=='Enter')return;const input=document.getElementById('chipInput');const val=input.value.trim();if(!val)return;const chip=document.createElement('span');chip.className='chip';chip.textContent=val+' ';const close=document.createElement('span');close.textContent='✕';close.style.cursor='pointer';close.style.opacity='.5';close.onclick=()=>chip.remove();chip.appendChild(close);input.parentElement.insertBefore(chip,input);input.value='';document.getElementById('chipSuggestions').innerHTML=''}
document.getElementById('chipInput').addEventListener('input',function(){const val=this.value.trim();const container=document.getElementById('chipSuggestions');if(!val||val.length<1){container.innerHTML='';return}const filtered=suggestions.filter(s=>s.includes(val.toLowerCase()));container.innerHTML=filtered.map(s=>'<span class="chip-suggestion" onclick="document.getElementById(\'chipInput\').value=\''+s+'\';this.click()">'+s+'</span>').join('')});
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a timeline component",
            "input": "Create a vertical timeline with alternating left/right items, dates, icons, and animations.",
            "output": """```html
<div class="timeline">
  <div class="tl-item">
    <div class="tl-dot">🚀</div>
    <div class="tl-content">
      <div class="tl-date">2024 Q1</div>
      <h4>Project Kickoff</h4>
      <p>Initial planning and requirements gathering completed with stakeholder alignment.</p>
    </div>
  </div>
  <div class="tl-item">
    <div class="tl-dot">⚙️</div>
    <div class="tl-content">
      <div class="tl-date">2024 Q2</div>
      <h4>Core Development</h4>
      <p>Main feature development including API, frontend components, and database schema.</p>
    </div>
  </div>
  <div class="tl-item">
    <div class="tl-dot">🧪</div>
    <div class="tl-content">
      <div class="tl-date">2024 Q3</div>
      <h4>Testing & QA</h4>
      <p>Comprehensive testing, bug fixes, and performance optimization across the platform.</p>
    </div>
  </div>
  <div class="tl-item">
    <div class="tl-dot">🎉</div>
    <div class="tl-content">
      <div class="tl-date">2024 Q4</div>
      <h4>Launch</h4>
      <p>Production deployment with monitoring, documentation, and team training completed.</p>
    </div>
  </div>
</div>
<style>
.timeline{position:relative;padding:20px 0}
.timeline::before{content:'';position:absolute;left:36px;top:0;bottom:0;width:2px;background:rgba(255,255,255,0.06)}
.tl-item{position:relative;padding-left:68px;padding-bottom:28px;animation:fadeIn .3s ease}
.tl-item:last-child{padding-bottom:0}
.tl-dot{position:absolute;left:24px;top:0;width:26px;height:26px;background:#1a1a2e;border:2px solid rgba(0,217,255,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.7rem;z-index:1}
.tl-content{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:10px;padding:14px 18px}
.tl-content:hover{border-color:rgba(255,255,255,0.08);background:rgba(255,255,255,0.03)}
.tl-date{font-size:.65rem;color:#00d9ff;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
.tl-content h4{color:#e0e0f0;font-size:.85rem;margin-bottom:4px}
.tl-content p{color:#777;font-size:.75rem;line-height:1.5;margin:0}
</style>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a skeleton loading component",
            "input": "Create skeleton loading placeholders with shimmer animation for cards, text lines, and avatars.",
            "output": """```html
<div class="skeleton-demo">
  <div class="skeleton-card">
    <div class="skeleton skeleton-img"></div>
    <div class="skeleton-body">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text short"></div>
      <div class="skeleton-row">
        <div class="skeleton skeleton-avatar"></div>
        <div class="skeleton skeleton-meta"></div>
      </div>
    </div>
  </div>
  <div class="skeleton-card">
    <div class="skeleton skeleton-img"></div>
    <div class="skeleton-body">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text short"></div>
      <div class="skeleton-row">
        <div class="skeleton skeleton-avatar"></div>
        <div class="skeleton skeleton-meta"></div>
      </div>
    </div>
  </div>
</div>
<style>
.skeleton-demo{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px}
.skeleton-card{background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden}
.skeleton-body{padding:14px}
.skeleton{background:linear-gradient(90deg,rgba(255,255,255,0.03) 25%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.03) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px}
.skeleton-img{height:140px;border-radius:0}
.skeleton-title{height:16px;width:70%;margin-bottom:10px}
.skeleton-text{height:10px;width:100%;margin-bottom:8px}
.skeleton-text.short{width:50%}
.skeleton-row{display:flex;align-items:center;gap:10px;margin-top:12px}
.skeleton-avatar{width:32px;height:32px;border-radius:50%}
.skeleton-meta{height:10px;width:100px;border-radius:4px}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
</style>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a file upload component",
            "input": "Create a drag-and-drop file upload zone with preview, progress, file type validation, and multi-file support.",
            "output": """```html
<div class="upload-zone" id="uploadZone" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
  <div class="upload-content" id="uploadContent">
    <div class="upload-icon">📁</div>
    <div class="upload-text">Drag & drop files here</div>
    <div class="upload-sub">or <label class="upload-link" for="fileInput">browse files</label></div>
    <input type="file" id="fileInput" multiple hidden onchange="handleFiles(this.files)">
  </div>
  <div class="upload-preview" id="uploadPreview"></div>
</div>
<style>
.upload-zone{border:2px dashed rgba(255,255,255,0.08);border-radius:12px;padding:32px;text-align:center;transition:.2s;cursor:pointer;background:rgba(255,255,255,0.01)}
.upload-zone:hover,.upload-zone.dragover{border-color:#00d9ff;background:rgba(0,217,255,0.03)}
.upload-zone.dragover{border-color:#00d9ff;background:rgba(0,217,255,0.05)}
.upload-icon{font-size:2.5rem;margin-bottom:8px}
.upload-text{color:#ccc;font-size:.9rem;font-weight:500;margin-bottom:4px}
.upload-sub{color:#666;font-size:.8rem}
.upload-link{color:#00d9ff;cursor:pointer;text-decoration:underline}
.upload-link:hover{color:#33e1ff}
.upload-preview{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.upload-file{padding:8px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;display:flex;align-items:center;gap:8px;font-size:.75rem}
.upload-file .name{color:#ccc}
.upload-file .size{color:#555;font-family:monospace}
.upload-file .remove{color:#f87171;cursor:pointer;font-size:1rem;padding:0 4px}
</style>
<script>
const uploadZone=document.getElementById('uploadZone');
const preview=document.getElementById('uploadPreview');
function handleDragOver(e){e.preventDefault();uploadZone.classList.add('dragover')}
function handleDragLeave(e){uploadZone.classList.remove('dragover')}
function handleDrop(e){e.preventDefault();uploadZone.classList.remove('dragover');handleFiles(e.dataTransfer.files)}
function handleFiles(files){for(const f of files){const div=document.createElement('div');div.className='upload-file';const size=(f.size/1024).toFixed(1);div.innerHTML='<span class="name">'+f.name+'</span><span class="size">'+size+' KB</span><span class="remove" onclick="this.parentElement.remove()">✕</span>';preview.appendChild(div)}}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a slide-out sidebar component",
            "input": "Create a slide-out sidebar/drawer with overlay, smooth transition, and toggle button.",
            "output": """```html
<div style="display:flex;gap:16px;align-items:center">
  <button class="btn btn-primary" onclick="openSidebar()">☰ Open Sidebar</button>
  <span style="color:#666;font-size:.75rem">Click to toggle sidebar drawer</span>
</div>
<div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>
<div class="sidebar-drawer" id="sidebarDrawer">
  <div class="sidebar-header"><h3>Navigation</h3><button class="sidebar-close" onclick="closeSidebar()">✕</button></div>
  <nav class="sidebar-nav">
    <a href="#" class="sidebar-link active" onclick="return false"><span class="s-icon">📊</span> Dashboard</a>
    <a href="#" class="sidebar-link" onclick="return false"><span class="s-icon">👤</span> Profile</a>
    <a href="#" class="sidebar-link" onclick="return false"><span class="s-icon">⚙️</span> Settings</a>
    <a href="#" class="sidebar-link" onclick="return false"><span class="s-icon">📁</span> Files</a>
    <a href="#" class="sidebar-link" onclick="return false"><span class="s-icon">👥</span> Team</a>
  </nav>
</div>
<style>
.sidebar-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:998;opacity:0;pointer-events:none;transition:opacity .3s ease}
.sidebar-overlay.open{opacity:1;pointer-events:all}
.sidebar-drawer{position:fixed;top:0;left:0;bottom:0;width:280px;background:#1a1a2e;border-right:1px solid rgba(255,255,255,0.08);z-index:999;transform:translateX(-100%);transition:transform .3s cubic-bezier(0.4,0,0.2,1);display:flex;flex-direction:column}
.sidebar-drawer.open{transform:translateX(0)}
.sidebar-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)}
.sidebar-header h3{color:#e0e0f0;font-size:1rem}
.sidebar-close{background:none;border:none;color:#666;font-size:1.2rem;cursor:pointer;padding:4px}
.sidebar-close:hover{color:#f87171}
.sidebar-nav{flex:1;padding:8px;display:flex;flex-direction:column;gap:2px}
.sidebar-link{display:flex;align-items:center;gap:10px;padding:10px 14px;color:#888;text-decoration:none;border-radius:8px;font-size:.85rem;transition:.15s}
.sidebar-link:hover{color:#ccc;background:rgba(255,255,255,0.03)}
.sidebar-link.active{color:#00d9ff;background:rgba(0,217,255,0.08)}
.s-icon{font-size:1rem;width:20px;text-align:center}
</style>
<script>
function openSidebar(){document.getElementById('sidebarOverlay').classList.add('open');document.getElementById('sidebarDrawer').classList.add('open')}
function closeSidebar(){document.getElementById('sidebarOverlay').classList.remove('open');document.getElementById('sidebarDrawer').classList.remove('open')}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a chat bubble component",
            "input": "Create a messaging/conversation UI with alternating left/right bubbles, timestamps, avatars, and typing indicator.",
            "output": """```html
<div class="chat-container">
  <div class="chat-header"><div class="chat-avatar">👤</div><div><div class="chat-name">Alice</div><div class="chat-status">Online</div></div></div>
  <div class="chat-messages" id="chatMessages">
    <div class="msg msg-left">
      <div class="msg-bubble">Hey! How's the project going?</div>
      <div class="msg-time">10:32 AM</div>
    </div>
    <div class="msg msg-right">
      <div class="msg-bubble">Going great! Just finished the UI components.</div>
      <div class="msg-time">10:34 AM</div>
    </div>
    <div class="msg msg-left">
      <div class="msg-bubble">Awesome! Can you share a preview?</div>
      <div class="msg-time">10:35 AM</div>
    </div>
    <div class="msg msg-right">
      <div class="msg-bubble">Sure! Let me grab the screenshots...</div>
      <div class="msg-time">10:36 AM</div>
    </div>
    <div class="typing-indicator" id="typingIndicator"><span></span><span></span><span></span></div>
  </div>
  <div class="chat-input"><input type="text" placeholder="Type a message..." id="chatInput" onkeydown="sendMessage(event)"><button class="btn btn-primary" onclick="sendMsg()" style="padding:8px 16px">Send</button></div>
</div>
<style>
.chat-container{background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;max-width:400px}
.chat-header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06)}
.chat-avatar{font-size:1.5rem}
.chat-name{color:#e0e0f0;font-size:.85rem;font-weight:500}
.chat-status{color:#4ade80;font-size:.65rem}
.chat-messages{padding:16px;min-height:240px;max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.msg{display:flex;flex-direction:column;max-width:80%}
.msg-right{align-self:flex-end;align-items:flex-end}
.msg-left{align-self:flex-start;align-items:flex-start}
.msg-bubble{padding:10px 14px;border-radius:14px;font-size:.8rem;line-height:1.4;color:#ccc}
.msg-left .msg-bubble{background:rgba(255,255,255,0.04);border-bottom-left-radius:4px}
.msg-right .msg-bubble{background:rgba(0,217,255,0.1);border-bottom-right-radius:4px;color:#e0e0f0}
.msg-time{font-size:.6rem;color:#555;margin-top:2px;padding:0 4px}
.typing-indicator{display:none;align-items:center;gap:3px;padding:8px 0}
.typing-indicator.active{display:flex}
.typing-indicator span{width:6px;height:6px;background:#666;border-radius:50%;animation:typing 1.4s infinite}
.typing-indicator span:nth-child(2){animation-delay:.2s}
.typing-indicator span:nth-child(3){animation-delay:.4s}
@keyframes typing{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
.chat-input{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06)}
.chat-input input{flex:1;padding:8px 14px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#ccc;font-size:.8rem;outline:none}
.chat-input input:focus{border-color:rgba(0,217,255,0.3)}
</style>
<script>
function sendMessage(e){if(e&&e.key!=='Enter')return;const input=document.getElementById('chatInput');const txt=input.value.trim();if(!txt)return;const msgs=document.getElementById('chatMessages');const div=document.createElement('div');div.className='msg msg-right';div.innerHTML='<div class="msg-bubble">'+txt.replace(/</g,'&lt;')+'</div><div class="msg-time">Just now</div>';msgs.insertBefore(div,document.getElementById('typingIndicator'));input.value='';msgs.scrollTop=msgs.scrollHeight;const typing=document.getElementById('typingIndicator');typing.classList.add('active');setTimeout(()=>{typing.classList.remove('active')},1500)}
function sendMsg(){sendMessage({key:'Enter'})}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a dropdown select component",
            "input": "Create a custom styled dropdown select with search filter, option groups, and keyboard navigation.",
            "output": """```html
<div class="dropdown-wrap" id="dropdownWrap">
  <button class="dropdown-trigger" onclick="toggleDropdown()">
    <span id="dropdownLabel">Select option...</span>
    <span class="dropdown-arrow">▾</span>
  </button>
  <div class="dropdown-menu" id="dropdownMenu">
    <input class="dropdown-search" id="dropdownSearch" placeholder="Search..." oninput="filterOptions(this.value)" onclick="event.stopPropagation()">
    <div class="dropdown-options" id="dropdownOptions">
      <div class="dropdown-opt" data-value="js" onclick="selectOption(this)"><span class="opt-icon">🟨</span> JavaScript</div>
      <div class="dropdown-opt" data-value="py" onclick="selectOption(this)"><span class="opt-icon">🐍</span> Python</div>
      <div class="dropdown-opt" data-value="rs" onclick="selectOption(this)"><span class="opt-icon">🦀</span> Rust</div>
      <div class="dropdown-opt" data-value="ts" onclick="selectOption(this)"><span class="opt-icon">🔷</span> TypeScript</div>
      <div class="dropdown-opt" data-value="go" onclick="selectOption(this)"><span class="opt-icon">🔵</span> Go</div>
      <div class="dropdown-opt" data-value="rb" onclick="selectOption(this)"><span class="opt-icon">💎</span> Ruby</div>
    </div>
  </div>
</div>
<style>
.dropdown-wrap{position:relative;width:260px}
.dropdown-trigger{width:100%;display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#ccc;font-size:.8rem;cursor:pointer;transition:.15s;font-family:inherit;text-align:left}
.dropdown-trigger:hover{border-color:rgba(255,255,255,0.12)}
.dropdown-arrow{transition:transform .2s;color:#666;font-size:.8rem}
.dropdown-wrap.open .dropdown-arrow{transform:rotate(180deg)}
.dropdown-menu{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:50;overflow:hidden;animation:fadeIn .15s ease}
.dropdown-wrap.open .dropdown-menu{display:block}
.dropdown-search{width:100%;padding:10px 14px;border:none;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.2);color:#ccc;font-size:.8rem;outline:none}
.dropdown-search::placeholder{color:#555}
.dropdown-options{max-height:200px;overflow-y:auto;padding:4px}
.dropdown-opt{display:flex;align-items:center;gap:8px;padding:8px 12px;color:#888;font-size:.8rem;cursor:pointer;border-radius:4px;transition:.1s}
.dropdown-opt:hover{background:rgba(255,255,255,0.03);color:#ccc}
.dropdown-opt.selected{background:rgba(0,217,255,0.08);color:#00d9ff}
.opt-icon{font-size:1rem}
</style>
<script>
function toggleDropdown(){document.getElementById('dropdownWrap').classList.toggle('open')}
function selectOption(el){document.querySelectorAll('.dropdown-opt').forEach(o=>o.classList.remove('selected'));el.classList.add('selected');document.getElementById('dropdownLabel').textContent=el.textContent.trim();document.getElementById('dropdownWrap').classList.remove('open')}
function filterOptions(val){document.querySelectorAll('.dropdown-opt').forEach(o=>{o.style.display=o.textContent.toLowerCase().includes(val.toLowerCase())?'flex':'none'})}
document.addEventListener('click',(e)=>{if(!document.getElementById('dropdownWrap').contains(e.target))document.getElementById('dropdownWrap').classList.remove('open')});
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a search autocomplete component",
            "input": "Create a search input with autocomplete suggestions, keyboard navigation, debounced API calls, and highlighted matches.",
            "output": """```html
<div class="autocomplete-wrap">
  <div class="autocomplete-input-wrap">
    <span class="search-icon">🔍</span>
    <input type="text" class="autocomplete-input" id="autoInput" placeholder="Search products, docs, users..." oninput="debounceSearch(this.value)" onkeydown="handleKeys(event)">
    <span class="search-shortcut">⌘K</span>
  </div>
  <div class="autocomplete-menu" id="autoMenu">
    <div class="auto-group">
      <div class="auto-group-label">Recent</div>
      <div class="auto-item" onclick="selectAuto(this)"><span class="auto-icon">🕐</span><span>Dashboard design</span><span class="auto-type">Project</span></div>
      <div class="auto-item" onclick="selectAuto(this)"><span class="auto-icon">🕐</span><span>API integration guide</span><span class="auto-type">Doc</span></div>
    </div>
    <div class="auto-group">
      <div class="auto-group-label">Suggestions</div>
      <div class="auto-item" onclick="selectAuto(this)"><span class="auto-icon">📄</span><span>User authentication flow</span><span class="auto-type">Page</span></div>
      <div class="auto-item" onclick="selectAuto(this)"><span class="auto-icon">📄</span><span>Payment processing setup</span><span class="auto-type">Page</span></div>
      <div class="auto-item" onclick="selectAuto(this)"><span class="auto-icon">👤</span><span>John Doe (johndoe)</span><span class="auto-type">User</span></div>
    </div>
  </div>
</div>
<style>
.autocomplete-wrap{position:relative;width:340px}
.autocomplete-input-wrap{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;transition:.15s}
.autocomplete-input-wrap:focus-within{border-color:rgba(0,217,255,0.3);box-shadow:0 0 0 3px rgba(0,217,255,0.05)}
.search-icon{font-size:1rem;opacity:.4}
.autocomplete-input{border:none;background:transparent;color:#ccc;font-size:.85rem;outline:none;flex:1}
.autocomplete-input::placeholder{color:#555}
.search-shortcut{padding:2px 6px;background:rgba(255,255,255,0.04);border-radius:4px;font-size:.6rem;color:#555;font-family:monospace}
.autocomplete-menu{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:50;overflow:hidden;max-height:300px;overflow-y:auto}
.autocomplete-menu.open{display:block}
.auto-group{padding:4px 0}
.auto-group:not(:last-child){border-bottom:1px solid rgba(255,255,255,0.04)}
.auto-group-label{padding:6px 12px;font-size:.6rem;color:#555;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.auto-item{display:flex;align-items:center;gap:8px;padding:8px 12px;color:#888;font-size:.8rem;cursor:pointer;transition:.1s}
.auto-item:hover{background:rgba(255,255,255,0.03);color:#ccc}
.auto-item.active{background:rgba(0,217,255,0.06);color:#e0e0f0}
.auto-icon{font-size:.9rem;flex-shrink:0}
.auto-type{margin-left:auto;font-size:.6rem;color:#555;padding:2px 6px;background:rgba(255,255,255,0.03);border-radius:4px}
</style>
<script>
let debounceTimer;
function debounceSearch(val){clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>{document.getElementById('autoMenu').classList.toggle('open',val.length>0)},200)}
function selectAuto(el){document.getElementById('autoInput').value=el.querySelector('span:nth-child(2)').textContent;document.getElementById('autoMenu').classList.remove('open')}
function handleKeys(e){if(e.key==='Escape')document.getElementById('autoMenu').classList.remove('open');if(e.key==='Enter'){const active=document.querySelector('.auto-item.active');if(active)selectAuto(active)}}
document.addEventListener('click',(e)=>{if(!document.querySelector('.autocomplete-wrap').contains(e.target))document.getElementById('autoMenu').classList.remove('open')});
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a notification bell component",
            "input": "Create a notification bell icon with unread badge count, dropdown panel with notification items, and mark-as-read.",
            "output": """```html
<div class="notif-wrap" id="notifWrap">
  <button class="notif-bell" onclick="toggleNotif()">
    🔔 <span class="notif-badge">3</span>
  </button>
  <div class="notif-dropdown" id="notifDropdown">
    <div class="notif-header"><span>Notifications</span><button class="btn btn-xs" onclick="markAllRead()">Mark all read</button></div>
    <div class="notif-list">
      <div class="notif-item unread" onclick="markRead(this)">
        <div class="notif-dot"></div>
        <div class="notif-icon">📊</div>
        <div class="notif-content"><div class="notif-title">Report ready</div><div class="notif-text">Your monthly report is ready for review</div><div class="notif-time">2 min ago</div></div>
      </div>
      <div class="notif-item unread" onclick="markRead(this)">
        <div class="notif-dot"></div>
        <div class="notif-icon">👤</div>
        <div class="notif-content"><div class="notif-title">New follower</div><div class="notif-text">Sarah started following your project</div><div class="notif-time">15 min ago</div></div>
      </div>
      <div class="notif-item unread" onclick="markRead(this)">
        <div class="notif-dot"></div>
        <div class="notif-icon">✅</div>
        <div class="notif-content"><div class="notif-title">Deployment successful</div><div class="notif-text">v2.4.0 deployed to production</div><div class="notif-time">1 hour ago</div></div>
      </div>
      <div class="notif-item" onclick="markRead(this)">
        <div class="notif-icon">💬</div>
        <div class="notif-content"><div class="notif-title">New comment</div><div class="notif-text">Alex commented on your pull request</div><div class="notif-time">Yesterday</div></div>
      </div>
    </div>
    <div class="notif-footer"><a href="#" onclick="return false">View all notifications</a></div>
  </div>
</div>
<style>
.notif-wrap{position:relative;display:inline-block}
.notif-bell{position:relative;background:none;border:none;font-size:1.3rem;cursor:pointer;padding:8px;border-radius:8px;transition:.15s}
.notif-bell:hover{background:rgba(255,255,255,0.04)}
.notif-badge{position:absolute;top:2px;right:2px;min-width:16px;height:16px;padding:0 4px;background:#f87171;color:#fff;font-size:.55rem;font-weight:700;border-radius:8px;display:flex;align-items:center;justify-content:center}
.notif-dropdown{display:none;position:absolute;top:calc(100% + 4px);right:0;width:360px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.5);z-index:50;overflow:hidden}
.notif-dropdown.open{display:block}
.notif-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06)}
.notif-header span{color:#e0e0f0;font-size:.85rem;font-weight:600}
.notif-list{max-height:320px;overflow-y:auto}
.notif-item{display:flex;gap:10px;padding:10px 16px;cursor:pointer;transition:.1s;position:relative}
.notif-item:hover{background:rgba(255,255,255,0.02)}
.notif-item.unread{background:rgba(0,217,255,0.03)}
.notif-dot{position:absolute;left:8px;top:50%;margin-top:-2px;width:4px;height:4px;background:#00d9ff;border-radius:50%}
.notif-item.unread .notif-dot{display:block}
.notif-icon{font-size:1.1rem;flex-shrink:0;margin-top:2px}
.notif-content{flex:1;min-width:0}
.notif-title{font-size:.8rem;color:#e0e0f0;font-weight:500;margin-bottom:2px}
.notif-text{font-size:.7rem;color:#777;line-height:1.3;margin-bottom:2px}
.notif-time{font-size:.6rem;color:#555}
.notif-footer{padding:10px 16px;border-top:1px solid rgba(255,255,255,0.06);text-align:center}
.notif-footer a{color:#00d9ff;font-size:.75rem;text-decoration:none}
.notif-footer a:hover{text-decoration:underline}
</style>
<script>
function toggleNotif(){document.getElementById('notifDropdown').classList.toggle('open')}
function markRead(el){el.classList.remove('unread');const count=document.querySelectorAll('.notif-item.unread').length;document.querySelector('.notif-badge').textContent=count||'';if(!count)document.querySelector('.notif-badge').style.display='none'}
function markAllRead(){document.querySelectorAll('.notif-item.unread').forEach(el=>el.classList.remove('unread'));document.querySelector('.notif-badge').style.display='none'}
document.addEventListener('click',(e)=>{if(!document.getElementById('notifWrap').contains(e.target))document.getElementById('notifDropdown').classList.remove('open')});
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a color picker component",
            "input": "Create a color picker with preset swatches, hex input, and live preview.",
            "output": """```html
<div class="colorpicker">
  <div class="cp-preview" id="cpPreview" style="background:#00d9ff"></div>
  <div class="cp-input-row">
    <label>Color</label>
    <input type="text" id="cpInput" value="#00d9ff" oninput="updateColor(this.value)" placeholder="#hex">
  </div>
  <div class="cp-swatches">
    <div class="cp-swatch" style="background:#f87171" onclick="pickColor('#f87171')"></div>
    <div class="cp-swatch" style="background:#fb923c" onclick="pickColor('#fb923c')"></div>
    <div class="cp-swatch" style="background:#facc15" onclick="pickColor('#facc15')"></div>
    <div class="cp-swatch" style="background:#4ade80" onclick="pickColor('#4ade80')"></div>
    <div class="cp-swatch" style="background:#34d399" onclick="pickColor('#34d399')"></div>
    <div class="cp-swatch" style="background:#00d9ff" onclick="pickColor('#00d9ff')"></div>
    <div class="cp-swatch" style="background:#60a5fa" onclick="pickColor('#60a5fa')"></div>
    <div class="cp-swatch" style="background:#818cf8" onclick="pickColor('#818cf8')"></div>
    <div class="cp-swatch" style="background:#c084fc" onclick="pickColor('#c084fc')"></div>
    <div class="cp-swatch" style="background:#f472b6" onclick="pickColor('#f472b6')"></div>
    <div class="cp-swatch" style="background:#eee" onclick="pickColor('#eee')"></div>
    <div class="cp-swatch" style="background:#333" onclick="pickColor('#333')"></div>
  </div>
</div>
<style>
.colorpicker{background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px;width:240px}
.cp-preview{height:60px;border-radius:8px;margin-bottom:12px;transition:background .2s;border:1px solid rgba(255,255,255,0.06)}
.cp-input-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.cp-input-row label{font-size:.75rem;color:#888;min-width:36px}
.cp-input-row input{flex:1;padding:6px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:#ccc;font-family:monospace;font-size:.8rem;outline:none}
.cp-input-row input:focus{border-color:rgba(0,217,255,0.3)}
.cp-swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}
.cp-swatch{aspect-ratio:1;border-radius:6px;cursor:pointer;border:2px solid transparent;transition:.15s}
.cp-swatch:hover{transform:scale(1.15);border-color:rgba(255,255,255,0.2)}
.cp-swatch.active{border-color:#fff}
</style>
<script>
function pickColor(c){document.getElementById('cpPreview').style.background=c;document.getElementById('cpInput').value=c}
function updateColor(v){if(/^#[0-9a-f]{6}$/i.test(v))document.getElementById('cpPreview').style.background=v}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a kanban card component",
            "input": "Create a Kanban-style task card with drag handle, labels, assignee, due date, and priority indicators.",
            "output": """```html
<div class="kanban-board" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
  <div class="kanban-col">
    <div class="kanban-header"><span>📋 To Do</span><span class="kanban-count">2</span></div>
    <div class="kanban-cards">
      <div class="kanban-card" draggable="true">
        <div class="k-card-labels"><span class="k-label" style="background:rgba(0,217,255,0.2);color:#00d9ff">Feature</span><span class="k-label" style="background:rgba(250,204,21,0.2);color:#facc15">High</span></div>
        <div class="k-card-title">Design system migration</div>
        <div class="k-card-desc">Migrate all components to the new design token system</div>
        <div class="k-card-footer"><span class="k-assignee">👤 Alex</span><span class="k-date">📅 Jul 30</span></div>
      </div>
      <div class="kanban-card" draggable="true">
        <div class="k-card-labels"><span class="k-label" style="background:rgba(74,222,128,0.2);color:#4ade80">Bug</span></div>
        <div class="k-card-title">Login redirect issue</div>
        <div class="k-card-desc">Users redirected to wrong page after OAuth login</div>
        <div class="k-card-footer"><span class="k-assignee">👤 Sarah</span><span class="k-date">📅 Jul 29</span></div>
      </div>
    </div>
  </div>
  <div class="kanban-col">
    <div class="kanban-header"><span>🔄 In Progress</span><span class="kanban-count">2</span></div>
    <div class="kanban-cards">
      <div class="kanban-card" draggable="true">
        <div class="k-card-labels"><span class="k-label" style="background:rgba(0,217,255,0.2);color:#00d9ff">Feature</span></div>
        <div class="k-card-title">Real-time notifications</div>
        <div class="k-card-desc">Implement WebSocket-based notification system</div>
        <div class="k-card-footer"><span class="k-assignee">👤 Mike</span><span class="k-date">📅 Aug 2</span></div>
      </div>
      <div class="kanban-card" draggable="true">
        <div class="k-card-labels"><span class="k-label" style="background:rgba(248,113,113,0.2);color:#f87171">Critical</span></div>
        <div class="k-card-title">Security audit fixes</div>
        <div class="k-card-desc">Address vulnerabilities from latest security scan</div>
        <div class="k-card-footer"><span class="k-assignee">👤 Alex</span><span class="k-date">📅 Jul 28</span></div>
      </div>
    </div>
  </div>
  <div class="kanban-col">
    <div class="kanban-header"><span>✅ Done</span><span class="kanban-count">1</span></div>
    <div class="kanban-cards">
      <div class="kanban-card" draggable="true">
        <div class="k-card-labels"><span class="k-label" style="background:rgba(74,222,128,0.2);color:#4ade80">Feature</span></div>
        <div class="k-card-title">Onboarding flow v2</div>
        <div class="k-card-desc">New user onboarding with interactive tutorial</div>
        <div class="k-card-footer"><span class="k-assignee">👤 Team</span><span class="k-date">✅ Jul 25</span></div>
      </div>
    </div>
  </div>
</div>
<style>
.kanban-col{background:rgba(255,255,255,0.02);border-radius:10px;padding:10px}
.kanban-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:.8rem;color:#aaa;font-weight:500}
.kanban-count{background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:10px;font-size:.65rem;color:#666}
.kanban-cards{display:flex;flex-direction:column;gap:8px}
.kanban-card{background:#1a1a2e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;cursor:grab;transition:.15s}
.kanban-card:hover{border-color:rgba(255,255,255,0.1);box-shadow:0 2px 8px rgba(0,0,0,0.2)}
.kanban-card:active{cursor:grabbing}
.k-card-labels{display:flex;gap:4px;margin-bottom:6px}
.k-label{padding:2px 6px;border-radius:4px;font-size:.6rem;font-weight:600}
.k-card-title{font-size:.8rem;color:#e0e0f0;font-weight:500;margin-bottom:4px}
.k-card-desc{font-size:.7rem;color:#777;line-height:1.4;margin-bottom:8px}
.k-card-footer{display:flex;justify-content:space-between;font-size:.65rem;color:#555}
</style>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a carousel/slider component",
            "input": "Create an image carousel with auto-play, navigation dots, previous/next arrows, and swipe support.",
            "output": """```html
<div class="carousel" id="carousel">
  <div class="carousel-track" id="carouselTrack">
    <div class="carousel-slide" style="background:linear-gradient(135deg,#1a1a2e,#2d2d5a)"><div class="slide-content"><h2>Slide 1</h2><p>Welcome to the carousel component</p></div></div>
    <div class="carousel-slide" style="background:linear-gradient(135deg,#1a1a2e,#3a1a2e)"><div class="slide-content"><h2>Slide 2</h2><p>Responsive and touch-friendly</p></div></div>
    <div class="carousel-slide" style="background:linear-gradient(135deg,#1a1a2e,#1a2e3a)"><div class="slide-content"><h2>Slide 3</h2><p>Auto-play with pause on hover</p></div></div>
  </div>
  <button class="carousel-btn prev" onclick="moveCarousel(-1)">‹</button>
  <button class="carousel-btn next" onclick="moveCarousel(1)">›</button>
  <div class="carousel-dots" id="carouselDots"></div>
</div>
<style>
.carousel{position:relative;border-radius:12px;overflow:hidden;background:#1a1a2e;max-width:500px}
.carousel-track{display:flex;transition:transform .4s cubic-bezier(0.4,0,0.2,1)}
.carousel-slide{min-width:100%;padding:60px 40px;text-align:center}
.slide-content h2{color:#e0e0f0;font-size:1.5rem;margin-bottom:8px}
.slide-content p{color:#888;font-size:.85rem}
.carousel-btn{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border:none;border-radius:50%;background:rgba(0,0,0,0.4);color:#fff;font-size:1.3rem;cursor:pointer;transition:.15s;z-index:2;backdrop-filter:blur(4px)}
.carousel-btn:hover{background:rgba(0,0,0,0.6)}
.carousel-btn.prev{left:12px}
.carousel-btn.next{right:12px}
.carousel-dots{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px}
.carousel-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.2);cursor:pointer;transition:.15s}
.carousel-dot.active{background:#00d9ff;width:24px;border-radius:4px}
</style>
<script>
let currentSlide=0,totalSlides=3;
const track=document.getElementById('carouselTrack');
const dots=document.getElementById('carouselDots');
for(let i=0;i<totalSlides;i++){const d=document.createElement('div');d.className='carousel-dot'+(i===0?' active':'');d.onclick=()=>goToSlide(i);dots.appendChild(d)}
function goToSlide(n){currentSlide=n;track.style.transform='translateX(-'+(n*100)+'%)';document.querySelectorAll('.carousel-dot').forEach((d,i)=>d.classList.toggle('active',i===n))}
function moveCarousel(d){goToSlide((currentSlide+d+totalSlides)%totalSlides)}
let autoPlay=setInterval(()=>moveCarousel(1),3000);
document.getElementById('carousel').addEventListener('mouseenter',()=>clearInterval(autoPlay));
document.getElementById('carousel').addEventListener('mouseleave',()=>{autoPlay=setInterval(()=>moveCarousel(1),3000)});
goToSlide(0);
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a data table component",
            "input": "Create a sortable, searchable data table with pagination and row selection.",
            "output": """```html
<div class="table-container">
  <div class="table-toolbar">
    <input type="text" class="table-search" placeholder="Search..." oninput="filterTable(this.value)">
    <select class="table-page-size" onchange="changePageSize(this.value)">
      <option value="10">10 per page</option>
      <option value="25">25 per page</option>
      <option value="50">50 per page</option>
    </select>
  </div>
  <table class="data-table">
    <thead><tr>
      <th onclick="sortTable(0)">Name <span class="sort-icon">↕</span></th>
      <th onclick="sortTable(1)">Category <span class="sort-icon">↕</span></th>
      <th onclick="sortTable(2)">Status <span class="sort-icon">↕</span></th>
      <th>Actions</th>
    </tr></thead>
    <tbody id="tableBody"></tbody>
  </table>
  <div class="table-footer">
    <span class="table-info" id="tableInfo">Showing 1-10 of 100</span>
    <div class="table-pagination" id="tablePagination"></div>
  </div>
</div>
<style>
.data-table{width:100%;border-collapse:collapse;font-size:.85rem}
.data-table th{background:rgba(0,217,255,0.05);color:#00d9ff;padding:10px 12px;text-align:left;cursor:pointer;user-select:none;font-weight:600;border-bottom:2px solid rgba(0,217,255,0.1)}
.data-table th:hover{background:rgba(0,217,255,0.1)}
.data-table td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.04);color:#aaa}
.data-table tr:hover td{background:rgba(255,255,255,0.02)}
.sort-icon{font-size:.65rem;margin-left:4px;opacity:.4}
th.sort-asc .sort-icon{opacity:1;color:#00d9ff}
th.sort-desc .sort-icon{opacity:1;color:#00d9ff;transform:rotate(180deg)}
.table-search{padding:8px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:#ccc;font-size:.8rem}
.table-toolbar{display:flex;gap:8px;margin-bottom:12px}
.table-footer{display:flex;justify-content:space-between;align-items:center;padding:12px 0;font-size:.75rem;color:#666}
.table-pagination{display:flex;gap:4px}
.table-pagination button{padding:4px 10px;border:1px solid rgba(255,255,255,0.06);border-radius:4px;background:transparent;color:#888;cursor:pointer;font-size:.75rem}
.table-pagination button:hover{border-color:#00d9ff;color:#00d9ff}
.table-pagination button.active{background:#00d9ff;color:#0f0f1a;border-color:#00d9ff}
</style>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a form with validation",
            "input": "Create a registration form with real-time validation, error messages, and submit handling.",
            "output": """```html
<form class="validated-form" id="registrationForm" novalidate>
  <div class="form-group">
    <label for="fullName">Full Name</label>
    <input type="text" id="fullName" required minlength="2" placeholder="John Doe">
    <span class="error-message">Please enter your full name (min 2 characters)</span>
  </div>
  <div class="form-group">
    <label for="email">Email Address</label>
    <input type="email" id="email" required placeholder="john@example.com">
    <span class="error-message">Please enter a valid email address</span>
  </div>
  <div class="form-group">
    <label for="password">Password</label>
    <input type="password" id="password" required minlength="8" placeholder="Min 8 characters">
    <div class="password-strength"><div class="strength-bar" id="strengthBar"></div></div>
    <span class="error-message">Password must be at least 8 characters</span>
  </div>
  <button type="submit" class="btn btn-primary">Create Account</button>
</form>
<style>
.validated-form{max-width:400px;margin:0 auto}
.form-group{margin-bottom:16px}
.form-group label{display:block;color:#aaa;font-size:.8rem;margin-bottom:6px;font-weight:500}
.form-group input{width:100%;padding:10px 14px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#e0e0f0;font-size:.85rem;transition:border-color .2s}
.form-group input:focus{border-color:#00d9ff;outline:none}
.form-group input.error{border-color:#f87171}
.form-group .error-message{display:none;color:#f87171;font-size:.7rem;margin-top:4px}
.form-group input.error ~ .error-message{display:block}
.password-strength{height:4px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:6px;overflow:hidden}
.strength-bar{height:100%;width:0;border-radius:2px;transition:width .3s,background .3s}
</style>
<script>
document.getElementById('registrationForm').addEventListener('submit',(e)=>{e.preventDefault();let valid=true;document.querySelectorAll('.form-group input').forEach(i=>{if(!i.checkValidity()){i.classList.add('error');valid=false}else i.classList.remove('error')});if(valid){}});
document.querySelectorAll('.form-group input').forEach(i=>{i.addEventListener('input',()=>{i.checkValidity()?i.classList.remove('error'):i.classList.add('error');if(i.id==='password')updateStrength(i.value)})});
function updateStrength(pw){const bar=document.getElementById('strengthBar');let score=0;if(pw.length>0)score+=Math.min(pw.length*10,40);if(/[a-z]/.test(pw))score+=10;if(/[A-Z]/.test(pw))score+=15;if(/[0-9]/.test(pw))score+=15;if(/[^a-zA-Z0-9]/.test(pw))score+=20;const colors=['#f87171','#fb923c','#facc15','#a3e635','#4ade80'];bar.style.width=Math.min(score,100)+'%';bar.style.background=colors[Math.min(Math.floor(score/20),4)]}
</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a card component",
            "input": "Create a reusable card component with image, title, description, and action buttons.",
            "output": """```html
<div class="card">
  <div class="card-image"><div class="card-image-placeholder">📷</div></div>
  <div class="card-content">
    <div class="card-tag">Category</div>
    <h3 class="card-title">Card Title</h3>
    <p class="card-description">This is a description for the card component. It can contain multiple lines of text.</p>
    <div class="card-footer">
      <span class="card-meta">2 min ago</span>
      <div class="card-actions">
        <button class="card-btn" title="Like">👍 <span>12</span></button>
        <button class="card-btn" title="Share">🔗</button>
      </div>
    </div>
  </div>
</div>
<style>
.card{background:linear-gradient(145deg,#1a1a2e,#1e1e3a);border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-4px);box-shadow:0 12px 24px rgba(0,0,0,0.3)}
.card-image{height:160px;background:rgba(0,217,255,0.05);display:flex;align-items:center;justify-content:center;font-size:2.5rem}
.card-content{padding:16px}
.card-tag{display:inline-block;padding:2px 8px;background:rgba(0,217,255,0.1);color:#00d9ff;border-radius:4px;font-size:.65rem;font-weight:600;margin-bottom:8px}
.card-title{color:#e0e0f0;font-size:1rem;margin-bottom:8px}
.card-description{color:#777;font-size:.8rem;line-height:1.5;margin-bottom:12px}
.card-footer{display:flex;justify-content:space-between;align-items:center}
.card-meta{color:#555;font-size:.7rem}
.card-actions{display:flex;gap:8px}
.card-btn{background:none;border:none;color:#666;cursor:pointer;font-size:.8rem;padding:4px 8px;border-radius:4px;transition:.15s}
.card-btn:hover{background:rgba(255,255,255,0.05);color:#aaa}
</style>""",
            "source": "gui-synthetic/components", "category": "component",
        },
        {
            "instruction": "Build a navigation bar",
            "input": "Create a responsive navigation bar with dropdown menus, search, and mobile hamburger menu.",
            "output": """```html
<nav class="navbar">
  <div class="nav-brand">Logo</div>
  <button class="nav-toggle" onclick="toggleNav()">☰</button>
  <div class="nav-menu" id="navMenu">
    <a href="#" class="nav-link active">Home</a>
    <div class="nav-dropdown">
      <a href="#" class="nav-link" onclick="toggleDropdown(this)">Products ▾</a>
      <div class="dropdown-content">
        <a href="#">Product 1</a><a href="#">Product 2</a><a href="#">Product 3</a>
      </div>
    </div>
    <a href="#" class="nav-link">About</a>
    <a href="#" class="nav-link">Contact</a>
    <div class="nav-search"><input type="text" placeholder="Search..."></div>
  </div>
</nav>
<style>
.navbar{display:flex;align-items:center;padding:12px 24px;background:#1a1a2e;border-bottom:1px solid rgba(255,255,255,0.06);position:sticky;top:0;z-index:100}
.nav-brand{font-size:1.2rem;font-weight:700;color:#00d9ff;margin-right:32px}
.nav-menu{display:flex;align-items:center;gap:4px;flex:1}
.nav-link{padding:8px 16px;color:#888;text-decoration:none;font-size:.85rem;border-radius:6px;transition:.15s}
.nav-link:hover{color:#e0e0f0;background:rgba(255,255,255,0.04)}
.nav-link.active{color:#00d9ff;background:rgba(0,217,255,0.08)}
.nav-dropdown{position:relative}
.dropdown-content{display:none;position:absolute;top:100%;left:0;min-width:180px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,0.3)}
.dropdown-content a{display:block;padding:8px 14px;color:#888;text-decoration:none;font-size:.8rem;border-radius:4px}
.dropdown-content a:hover{background:rgba(0,217,255,0.08);color:#00d9ff}
.nav-dropdown:hover .dropdown-content{display:block}
.nav-search input{padding:6px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:6px;color:#ccc;font-size:.8rem;width:200px}
.nav-toggle{display:none;background:none;border:none;color:#ccc;font-size:1.5rem;cursor:pointer}
@media(max-width:768px){
  .nav-toggle{display:block}
  .nav-menu{display:none;flex-direction:column;position:absolute;top:100%;left:0;right:0;background:#1a1a2e;padding:16px}
  .nav-menu.open{display:flex}
  .nav-search input{width:100%}
  .dropdown-content{position:static;box-shadow:none}
}
</style>
<script>function toggleNav(){document.getElementById('navMenu').classList.toggle('open')}</script>""",
            "source": "gui-synthetic/components", "category": "component",
        },
    ]


def generate_css_patterns():
    """Generate dataset about CSS patterns and techniques (10 patterns)."""
    return [
        {
            "instruction": "Create a dark theme design system",
            "input": "How do I create a cohesive dark theme design system with CSS custom properties?",
            "output": """```css
:root {
  --bg-deep: #0a0a14;
  --bg-dark: #0f0f1a;
  --bg-surface: #1a1a2e;
  --bg-elevated: #1e1e3a;
  --text-primary: #e0e0f0;
  --text-secondary: #aaa;
  --text-tertiary: #777;
  --text-muted: #555;
  --accent: #00d9ff;
  --accent-dim: rgba(0,217,255,0.1);
  --success: #4ade80;
  --warning: #facc15;
  --error: #f87171;
  --info: #60a5fa;
  --border-subtle: rgba(255,255,255,0.04);
  --border-default: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.12);
  --space-xs: 4px; --space-sm: 8px; --space-md: 16px;
  --space-lg: 24px; --space-xl: 32px;
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
  --shadow-sm: 0 2px 4px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.4);
  --font-sans: 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'Fira Code', 'Consolas', monospace;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  color: var(--text-secondary);
  transition: transform var(--transition), box-shadow var(--transition);
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.card h3 { color: var(--text-primary); }
.card .accent { color: var(--accent); }
```""",
            "source": "gui-synthetic/css-patterns", "category": "css-pattern",
        },
        {
            "instruction": "Create responsive grid layouts",
            "input": "Show me how to create responsive grid layouts with CSS Grid that adapt to different screen sizes.",
            "output": """```css
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.fixed-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
@media (max-width: 1024px) { .fixed-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .fixed-grid { grid-template-columns: 1fr; } }
.holy-grail {
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-columns: 200px 1fr 200px;
  min-height: 100vh;
  grid-template-areas:
    "header header header"
    "nav    main   sidebar"
    "footer footer footer";
}
.holy-grail header { grid-area: header; }
.holy-grail nav { grid-area: nav; }
.holy-grail main { grid-area: main; }
.holy-grail aside { grid-area: sidebar; }
.holy-grail footer { grid-area: footer; }
@media (max-width: 768px) {
  .holy-grail { grid-template-columns: 1fr; grid-template-areas:
    "header" "nav" "main" "sidebar" "footer";
  }
}
.dashboard {
  display: grid;
  grid-template-columns: 250px 1fr;
  grid-template-rows: 60px 1fr;
  height: 100vh;
  grid-template-areas: "sidebar header" "sidebar content";
}
```""",
            "source": "gui-synthetic/css-patterns", "category": "css-pattern",
        },
        {
            "instruction": "Create CSS animations and keyframes",
            "input": "Show me common CSS animations for fade-in, slide-up, scale, shimmer, and bounce effects.",
            "output": """```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```""",
            "source": "gui-synthetic/css-patterns", "category": "css-pattern",
        },
        {
            "instruction": "Create glass morphism and modern visual effects",
            "input": "Show me how to create glass morphism, neumorphism, gradient borders, and frosted glass effects.",
            "output": """```css
/* Glass morphism */
.glass {
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}

/* Neumorphism */
.neumorph {
  background: #1a1a2e;
  border-radius: 12px;
  box-shadow: 6px 6px 12px rgba(0,0,0,0.3), -6px -6px 12px rgba(255,255,255,0.02);
}

/* Gradient border */
.gradient-border {
  position: relative;
  border-radius: 12px;
  background: #1a1a2e;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.gradient-border::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 14px;
  background: linear-gradient(135deg, #00d9ff, #0099ff, #4ade80);
  z-index: -1;
}

/* Frosted glass */
.frost {
  background: rgba(26,26,46,0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}

/* Glow */
.glow { box-shadow: 0 0 20px rgba(0,217,255,0.15), 0 0 60px rgba(0,217,255,0.05); }
.glow-text { text-shadow: 0 0 20px rgba(0,217,255,0.5); }

/* Gradient text */
.gradient-text {
  background: linear-gradient(135deg, #00d9ff, #4ade80, #60a5fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```""",
            "source": "gui-synthetic/css-patterns", "category": "css-pattern",
        },
        {
            "instruction": "Create responsive typography system",
            "input": "Show me how to set up a fluid typography system with clamp(), responsive font sizes, and proper hierarchy.",
            "output": """```css
:root {
  --step-0: clamp(0.875rem, 0.75rem + 0.25vw, 1rem);
  --step-1: clamp(1rem, 0.8rem + 0.5vw, 1.25rem);
  --step-2: clamp(1.25rem, 0.9rem + 0.75vw, 1.5rem);
  --step-3: clamp(1.5rem, 1rem + 1vw, 2rem);
  --step-4: clamp(2rem, 1.25rem + 1.5vw, 2.5rem);
  --step-5: clamp(2.5rem, 1.5rem + 2vw, 3.5rem);
  --font-sans: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-mono: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;
}
body {
  font-family: var(--font-sans);
  font-size: var(--step-0);
  line-height: var(--leading-normal);
  color: var(--text-primary);
}
h1 { font-size: var(--step-4); font-weight: 700; line-height: var(--leading-tight); }
h2 { font-size: var(--step-3); font-weight: 600; line-height: var(--leading-tight); }
h3 { font-size: var(--step-2); font-weight: 600; line-height: var(--leading-tight); }
h4 { font-size: var(--step-1); font-weight: 500; line-height: var(--leading-tight); }
p { font-size: var(--step-0); line-height: var(--leading-relaxed); color: var(--text-secondary); }
small, .text-sm { font-size: var(--step-0); opacity: 0.8; }
code, .text-mono { font-family: var(--font-mono); font-size: 0.9em; }
```""",
            "source": "gui-synthetic/css-patterns", "category": "css-pattern",
        },
        {
            "instruction": "Create form and input styling patterns",
            "input": "Show me CSS patterns for modern form inputs, buttons, checkboxes, radio buttons, and select menus.",
            "output": """```css
/* Input base */
.input {
  padding: 10px 14px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  color: #e0e0f0;
  font-size: 0.85rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  width: 100%;
}
.input:focus { border-color: #00d9ff; outline: none; box-shadow: 0 0 0 3px rgba(0,217,255,0.1); }
.input.error { border-color: #f87171; }
.input.success { border-color: #4ade80; }

/* Button variants */
.btn {
  padding: 10px 24px; border: none; border-radius: 8px;
  font-size: 0.85rem; font-weight: 600; cursor: pointer;
  transition: all 0.2s ease; font-family: inherit;
  display: inline-flex; align-items: center; gap: 6px;
}
.btn-primary { background: linear-gradient(135deg, #00d9ff, #0099ff); color: #0f0f1a; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,217,255,0.3); }
.btn-secondary { background: rgba(255,255,255,0.06); color: #aaa; border: 1px solid rgba(255,255,255,0.08); }
.btn-danger { background: linear-gradient(135deg, #f87171, #ef4444); color: #fff; }
.btn-ghost { background: transparent; color: #888; }
.btn-sm { padding: 6px 14px; font-size: 0.75rem; }
.btn-lg { padding: 14px 32px; font-size: 1rem; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

/* Custom checkbox */
.checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #aaa; }
.checkbox input { position: absolute; opacity: 0; width: 0; height: 0; }
.checkmark {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  transition: 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.checkbox input:checked + .checkmark { background: #00d9ff; border-color: #00d9ff; }
.checkbox input:checked + .checkmark::after { content: '\2713'; color: #0f0f1a; font-weight: 700; }
```""",
            "source": "gui-synthetic/css-patterns", "category": "css-pattern",
        },
        {
            "instruction": "Create scrollbar and overflow patterns",
            "input": "Show me how to customize scrollbars, create scroll-snap containers, and handle overflow content.",
            "output": """```css
/* Custom scrollbar */
.custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scroll::-webkit-scrollbar-track { background: transparent; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

/* Thin scrollbar */
.thin-scroll {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.08) transparent;
}

/* Scroll snap */
.snap-x {
  display: flex; overflow-x: auto;
  scroll-snap-type: x mandatory;
  gap: 16px; scroll-behavior: smooth;
}
.snap-x > * { scroll-snap-align: start; flex-shrink: 0; }
.snap-y { overflow-y: auto; scroll-snap-type: y mandatory; height: 100vh; }
.snap-y > * { scroll-snap-align: start; }

/* Hide scrollbar */
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.hide-scrollbar::-webkit-scrollbar { display: none; }

/* Overflow */
.overflow-ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.overflow-fade { overflow: hidden; position: relative; }
.overflow-fade::after {
  content: ''; position: absolute; bottom: 0; left: 0; right: 0;
  height: 40px;
  background: linear-gradient(transparent, var(--bg-surface));
}
```""",
            "source": "gui-synthetic/css-patterns", "category": "css-pattern",
        },
        {
            "instruction": "Create layout patterns with Flexbox",
            "input": "Show me common Flexbox layout patterns: centering, sticky footer, equal height columns, and sidebar layouts.",
            "output": """```css
/* Perfect centering */
.center { display: flex; align-items: center; justify-content: center; }

/* Sticky footer */
.page { display: flex; flex-direction: column; min-height: 100vh; }
.page main { flex: 1; }
.page footer { flex-shrink: 0; }

/* Equal height columns */
.equal-cols { display: flex; gap: 16px; }
.equal-cols > * { flex: 1; display: flex; flex-direction: column; }

/* Sidebar layout */
.with-sidebar { display: flex; gap: 24px; align-items: flex-start; }
.with-sidebar .sidebar { flex: 0 0 280px; position: sticky; top: 20px; }
.with-sidebar .content { flex: 1; min-width: 0; }
@media (max-width: 768px) {
  .with-sidebar { flex-direction: column; }
  .with-sidebar .sidebar { flex: none; width: 100%; position: static; }
}

/* Card grid */
.card-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.card-grid > * { flex: 1 1 calc(33.333% - 16px); min-width: 280px; }

/* Media object */
.media { display: flex; gap: 12px; align-items: flex-start; }
.media-figure { flex-shrink: 0; width: 64px; height: 64px; }
.media-body { flex: 1; min-width: 0; }
.media-body p { color: #888; font-size: 0.8rem; }
```""",
            "source": "gui-synthetic/css-patterns", "category": "css-pattern",
        },
    ]


def generate_js_patterns():
    """Generate dataset about JavaScript interaction patterns (8 patterns)."""
    return [
        {
            "instruction": "Implement drag and drop",
            "input": "How do I implement HTML5 drag and drop for a kanban board or file upload zone?",
            "output": """```javascript
class DragDropManager {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);
    this.dragItemsSelector = options.dragItems || '.draggable';
    this.dropZonesSelector = options.dropZones || '.drop-zone';
    this.onDrop = options.onDrop || (() => {});
    this.draggedElement = null;
    this.init();
  }

  init() {
    // Set up draggable items
    this.container.querySelectorAll(this.dragItemsSelector).forEach((item) => {
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', (event) => this.handleDragStart(event, item));
      item.addEventListener('dragend', (event) => this.handleDragEnd(event, item));
    });

    // Set up drop zones
    this.container.querySelectorAll(this.dropZonesSelector).forEach((zone) => {
      zone.addEventListener('dragover', (event) => event.preventDefault());
      zone.addEventListener('dragenter', (event) => zone.classList.add('drag-over'));
      zone.addEventListener('dragleave', (event) => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('drag-over');
        if (this.draggedElement) {
          this.onDrop(this.draggedElement, zone);
        }
      });
    });
  }

  handleDragStart(event, item) {
    this.draggedElement = item;
    item.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.dataset.id || '');
  }

  handleDragEnd(event, item) {
    item.classList.remove('dragging');
    this.container.querySelectorAll(this.dropZonesSelector).forEach((zone) => {
      zone.classList.remove('drag-over');
    });
  }

  refresh() {
    this.init();
  }
}

// Usage example for a Kanban board
const board = new DragDropManager('.kanban-board', {
  dragItems: '.task-card',
  dropZones: '.column-body',
  onDrop: (item, zone) => {
    zone.appendChild(item);
    saveBoardState();
  },
});
```""",
            "source": "gui-synthetic/js-patterns", "category": "js-pattern",
        },
        {
            "instruction": "Implement undo/redo system",
            "input": "How do I implement an undo/redo system with command pattern for a creative app?",
            "output": """```javascript
class UndoRedoManager {
  constructor(maxSteps = 50) {
    this.history = [];
    this.future = [];
    this.maxSteps = maxSteps;
    this.onChange = null;
  }

  push(state) {
    // Deep clone the state before storing
    const snapshot = JSON.parse(JSON.stringify(state));
    this.history.push(snapshot);

    // Enforce max history size
    if (this.history.length > this.maxSteps) {
      this.history.shift();
    }

    // Clear redo stack on new action
    this.future = [];
    this.notify();
  }

  undo() {
    if (this.history.length <= 1) return null;

    // Move current state to future stack
    this.future.push(this.history.pop());
    this.notify();

    // Return a deep clone of the restored state
    return JSON.parse(JSON.stringify(this.history[this.history.length - 1]));
  }

  redo() {
    if (this.future.length === 0) return null;

    // Restore from future stack
    this.history.push(this.future.pop());
    this.notify();

    return JSON.parse(JSON.stringify(this.history[this.history.length - 1]));
  }

  canUndo() {
    return this.history.length > 1;
  }

  canRedo() {
    return this.future.length > 0;
  }

  notify() {
    if (this.onChange) {
      this.onChange({
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        steps: this.history.length - 1,
      });
    }
  }

  clear() {
    this.history = [];
    this.future = [];
    this.notify();
  }
}

// Usage with keyboard shortcuts
const undoManager = new UndoRedoManager();
undoManager.onChange = (state) => {
  document.getElementById('undoBtn').disabled = !state.canUndo;
  document.getElementById('redoBtn').disabled = !state.canRedo;
};

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    event.preventDefault();
    const restoredState = event.shiftKey
      ? undoManager.redo()
      : undoManager.undo();
    if (restoredState) {
      restoreApplicationState(restoredState);
    }
  }
});
```""",
            "source": "gui-synthetic/js-patterns", "category": "js-pattern",
        },
        {
            "instruction": "Implement debounce and throttle",
            "input": "How do I implement debounce, throttle, and requestAnimationFrame for performance optimization?",
            "output": """```javascript
/**
 * Debounce: delays execution until after a period of inactivity.
 * Useful for search inputs, auto-save, and resize handlers.
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle: limits execution to once per specified interval.
 * Useful for scroll handlers, mouse move events, and API calls.
 */
function throttle(fn, limit = 100) {
  let isThrottled = false;
  return function (...args) {
    if (!isThrottled) {
      fn(...args);
      isThrottled = true;
      setTimeout(() => {
        isThrottled = false;
      }, limit);
    }
  };
}

/**
 * requestAnimationFrame throttle: synchronizes with browser paint cycles.
 * Best for visual updates like scroll position, animations, and layouts.
 */
function rafThrottle(fn) {
  let isScheduled = false;
  return function (...args) {
    if (!isScheduled) {
      requestAnimationFrame(() => {
        fn(...args);
        isScheduled = false;
      });
      isScheduled = true;
    }
  };
}

/**
 * Leading-edge throttle: fires immediately, then waits.
 * Useful for save buttons and send actions.
 */
function throttleLeading(fn, limit = 100) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      fn(...args);
      lastCall = now;
    }
  };
}

/**
 * Debounce with optional leading call.
 */
function debounceLeading(fn, delay = 300, leading = false) {
  let timer = null;
  let hasRun = false;
  return function (...args) {
    if (leading && !hasRun) {
      fn(...args);
      hasRun = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      hasRun = false;
    }, delay);
  };
}

// Usage examples
const handleSearch = debounce((query) => fetchSearchResults(query), 300);
const handleScroll = rafThrottle(() => updateScrollPosition());
const handleResize = throttle(() => recalculateLayout(), 100);
```""",
            "source": "gui-synthetic/js-patterns", "category": "js-pattern",
        },
        {
            "instruction": "Implement localStorage cache with TTL",
            "input": "How do I implement a client-side cache with localStorage that supports time-to-live and automatic expiration?",
            "output": """```javascript
/**
 * Client-side cache with time-to-live (TTL) support.
 * Automatically expires stale entries and evicts oldest data when storage is full.
 */
const Cache = {
  /** Retrieve a cached value. Returns null if missing or expired. */
  get(key) {
    try {
      const raw = localStorage.getItem('cache_' + key);
      if (!raw) return null;

      const entry = JSON.parse(raw);

      // Check expiration
      if (entry.expiry && Date.now() > entry.expiry) {
        localStorage.removeItem('cache_' + key);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  },

  /** Store a value with optional TTL (in minutes). */
  set(key, data, ttlMinutes = 5) {
    try {
      localStorage.setItem('cache_' + key, JSON.stringify({
        data,
        expiry: ttlMinutes ? Date.now() + ttlMinutes * 60000 : null,
      }));
    } catch (error) {
      // Quota exceeded — evict oldest entries
      if (error.name === 'QuotaExceededError') {
        this.evict();
      }
    }
  },

  /** Remove a single key from cache. */
  remove(key) {
    localStorage.removeItem('cache_' + key);
  },

  /** Clear all cached entries. */
  clear() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('cache_'))
      .forEach((k) => localStorage.removeItem(k));
  },

  /** Evict the oldest 30% of cached entries when storage is full. */
  evict() {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith('cache_')
    );
    if (keys.length === 0) return;

    const entries = keys.map((key) => ({
      key,
      size: localStorage.getItem(key).length,
      lastAccess: Date.now(),
    }));

    // Sort by approximate access time (oldest first) and remove 30%
    entries.sort((a, b) => a.lastAccess - b.lastAccess);
    const target = Math.ceil(entries.length * 0.3);

    for (let i = 0; i < target; i++) {
      localStorage.removeItem(entries[i].key);
    }
  },

  /** Get total cache size in bytes. */
  size() {
    let total = 0;
    Object.keys(localStorage)
      .filter((k) => k.startsWith('cache_'))
      .forEach((k) => (total += localStorage.getItem(k).length));
    return total;
  },
};

// Usage: fetch with caching
async function fetchUsersWithCache() {
  let users = Cache.get('users');
  if (!users) {
    users = await fetchUsersFromAPI();
    Cache.set('users', users, 10); // Cache for 10 minutes
  }
  return users;
}
```""",
            "source": "gui-synthetic/js-patterns", "category": "js-pattern",
        },
        {
            "instruction": "Implement keyboard shortcut manager",
            "input": "How do I create a keyboard shortcut system with modifier keys, combos, and conflict prevention?",
            "output": """```javascript
/**
 * Keyboard Shortcut Manager
 * Supports modifier keys (Ctrl/Cmd, Alt, Shift), combos, and input field detection.
 */
const Shortcuts = {
  _bindings: new Map(),

  /** Initialize by listening to keydown events globally. */
  init() {
    document.addEventListener('keydown', (event) => this._handle(event));
  },

  /** Register a keyboard shortcut with an optional description. */
  register(combo, handler, description = '') {
    this._bindings.set(combo.toLowerCase(), {
      handler,
      description,
      combo,
    });
  },

  /** Remove a previously registered shortcut. */
  unregister(combo) {
    this._bindings.delete(combo.toLowerCase());
  },

  /** Internal handler that matches key events to registered shortcuts. */
  _handle(event) {
    const key = event.key.toLowerCase();
    let combo = '';

    // Build modifier prefix in a consistent order
    if (event.ctrlKey || event.metaKey) combo += 'ctrl+';
    if (event.altKey) combo += 'alt+';
    if (event.shiftKey) combo += 'shift+';
    combo += key;

    const binding = this._bindings.get(combo);
    if (!binding) return;

    // Don't intercept shortcuts when typing in input fields (unless Escape/Enter)
    const target = event.target;
    const isInputField =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    if (isInputField && !['escape', 'enter'].includes(key)) {
      return;
    }

    event.preventDefault();
    binding.handler(event);
  },

  /** Get a help string listing all registered shortcuts. */
  getHelp() {
    return Array.from(this._bindings.values())
      .filter((b) => b.description)
      .map((b) => `${b.combo}: ${b.description}`)
      .join('\n');
  },
};
Shortcuts.init();
Shortcuts.register('ctrl+s',()=>save(),'Save current document');
Shortcuts.register('ctrl+z',()=>undo(),'Undo last action');
Shortcuts.register('ctrl+shift+z',()=>redo(),'Redo last action');
Shortcuts.register('ctrl+k',()=>openCommandPalette(),'Open command palette');
Shortcuts.register('escape',()=>closeModal(),'Close modal');
```""",
            "source": "gui-synthetic/js-patterns", "category": "js-pattern",
        },
        {
            "instruction": "Implement a simple reactive state manager",
            "input": "How do I create a simple reactive state management system like a minimal Redux or Zustand?",

            "output": """```javascript
/**
 * Creates a simple reactive store inspired by Zustand and Redux.
 * Supports state updates, subscriptions, and derived state.
 */
function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    /** Get the current state snapshot. */
    getState() {
      return state;
    },

    /** Update state with a partial object or updater function. */
    setState(updates) {
      const previousState = state;

      if (typeof updates === 'function') {
        state = { ...state, ...updates(state) };
      } else {
        state = { ...state, ...updates };
      }

      // Notify all subscribers with new and previous state
      listeners.forEach((listener) => listener(state, previousState));
    },

    /** Subscribe to state changes. Returns unsubscribe function. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Reset state to initial values. */
    reset() {
      state = { ...initialState };
      listeners.forEach((listener) => listener(state, null));
    },
  };
}

// Usage example
const store = createStore({
  count: 0,
  user: null,
  theme: 'dark',
});

// Subscribe to changes
const unsubscribe = store.subscribe((newState, previousState) => {
  console.log('State changed:', newState);

  // Update specific UI elements on change
  if (newState.count !== previousState.count) {
    updateCounterDisplay(newState.count);
  }
});

// Update state (partial merge)
store.setState({ count: store.getState().count + 1 });

// Update state with function (access current state)
store.setState((current) => ({ count: current.count + 1 }));

/**
 * Creates derived/computed state from a store.
 * Only notifies subscribers when the derived value actually changes.
 */
function createDerived(store, deriveFn) {
  let currentValue = deriveFn(store.getState());
  const subscribers = new Set();

  const unsubscribe = store.subscribe((newState) => {
    const nextValue = deriveFn(newState);
    if (nextValue !== currentValue) {
      currentValue = nextValue;
      subscribers.forEach((fn) => fn(currentValue));
    }
  });

  return {
    get() {
      return currentValue;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    destroy() {
      unsubscribe();
      subscribers.clear();
    },
  };
}

// Derived state example
const doubledCount = createDerived(store, (state) => state.count * 2);
doubledCount.subscribe((value) => {
  console.log('Doubled count:', value);
});
```""",
            "source": "gui-synthetic/js-patterns", "category": "js-pattern",
        },
        {
            "instruction": "Implement WebSocket connection manager",
            "input": "How do I create a robust WebSocket connection manager with auto-reconnect, heartbeat, and message queuing?",
            "output": """```javascript
class WSClient {
  constructor(url, opts = {}) {
    this.url = url;
    this.reconnectDelay = opts.reconnectDelay || 1000;
    this.maxReconnects = opts.maxReconnects || 10;
    this.heartbeatInterval = opts.heartbeatInterval || 30000;
    this.onMessage = opts.onMessage || (() => {});
    this.onStatus = opts.onStatus || (() => {});
    this.ws = null;
    this.reconnects = 0;
    this.queue = [];
    this.heartbeatTimer = null;
    this.connect();
  }
  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.reconnects = 0;
        this.onStatus('connected');
        this.startHeartbeat();
        while (this.queue.length) this.ws.send(this.queue.shift());
      };
      this.ws.onmessage = (e) => {
        try { this.onMessage(JSON.parse(e.data)); }
        catch { this.onMessage(e.data); }
      };
      this.ws.onclose = () => {
        this.onStatus('disconnected');
        this.scheduleReconnect();
      };
      this.ws.onerror = () => { this.ws.close(); };
    } catch (e) { this.scheduleReconnect(); }
  }
  scheduleReconnect() {
    this.stopHeartbeat();
    if (this.reconnects >= this.maxReconnects) {
      this.onStatus('failed');
      return;
    }
    this.reconnects++;
    this.onStatus('reconnecting');
    setTimeout(() => this.connect(), this.reconnectDelay * Math.min(this.reconnects, 5));
  }
  send(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(msg);
    else this.queue.push(msg);
  }
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.heartbeatInterval);
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  disconnect() {
    this.stopHeartbeat();
    this.maxReconnects = 0;
    if (this.ws) this.ws.close();
  }
}

const ws = new WSClient('wss://api.example.com/ws', {
  onMessage: (msg) => console.log(msg),
  onStatus: (s) => document.getElementById('status').textContent = s,
});
```""",
            "source": "gui-synthetic/js-patterns", "category": "js-pattern",
        },
        {
            "instruction": "Implement virtual scrolling for large lists",
            "input": "How do I implement virtual scrolling to render only visible items in a large list for performance?",
            "output": """```javascript
/**
 * Virtual Scroller - renders only visible items in a large list for performance.
 * Handles scroll events, calculates visible range, and updates the DOM efficiently.
 */
class VirtualScroll {
  constructor(containerSelector, items, options = {}) {
    this.container = document.querySelector(containerSelector);
    this.items = items;
    this.itemHeight = options.itemHeight || 40;
    this.overscan = options.overscan || 5; // Extra items rendered above/below viewport
    this.renderItem = options.renderItem || ((index, data) => '<div>' + data + '</div>');

    this.totalHeight = items.length * this.itemHeight;
    this.scrollTop = 0;
    this.init();
  }

  /** Set up the container and initial rendering. */
  init() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';

    // Create a spacer element to create the full scrollable area
    this.container.innerHTML =
      '<div style="height:' + this.totalHeight + 'px;position:relative"></div>';
    this.placeholder = this.container.firstChild;

    // Bind scroll handler
    this.container.addEventListener('scroll', () => this.update());

    // Initial render
    this.update();
  }

  /** Recalculate and render only the visible items. */
  update() {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    // Calculate which items should be visible
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / this.itemHeight) - this.overscan
    );
    const endIndex = Math.min(
      this.items.length,
      Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.overscan
    );

    // Build HTML for visible items only
    let html = '';
    for (let i = startIndex; i < endIndex; i++) {
      html +=
        '<div style="position:absolute;top:' +
        i * this.itemHeight +
        'px;left:0;right:0;height:' +
        this.itemHeight +
        'px">' +
        this.renderItem(i, this.items[i]) +
        '</div>';
    }
    this.placeholder.innerHTML = html;
  }

  /** Update the dataset and re-render. */
  updateItems(newItems) {
    this.items = newItems;
    this.totalHeight = newItems.length * this.itemHeight;
    this.placeholder.style.height = this.totalHeight + 'px';
    this.update();
  }
}

// Usage: efficiently render 10,000 items
const items = Array.from({ length: 10000 }, (_, index) => 'Item #' + index);
const scroller = new VirtualScroll('#list-container', items, {
  itemHeight: 36,
  renderItem: (index, data) =>
    '<div style="padding:8px 12px;color:#aaa;border-bottom:1px solid rgba(255,255,255,0.04)">' +
    data +
    '</div>',
});
```""",
            "source": "gui-synthetic/js-patterns", "category": "js-pattern",
        },
    ]


def generate_design_patterns():
    """Generate dataset about UI/UX design patterns and decisions."""
    patterns = [
        {
            "instruction": "Design a modern dashboard layout",
            "input": "What's the best layout and component structure for a data dashboard? Include responsive considerations.",
            "output": """A modern dashboard should follow these design principles:

## Layout Structure
```
┌──────────────────────────────────────────────┐
│  Header: Logo, Search, Notifications, Profile │
├──────┬───────────────────────────────────────┤
│      │  ┌──────┐ ┌──────┐ ┌──────┐           │
│ Side │  │ KPI  │ │ KPI  │ │ KPI  │           │
│ bar   │  └──────┘ └──────┘ └──────┘           │
│      │  ┌────────────────────────┐            │
│ Nav  │  │     Main Chart         │            │
│      │  └────────────────────────┘            │
│ Links│  ┌────────────┐ ┌────────────────────┐ │
│      │  │ Data Table │ │ Activity Feed      │ │
│      │  └────────────┘ └────────────────────┘ │
└──────┴───────────────────────────────────────┘
```

## Key Components
1. **KPI Cards** - 3-4 key metrics in a row with icon, value, trend indicator
2. **Main Chart** - Primary visualization (line/bar/area) taking full width
3. **Data Table** - Sortable, filterable with pagination
4. **Activity Feed** - Real-time updates with timestamps
5. **Sidebar** - Navigation with collapsible groups

## Responsive Breakpoints
- Desktop (>1024px): Full sidebar + 3-column KPI grid
- Tablet (768-1024px): Collapsed sidebar + 2-column KPI grid
- Mobile (<768px): Bottom nav + single column KPI

## Design Decisions
- **Dark background** (#0f0f1a) reduces eye strain for monitoring
- **Cyan accent** (#00d9ff) for data highlights against dark bg
- **Card-based UI** with subtle borders and hover effects
- **Consistent 16px spacing** using 4px grid system
- **Data updates** via WebSocket for real-time feel
- **Loading states** with skeleton screens, not spinners""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design a code editor interface",
            "input": "I need to design a web-based code editor UI. What components and layout should I use?",
            "output": """A web code editor needs these core components:

## Layout
```
┌──────────────────────────────────────────────────┐
│  Tab Bar: Files open as tabs, close button each   │
├─────────┬────────────────────┬───────────────────┤
│         │                    │                   │
│ File    │   Code Editor      │   Preview/Output  │
│ Explorer│   (Monaco/CodeMirror)│   Panel          │
│         │                    │                   │
│ - src/  │  • Syntax highlight│  • Live preview   │
│  - app. │  • Line numbers    │  • Console        │
│  - comp.│  • Auto-indent     │  • Errors         │
│ - pub/  │  • Bracket matching│  • Performance    │
│         │  • Minimap         │                   │
├─────────┴────────────────────┴───────────────────┤
│  Status Bar: Line/Col, Language, Encoding, Git    │
└──────────────────────────────────────────────────┘
```

## Component Specs

### File Explorer
- Tree view with file/folder icons
- Right-click context menu (new, rename, delete)
- Drag-and-drop file organization  
- Search/filter files (Cmd+P)

### Code Editor
- Monaco Editor (VS Code core) or CodeMirror 6
- Syntax highlighting for 20+ languages
- Auto-completion with IntelliSense
- Multiple cursors (Cmd+D)
- Code folding, minimap, breadcrumbs
- Font: 'Cascadia Code' or 'Fira Code' with ligatures

### Preview Panel
- Live HTML/CSS preview with iframe sandboxing
- Console output with log levels (info/warn/error)
- Performance metrics (load time, memory)
- Responsive device preview buttons

## Dark Theme Colors
- Editor bg: #1e1e2e
- Sidebar: #181825
- Active tab: #1e1e2e
- Text: #cdd6f4
- Keywords: #cba6f7 (purple)
- Strings: #a6e3a1 (green)
- Functions: #89b4fa (blue)
- Numbers: #fab387 (peach)
- Comments: #6c7086 (gray)""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design a settings/preferences page",
            "input": "What's the best layout and component structure for a settings or preferences page with multiple categories?",
            "output": """A settings page needs clear organization and intuitive navigation between preference categories.

## Layout Structure
```
┌─────────────────────────────────────┐
│  Settings  ───  Search settings…    │
├──────────┬──────────────────────────┤
│  ┌──────┐│  ┌──────────────────────┐│
│  │⚙️   ││  │ Appearance           ││
│  │General││  │ ┌──────────────────┐││
│  ├──────┤│  │ │ 🌙 Dark mode     │││
│  │🔔   ││  │ │    ○ Off  ● On    │││
│  │Notifs ││  │ └──────────────────┘││
│  ├──────┤│  │ ┌──────────────────┐││
│  │🔒   ││  │ │ 🔤 Font size     │││
│  │Privacy││  │ │ [Medium    ▾]   │││
│  ├──────┤│  │ └──────────────────┘││
│  │👤   ││  │ ┌──────────────────┐││
│  │Account││  │ │ 🎨 Accent color │││
│  └──────┘│  │ │ ■■■■■■■□        │││
│          │  │ └──────────────────┘││
│          │  └──────────────────────┘│
└──────────┴──────────────────────────┘
```

## Key Components
1. **Sidebar Navigation** - Icon + label categories with active state
2. **Search Bar** - Quick filter across all settings
3. **Section Cards** - Grouped settings with clear headers
4. **Toggle Switches** - For binary options with instant apply
5. **Dropdown Selects** - For multiple-choice settings
6. **Color Picker** - For theme customization
7. **Slider Controls** - For numeric ranges (opacity, size, speed)
8. **Save Indicator** - "Unsaved changes" chip + auto-save badge

## Responsive Behavior
- Desktop: Sidebar + content side by side (280px sidebar)
- Tablet: Collapsible sidebar or top tab bar
- Mobile: Full-screen category drill-down with back button

## UX Patterns
- **Live Preview** - Changes apply immediately (no save button needed)
- **Search** - Filters visible categories in real-time
- **Danger Zone** - Red-bordered section for destructive actions
  with confirmation dialogs
- **Reset to Defaults** - Per-section or global reset option
- **Keyboard Navigation** - Tab through settings, arrow keys for selects""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design an onboarding flow",
            "input": "How should I structure a multi-step onboarding flow for a new user? Include progress indicators and CTAs.",
            "output": """A great onboarding flow guides users from first visit to value discovery without overwhelming them.

## Layout Structure
```
┌─────────────────────────────────┐
│         ● ● ○ ○ ○ ○            │
│      Step 2 of 6 — Profile     │
├─────────────────────────────────┤
│                                 │
│     ┌─────────────────────┐     │
│     │                     │     │
│     │    👤 Avatar Upload │     │
│     │    ┌──────────┐    │     │
│     │    │  📷      │    │     │
│     │    │  Upload  │    │     │
│     │    └──────────┘    │     │
│     │                     │     │
│     │  Name: [_________] │     │
│     │  Role: [Developer ▾]│     │
│     │                     │     │
│     └─────────────────────┘     │
│                                 │
│  [Skip]           [Continue →]  │
└─────────────────────────────────┘
```

## Step Structure
1. **Welcome** - Brief value proposition + "Get Started" CTA
2. **Profile** - Name, avatar, role (optional)
3. **Preferences** - Theme, notifications, language
4. **Connect** - Import data or connect accounts (GitHub, Google)
5. **Tutorial** - Interactive walkthrough of key features (3-4 steps)
6. **Complete** - Confirmation + transition to main app

## Key Components
1. **Step Indicator** - Circular dots with progress fill, numbered
2. **Card Container** - Centered max-width card (520px) with subtle shadow
3. **Progress Bar** - Animated bar across the top
4. **Navigation** - Back (left), Continue/Next (right primary CTA), Skip (text link)
5. **Illustration Area** - Each step has a relevant vector/graphic

## Design Decisions
- **Linear flow** - Users complete steps in order (no skipping core steps)
- **Optional fields** - Marked clearly, allow skip
- **Micro-animations** - Card slides left on next, fades in content
- **Progress persistence** - Save to localStorage so resume on return
- **Minimal text** - Each step has 1 headline + 1 subtitle max
- **One primary action** per step (avoid choice paralysis)
- **Exit intent** - Warning dialog if user tries to close during onboarding

## Accessibility
- Full keyboard navigation (Tab, Enter, Escape)
- Screen reader announcements for step changes
- Focus management (auto-focus first input each step)
- Reduced motion support for animations""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design a search results page",
            "input": "What layout and components should a search results page have? Include filters, facets, and result display.",
            "output": """A search results page balances findability with readability, helping users quickly locate relevant results.

## Layout Structure
```
┌──────────────────────────────────────────┐
│  🔍 [search query___________]  ⚙️ Filters │
├──────────┬───────────────────────────────┤
│  Filters  │  Results (1-20 of 1,234)      │
│ ───────── │                               │
│  □ Category│  ┌─────────────────────────┐  │
│  □ Docs   │  │ 📄 Introduction to React│  │
│  □ Guides │  │ React is a JavaScript…  │  │
│  □ API    │  │ ⭐ 4.8 • 📖 12 pages    │  │
│           │  └─────────────────────────┘  │
│  Sort:    │  ┌─────────────────────────┐  │
│  [Relevan▾]│  │ 🎨 CSS Grid Layout Guide│  │
│           │  │ Master CSS Grid with…   │  │
│  Date:    │  │ ⭐ 4.6 • 📖 8 pages     │  │
│  [Any ▾]  │  └─────────────────────────┘  │
│           │                               │
│  🔖 Type  │  ┌─────────────────────────┐  │
│  □ Article│  │ ⚡ Performance Tips     │  │
│  □ Video  │  │ Optimize your app…     │  │
│  □ Course │  │ ⭐ 4.9 • 🎬 15 min     │  │
│           │  └─────────────────────────┘  │
│  [Apply]  │  ◂ 1 2 3 4 5 … 62 ▸          │
└──────────┴───────────────────────────────┘
```

## Key Components
1. **Search Bar** - Persistent at top with clear button and recent searches dropdown
2. **Filter Sidebar** - Checkbox groups, range sliders, dropdowns
3. **Result Card** - Title, description snippet (2 lines), metadata (rating, type, date)
4. **Sort Dropdown** - Relevance, date, rating, alphabetical
5. **Pagination** - Page numbers with prev/next, jump to page input
6. **Active Filters** - Chip/tag display with individual remove buttons
7. **Result Count** - "Showing X-Y of Z results" with contextual help
8. **Empty State** - Illustration, suggestion to broaden search, popular alternatives

## Responsive Behavior
- Desktop: Sidebar filters + 1-3 column results grid
- Tablet: Collapsible filter panel (slide-out drawer)
- Mobile: Full-width results, filter button opens bottom sheet

## UX Patterns
- **Debounced Search** - Results update after 300ms of no typing
- **URL Sync** - All filters/sort/page reflected in URL for sharing
- **Infinite Scroll** - Optional: auto-load next page on scroll (with loading skeleton)
- **Result Highlighting** - Bold matching terms in title and snippet
- **Quick Preview** - Hover card or expandable preview for each result
- **Keyboard Navigation** - Arrow keys to navigate results, Enter to select""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design a user profile page",
            "input": "What components and layout should a user profile page have? Include bio, activity, and social features.",
            "output": """A user profile page is a personal hub that showcases identity, activity, and social connections.

## Layout Structure
```
┌──────────────────────────────────────────┐
│  ┌──────────────────────────────────────┐│
│  │  👤 Cover Photo (banner)            ││
│  │       ┌──────┐                      ││
│  │       │Avatar│  Sarah Chen          ││
│  │       │ 128px│  @sarahcodes         ││
│  │       └──────┘  Senior Developer    ││
│  │  [Edit Profile] [Share]             ││
│  └──────────────────────────────────────┘│
├──────────┬───────────────────────────────┤
│  Stats   │  Tabs: Posts │ Repos │ About  │
│ ─────── │───────────────────────────────│
│  📊 342  │  ┌─────────────────────────┐  │
│   Posts  │  │ 📝 Just shipped v2.0!  │  │
│          │  │ Added dark mode and…   │  │
│  👥 1.2K │  │ ❤️ 24 • 💬 8 • 2h ago  │  │
│  Followers│  └─────────────────────────┘  │
│          │  ┌─────────────────────────┐  │
│  🔗 89   │  │ 🎨 New color palette   │  │
│  Following│  │ Inspired by sunset…    │  │
│          │  │ ❤️ 18 • 💬 3 • 5h ago   │  │
│  ⭐ 1.5K │  └─────────────────────────┘  │
│  Reputation│                             │
│          │  [Load more...]               │
└──────────┴───────────────────────────────┘
```

## Key Components
1. **Profile Header** - Cover photo, avatar (editable), name, handle, bio, location
2. **Action Buttons** - Follow/Unfollow, Message, Share, Edit Profile
3. **Stat Cards** - Posts, followers, following, reputation with subtle icons
4. **Tab Navigation** - Content categories (Posts, Activity, About, Settings)
5. **Activity Feed** - Chronological list with avatars, timestamps, reactions
6. **About Section** - Bio, website, social links, joined date, skills/tags
7. **Badge Display** - Achievement or role badges in a horizontal row

## Responsive Behavior
- Desktop: Stats sidebar + content in main column
- Tablet: Stats row above tabs, single column
- Mobile: Stack everything, tabs become horizontal scroll, stats compact row

## Design Decisions
- **Visual hierarchy** - Avatar is the focal point surrounded by identity info
- **Consistent spacing** - 24px between sections, 16px within cards
- **Verified badge** - Blue checkmark for authenticated accounts
- **Edit mode** - Inline editing with save/cancel, no separate edit page
- **Activity privacy** - Users can hide specific activities or set profile to private
- **Loading state** - Skeleton profile while data loads (avatar circle, rect blocks)
- **Social proof** - Show mutual connections when viewing others' profiles""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design a landing page",
            "input": "How should I structure a landing page for a SaaS product? Include hero, features, testimonials, and CTA sections.",
            "output": """A high-converting landing page guides visitors from awareness to action through a clear narrative arc.

## Layout Structure
```
┌──────────────────────────────────────────┐
│  [Logo]  Product  Pricing  Docs  [Sign In]│
├──────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐│
│  │ 🚀 Build Better Apps Faster         ││
│  │ Ship 10x faster with our platform   ││
│  │ that handles deployment, monitoring,││
│  │ and scaling out of the box.         ││
│  │                                      ││
│  │ [Start Free Trial →]  [Watch Demo]  ││
│  │                                      ││
│  │ ✦ No credit card  ✦ 14-day trial    ││
│  └──────────────────────────────────────┘│
├──────────────────────────────────────────┤
│  Trusted by 10,000+ companies worldwide  │
│  [Logo1] [Logo2] [Logo3] [Logo4] [Logo5] │
├──────────────────────────────────────────┤
│  ┌────────┐  ┌────────┐  ┌────────┐     │
│  │⚡      │  │🔒      │  │🌐      │     │
│  │Speed   │  │Security│  │Global  │     │
│  │Deploy… │  │End-to… │  │Edge…   │     │
│  └────────┘  └────────┘  └────────┘     │
├──────────────────────────────────────────┤
│  "This tool transformed our workflow"   │
│  ── Jane D., CTO at TechCorp  ⭐⭐⭐⭐⭐  │
├──────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐│
│  │ Ready to get started?               ││
│  │ [Start Your Free Trial →]           ││
│  │ No commitment, cancel anytime       ││
│  └──────────────────────────────────────┘│
├──────────────────────────────────────────┤
│  © 2024  •  Privacy  •  Terms  •  Contact│
└──────────────────────────────────────────┘
```

## Section Breakdown
1. **Hero** - Headline (benefit-focused), subheadline, primary CTA, secondary CTA, social proof
2. **Social Proof Bar** - Customer logos in grayscale, hover to color
3. **Features Grid** - 3-6 feature cards with icon, title, description, optional screenshot
4. **Testimonials** - Carousel or grid of quotes with photo, name, title, company, rating
5. **Stats/Results** - Data points: "10M+ requests served", "99.9% uptime"
6. **Pricing Preview** - 3-tier comparison cards (Free, Pro, Enterprise)
7. **CTA Section** - Final call-to-action with urgency (limited offer)
8. **Footer** - Links, social, legal

## Key Components
1. **Navigation** - Fixed top, transparent → solid on scroll, mobile hamburger
2. **Hero Section** - Full viewport height with gradient or particle background
3. **Feature Card** - Icon, title, description, optional hover animation
4. **Testimonial Card** - Quote, author info, star rating, optional video
5. **CTA Button** - High contrast, action-oriented text, arrow icon
6. **Pricing Card** - Tier name, price, feature list, CTA button, "Most Popular" badge

## Design Decisions
- **Above the fold** - Hero must communicate value proposition in under 5 seconds
- **Visual hierarchy** - One primary CTA per section, use size/color to direct attention
- **Scarcity** - "Limited time offer", "Only X spots left" for urgency
- **Animation** - Reveal sections on scroll (fade in, slide up) for engagement
- **Mobile First** - Single column on mobile, grid expands on larger screens
- **Color psychology** - Blue for trust, green for growth, orange for urgency
- **Typography** - 1.25x line height for readability, max 75 chars per line""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design an e-commerce product page",
            "input": "What layout and components should an e-commerce product detail page have? Include gallery, variants, reviews, and add-to-cart.",
            "output": """A product page must present information clearly while minimizing friction in the purchase journey.

## Layout Structure
```
┌────────────────────────────────────────────────────┐
│  Home > Electronics > Headphones > Wireless         │
├────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────────────────┐│
│  │  ┌────────┐  │  │  🎧 UltraBass Pro X        ││
│  │  │  Main  │  │  │  ⭐ 4.8 (234 reviews)       ││
│  │  │  Image │  │  │  ─────────────────────────  ││
│  │  └────────┘  │  │  $249.99  •  In Stock       ││
│  │  ┌──┐┌──┐┌──┐│  │  █████████  $199 sale       ││
│  │  │  ││  ││  ││  │  ─────────────────────────  ││
│  │  └──┘└──┘└──┘│  │  Color: [Black ▾]          ││
│  │  Thumbnails   │  │  ┌─────┐┌─────┐┌─────┐   ││
│  └──────────────┘  │  │Black││White││Blue │   ││
│                     │  └─────┘└─────┘└─────┘   ││
│                     │  Quantity: [1 ▾]          ││
│                     │  ─────────────────────────  ││
│                     │  [🛒 Add to Cart  +$249.99]││
│                     │  [⚡ Buy Now]              ││
│                     │  ✓ Free shipping • 30-day returns    ││
│                     └─────────────────────────────┘│
├────────────────────────────────────────────────────┤
│  Description  │  Specs  │  Reviews  │  Shipping    │
│  ──────────────────────────────────────────────   │
│  Premium wireless headphones with active noise    │
│  cancellation, 40-hour battery life, and premium │
│  memory foam ear cushions for all-day comfort.   │
└────────────────────────────────────────────────────┘
```

## Key Components
1. **Image Gallery** - Main image + thumbnail strip, zoom on hover, lightbox on click
2. **Product Info** - Title, rating stars + count, price (original + sale), stock status
3. **Variant Selector** - Color swatches, size buttons, dropdowns for options
4. **Quantity Selector** - Stepper with +/- buttons, min/max validation
5. **Add to Cart Button** - Primary action, updates cart icon, shows micro-feedback
6. **Buy Now Button** - Secondary action, goes directly to checkout
7. **Trust Signals** - Shipping info, return policy, secure checkout badges
8. **Tab Content** - Description, specifications, reviews, shipping details

## Responsive Behavior
- Desktop: Image left, info right (60/40 split), sidebar
- Tablet: Same layout but narrower, thumbnails below main image
- Mobile: Stacked layout, gallery full-width, CTA fixed at bottom

## UX Patterns
- **Sticky CTA** - Add to Cart follows on scroll (mobile)
- **Stock Indicator** - "Only 3 left!" for low stock urgency
- **Recently Viewed** - Horizontal scroll of recently browsed products
- **Related Products** - "Customers also bought" carousel below
- **Wishlist Heart** - Toggle icon on image corner for saving
- **Review Filtering** - Sort by date/rating, filter by star level, photo reviews""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design a mobile navigation system",
            "input": "How should I design navigation for a mobile app? Cover bottom tabs, gestures, and transition patterns.",
            "output": """Mobile navigation must prioritize thumb reach, clarity, and natural gesture interactions.

## Navigation Patterns

### 1. Bottom Tab Bar (Primary Navigation)
```
┌──────────────────────────────────────────┐
│                                          │
│            Content Area                   │
│                                          │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  🏠      🔍     ➕     🔔     👤       │
│ Home   Search   New   Alerts  Profile   │
│ ●      ○       ○     ○       ○          │
└──────────────────────────────────────────┘
```
- 3-5 tabs max (5 is the absolute limit)
- Active tab: filled icon + accent color
- Inactive: outlined icons in neutral gray
- Badge counts on notification tab

### 2. Gesture Navigation
- **Swipe Left/Right** - Switch between tabs at same level
- **Swipe Back** - From left edge to go to previous screen
- **Pull Down** - Refresh content, or open search
- **Long Press** - Context menu on items
- **Pinch** - Zoom in/out on media
- **Tap Top** - Scroll to top of content

### 3. Navigation Hierarchy
```
┌─ Root (Bottom Tabs) ──────────────────────┐
│  ├ Home → Article → Reader (push stack)   │
│  ├ Search → Results → Detail (push stack) │
│  ├ New → [Modal: Create Post]             │
│  ├ Notifications → Detail (push stack)    │
│  └ Profile → Settings → Edit (push stack) │
└────────────────────────────────────────────┘
```

## Key Components
1. **Bottom Tab Bar** - Fixed at bottom, 48-56px height, icon + label
2. **Navigation Bar** - Top bar with back button, title, optional actions
3. **Hamburger Menu** - For secondary navigation in utility screens
4. **Tab Bar (Secondary)** - Below top bar for sub-sections within a tab
5. **Search Bar** - Expandable from top, with recent searches
6. **Modal Presentation** - Sheet slides up from bottom for compose/edit

## Design Decisions
- **Thumb Zone** - Primary actions within thumb reach (bottom 1/3 of screen)
- **Back gesture** - Swipe back should work consistently from any screen
- **Transition types**: Push (right-to-left), Modal (bottom-up), Fade (contextual)
- **Haptic feedback** - Light tap for button press, medium for success/error
- **Safe areas** - Respect notch, home indicator, and status bar insets
- **One level deep** - Most tasks should complete within 2 taps from root
- **Bottom sheet** - Use instead of full modals for quick actions/options""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
        {
            "instruction": "Design a multi-step form wizard",
            "input": "How do I design a multi-step form wizard for complex data entry? Include progress, validation, and navigation.",
            "output": """A form wizard breaks complex data entry into manageable steps, reducing cognitive load and improving completion rates.

## Layout Structure
```
┌──────────────────────────────────────┐
│  Step 2 of 4 — Shipping Address      │
│  ████████░░░░░░░░░░ 50%              │
├──────────────────────────────────────┤
│  ┌──────────────────────────────────┐│
│  │ 📦 Shipping Information          ││
│  │                                  ││
│  │  Full Name                       ││
│  │  [___________________________]   ││
│  │                                  ││
│  │  Address                         ││
│  │  [___________________________]   ││
│  │                                  ││
│  │  City         State    ZIP       ││
│  │  [________]   [__▾_]  [______]   ││
│  │                                  ││
│  │  ☑ Save as default address      ││
│  └──────────────────────────────────┘│
│                                      │
│  [← Back]              [Continue →]  │
└──────────────────────────────────────┘
```

## Step Structure (Example: Checkout)
1. **Cart Review** - Items summary, quantities, remove options
2. **Shipping** - Address form, delivery method selection
3. **Payment** - Card details, billing address, promo code
4. **Confirmation** - Order summary, total, place order

## Key Components
1. **Progress Indicator** - Step numbers, active/completed states, labels below
2. **Progress Bar** - Animated fill line connecting steps
3. **Step Card** - White container with step title and description
4. **Form Fields** - Input, select, checkbox, radio with labels and validation
5. **Navigation** - Back (secondary/ghost) and Continue (primary) buttons
6. **Step Summary** - Collapsible review of completed steps
7. **Error Summary** - Top-of-form list of validation errors with links

## Validation Strategy
- **Inline validation** - Validate on blur, show error below field
- **Step validation** - Only validate current step on "Continue"
- **Debounced validation** - For async checks (username availability)
- **Error grouping** - Highlight all errors in step, scroll to first
- **Progress saving** - Auto-save form data to localStorage on each step

## UX Patterns
- **Ghost text examples** - Placeholder shows format: "MM/YY" for card expiry
- **Smart defaults** - Auto-detect country from IP, city from ZIP
- **Type-ahead** - Address autocomplete with debounced API search
- **Skeleton steps** - Load step content progressively for perceived speed
- **Exit save** - Save all entered data on browser close/unload
- **Keyboard support** - Tab through fields, Enter to continue, Escape to go back
- **Loading state** - Spinner on Continue button during async validation

## Design Decisions
- **Max 6 steps** - Beyond that, show summary page or use grouped sections
- **Linear vs branched** - Linear for most flows, conditional branches for specific cases
- **Step labels** - Verb phrases: "Enter Shipping", not just "Step 2"
- **Review step** - Always include a final review before submission
- **Color coding** - Green for completed, blue for active, gray for upcoming""",
            "source": "gui-synthetic/design",
            "category": "design",
        },
    ]
    return patterns


# ─── Main Generation ─────────────────────────────────────────────────────

def generate_all_datasets():
    """Generate all GUI training datasets."""
    print("=" * 60)
    print("  🎨 GUI Training Dataset Generator")
    print("=" * 60)

    total_entries = 0

    # ─── Phase 1: Parse HTML Projects ─────────────────────────────────
    print("\n📁 Phase 1: Parsing HTML projects...")
    html_files = sorted(glob.glob(str(PROJECTS_DIR / "*.html")))
    print(f"   Found {len(html_files)} HTML project files")
    
    projects = []
    errors = 0
    for fpath in html_files:
        try:
            proj = parse_html_project(fpath)
            projects.append(proj)
        except Exception as e:
            errors += 1
            print(f"   ⚠️  Error parsing {Path(fpath).name}: {e}")
    
    print(f"   Parsed {len(projects)} projects ({errors} errors)")

    # Generate project-based instructions
    print("\n📝 Phase 2: Generating instruction pairs from projects...")
    gui_projects = []
    for i, proj in enumerate(projects):
        try:
            entries = generate_project_instructions(proj)
            gui_projects.extend(entries)
        except Exception as e:
            print(f"   ⚠️  Error generating instruction for {proj['filename']}: {e}")
    
    print(f"   Generated {len(gui_projects)} instruction pairs from projects")

    # Save project dataset
    project_file = OUTPUT_DIR / "gui-projects.jsonl"
    with open(project_file, 'w') as f:
        for entry in gui_projects:
            f.write(json.dumps(entry) + '\n')
    print(f"   ✅ Saved: {project_file.name}")

    # ─── Phase 3: Generate Synthetic Datasets ─────────────────────────
    print("\n🔄 Phase 3: Generating synthetic GUI knowledge datasets...")

    # Component patterns
    print("   Generating component patterns...")
    components = generate_component_patterns()
    comp_file = OUTPUT_DIR / "gui-components.jsonl"
    with open(comp_file, 'w') as f:
        for entry in components:
            f.write(json.dumps(entry) + '\n')
    print(f"   ✅ Saved: {comp_file.name} ({len(components)} entries)")

    # CSS patterns
    print("   Generating CSS patterns...")
    css_patterns = generate_css_patterns()
    css_file = OUTPUT_DIR / "gui-css-patterns.jsonl"
    with open(css_file, 'w') as f:
        for entry in css_patterns:
            f.write(json.dumps(entry) + '\n')
    print(f"   ✅ Saved: {css_file.name} ({len(css_patterns)} entries)")

    # JS patterns
    print("   Generating JS patterns...")
    js_patterns = generate_js_patterns()
    js_file = OUTPUT_DIR / "gui-js-patterns.jsonl"
    with open(js_file, 'w') as f:
        for entry in js_patterns:
            f.write(json.dumps(entry) + '\n')
    print(f"   ✅ Saved: {js_file.name} ({len(js_patterns)} entries)")

    # Design patterns
    print("   Generating design patterns...")
    design_patterns = generate_design_patterns()
    design_file = OUTPUT_DIR / "gui-design.jsonl"
    with open(design_file, 'w') as f:
        for entry in design_patterns:
            f.write(json.dumps(entry) + '\n')
    print(f"   ✅ Saved: {design_file.name} ({len(design_patterns)} entries)")

    # ─── Phase 4: Compile Stats ───────────────────────────────────────
    print("\n📊 Stats:")
    datasets = {
        "gui-projects": gui_projects,
        "gui-components": components,
        "gui-css-patterns": css_patterns,
        "gui-js-patterns": js_patterns,
        "gui-design": design_patterns,
    }
    
    total_entries = 0
    for name, data in datasets.items():
        count = len(data)
        total_chars = sum(len(json.dumps(d)) for d in data)
        total_entries += count
        print(f"   {name}: {count} entries ({total_chars:,} chars)")
    
    print(f"\n{'=' * 50}")
    print(f"  Total: {total_entries} entries across {len(datasets)} datasets")
    print(f"  Location: {OUTPUT_DIR}")
    print(f"{'=' * 50}")

    # Save combined dataset
    combined_file = OUTPUT_DIR / "gui-combined.jsonl"
    with open(combined_file, 'w') as f:
        for name, data in datasets.items():
            for entry in data:
                f.write(json.dumps(entry) + '\n')
    print(f"\n   Combined: {OUTPUT_DIR / 'gui-combined.jsonl'}")

    # Write metadata
    metadata = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalExamples": total_entries,
        "projectsParsed": len(projects),
        "datasets": {name: len(data) for name, data in datasets.items()},
        "format": "instruction-input-output",
        "targetModel": "qwen2.5-7b-instruct-uncensored",
        "description": "GUI-focused training datasets for web application development fine-tuning",
    }
    meta_file = OUTPUT_DIR / "metadata.json"
    with open(meta_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"   Metadata: {meta_file}")

    return total_entries


if __name__ == "__main__":
    generate_all_datasets()
