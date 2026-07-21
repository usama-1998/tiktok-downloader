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
const resultEl = $<HTMLElement>("result");
const toastContainer = $<HTMLDivElement>("toast-container");

type ToastType = "success" | "error" | "info";
const TOAST_ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "⚠️",
  info: "ℹ️",
};

function toast(message: string, type: ToastType = "info", duration = 3500) {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type]}</span><span class="toast-msg"></span>`;
  (el.querySelector(".toast-msg") as HTMLElement).textContent = message;
  toastContainer.appendChild(el);

  // Trigger the enter transition on the next frame.
  requestAnimationFrame(() => el.classList.add("show"));

  const remove = () => {
    el.classList.remove("show");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    // Safety net in case the transition doesn't fire.
    setTimeout(() => el.remove(), 400);
  };
  el.addEventListener("click", remove);
  setTimeout(remove, duration);
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
      toast("Link pasted", "success", 2000);
    } else {
      toast("Clipboard is empty", "info", 2000);
    }
  } catch {
    urlInput.focus();
    toast("Couldn't read clipboard, please paste manually", "info");
  }
});

// A download link was clicked (video, audio, or a slideshow image).
document.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest(
    "a.download-link, .images-grid a"
  );
  if (target) toast("Download started", "info", 2000);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  resultEl.hidden = true;
  // Stop any previously playing video so its audio doesn't linger.
  const prevPlayer = document.getElementById("player") as HTMLVideoElement | null;
  if (prevPlayer) prevPlayer.pause();

  const url = urlInput.value.trim();
  if (!url) {
    toast("Please paste a TikTok link first", "info");
    return;
  }
  if (!/tiktok\.com/i.test(url)) {
    toast("That doesn't look like a TikTok link", "error");
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
      toast(data.error || "Could not fetch this video. Please try again.", "error", 5000);
      return;
    }
    render(data as DownloadResult);
    toast("Video ready. Tap Download to save it.", "success");
  } catch {
    toast("Network error. Please check your connection and try again.", "error", 5000);
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
