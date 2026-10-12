/**
 * reset-pwa-cache.mjs — drop the PWA service worker and its caches in the
 * running app window, then reload.
 *
 * Why this is needed: the frontend ships a service worker that precaches the
 * built bundle. Replacing frontend/dist on disk is not enough — the window
 * keeps serving the precached (stale) assets, so a freshly deployed build
 * appears to have had no effect. That failure looks exactly like "my code
 * change didn't work", which is why it is worth a script rather than a note.
 *
 * Usage: node docs/narration/reset-pwa-cache.mjs
 *        (app must be running with --remote-debugging-port=9222)
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3001';

const targets = await (await fetch(`${CDP_HTTP}/json`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith(APP_URL));
if (!page) {
  console.error(`no page target for ${APP_URL}`);
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
});

await new Promise((r) => ws.addEventListener('open', r));

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate threw');
  return r.result.value;
};

const before = await evaluate(
  `[...document.querySelectorAll('script[src]')].map(s => s.src).find(s => /assets\\/main-/.test(s)) || null`
);
console.log('bundle before:', before && before.split('/').pop());

const report = await evaluate(`(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const names = await caches.keys();
  await Promise.all(names.map((n) => caches.delete(n)));
  return { unregistered: regs.length, cachesCleared: names };
})()`);
console.log('unregistered service workers:', report.unregistered);
console.log('cleared caches:', report.cachesCleared.join(', ') || '(none)');

await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
console.log('reloaded with cache ignored');

ws.close();
