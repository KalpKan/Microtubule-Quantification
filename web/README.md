# Microtubule Quantifier, browser edition

Live: **https://microtubules.kalpkan.com**

This folder is a small web page that runs the same microtubule measurement as the Python script in the folder above, but inside your browser. You pick a fluorescent cell image (or tap a sample), and it shows the image, a green overlay of the detected microtubules with the nucleus cut out, and the percentage of the image that is microtubule. The picture is processed on your device and is never uploaded anywhere. After the page has loaded once it needs no internet connection at all.

**What the number is:** the share of *all* pixels in the picture counted as microtubule after the nucleus is removed. Background is in the denominator, so a tighter crop around the cell gives a higher number; compare images within one experiment (same microscope, same exposure). The page says so next to the result, shows the group's reference values (untreated 27.9 ± 4.6 %, nocodazole 45 µM 17.2 ± 2.6 %, taxol 30.7 ± 9.5 %) and explains the Otsu threshold and pixel counts. When the input is not a two-colour fluorescence image (grayscale, single channel, flat, or the nucleus mask covers more than 90 % of it) an amber warning says the result is not a measurement.

**What it reads:** PNG, JPEG, WebP, BMP and GIF up to 30 megapixels, on the page's own terms: embedded colour profiles (PNG `iCCP`/`gAMA`/`cHRM`/`sRGB`, JPEG ICC) are stripped before decoding so every browser reads the stored pixel values exactly as `cv2.imread` does (Safari would otherwise apply a Mac PNG's profile and shift the number). TIFF and HEIC are refused with a message that names the file and says to convert to PNG first (the Python script does read TIFF). Any other file gets the same clear refusal and the previous result is cleared, never left on screen. A 24 MP phone photo takes about 1.5 s on a laptop; decoding and the analysis run in a Web Worker so the page never freezes, the two pictures on screen are capped at 2 MP each, and the analysis itself always runs at full resolution.

**Keeping the result:** "Download overlay" and "Download mask" save PNGs named like the Python `Results/` files (`<name>_overlay.png`, `<name>_mask.png`) and are pixel-identical to them; "Copy result" puts `<name>: <percent>% (threshold N, X/Y px)` on the clipboard.

## Accuracy

The browser version was checked against the Python pipeline (`../microtubule_quantification.py`, run with `opencv-python-headless` 5.0.0 in a `python3 -m venv`) on the three sample cells shipped in `public/samples/`. The requirement was "within 1 percentage point"; the result is identical to four decimal places, with the same Otsu threshold and the same pixel counts.

| Sample cell | Condition | Size | Python `green_percentage` | Browser (OpenCV.js) | Difference |
|---|---|---|---|---|---|
| `P1_W1_C1` | untreated | 77 × 58 px | 24.8321 % | 24.8321 % | 0.0000 |
| `P3_W2_C3` | nocodazole 25 µM | 92 × 77 px | 34.7120 % | 34.7120 % | 0.0000 |
| `P1_W3_C1` | taxol control | 68 × 47 px | 21.1827 % | 21.1827 % | 0.0000 |

How the numbers were produced (all from the repository root):

```
$ .venv/bin/python web/scripts/reference.py
P1_W1_C1: 24.8321% (threshold 36, 1109/4466 px, 77x58) - matches Results CSV
P1_W3_C1: 21.1827% (threshold 62, 677/3196 px, 68x47) - matches Results CSV
P3_W2_C3: 34.7120% (threshold 29, 2459/7084 px, 92x77) - matches Results CSV
wrote web/tests/expected.json

$ cd web && npx vitest run --reporter=verbose
Python vs JS on the sample cells:
P1_W1_C1	python 24.8321%	js 24.8321%	diff 0.0000
P1_W3_C1	python 21.1827%	js 21.1827%	diff 0.0000
P3_W2_C3	python 34.7120%	js 34.7120%	diff 0.0000
 ✓ tests/pipeline.test.ts (4 tests)
```

The Python numbers also equal the values published in `../Results/quantification_results.csv` for the same cells, which shows the recovered samples are the original crops (see below).

Beyond the three samples, `tests/corpus.test.ts` runs every PNG in `../tests/fixtures/` (the 36 original ImageJ crops, the whole-well images and generated edge cases, 52 files, Python truth in `../tests/fixtures/ground_truth.json`) and passes with `diff 0.0000` on all of them. Three of the crops (`P3_W1_C2`, `P3_W1_C3`, `P3_W3_C3`) were re-cropped after `../Results/quantification_results.csv` was produced, so their truth is the pipeline on the committed file, not the CSV row. `npm run test:browser` (`scripts/browser-check.cjs`, Playwright) then drives the built page through the real file input in **Chromium and WebKit** (the Safari engine) on all 60 images plus the six wrong-file fixtures: every lossless image must match to 2 decimals with the identical Otsu threshold and pixel counts in both engines (JPEG within 1 point, decoder rounding), the 12 and 24 MP files must finish within 15 s without blocking the page for more than 1 s, the downloads must equal `../Results/*_overlay.png` / `*_mask.png` pixel for pixel, and the result must be scrolled into view at 360/390/430 px. Last run (2026-09-19): Chromium 57 images max |diff| 0.0050, WebKit 57 images max |diff| 0.2864 (JPEGs only; 0 lossless mismatches), 24 MP in 1.4 s with the main thread never blocked more than 44 ms.

`tests/pipeline.test.ts` is the automated version of this table: it loads the very same `public/opencv.js` the page ships, decodes each sample PNG with `pngjs`, runs `src/pipeline.ts`, and fails if any percentage drifts by more than 1 point or the threshold or pixel counts change.

### Where the sample cells come from

The original cropped cells were never committed to the repository (they lived in a Desktop folder). The `Results/*_analysis.png` figures, however, contain the original image as their first panel, drawn by matplotlib with nearest-neighbour upscaling, so every original pixel is a flat block in the figure. `scripts/extract_samples.py` finds that panel, reads the centre of each block, checks that every block is perfectly flat and that the result equals `Results/<name>_overlay.png` outside the mask, and writes the recovered cell to `public/samples/`. That is why the browser and the CSV agree exactly.

### What the pipeline does (and what it does not)

`src/pipeline.ts` mirrors the steps `MicrotubuleQuantifier.process_image` actually executes:

1. green channel of the image;
2. nucleus mask: Otsu threshold on the blue channel, then an elliptical 5 × 5 closing applied twice;
3. microtubule mask: Otsu threshold on the raw green channel;
4. nucleus pixels removed from the microtubule mask;
5. clean-up: elliptical 3 × 3 opening, then closing;
6. percentage = non-zero mask pixels ÷ all pixels × 100.

The Python class also defines Gaussian-blur, bilateral-filter and background-subtraction helpers, but `process_image` never calls them, so neither does the port. Adding them would change the numbers and break the match above.

## How to run this

You need Node.js (version 22 or newer) installed. Then, in a terminal:

```bash
cd web
npm install        # first time only, downloads the build tools
npm run dev        # prints a local address such as http://localhost:5173, open it in a browser
```

Other useful commands:

```bash
npm test           # runs the accuracy tests above in Node (about two seconds)
npm run build      # makes the finished site in web/dist/
npm run test:browser  # after a build: the full corpus through the real page in Chromium and WebKit (needs `npx playwright install chromium webkit` once)
npm run preview    # serves web/dist/ locally so you can check the built site
```

Analytics is off when you run it locally unless you create a `web/.env.local` file with the names from `.env.example` (that file is ignored by git).

## How to deploy this

The site is a folder of static files served by Vercel (free Hobby plan; $0). Two ways to deploy:

1. **Automatic:** push to the `main` branch on GitHub. The Vercel project `microtubules` (team "Kk's projects") is connected to `KalpKan/Microtubule-Quantification` with root directory `web`, so every push builds and publishes itself. Check the Vercel dashboard if a push does not show up within a few minutes.
2. **By hand**, from a computer where the Vercel CLI is logged in:
   ```bash
   cd ~/projects/microtubules
   npx vercel@latest --prod --yes
   ```
   The last line printed is the deployment URL; `https://microtubules.kalpkan.com` points at it.

To check it is healthy: open https://microtubules.kalpkan.com/health.json — it should say `{"ok":true,"service":"microtubules"}`. The full checklist an agent uses is in the portfolio repo (`skills/portfolio-ops/verification.md`).

## Where the settings live

There is only one setting, and it is not a secret:

| Name | What it is | Where the real value lives |
|---|---|---|
| `VITE_PUBLIC_POSTHOG_KEY` | the PostHog project token (starts with `phc_`) that lets the page report anonymous, cookieless usage: page views, clicks, `sample_loaded {sample}` and `image_analyzed {percent, width, height, source}`. Never any image data. | Vercel dashboard → project `microtubules` → Settings → Environment Variables. Copy `.env.example` to `.env.local` to set it locally. Without it, analytics is simply off and everything else works. |
| `VITE_PUBLIC_POSTHOG_HOST` | always `/ingest`; the site forwards analytics through its own address (rules in `vercel.json`) | same place; optional, defaults to `/ingest` |

The domain `microtubules.kalpkan.com` is a DNS record in Cloudflare (Kalp's account, zone `kalpkan.com`) pointing at the Vercel project; how it was set up is recorded in the portfolio repo (`docs/DNS_PENDING.md` and the "Attach a domain to a Vercel project" runbook).

## Files

| Path | Purpose |
|---|---|
| `index.html`, `src/main.ts`, `src/style.css` | the page: paints two small pictures, shows the numbers, warnings and the download/copy buttons |
| `src/worker.ts` | the Web Worker: downloads and starts `/opencv.js`, strips colour profiles, decodes the image in bands, runs the pipeline at full resolution, scales the pictures for display and encodes the downloadable PNGs |
| `src/pipeline.ts` | the measurement, a pure function used by the worker and the tests |
| `src/decode.ts` | byte-level helpers: file-type sniffing, colour-profile stripping, header dimensions |
| `src/interpret.ts` | the warnings, the reference values and the copy line |
| `src/export.ts` | the overlay/mask images the Download buttons save |
| `src/analytics.ts` | PostHog wiring |
| `public/opencv.js` | the official OpenCV.js build, downloaded 2026-09-18 from `https://docs.opencv.org/4.x/opencv.js` (wasm embedded, one file, 10.96 MB), sha256 `63366510248adf3a7eddf3e793dd825404efb7df3749f4d6f8557c7fa4ca8aa0`. Served from this site, not a CDN, so the page works offline. |
| `public/samples/*.png` | the three sample cells |
| `public/health.json` | `{"ok":true,"service":"microtubules"}`, polled by the portfolio hub and UptimeRobot |
| `scripts/extract_samples.py`, `scripts/reference.py` | how the samples and the expected numbers were made (Python, run from the repo root) |
| `tests/*.test.ts`, `tests/expected.json` | the Node test suite (samples, 52-PNG corpus, colour-profile stripping, warnings, exports) |
| `scripts/browser-check.cjs`, `scripts/browser-corpus.js` | the browser-level checks (scripted Playwright run; paste-into-console version) |
| `vercel.json` | PostHog `/ingest` rewrites and cache headers |

Licence: MIT, same as the rest of the repository. OpenCV is Apache-2.0.
