/**
 * verify-hover-cdp.mjs — prove the hover narration works in the running app.
 *
 * This drives the real Electron window over the Chrome DevTools Protocol: it
 * dispatches genuine mouseover events on buttons found in the live DOM, watches
 * the network for the resulting /api/tts call, and reads the module's own
 * counters. A unit test can show the matching logic is right; only this shows
 * that hovering a button in the app actually reaches the voice service.
 *
 * Usage:
 *   # app must be running with --remote-debugging-port=9222
 *   node docs/narration/verify-hover-cdp.mjs
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  const targets = await (await fetch(`${CDP_HTTP}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith(APP_URL));
  if (!page) {
    throw new Error(
      `no page target for ${APP_URL}. targets: ${targets.map((t) => `${t.type} ${t.url}`).join(', ')}`
    );
  }
  return page;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    const listeners = [];
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const id = ++nextId;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        on(fn) {
          listeners.push(fn);
        },
        close: () => ws.close(),
      })
    );
    ws.addEventListener('error', reject);
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) {
        listeners.forEach((fn) => fn(msg));
      }
    });
  });
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const page = await findPage();
  console.log(`target: ${page.title} <${page.url}>\n`);
  const cdp = await connect(page.webSocketDebuggerUrl);

  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  // Capture every /api/tts exchange the page makes, keyed by requestId.
  // Keying by "the most recent request" instead looks correct until two
  // narrations overlap, at which point responses get attributed to the wrong
  // request and the run reports false failures. Responses genuinely interleave
  // here because each hover starts its own audio fetch.
  const ttsRequests = [];
  const ttsById = new Map();
  const isTts = (url) => url.includes('/api/tts');
  cdp.on((msg) => {
    if (msg.method === 'Network.requestWillBeSent' && isTts(msg.params.request.url)) {
      const entry = {
        id: msg.params.requestId,
        url: msg.params.request.url,
        method: msg.params.request.method,
        status: null,
        mimeType: null,
        bytes: 0,
      };
      ttsRequests.push(entry);
      ttsById.set(entry.id, entry);
    }
    if (msg.method === 'Network.responseReceived' && isTts(msg.params.response.url)) {
      const entry = ttsById.get(msg.params.requestId);
      if (entry) {
        entry.status = msg.params.response.status;
        entry.mimeType = msg.params.response.mimeType;
      }
    }
    if (msg.method === 'Network.loadingFinished') {
      const entry = ttsById.get(msg.params.requestId);
      if (entry) entry.bytes = msg.params.encodedDataLength;
    }
  });

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate threw');
    return r.result.value;
  };

  // ── 1. Is the narration-enabled bundle the one actually loaded? ──────────
  const bundle = await evaluate(
    `[...document.querySelectorAll('script[src]')].map(s => s.src).find(s => /assets\\/main-/.test(s)) || null`
  );
  record('page loaded a main bundle', !!bundle, bundle ? bundle.split('/').pop() : 'none found');

  const installed = await evaluate(`typeof window.__vacaNarration`);
  record('narration module installed', installed === 'object', `window.__vacaNarration is ${installed}`);

  if (installed !== 'object') {
    console.log('\nnarration is not present in the loaded bundle — nothing further to test.');
    cdp.close();
    process.exitCode = 1;
    return;
  }

  const enabled = await evaluate(`window.__vacaNarration.enabled()`);
  record('narration enabled', enabled === true, `enabled=${enabled}`);

  const entries = await evaluate(`window.__vacaNarration.entries().length`);
  record('narration map loaded', entries > 30, `${entries} entries`);

  // ── 2. Hover real controls and watch the voice service ──────────────────
  const hover = async (matcher, label) => {
    const probe = await evaluate(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => ${matcher});
      if (!b) return { found: false, seen: btns.map(x => (x.innerText||'').trim()).filter(Boolean).slice(0, 25) };
      b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
      return {
        found: true,
        text: (b.innerText || '').trim(),
        cls: b.className,
        resolved: window.__vacaNarration.resolve(b),
      };
    })()`);

    if (!probe.found) {
      record(`hover ${label}`, false, `button not in DOM. present: ${(probe.seen || []).join(' | ')}`);
      return null;
    }

    await sleep(1800); // DWELL_MS is 450ms, then the TTS round trip
    const stats = await evaluate(`window.__vacaNarration.stats()`);
    record(
      `hover ${label}`,
      probe.resolved === label,
      `"${probe.text}" [${probe.cls}] → ${probe.resolved}; spoken total=${stats.spoken}`
    );
    return probe.resolved;
  };

  await hover(`/Generate Code/.test(x.innerText)`, 'toolbar.generate');
  await hover(`(x.innerText||'').trim() === '🗑 Clear'`, 'toolbar.clear');
  await hover(`/Export/.test(x.innerText) && /toolbar-btn/.test(x.className)`, 'toolbar.export');
  await hover(`/Build from Description/.test(x.innerText)`, 'toolbar.blueprint');
  await hover(`/History/.test(x.innerText)`, 'header.history');

  // ── 3. Resting on one control must narrate once, not once per event ────
  // The browser fires mouseover again every time the pointer crosses a child
  // element inside the button. Without the spoken-once bookkeeping, a single
  // hover would trigger the whole narration repeatedly and queue several
  // minutes of audio.
  const repeatTarget = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Build from Description/.test(x.innerText));
    if (!b) return null;
    for (let i = 0; i < 5; i++) b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    return (b.innerText || '').trim();
  })()`);
  const beforeRepeat = await evaluate(`window.__vacaNarration.stats().spoken`);
  await sleep(1800);
  const afterRepeat = await evaluate(`window.__vacaNarration.stats().spoken`);
  record(
    'five mouseovers on one control narrate once',
    repeatTarget !== null && afterRepeat - beforeRepeat <= 1,
    repeatTarget ? `"${repeatTarget}" → spoken ${beforeRepeat} → ${afterRepeat}` : '(target not found)'
  );

  // ── 4. A control with no entry stays silent ────────────────────────────
  const beforeSilent = await evaluate(`window.__vacaNarration.stats().spoken`);
  const unmapped = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => !window.__vacaNarration.resolve(x) && (x.innerText||'').trim());
    if (!b) return null;
    b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    return (b.innerText || '').trim();
  })()`);
  await sleep(1200);
  const afterSilent = await evaluate(`window.__vacaNarration.stats().spoken`);
  if (unmapped === null) {
    console.log('SKIP  unmapped control stays silent — every visible button currently has an entry');
  } else {
    record(
      'unmapped control stays silent',
      afterSilent === beforeSilent,
      `hovered "${unmapped}", spoken ${beforeSilent} → ${afterSilent}`
    );
  }

  // ── 5. Did the voice service actually get called, with audio back? ─────
  await sleep(1500);
  record(
    'voice service called on every spoken hover',
    ttsRequests.length >= 5,
    `${ttsRequests.length} request(s) to /api/tts`
  );
  const bad = ttsRequests.filter((r) => r.status !== 200 || !/audio/.test(r.mimeType || ''));
  record(
    'every TTS call returned audio',
    bad.length === 0,
    bad.length
      ? bad.map((r) => `${r.status} ${r.mimeType}`).join(', ')
      : `all ${ttsRequests.length} returned audio/mpeg`
  );
  for (const r of ttsRequests) {
    console.log(
      `      ${r.method} /api/tts → ${r.status} ${r.mimeType || ''} ${r.bytes ? `(${Math.round(r.bytes / 1024)}KB)` : ''}`
    );
  }

  cdp.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('verification failed to run:', err.message);
  process.exitCode = 2;
});
