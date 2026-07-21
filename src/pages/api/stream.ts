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
  let origin: string;
  try {
    const parsed = new URL(src);
    host = parsed.hostname;
    origin = parsed.origin;
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!isAllowedMediaHost(host)) {
    return new Response("Host not allowed", { status: 403 });
  }

  // Use a referer the media host will accept: TikTok's CDN wants a tiktok.com
  // referer, while the resolver's own CDN wants its own origin (hotlink guard).
  const referer = /tiktok/i.test(host) ? "https://www.tiktok.com/" : origin + "/";

  try {
    const upstream = await fetch(src, {
      redirect: "follow",
      headers: {
        "User-Agent": DESKTOP_UA,
        Referer: referer,
        Accept: "*/*",
      },
    });

    // If the source can't be proxied, send the browser straight to it as a
    // last resort rather than handing back an empty file.
    if (!upstream.ok || !upstream.body) {
      return new Response(null, { status: 302, headers: { Location: src } });
    }

    const type =
      upstream.headers.get("content-type") || "application/octet-stream";
    const ext = /image/i.test(type)
      ? "jpg"
      : /audio|mpeg|mp3/i.test(type)
        ? "mp3"
        : "mp4";

    const headers = new Headers({
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}.${ext}"`,
      "Cache-Control": "no-store",
    });

    // Pipe the upstream stream straight through. We intentionally omit
    // Content-Length so the response is chunked — a mismatched length can
    // truncate the body to 0 on some serverless runtimes.
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    console.error("stream error:", err);
    // Fall back to a direct redirect so the user still gets the media.
    return new Response(null, { status: 302, headers: { Location: src } });
  }
};
