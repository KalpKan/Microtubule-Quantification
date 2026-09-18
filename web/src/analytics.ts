import posthog from "posthog-js";

/**
 * PostHog, following the contract every app on kalpkan.com uses
 * (portfolio repo, lib/posthog.ts): cookieless (`persistence: "memory"`),
 * first-party via the /ingest rewrite in vercel.json, autocapture on.
 *
 * Only two custom events exist and neither ever carries image data:
 *   sample_loaded   { sample }
 *   image_analyzed  { percent, width, height, source }
 *
 * Without VITE_PUBLIC_POSTHOG_KEY (local dev, a fork) this is a silent no-op.
 */
let initialised = false;

export function initAnalytics(key: string | undefined = import.meta.env.VITE_PUBLIC_POSTHOG_KEY): void {
  if (initialised || !key) return;
  initialised = true;
  posthog.init(key, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "/ingest",
    ui_host: "https://us.posthog.com",
    persistence: "memory",
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: { maskAllInputs: true },
    disable_surveys: true,
  });
}

export function capture(event: "sample_loaded" | "image_analyzed", props: Record<string, string | number>): void {
  if (!initialised) return;
  // Per docs/analytics.md: instant + sendBeacon so an event is not lost with the page.
  posthog.capture(event, props, { send_instantly: true, transport: "sendBeacon" });
}
