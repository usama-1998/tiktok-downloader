// Shared TikTok resolver used by the API routes. It talks to TikTok's mobile
// feed API, whose `play_addr` field is the clean, no-watermark, full-quality
// source (as opposed to the watermarked `download_addr` share file).

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
      const aweme = data?.aweme_list?.find(
        (a: any) => a.aweme_id === awemeId
      );
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

/** Host allow-list for the streaming proxy (prevents open-proxy abuse). */
export function isAllowedMediaHost(host: string): boolean {
  return /(tiktok|tiktokcdn|ibyteimg|byteoversea|muscdn)\.com$/i.test(host);
}
