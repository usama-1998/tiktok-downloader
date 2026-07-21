// Client-side logic for the downloader form. Astro bundles this automatically.

interface DownloadResult {
  id: string;
  description: string;
  author: { name: string; username: string; avatar: string | null };
  music: { url: string | null };
  stats: {
    likes: number | null;
    comments: number | null;
    shares: number | null;
    plays: number | null;
  };
  cover: string | null;
  duration: number | null;
  video: { noWatermark: string | null };
  images: string[];
}

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const form = $<HTMLFormElement>("download-form");
const urlInput = $<HTMLInputElement>("url");
const submitBtn = $<HTMLButtonElement>("submit-btn");
const pasteBtn = $<HTMLButtonElement>("paste-btn");
const errorEl = $<HTMLParagraphElement>("error");
const resultEl = $<HTMLElement>("result");

function showError(msg: string) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}
function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}
function setLoading(on: boolean) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle("loading", on);
}

function fmt(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function fmtDuration(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function streamUrl(src: string, filename: string): string {
  return `/api/stream?url=${encodeURIComponent(src)}&filename=${encodeURIComponent(
    filename
  )}`;
}

// Serve an image (poster/avatar/thumbnail) inline through our proxy so
// referer-locked TikTok CDN images still load in the browser.
function inlineUrl(src: string | null): string {
  return src ? `/api/stream?inline=1&url=${encodeURIComponent(src)}` : "";
}

// Give the player a thumbnail no matter what: probe the cover URL (direct,
// then proxied) and use the first that actually loads; if neither does, seek
// the video slightly so the browser renders its first frame instead of black.
function setPoster(player: HTMLVideoElement, coverSrc: string | null) {
  player.removeAttribute("poster");

  const showFirstFrame = () => {
    const nudge = () => {
      try {
        if (player.currentTime === 0 && player.paused) player.currentTime = 0.1;
      } catch {
        /* ignore */
      }
    };
    if (player.readyState >= 1) nudge();
    else player.addEventListener("loadedmetadata", nudge, { once: true });
  };

  const candidates = coverSrc ? [coverSrc, inlineUrl(coverSrc)] : [];
  const tryNext = (i: number) => {
    if (i >= candidates.length) {
      showFirstFrame();
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      player.poster = candidates[i];
    };
    probe.onerror = () => tryNext(i + 1);
    probe.src = candidates[i];
  };
  tryNext(0);
}

pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text.trim();
      urlInput.focus();
    }
  } catch {
    urlInput.focus();
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  resultEl.hidden = true;
  // Stop any previously playing video so its audio doesn't linger.
  const prevPlayer = document.getElementById("player") as HTMLVideoElement | null;
  if (prevPlayer) prevPlayer.pause();

  const url = urlInput.value.trim();
  if (!url) return;
  if (!/tiktok\.com/i.test(url)) {
    showError("That doesn't look like a TikTok link. Please paste a valid URL.");
    return;
  }

  setLoading(true);
  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Could not fetch this video. Please try again.");
      return;
    }
    render(data as DownloadResult);
  } catch {
    showError("Network error. Please check your connection and try again.");
  } finally {
    setLoading(false);
  }
});

function render(data: DownloadResult) {
  const baseName = `tiktok_${data.author.username || data.id}`;

  const durEl = $<HTMLSpanElement>("duration");
  durEl.textContent = fmtDuration(data.duration);
  durEl.hidden = !data.duration;

  $<HTMLImageElement>("avatar").src = inlineUrl(data.author.avatar);
  $("author-name").textContent = data.author.name || "Unknown";
  $("author-user").textContent = data.author.username
    ? "@" + data.author.username
    : "";
  $("desc").textContent = data.description || "";

  const statPairs: [string, number | null][] = [
    ["❤️", data.stats.likes],
    ["💬", data.stats.comments],
    ["🔁", data.stats.shares],
    ["▶️", data.stats.plays],
  ];
  $("stats").innerHTML = statPairs
    .filter(([, v]) => v != null)
    .map(([icon, v]) => `<span>${icon} ${fmt(v)}</span>`)
    .join("");

  const dlVideo = $<HTMLAnchorElement>("dl-video");
  const imagesGrid = $<HTMLDivElement>("images-grid");
  const player = $<HTMLVideoElement>("player");
  const cover = $<HTMLImageElement>("cover");

  if (data.video.noWatermark) {
    // Play inline from the direct media URL (streams/seeks natively); download
    // still routes through /api/stream to force an attachment save.
    dlVideo.hidden = false;
    dlVideo.href = streamUrl(data.video.noWatermark, baseName);
    player.src = data.video.noWatermark;
    setPoster(player, data.cover);
    player.hidden = false;
    cover.hidden = true;
    imagesGrid.hidden = true;
  } else {
    dlVideo.hidden = true;
    player.removeAttribute("src");
    player.hidden = true;
  }

  if (data.images && data.images.length) {
    player.hidden = true;
    imagesGrid.hidden = false;
    imagesGrid.innerHTML = data.images
      .map(
        (src, i) =>
          `<a href="${streamUrl(src, `${baseName}_${i + 1}`)}" download title="Download image ${
            i + 1
          }"><img src="${inlineUrl(src)}" alt="Image ${i + 1}" loading="lazy" /></a>`
      )
      .join("");
    cover.src = inlineUrl(data.images[0]);
    cover.hidden = false;
  }

  const dlAudio = $<HTMLAnchorElement>("dl-audio");
  if (data.music && data.music.url) {
    dlAudio.hidden = false;
    dlAudio.href = streamUrl(data.music.url, `${baseName}_audio`);
  } else {
    dlAudio.hidden = true;
  }

  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
