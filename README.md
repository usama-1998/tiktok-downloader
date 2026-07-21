# TikTok Downloader

A clean, one-page website to download TikTok videos **without watermark** in
**full quality**. Paste a link, get the video — no login, no ads, no limits.

![No watermark · Full HD](https://img.shields.io/badge/no%20watermark-full%20HD-fe2c55)

## Features

- 🚫 **No watermark** — downloads the original `play_addr` source, not the
  watermarked share file.
- 🎬 **Full quality** — picks the highest-bitrate / HD source available.
- 🎵 **Audio + photo posts** — grab the original sound (MP3) or slideshow images.
- ⚡ **Fast & free** — no account, no third-party redirects.
- 📱 **Responsive** — works on phone, tablet and desktop.

## How it works

The browser can't fetch TikTok media directly (CORS + watermark), so a tiny
Express backend does two things:

1. `POST /api/download` — resolves short links, extracts the video id, and
   queries TikTok's mobile feed API to get the clean, no-watermark URL plus
   metadata.
2. `GET /api/stream` — proxies the chosen media through the server so the
   browser saves it as a file (with a clean filename) instead of opening it.
   The proxy is locked to TikTok CDN hosts to avoid open-proxy abuse.

## Getting started

Requires **Node.js 18+** (uses the built-in global `fetch`).

```bash
npm install
npm start
```

Then open <http://localhost:3000>.

For development with auto-reload:

```bash
npm run dev
```

Change the port with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Usage

1. Copy a video link from TikTok (**Share → Copy link**). Short links like
   `https://vt.tiktok.com/…` work too.
2. Paste it into the box and press **Download**.
3. Save the watermark-free video, audio, or images.

## Project structure

```
├── server.js          # Express server: resolver + streaming proxy
├── public/
│   ├── index.html     # One-page UI
│   ├── styles.css     # Styling
│   └── app.js         # Front-end logic
├── package.json
└── README.md
```

## Notes & disclaimer

- TikTok's private API is unofficial and can change; if a request fails, the
  endpoints in `server.js` may need updating.
- Videos that are private, deleted, or region-locked can't be fetched.
- Please only download content you own or have permission to use, and respect
  creators' rights and [TikTok's Terms of Service](https://www.tiktok.com/legal/terms-of-service).
  This project is for personal use and is **not affiliated with TikTok**.
