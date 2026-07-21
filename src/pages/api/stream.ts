import type { APIRoute } from "astro";
import { DESKTOP_UA, isAllowedMediaHost } from "../../lib/tiktok";

// Opt out of prerendering: this runs on-demand as a Netlify Function.
export const prerender = false;

// Stream remote media through the server so the browser saves it as a file
// (avoids CORS blocks and forces an attachment download with a clean filename).
export const GET: APIRoute = async ({ url }) => {
  const src = url.searchParams.get("url");
  const filename = (url.searchParams.get("filename") || "tiktok").replace(
    /[^\w.-]/g,
    "_"
  );

  if (!src || !/^https?:\/\//.test(src)) {
    return new Response("Invalid url", { status: 400 });
  }

  let host: string;
  try {
    host = new URL(src).hostname;
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!isAllowedMediaHost(host)) {
    return new Response("Host not allowed", { status: 403 });
  }

  try {
    const upstream = await fetch(src, {
      headers: { "User-Agent": DESKTOP_UA, Referer: "https://www.tiktok.com/" },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream fetch failed", { status: 502 });
    }

    const type =
      upstream.headers.get("content-type") || "application/octet-stream";
    const ext = type.includes("image") ? "jpg" : "mp4";
    const headers = new Headers({
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}.${ext}"`,
    });
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);

    // Pipe the upstream ReadableStream straight through to the client.
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    console.error("stream error:", err);
    return new Response("Stream failed", { status: 500 });
  }
};
