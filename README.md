# TikTok Downloader

A clean, one-page **[Astro](https://astro.build)** website to download TikTok
videos **without watermark** in **full quality**. Paste a link, get the video —
no login, no ads, no limits. Built to deploy to **Netlify** in one click.

![No watermark · Full HD](https://img.shields.io/badge/no%20watermark-full%20HD-fe2c55)

## Features

- 🚫 **No watermark** — downloads the original `play_addr` source, not the
  watermarked share file.
- 🎬 **Full quality** — picks the highest-bitrate / HD source available.
- 🎵 **Audio + photo posts** — grab the original sound (MP3) or slideshow images.
- ⚡ **Fast & free** — no account, no API key, no third-party redirects.
- 🔎 **SEO-friendly** — the homepage is prerendered to static HTML with meta,
  Open Graph, Twitter, and JSON-LD structured data (zero client framework JS).
- 📱 **Responsive** — works on phone, tablet and desktop.

## How it works

Astro is **static-first**: the homepage is prerendered to plain HTML for fast
loads and great SEO. The two backend routes opt out of prerendering and run
on-demand as **Netlify Functions** — no persistent server, no API key.

- `POST /api/download` — resolves short links, extracts the video id, and
  queries TikTok's mobile feed API to get the clean, no-watermark URL plus
  metadata (`src/pages/api/download.ts`).
- `GET /api/stream` — proxies the chosen media through the function so the
  browser saves it as a file (with a clean filename) instead of opening it.
  The proxy is locked to TikTok CDN hosts to avoid open-proxy abuse
  (`src/pages/api/stream.ts`).

Shared resolver logic lives in `src/lib/tiktok.ts`.

## Getting started

Requires **Node.js 18.20.8+**.

```bash
npm install
npm run dev      # http://localhost:4321
```

Build and preview a production bundle:

```bash
npm run build
npm run preview
```

## Deploy to Netlify

The [`@astrojs/netlify`](https://docs.astro.build/en/guides/integrations-guide/netlify/)
adapter is already configured, so deployment needs zero extra setup:

1. Push this repo to GitHub.
2. In Netlify, **Add new site → Import an existing project** and pick the repo.
3. Netlify reads `netlify.toml` (build command `npm run build`, publish `dist`)
   and wires up the API routes as Functions automatically. Click **Deploy**.

Optionally set a `SITE_URL` environment variable to your production URL so the
canonical/Open Graph tags point at the right place.

## Project structure

```
├── astro.config.mjs        # Astro + Netlify adapter config
├── netlify.toml            # Netlify build settings
├── src/
│   ├── pages/
│   │   ├── index.astro      # One-page UI (prerendered static, SEO tags)
│   │   └── api/
│   │       ├── download.ts  # POST — resolve no-watermark URL (on-demand)
│   │       └── stream.ts    # GET  — streaming download proxy (on-demand)
│   ├── lib/tiktok.ts        # Shared TikTok resolver
│   ├── scripts/downloader.ts# Client-side form logic
│   └── styles/global.css    # Styling
├── package.json
└── README.md
```

## Notes & disclaimer

- TikTok's private API is unofficial and can change; if a request fails, the
  endpoints in `src/lib/tiktok.ts` may need updating.
- Videos that are private, deleted, or region-locked can't be fetched.
- Please only download content you own or have permission to use, and respect
  creators' rights and [TikTok's Terms of Service](https://www.tiktok.com/legal/terms-of-service).
  This project is for personal use and is **not affiliated with TikTok**.
