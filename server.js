import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Follow redirects on short links (vt.tiktok.com / vm.tiktok.com) and return
 * the final canonical TikTok URL.
 */
async function resolveFinalUrl(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": DESKTOP_UA },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

/** Extract the numeric aweme (video) id from any TikTok URL form. */
function extractAwemeId(url) {
  const patterns = [
    /\/video\/(\d+)/,
    /\/photo\/(\d+)/,
    /\/v\/(\d+)/,
    /[?&]item_id=(\d+)/,
    /[?&]aweme_id=(\d+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Query TikTok's mobile feed API for a single video. The `play_addr` field it
 * returns is the clean, no-watermark, full-quality source.
 */
async function fetchAweme(awemeId) {
  const params = new URLSearchParams({
    aweme_id: awemeId,
    version_code: "300904",
    version_name: "30.9.4",
    build_number: "30.9.4",
    manifest_version_code: "2023009040",
    update_version_code: "2023009040",
    aid: "1233",
    app_name: "musical_ly",
    channel: "googleplay",
    device_platform: "android",
    device_type: "Pixel 7",
    os_version: "13",
    ssmix: "a",
    _rticket: Date.now().toString(),
  });

  const endpoints = [
    "https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/",
    "https://api22-normal-c-useast2a.tiktokv.com/aweme/v1/feed/",
    "https://api19-normal-c-useast1a.tiktokv.com/aweme/v1/feed/",
  ];

  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}?${params.toString()}`, {
        headers: {
          "User-Agent":
            "com.zhiliaoapp.musically/2023009040 (Linux; U; Android 13; " +
            "en_US; Pixel 7; Build/TP1A.220624.021; Cronet/58.0.2991.0)",
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const aweme = data?.aweme_list?.find((a) => a.aweme_id === awemeId);
      if (aweme) return aweme;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

function pickUrl(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  // Prefer a non-watermarked, http(s) url.
  return list.find((u) => /^https?:\/\//.test(u)) || list[0];
}

function buildResult(aweme) {
  const video = aweme.video || {};
  const author = aweme.author || {};
  const music = aweme.music || {};

  // play_addr = no watermark. download_addr = watermarked. Prefer HD if present.
  const noWatermark =
    pickUrl(video.play_addr_h264?.url_list) ||
    pickUrl(video.play_addr?.url_list) ||
    pickUrl(video.play_addr_bytevc1?.url_list);
  const hd = pickUrl(video.bit_rate?.[0]?.play_addr?.url_list);

  // Photo (image) posts
  const images = (aweme.image_post_info?.images || [])
    .map((img) => pickUrl(img.display_image?.url_list))
    .filter(Boolean);

  return {
    id: aweme.aweme_id,
    description: aweme.desc || "",
    createTime: aweme.create_time || null,
    author: {
      name: author.nickname || "",
      username: author.unique_id || "",
      avatar: pickUrl(author.avatar_medium?.url_list),
    },
    music: {
      title: music.title || "",
      author: music.author || "",
      url: pickUrl(music.play_url?.url_list),
    },
    stats: {
      likes: aweme.statistics?.digg_count ?? null,
      comments: aweme.statistics?.comment_count ?? null,
      shares: aweme.statistics?.share_count ?? null,
      plays: aweme.statistics?.play_count ?? null,
    },
    cover: pickUrl(video.cover?.url_list) || pickUrl(video.origin_cover?.url_list),
    duration: video.duration ? Math.round(video.duration / 1000) : null,
    width: video.width || null,
    height: video.height || null,
    video: {
      noWatermark: hd || noWatermark,
      watermark: pickUrl(video.download_addr?.url_list),
    },
    images,
  };
}

app.post("/api/download", async (req, res) => {
  const rawUrl = (req.body?.url || "").trim();
  if (!rawUrl || !/tiktok\.com/i.test(rawUrl)) {
    return res.status(400).json({ error: "Please provide a valid TikTok URL." });
  }

  try {
    const finalUrl = await resolveFinalUrl(rawUrl);
    const awemeId = extractAwemeId(finalUrl) || extractAwemeId(rawUrl);
    if (!awemeId) {
      return res
        .status(422)
        .json({ error: "Could not find a video id in that link." });
    }

    const aweme = await fetchAweme(awemeId);
    if (!aweme) {
      return res.status(502).json({
        error:
          "TikTok did not return the video. It may be private, region-locked, " +
          "or removed. Please try again.",
      });
    }

    const result = buildResult(aweme);
    if (!result.video.noWatermark && result.images.length === 0) {
      return res
        .status(502)
        .json({ error: "No downloadable media found for this post." });
    }
    return res.json(result);
  } catch (err) {
    console.error("download error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong while fetching the video." });
  }
});

/**
 * Stream remote media through the server so the browser can save it directly
 * (avoids CORS blocks and forces an attachment download with a clean filename).
 */
app.get("/api/stream", async (req, res) => {
  const src = req.query.url;
  const filename = (req.query.filename || "tiktok").toString().replace(/[^\w.-]/g, "_");
  if (typeof src !== "string" || !/^https?:\/\//.test(src)) {
    return res.status(400).send("Invalid url");
  }
  // Only allow TikTok CDN hosts to prevent open-proxy abuse.
  let host;
  try {
    host = new URL(src).hostname;
  } catch {
    return res.status(400).send("Invalid url");
  }
  if (!/(tiktok|tiktokcdn|ibyteimg|byteoversea|muscdn)\.com$/i.test(host)) {
    return res.status(403).send("Host not allowed");
  }

  try {
    const upstream = await fetch(src, {
      headers: { "User-Agent": DESKTOP_UA, Referer: "https://www.tiktok.com/" },
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).send("Upstream fetch failed");
    }
    const type = upstream.headers.get("content-type") || "application/octet-stream";
    const ext = type.includes("image") ? "jpg" : "mp4";
    res.setHeader("Content-Type", type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.${ext}"`
    );
    const len = upstream.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);

    const reader = upstream.body.getReader();
    res.on("close", () => reader.cancel().catch(() => {}));
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error("stream error:", err);
    if (!res.headersSent) res.status(500).send("Stream failed");
  }
});

app.listen(PORT, () => {
  console.log(`TikTok downloader running at http://localhost:${PORT}`);
});
