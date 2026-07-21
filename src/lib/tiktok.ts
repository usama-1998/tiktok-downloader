// TikTok resolver used by the API routes.
//
// TikTok's own mobile feed API now requires signed requests (X-Gorgon/X-Argus)
// and returns nothing for unsigned calls, so we resolve through a public,
// key-less resolver (tikwm) as the primary path and fall back to the mobile
// API. Both return the clean, no-watermark, full-quality source.

export const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MOBILE_UA =
  "com.zhiliaoapp.musically/2023009040 (Linux; U; Android 13; en_US; " +
  "Pixel 7; Build/TP1A.220624.021; Cronet/58.0.2991.0)";

export interface DownloadResult {
  id: string;
  description: string;
  createTime: number | null;
  author: { name: string; username: string; avatar: string | null };
  music: { title: string; author: string; url: string | null };
  stats: {
    likes: number | null;
    comments: number | null;
    shares: number | null;
    plays: number | null;
  };
  cover: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  video: { noWatermark: string | null; watermark: string | null };
  images: string[];
}

/** Turn a possibly-relative resolver URL into an absolute one. */
function absolutize(u: string | null | undefined, base: string): string | null {
  if (!u || typeof u !== "string") return null;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return base.replace(/\/$/, "") + u;
  if (/^https?:\/\//.test(u)) return u;
  return null;
}

// ---------------------------------------------------------------------------
// Primary path: tikwm public API (no key, resolves short links itself).
// ---------------------------------------------------------------------------

const TIKWM_BASE = "https://www.tikwm.com";

export async function fetchViaTikwm(
  rawUrl: string
): Promise<DownloadResult | null> {
  const endpoint = `${TIKWM_BASE}/api/?hd=1&url=${encodeURIComponent(rawUrl)}`;
  let data: any;
  try {
    const res = await fetch(endpoint, {
      headers: {
        "User-Agent": DESKTOP_UA,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || body.code !== 0 || !body.data) return null;
    data = body.data;
  } catch {
    return null;
  }

  const author = data.author || {};
  const musicInfo = data.music_info || {};

  const images: string[] = Array.isArray(data.images)
    ? data.images.map((u: string) => absolutize(u, TIKWM_BASE)).filter(Boolean)
    : [];

  const noWatermark =
    absolutize(data.hdplay, TIKWM_BASE) || absolutize(data.play, TIKWM_BASE);

  return {
    id: String(data.id ?? ""),
    description: data.title || "",
    createTime: data.create_time ?? null,
    author: {
      name: author.nickname || "",
      username: author.unique_id || "",
      avatar: absolutize(author.avatar, TIKWM_BASE),
    },
    music: {
      title: musicInfo.title || "",
      author: musicInfo.author || "",
      url: absolutize(data.music || musicInfo.play, TIKWM_BASE),
    },
    stats: {
      likes: data.digg_count ?? null,
      comments: data.comment_count ?? null,
      shares: data.share_count ?? null,
      plays: data.play_count ?? null,
    },
    cover: absolutize(data.cover || data.origin_cover, TIKWM_BASE),
    duration: data.duration ?? null,
    width: null,
    height: null,
    video: {
      noWatermark,
      watermark: absolutize(data.wmplay, TIKWM_BASE),
    },
    images,
  };
}

// ---------------------------------------------------------------------------
// Fallback path: TikTok mobile feed API (unsigned; may return nothing).
// ---------------------------------------------------------------------------

/** Follow redirects on short links (vt.tiktok.com / vm.tiktok.com). */
export async function resolveFinalUrl(url: string): Promise<string> {
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
export function extractAwemeId(url: string): string | null {
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

/** Query TikTok's mobile feed API for a single video. */
export async function fetchAweme(awemeId: string): Promise<any | null> {
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
        headers: { "User-Agent": MOBILE_UA },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const aweme = data?.aweme_list?.find((a: any) => a.aweme_id === awemeId);
      if (aweme) return aweme;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

function pickUrl(list: unknown): string | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.find((u) => /^https?:\/\//.test(u)) || list[0];
}

export function buildResult(aweme: any): DownloadResult {
  const video = aweme.video || {};
  const author = aweme.author || {};
  const music = aweme.music || {};

  const noWatermark =
    pickUrl(video.play_addr_h264?.url_list) ||
    pickUrl(video.play_addr?.url_list) ||
    pickUrl(video.play_addr_bytevc1?.url_list);
  const hd = pickUrl(video.bit_rate?.[0]?.play_addr?.url_list);

  const images: string[] = (aweme.image_post_info?.images || [])
    .map((img: any) => pickUrl(img.display_image?.url_list))
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
    cover:
      pickUrl(video.cover?.url_list) || pickUrl(video.origin_cover?.url_list),
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

// ---------------------------------------------------------------------------
// Orchestrator: try the reliable resolver first, then the mobile API.
// ---------------------------------------------------------------------------

export async function resolve(rawUrl: string): Promise<DownloadResult | null> {
  const primary = await fetchViaTikwm(rawUrl);
  if (primary && (primary.video.noWatermark || primary.images.length)) {
    return primary;
  }

  const finalUrl = await resolveFinalUrl(rawUrl);
  const awemeId = extractAwemeId(finalUrl) || extractAwemeId(rawUrl);
  if (!awemeId) return primary; // may still be a partial primary result
  const aweme = await fetchAweme(awemeId);
  if (!aweme) return primary;
  return buildResult(aweme);
}

/** Host allow-list for the streaming proxy (prevents open-proxy abuse). */
export function isAllowedMediaHost(host: string): boolean {
  return /(tiktok|tiktokcdn|ibyteimg|byteoversea|muscdn|tikwm|akamaized)\.(com|net)$/i.test(
    host
  );
}
