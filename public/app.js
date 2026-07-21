const form = document.getElementById("download-form");
const urlInput = document.getElementById("url");
const submitBtn = document.getElementById("submit-btn");
const pasteBtn = document.getElementById("paste-btn");
const errorEl = document.getElementById("error");
const resultEl = document.getElementById("result");

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}
function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle("loading", on);
}

function fmt(n) {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function fmtDuration(s) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function streamUrl(src, filename) {
  return `/api/stream?url=${encodeURIComponent(src)}&filename=${encodeURIComponent(filename)}`;
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
    render(data);
  } catch {
    showError("Network error. Please check your connection and try again.");
  } finally {
    setLoading(false);
  }
});

function render(data) {
  const baseName = `tiktok_${data.author.username || data.id}`;

  document.getElementById("cover").src = data.cover || "";
  const durEl = document.getElementById("duration");
  durEl.textContent = fmtDuration(data.duration);
  durEl.hidden = !data.duration;

  document.getElementById("avatar").src = data.author.avatar || "";
  document.getElementById("author-name").textContent = data.author.name || "Unknown";
  document.getElementById("author-user").textContent = data.author.username
    ? "@" + data.author.username
    : "";
  document.getElementById("desc").textContent = data.description || "";

  const statPairs = [
    ["❤️", data.stats.likes],
    ["💬", data.stats.comments],
    ["🔁", data.stats.shares],
    ["▶️", data.stats.plays],
  ];
  document.getElementById("stats").innerHTML = statPairs
    .filter(([, v]) => v != null)
    .map(([icon, v]) => `<span>${icon} ${fmt(v)}</span>`)
    .join("");

  const dlVideo = document.getElementById("dl-video");
  const imagesGrid = document.getElementById("images-grid");

  if (data.video.noWatermark) {
    dlVideo.hidden = false;
    dlVideo.href = streamUrl(data.video.noWatermark, baseName);
    imagesGrid.hidden = true;
  } else {
    dlVideo.hidden = true;
  }

  // Photo (slideshow) posts
  if (data.images && data.images.length) {
    imagesGrid.hidden = false;
    imagesGrid.innerHTML = data.images
      .map(
        (src, i) =>
          `<a href="${streamUrl(src, `${baseName}_${i + 1}`)}" download title="Download image ${i + 1}">
             <img src="${src}" alt="Image ${i + 1}" loading="lazy" />
           </a>`
      )
      .join("");
    document.getElementById("cover").src = data.images[0];
  }

  const dlAudio = document.getElementById("dl-audio");
  if (data.music && data.music.url) {
    dlAudio.hidden = false;
    dlAudio.href = streamUrl(data.music.url, `${baseName}_audio`);
  } else {
    dlAudio.hidden = true;
  }

  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
