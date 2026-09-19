#!/usr/bin/env node
/**
 * Browser-level test of the built page against the labelled corpus, in Chromium
 * and in WebKit (the Safari engine). This is the part of the test suite that
 * Node cannot run: real image decoding (JPEG, WebP, BMP, EXIF, ICC-tagged PNGs),
 * the Web Worker, the phone layout, the download buttons and the clipboard.
 *
 * Run from web/ after `npm run build`:
 *   npm run test:browser                 # both engines, everything
 *   BROWSERS=webkit npm run test:browser # one engine
 *   ONLY=corpus,files,huge,downloads,phone,bands npm run test:browser
 *   OUT=/path/report.json                # also write every row as JSON
 *
 * It serves dist/ plus ../tests/fixtures on a local port itself. Browsers come
 * from Playwright's cache (`npx playwright install chromium webkit` once).
 * Exit code 1 on any failed assertion; the summary lines start with "PASS"/"FAIL".
 */
const { chromium, webkit, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { PNG } = require("pngjs");

const WEB = path.resolve(__dirname, "..");
const DIST = path.join(WEB, "dist");
const FIX = path.resolve(WEB, "..", "tests", "fixtures");
const RESULTS = path.resolve(WEB, "..", "Results");
const gt = JSON.parse(fs.readFileSync(path.join(FIX, "ground_truth.json"), "utf8"));
const BROWSERS = (process.env.BROWSERS || "chromium,webkit").split(",");
const ONLY = new Set((process.env.ONLY || "corpus,files,huge,downloads,phone,bands").split(","));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };

const failures = [];
const rows = [];
function check(ok, label) {
  if (!ok) failures.push(label);
  return ok;
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      let file = url.startsWith("/fixtures/") ? path.join(FIX, url.slice("/fixtures/".length)) : path.join(DIST, url === "/" ? "index.html" : url);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

const DONE = /^Done|could not be read|too large|megapixels|^Could not|^OpenCV failed/;
async function waitReady(page) {
  await page.waitForFunction(() => /^Ready/.test(document.getElementById("status").textContent), null, { timeout: 120000 });
}
async function waitDone(page, timeout = 60000) {
  await page.waitForFunction((re) => new RegExp(re).test(document.getElementById("status").textContent), DONE.source, { timeout });
}
function readout(page) {
  return page.evaluate(() => {
    const g = (id) => (document.getElementById(id) || { textContent: "" }).textContent.trim();
    const results = document.getElementById("results");
    const ic = document.getElementById("input-canvas");
    const oc = document.getElementById("overlay-canvas");
    const warn = document.getElementById("warnings");
    return {
      status: g("status"), percent: g("percent"), threshold: g("threshold"), pixels: g("pixels"), dims: g("dims"),
      resultsHidden: results.hidden, stale: results.classList.contains("stale"),
      inputCanvas: [ic.width, ic.height], overlayCanvas: [oc.width, oc.height],
      warnings: warn && !warn.hidden ? warn.textContent.trim() : "",
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  });
}
async function upload(page, rel) {
  await page.evaluate(() => { window.__gaps = []; window.__last = performance.now(); window.__tick = setInterval(() => { const n = performance.now(); window.__gaps.push(n - window.__last); window.__last = n; }, 16); });
  const t0 = Date.now();
  await page.locator("#file-input").setInputFiles(path.join(FIX, rel));
  await waitDone(page, 120000);
  const wall = Date.now() - t0;
  const maxGap = await page.evaluate(() => { clearInterval(window.__tick); return Math.round(Math.max(0, ...window.__gaps)); });
  return { wall, maxGap };
}

async function corpus(page, engine) {
  let n = 0, maxDiff = 0, thr = 0, px = 0;
  const skip = new Set(["edge/huge-12mp-4000x3000.png", "edge/huge-12mp-4000x3000.jpg", "edge/generated-large/huge-24mp-6000x4000.jpg"]);
  for (const [rel, ref] of Object.entries(gt.images)) {
    if (skip.has(rel) || !fs.existsSync(path.join(FIX, rel))) continue;
    const { wall } = await upload(page, rel);
    const r = await readout(page);
    const done = r.status.startsWith("Done");
    const got = done ? Number(r.percent) : null;
    const diff = got === null ? null : +(got - ref.percent).toFixed(4);
    const lossless = !/\.jpe?g$/i.test(rel);
    const thrOk = String(ref.threshold) === r.threshold;
    const pxOk = r.pixels === `${ref.green_pixels.toLocaleString("en-US")} / ${ref.total_pixels.toLocaleString("en-US")}`;
    const row = { engine, kind: "corpus", file: rel, got, ref: +ref.percent.toFixed(4), diff, threshold: r.threshold, refThreshold: ref.threshold, pixels: r.pixels, dims: r.dims, wallMs: wall, warnings: r.warnings, status: r.status.slice(0, 120) };
    rows.push(row);
    n++;
    if (done) maxDiff = Math.max(maxDiff, Math.abs(diff));
    check(done, `${engine} ${rel}: not analysed: ${r.status}`);
    // Bar (spec S3): every image within 1 point; lossless formats exact to 2 decimals with identical threshold and pixel counts.
    check(done && Math.abs(diff) <= 1, `${engine} ${rel}: ${got} vs ${ref.percent} (diff ${diff})`);
    if (lossless) {
      if (!thrOk) thr++;
      if (!pxOk) px++;
      check(done && Math.abs(diff) <= 0.005 && thrOk && pxOk, `${engine} ${rel}: lossless mismatch got ${got} thr ${r.threshold} px ${r.pixels}, want ${ref.percent.toFixed(4)} thr ${ref.threshold} px ${ref.green_pixels}/${ref.total_pixels}`);
    }
    // Inputs that must carry a visible warning: the synthetic edge cases, the green-only camera JPEG, the 4x4 image whose
    // nucleus mask covers everything, and the three DMSO cells that Python also scores 0.0 % (Results/quantification_results.csv).
    const degenerate = /grayscale|all-black|all-green|one-pixel|all-blue|green_channel_camera|tiny-4x4|P1_W2_C[123]/.test(rel);
    check(degenerate === (r.warnings.length > 0), `${engine} ${rel}: warning ${degenerate ? "missing" : "unexpected"}: "${r.warnings.slice(0, 80)}"`);
    console.log(`${engine} corpus ${rel} ${got === null ? "-" : got.toFixed(2)} (py ${ref.percent.toFixed(2)}) diff ${diff} thr ${r.threshold}/${ref.threshold} ${wall} ms${r.warnings ? " WARN" : ""}`);
  }
  console.log(`${engine} corpus summary: ${n} images, max |diff| ${maxDiff.toFixed(4)}, lossless threshold mismatches ${thr}, pixel mismatches ${px}`);
}

async function wrongFiles(page, engine) {
  // First produce a real result so a stale one would be visible.
  await page.click('button[data-sample="P1_W3_C1"]');
  await waitDone(page);
  for (const rel of Object.keys(gt.non_images)) {
    await upload(page, rel);
    const r = await readout(page);
    const name = path.basename(rel);
    const tiffDecoded = rel.endsWith(".tiff") && r.status.startsWith("Done");
    const row = { engine, kind: "file", file: rel, status: r.status, resultsHidden: r.resultsHidden, stale: r.stale };
    rows.push(row);
    console.log(`${engine} file ${rel}: hidden=${r.resultsHidden} "${r.status.slice(0, 140)}"`);
    if (tiffDecoded) continue; // Safari can decode TIFF; that is allowed (spec "Known limitations")
    // Bar (spec S6): names the file, says it could not be read as an image, lists formats + TIFF/HEIC note, hides the old result.
    check(r.status.includes(name), `${engine} ${rel}: file name missing from "${r.status}"`);
    check(/could not be read as an image/.test(r.status), `${engine} ${rel}: no 'could not be read as an image'`);
    check(/PNG, JPEG, WebP, BMP and GIF/.test(r.status) && /TIFF/.test(r.status), `${engine} ${rel}: format list missing`);
    check(r.resultsHidden || r.stale, `${engine} ${rel}: previous result still on screen`);
  }
  await page.click('button[data-sample="P1_W1_C1"]');
  await waitDone(page);
  const r = await readout(page);
  check(r.percent === "24.83" && !r.resultsHidden, `${engine}: sample after a bad file gave ${r.percent}`);
  const accept = await page.getAttribute("#file-input", "accept");
  check(/image\/png/.test(accept) && !/image\/\*/.test(accept), `${engine}: file input accept is "${accept}"`);
}

async function huge(page, engine) {
  const files = ["edge/huge-12mp-4000x3000.jpg", "edge/huge-12mp-4000x3000.png", "edge/generated-large/huge-24mp-6000x4000.jpg"];
  for (const rel of files) {
    if (!fs.existsSync(path.join(FIX, rel))) { console.log(`${engine} huge ${rel}: missing (regenerate with make_fixtures.py)`); continue; }
    const ref = gt.images[rel];
    const { wall, maxGap } = await upload(page, rel);
    const r = await readout(page);
    const got = Number(r.percent);
    const row = { engine, kind: "huge", file: rel, got, ref: ref.percent, wallMs: wall, maxMainThreadGapMs: maxGap, heapMB: r.heapMB, inputCanvas: r.inputCanvas, overlayCanvas: r.overlayCanvas, status: r.status.slice(0, 120) };
    rows.push(row);
    console.log(`${engine} huge ${rel}: ${got} (py ${ref.percent.toFixed(4)}) wall ${wall} ms, max main-thread gap ${maxGap} ms, heap ${r.heapMB} MB, canvases ${r.inputCanvas.join("x")} / ${r.overlayCanvas.join("x")}`);
    // Bar (spec S5): correct number within 15 s, main thread never blocked > 1 s, display canvases <= 2 MP, heap < 300 MB.
    check(r.status.startsWith("Done") && Math.abs(got - ref.percent) <= 1, `${engine} ${rel}: ${r.status.slice(0, 80)} / ${got}`);
    check(wall <= 15000, `${engine} ${rel}: took ${wall} ms`);
    check(maxGap < 1000, `${engine} ${rel}: main thread blocked ${maxGap} ms`);
    check(r.inputCanvas[0] * r.inputCanvas[1] <= 2_000_000 && r.overlayCanvas[0] * r.overlayCanvas[1] <= 2_000_000, `${engine} ${rel}: display canvases ${r.inputCanvas.join("x")}`);
    if (r.heapMB !== null) check(r.heapMB < 300, `${engine} ${rel}: heap ${r.heapMB} MB`);
  }
  if (engine === "chromium") {
    // Information only: the worker's wasm heap after the 24 MP run (OpenCV's Mats live there, not in the page's JS heap).
    const w = page.workers()[0];
    if (w) {
      const wasmMB = await w.evaluate(() => (self.cv && self.cv.HEAPU8 ? Math.round(self.cv.HEAPU8.length / 1048576) : null)).catch(() => null);
      rows.push({ engine, kind: "worker-memory", wasmHeapMB: wasmMB });
      console.log(`${engine} worker wasm heap after the huge files: ${wasmMB} MB`);
    }
  }
  // A stated megapixel limit (spec S5 alternative) must be shown for an oversized header without decoding it.
  const limit = await page.evaluate(() => (document.getElementById("mp-limit") || {}).textContent || "");
  check(/megapixel/i.test(limit), `${engine}: no stated megapixel limit on the page (#mp-limit)`);
}

/** The banded pixel read (used for big pictures) must give the same numbers on small files, including an EXIF-rotated JPEG. */
async function bands(browser, engine, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "?bandRows=37");
  await waitReady(page);
  for (const rel of ["cells/P1_W1_C1.PNG", "edge/exif-rotated-orientation6.jpg", "fullfield/Plate1_W1_untreated.png"]) {
    const ref = gt.images[rel];
    await upload(page, rel);
    const r = await readout(page);
    const got = Number(r.percent);
    rows.push({ engine, kind: "bands", file: rel, got, ref: ref.percent, threshold: r.threshold, dims: r.dims });
    console.log(`${engine} bands ${rel}: ${got} (py ${ref.percent.toFixed(4)}) thr ${r.threshold}/${ref.threshold} ${r.dims}`);
    check(r.status.startsWith("Done") && Math.abs(got - ref.percent) <= (rel.endsWith(".jpg") ? 1 : 0.005) && r.dims === `${ref.width} × ${ref.height} px`, `${engine} bands ${rel}: ${got} ${r.dims} (${r.status.slice(0, 60)})`);
    if (!rel.endsWith(".jpg")) check(String(ref.threshold) === r.threshold, `${engine} bands ${rel}: threshold ${r.threshold} != ${ref.threshold}`);
  }
  await ctx.close();
}

async function downloads(page, engine, ctx) {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mt-dl-"));
  for (const name of ["P1_W1_C1", "P3_W2_C3", "P1_W3_C1"]) {
    await page.click(`button[data-sample="${name}"]`);
    await waitDone(page);
    for (const kind of ["overlay", "mask"]) {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click(`#download-${kind}`)]);
      const file = path.join(dir, dl.suggestedFilename());
      await dl.saveAs(file);
      const got = PNG.sync.read(fs.readFileSync(file));
      const ref = PNG.sync.read(fs.readFileSync(path.join(RESULTS, `${name}_${kind}.png`)));
      let diff = 0;
      for (let i = 0; i < ref.data.length; i += 4) if (got.data[i] !== ref.data[i] || got.data[i + 1] !== ref.data[i + 1] || got.data[i + 2] !== ref.data[i + 2]) diff++;
      const sizeOk = got.width === ref.width && got.height === ref.height;
      rows.push({ engine, kind: "download", file: `${name}_${kind}.png`, suggested: dl.suggestedFilename(), diffPx: sizeOk ? diff : -1 });
      console.log(`${engine} download ${dl.suggestedFilename()}: ${got.width}x${got.height}, ${sizeOk ? diff : "size mismatch"} px differ from Results/`);
      check(dl.suggestedFilename() === `${name}_${kind}.png`, `${engine}: download named ${dl.suggestedFilename()}`);
      check(sizeOk && diff === 0, `${engine} ${name}_${kind}: ${sizeOk ? diff : "size"} px differ from Python`);
    }
    if (engine === "chromium") {
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.click("#copy-result");
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      const ref = gt.images[`cells/${name}.PNG`];
      const want = `${name}: ${ref.percent.toFixed(2)}% (threshold ${ref.threshold}, ${ref.green_pixels}/${ref.total_pixels} px)`;
      rows.push({ engine, kind: "copy", file: name, text });
      console.log(`${engine} copy ${name}: "${text}"`);
      check(text === want, `${engine} copy ${name}: "${text}" != "${want}"`);
    }
  }
}

async function phone(browser, engine, base) {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 664 : 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent });
    const page = await ctx.newPage();
    await page.goto(base);
    await waitReady(page);
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    check(overflow.scrollWidth <= overflow.clientWidth, `${engine} ${width}px: horizontal overflow ${overflow.scrollWidth} > ${overflow.clientWidth}`);
    const buttons = await page.evaluate(() => [...document.querySelectorAll(".button, button")].filter((b) => b.offsetParent !== null).map((b) => Math.round(b.getBoundingClientRect().height)));
    check(buttons.every((h) => h >= 44), `${engine} ${width}px: button heights ${buttons.join(",")}`);
    for (const sample of ["P1_W1_C1", "P3_W2_C3"]) {
      await page.click(`button[data-sample="${sample}"]`);
      await waitDone(page);
      await page.waitForTimeout(1200); // smooth scroll settles
      const v = await page.evaluate(() => {
        const r = document.getElementById("percent").getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), innerH: window.innerHeight, scrollY: Math.round(window.scrollY), resultsTop: Math.round(document.getElementById("results").getBoundingClientRect().top) };
      });
      const visible = v.top >= 0 && v.bottom <= v.innerH;
      rows.push({ engine, kind: "phone", width, sample, ...v, visible });
      console.log(`${engine} phone ${width}px ${sample}: percent y=${v.top}-${v.bottom} of ${v.innerH}, scrollY ${v.scrollY}, results top ${v.resultsTop}, visible=${visible}`);
      // Bar (spec S2/S8, report D6): the number is visible and the result card was scrolled into view.
      check(visible, `${engine} ${width}px ${sample}: percent not visible (y ${v.top}-${v.bottom} of ${v.innerH})`);
      check(v.resultsTop <= 40, `${engine} ${width}px ${sample}: results top ${v.resultsTop} (not scrolled into view)`);
    }
    if (width === 390 && process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `${engine}-phone-390-after-sample.png`) });
    await ctx.close();
  }
}

(async () => {
  const { server, base } = await serve();
  for (const engine of BROWSERS) {
    const browserType = engine === "webkit" ? webkit : chromium;
    const browser = await browserType.launch({ headless: true, args: engine === "chromium" ? ["--enable-precise-memory-info"] : [] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(base);
    await waitReady(page);
    if (ONLY.has("corpus")) await corpus(page, engine);
    if (ONLY.has("files")) await wrongFiles(page, engine);
    if (ONLY.has("huge")) await huge(page, engine);
    if (ONLY.has("downloads")) await downloads(page, engine, ctx);
    await ctx.close();
    if (ONLY.has("phone")) await phone(browser, engine, base);
    if (ONLY.has("bands")) await bands(browser, engine, base);
    check(pageErrors.length === 0, `${engine}: page errors ${pageErrors.join(" | ")}`);
    await browser.close();
  }
  server.close();
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ rows, failures }, null, 2));
  if (failures.length) {
    console.log(`FAIL: ${failures.length} assertion(s)`);
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log(`PASS: browser checks in ${BROWSERS.join(" + ")}`);
})().catch((e) => { console.error(e); process.exit(2); });
