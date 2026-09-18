# Microtubule Quantifier, browser edition

Live: **https://microtubules.kalpkan.com**

This folder is a small web page that runs the same microtubule measurement as the Python script in the folder above, but inside your browser. You pick a fluorescent cell image (or tap a sample), and it shows the image, a green overlay of the detected microtubules with the nucleus cut out, and the percentage of the image that is microtubule. The picture is processed on your device and is never uploaded anywhere. After the page has loaded once it needs no internet connection at all.

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
npm test           # runs the accuracy test above (takes about a second)
npm run build      # makes the finished site in web/dist/
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
| `index.html`, `src/main.ts`, `src/style.css` | the page |
| `src/pipeline.ts` | the measurement, a pure function used by both the page and the test |
| `src/opencv-loader.ts` | loads `/opencv.js` once and waits for the wasm runtime |
| `src/analytics.ts` | PostHog wiring |
| `public/opencv.js` | the official OpenCV.js build, downloaded 2026-09-18 from `https://docs.opencv.org/4.x/opencv.js` (wasm embedded, one file, 10.96 MB), sha256 `63366510248adf3a7eddf3e793dd825404efb7df3749f4d6f8557c7fa4ca8aa0`. Served from this site, not a CDN, so the page works offline. |
| `public/samples/*.png` | the three sample cells |
| `public/health.json` | `{"ok":true,"service":"microtubules"}`, polled by the portfolio hub and UptimeRobot |
| `scripts/extract_samples.py`, `scripts/reference.py` | how the samples and the expected numbers were made (Python, run from the repo root) |
| `tests/expected.json`, `tests/pipeline.test.ts` | the accuracy test |
| `vercel.json` | PostHog `/ingest` rewrites and cache headers |

Licence: MIT, same as the rest of the repository. OpenCV is Apache-2.0.
