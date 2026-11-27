// يختبر كود APP_LIFECYCLE (المستخرج من family.html) في كروم حقيقي (headless) على سيرفر محلي بيحاكي GitHub Pages
// (Cache-Control: max-age=600 + ETag). التشغيل: node tests/lifecycle/lifecycle.test.js
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const fam = fs.readFileSync(path.join(__dirname, "../../family.html"), "utf8");
const snip = fam.slice(fam.indexOf("<!-- APP_LIFECYCLE_START"), fam.indexOf("<!-- APP_LIFECYCLE_END -->"));
let version = 1, hits = 0;
const srv = http.createServer((req, res) => {
  if (!req.url.startsWith("/page.html")) { res.writeHead(404); return res.end(); }
  hits++;
  const etag = '"v' + version + '"';
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, { ETag: etag, "Cache-Control": "max-age=600" }); return res.end(); }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ETag: etag, "Cache-Control": "max-age=600" });
  res.end('<!doctype html><meta charset="utf-8"><meta name="theme-color" content="#050A14">' + snip +
    '<script>window.fakeDb={terminated:false,waitForPendingWrites(){return Promise.resolve()},terminate(){this.terminated=true;return Promise.resolve()}};window.__appDb=window.fakeDb;<\/script><body><h1 id="v">version ' + version + "</h1></body>");
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) failed++; };
(async () => {
  await new Promise((r) => srv.listen(8791, r));
  const ch = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9444", "--user-data-dir=/tmp/lc-prof", "about:blank"], { stdio: "ignore" });
  await sleep(2500);
  const list = await (await fetch("http://127.0.0.1:9444/json")).json();
  const ws = new WebSocket(list.find((x) => x.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) pend[m.id](m.result); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;
  await send("Page.enable");
  const nav = async (u) => { await send("Page.navigate", { url: u }); await sleep(1800); };
  const U = "http://127.0.0.1:8791/page.html";

  await nav(U);
  ok((await ev("document.getElementById('v').textContent")) === "version 1", "first open shows version 1");
  ok((await ev("!document.getElementById('verGate')")), "gate removed after check when nothing new");

  version = 2; // نشر نسخة جديدة. الكاش لسه ماسك v1 لمدة 10 دقايق
  await nav(U);
  await sleep(1500);
  ok((await ev("document.getElementById('v').textContent")) === "version 2", "open with a newer version on the server auto-reloads to version 2 (cache max-age 600 ignored)");
  ok((await ev("!document.getElementById('verGate')")), "gate removed after the reload");

  const before = hits; await nav(U); await sleep(800);
  ok(hits - before <= 4, "no reload loop when already up to date (requests: " + (hits - before) + ")");

  // الاتصالات بتتقفل بعد ما التطبيق يتساب مدة، ولما يرجع يتحمّل من جديد
  await ev("window.__lifecycleHideMs=0;true");
  await nav(U);
  await ev("window.__marker='old-page';Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));true");
  await sleep(300);
  ok((await ev("window.fakeDb.terminated")) === false, "not released before the hide delay (default 60s)");
  await ev("window.__lifecycle.release();true"); await sleep(300);
  ok((await ev("window.fakeDb.terminated")) === true, "release() waits for pending writes then terminates Firestore");
  await ev("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));true");
  await sleep(2500);
  ok((await ev("window.__marker")) === undefined, "coming back after release reloads the page from scratch");

  ws.close(); ch.kill(); srv.close();
  console.log(failed ? failed + " FAILED" : "ALL PASSED"); process.exit(failed ? 1 : 0);
})();
