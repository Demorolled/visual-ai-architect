# Micro-App Build References — 10 worked examples

Each row shows the SAME micro-app written plainly (Baseline), then improved to be **smaller, faster, and more universal** (Improved). The **Lesson** is the reusable design pattern the LLM should generalize — VACA's idle experimenter uses these as reference when it rewrites code in the catalog.

## 1. Password strength checker  ｜ nodeType: `logic` · language: `typescript`

**Baseline (plain, works):**
```ts
const readline = require('readline');
function checkStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score >= 4) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Enter password: ', (pw) => { console.log('Strength: ' + checkStrength(pw)); rl.close(); });
```

**Improved (smaller · faster · more universal):**
```ts
const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
const checks = [/.{8}/, /\d/, /[a-z]/, /[A-Z]/, /[^A-Za-z0-9]/];
const rate = pw => ['weak','medium','strong'][Math.min(2, Math.floor(checks.filter(c => c.test(pw)).length / 2))];
rl.question('Enter password: ', pw => { console.log('Strength: ' + rate(pw)); rl.close(); });
```

**Lesson / pattern:** Express the scoring rules as a data-driven array of regex tests and map the count to a label with one arithmetic expression. Fewer branches, trivial to extend, and the "checklist → category" shape generalizes to any validator.

---

## 2. Mini http server  ｜ nodeType: `api` · language: `javascript`

**Baseline (plain, works):**
```js
const http = require('http');
const server = http.createServer((req, res) => {
  let body = '<h1>Hello</h1>';
  if (req.url === '/about') body = '<h1>About</h1>';
  if (req.url === '/api') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(body);
});
server.listen(3000, () => console.log('listening on 3000'));
```

**Improved (smaller · faster · more universal):**
```js
const http = require('http');
const routes = {
  '/': '<h1>Home</h1>',
  '/about': '<h1>About</h1>',
  '/api': JSON.stringify({ ok: true }),
};
http.createServer((req, res) => {
  const api = req.url === '/api';
  res.writeHead(200, { 'Content-Type': api ? 'application/json' : 'text/html' });
  res.end(routes[req.url] ?? routes['/']);
}).listen(3000, () => console.log('listening on 3000'));
```

**Lesson / pattern:** Model routes as a lookup object (path → response) instead of an if/else chain. Adding a route is one line, the unmatched case shares one fallback, and object-dispatch is a universal pattern for any state machine or lookup table.

---

## 3. Simple media player  ｜ nodeType: `ui` · language: `html`

**Baseline (plain, works):**
```html
<!doctype html><title>Player</title>
<audio id="a" src="song.mp3"></audio>
<div>
  <button onclick="document.getElementById('a').play()">Play</button>
  <button onclick="document.getElementById('a').pause()">Pause</button>
</div>
```

**Improved (smaller · faster · more universal):**
```html
<!doctype html><title>Player</title>
<audio id="a" src="song.mp3" controls autoplay></audio>
```

**Lesson / pattern:** Use the native <audio controls> element instead of hand-wiring Play/Pause buttons — the browser provides play/pause/seek/volume for free, works across browsers, and removes all application logic.

---

## 4. Todo list cli  ｜ nodeType: `logic` · language: `typescript`

**Baseline (plain, works):**
```ts
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const todos = [];
const add = t => todos.push({ text: t, done: false });
const list = () => todos.forEach((t, i) => console.log((t.done ? '[x]' : '[ ]') + ' ' + i + ' ' + t.text));
const done = i => { if (todos[i]) todos[i].done = true; };
function prompt() {
  rl.question('> ', (line) => {
    const parts = line.trim().split(' ');
    const cmd = parts[0];
    const arg = parts.slice(1).join(' ');
    if (cmd === 'add') add(arg);
    else if (cmd === 'done') done(parseInt(arg));
    else if (cmd === 'list') list();
    list();
    prompt();
  });
}
prompt();
```

**Improved (smaller · faster · more universal):**
```ts
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let todos = [];
const cmds = {
  add: t => todos = [...todos, { text: t, done: false }],
  list: () => todos.forEach((t, i) => console.log(`${t.done ? '[x]' : '[ ]'} ${i} ${t.text}`)),
  done: n => { todos[n].done = true; },
};
const arg = a => isNaN(+a[0]) ? a.join(' ') : +a[0];
const repl = () => rl.question('> ', l => {
  const [c, ...rest] = l.trim().split(' ');
  (cmds[c] ?? (() => {}))(arg(rest));
  cmds.list();
  repl();
});
repl();
```

**Lesson / pattern:** Drive the whole REPL through a command table with one arg-coercion rule (number when numeric, string otherwise). A command map is a universal dispatcher — the same shape powers any CLI, event system, or menu.

---

## 5. Markdown to html converter  ｜ nodeType: `logic` · language: `typescript`

**Baseline (plain, works):**
```ts
const fs = require('fs');
const input = fs.readFileSync(process.argv[2] || 'input.md', 'utf8');
const html = input.split('\n').map(line => {
  if (line.startsWith('# ')) return '<h1>' + line.slice(2) + '</h1>';
  if (line.startsWith('## ')) return '<h2>' + line.slice(3) + '</h2>';
  if (line.startsWith('- ')) return '<li>' + line.slice(2) + '</li>';
  return line ? '<p>' + line + '</p>' : '';
}).join('\n');
console.log(html);
```

**Improved (smaller · faster · more universal):**
```ts
const fs = require('fs');
const rules = [[/^# (.*)$/, '<h1>$1</h1>'], [/^## (.*)$/, '<h2>$1</h2>'], [/^- (.*)$/, '<li>$1</li>']];
const convert = l => { for (const [re, out] of rules) if (re.test(l)) return l.replace(re, out); return l ? `<p>${l}</p>` : ''; };
console.log(fs.readFileSync(process.argv[2] || 'input.md', 'utf8').split('\n').map(convert).join('\n'));
```

**Lesson / pattern:** Encode the converter as an ordered table of (test, transform) rules — each rule is one line and the loop is shared. A rules table is a universal transform engine; adding a markdown element is a single table entry.

---

## 6. Temperature converter  ｜ nodeType: `ui` · language: `html`

**Baseline (plain, works):**
```html
<!doctype html><title>Temp</title>
<input id="c" placeholder="Celsius"><button onclick="conv()">To F</button>
<div id="out"></div>
<script>
function conv() {
  const c = document.getElementById('c').value;
  const f = parseFloat(c) * 9 / 5 + 32;
  document.getElementById('out').textContent = f;
}
</script>
```

**Improved (smaller · faster · more universal):**
```html
<!doctype html><title>Temp</title>
<input id="c"><span>°C → <output id="out"></output>°F</span>
<script>
const toF = c => c * 9 / 5 + 32;
c.oninput = () => out.textContent = isNaN(c.value) ? '' : toF(parseFloat(c.value)).toFixed(1);
</script>
```

**Lesson / pattern:** Recalculate from the input event rather than a button click, and isolate the math in one tiny pure function. The "map one magnitude through a pure transform" shape is universal — swap toF and the same UI does km/miles, any unit pair, or any linear mapping.

---

## 7. Simple stopwatch  ｜ nodeType: `ui` · language: `html`

**Baseline (plain, works):**
```html
<!doctype html><title>Timer</title>
<div id="d">0:00</div>
<button onclick="tog()">Start/Stop</button>
<script>
let ms = 0, id = null;
function tog() {
  if (id) { clearInterval(id); id = null; }
  else id = setInterval(() => { ms += 100; d.textContent = (ms / 1000).toFixed(1) + 's'; }, 100);
}
</script>
```

**Improved (smaller · faster · more universal):**
```html
<!doctype html><title>Timer</title>
<div id="d">0:00</div><button id="b">▶</button>
<script>
let on = false, acc = 0, t;
b.onclick = () => { on = !on; b.textContent = on ? '⏸' : '▶'; t = performance.now(); if (on) tick(); };
function tick() {
  d.textContent = ((acc + (on ? performance.now() - t : 0)) / 1000).toFixed(1) + 's';
  if (on) requestAnimationFrame(tick);
}
</script>
```

**Lesson / pattern:** Measure against an absolute clock (performance.now()) and diff, never accumulate a tick counter — that removes drift and timer throttling entirely. The absolute-now diff pattern also powers countdowns, FPS meters, and progress bars.

---

## 8. Character and word counter  ｜ nodeType: `logic` · language: `typescript`

**Baseline (plain, works):**
```ts
const fs = require('fs');
const text = fs.readFileSync(process.argv[2] || '', 'utf8');
const words = text.trim().split(/\s+/).filter(w => w.length > 0);
const letters = text.replace(/\s/g, '').length;
console.log('Words: ' + words.length);
console.log('Chars: ' + letters);
```

**Improved (smaller · faster · more universal):**
```ts
const t = require('fs').readFileSync(process.argv[2] || '', 'utf8').trim();
console.log('Words: ' + t.split(/\s+/).filter(Boolean).length + ' | Chars: ' + t.replace(/\s/g, '').length);
```

**Lesson / pattern:** Collapse to a single statement and use filter(Boolean) to drop empties. Small count helpers like "count non-whitespace tokens" are reusable across logs, diffs, and search indexing.

---

## 9. Notes app with add/list/delete  ｜ nodeType: `ui` · language: `html`

**Baseline (plain, works):**
```html
<!doctype html><title>Notes</title>
<input id="n"><button onclick="add()">Add</button>
<ul id="l"></ul>
<script>
const notes = [];
function add() {
  const t = document.getElementById('n').value;
  if (!t) return;
  notes.push(t);
  document.getElementById('n').value = '';
  render();
}
function render() {
  const ul = document.getElementById('l');
  ul.innerHTML = '';
  notes.forEach((n, i) => {
    const li = document.createElement('li');
    li.textContent = i + ': ' + n;
    ul.appendChild(li);
  });
}
</script>
```

**Improved (smaller · faster · more universal):**
```html
<!doctype html><title>Notes</title>
<input id="n"><button id="b">Add</button><ul id="l"></ul>
<script>
let notes = [];
const render = () => l.innerHTML = notes.map((t, i) => `<li>${i}: ${t}</li>`).join('');
b.onclick = () => { const v = n.value.trim(); if (v) { notes.push(v); n.value = ''; render(); } };
</script>
```

**Lesson / pattern:** Keep state in one plain array and re-render the whole list from it on every change — never hand-manipulate the DOM. Deriving the view from state is the universal pattern behind component frameworks and keeps single-file apps small and bug-free.

---

## 10. Quiz app with hardcoded questions  ｜ nodeType: `ui` · language: `html`

**Baseline (plain, works):**
```html
<!doctype html><title>Quiz</title>
<div id="q"></div><div id="r"></div>
<script>
const quiz = [
  { q: '2+2?', opts: ['3', '4', '5'], a: 1 },
  { q: 'Capital of France?', opts: ['Berlin', 'Paris', 'Rome'], a: 1 },
];
let i = 0, score = 0;
function render() {
  if (i >= quiz.length) { r.textContent = 'Score: ' + score + '/' + quiz.length; return; }
  const item = quiz[i];
  q.innerHTML = item.q + '<br>' + item.opts.map((o, k) => '<button onclick="ans(' + k + ')">' + o + '</button>').join('');
}
function ans(k) { if (k === quiz[i].a) score++; i++; render(); }
render();
</script>
```

**Improved (smaller · faster · more universal):**
```html
<!doctype html><title>Quiz</title>
<div id="q"></div>
<script>
const quiz = [{ q: '2+2?', o: ['3', '4', '5'], a: 1 }, { q: 'Capital of France?', o: ['Berlin', 'Paris', 'Rome'], a: 1 }];
let i = 0, s = 0;
const ask = () => q.innerHTML = quiz[i].q + quiz[i].o.map((o, k) => `<button onclick="ans(${k})">${o}</button>`).join('');
const ans = k => { if (k === quiz[i].a) s++; if (++i < quiz.length) ask(); else q.innerHTML = `Score ${s}/${quiz.length}`; };
ask();
</script>
```

**Lesson / pattern:** Run the quiz as a tiny state machine: one advance step mutates the shared index/score and re-renders, branching on the terminal condition. That shape is reusable for slideshows, carousels, and wizards.

---
