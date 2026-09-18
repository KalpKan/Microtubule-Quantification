/**
 * Browser corpus run: exercises the real page code path (file input -> createImageBitmap
 * -> canvas -> OpenCV.js) on the fixture corpus, including the formats Node cannot decode
 * (JPEG, WebP, BMP, EXIF-rotated JPEG) and the non-image files.
 *
 * How to use (from the repo root):
 *   1. cd web && npm run build
 *   2. mkdir -p /tmp/mt-site && cp -R web/dist/. /tmp/mt-site && cp -R tests/fixtures /tmp/mt-site/fixtures
 *   3. (cd /tmp/mt-site && python3 -m http.server 8792)
 *   4. open http://localhost:8792/ in Chrome, wait for "Ready", paste this file into the console, then run e.g.
 *        await runCorpus(["cells/P3_W4_C3.PNG", "edge/cell-q95.jpg", "edge/not-an-image.txt"])
 *      or  await runCorpus(await corpusList())   // every entry in ground_truth.json
 *   Each row: file | browser % | python % | diff | threshold | size | analysis ms | status line.
 *   Expected: |diff| <= 1 for every image; a clear, specific refusal for every non-image.
 * The page must be served from the same origin as /fixtures/ (a https page cannot fetch localhost).
 */
window.corpusList = async function () {
  const gt = await (await fetch("/fixtures/ground_truth.json")).json();
  return [...Object.keys(gt.images), ...Object.keys(gt.non_images)];
};

window.runCorpus = async function (files) {
  const gt = await (await fetch("/fixtures/ground_truth.json")).json();
  const input = document.getElementById("file-input");
  const status = document.getElementById("status");
  const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff", txt: "text/plain", pdf: "application/pdf" };
  const rows = [];
  for (const f of files) {
    const blob = await (await fetch("/fixtures/" + f)).blob();
    const name = f.split("/").pop();
    const file = new File([blob], name, { type: types[name.split(".").pop().toLowerCase()] || "" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    let st = "";
    for (let i = 0; i < 2400; i++) {
      await new Promise((r) => setTimeout(r, 25));
      st = status.textContent;
      if (/^Done|^Could not|^OpenCV failed|^Refused|^That file/.test(st)) break;
    }
    const ref = gt.images[f];
    const got = st.startsWith("Done") ? Number(document.getElementById("percent").textContent) : null;
    const diff = ref && got !== null ? (got - ref.percent).toFixed(3) : "-";
    rows.push([f, got ?? "-", ref ? ref.percent.toFixed(4) : "(non-image)", diff, document.getElementById("threshold").textContent, document.getElementById("dims").textContent, document.getElementById("elapsed").textContent, st.slice(0, 100)].join(" | "));
  }
  console.log(rows.join("\n"));
  return rows;
};
