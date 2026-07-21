import type { APIRoute } from "astro";
import { DESKTOP_UA, isAllowedMediaHost } from "../../lib/tiktok";

// Opt out of prerendering: this runs on-demand as a Netlify Function.
export const prerender = false;

// Proxy the media through our own origin and stream it back with an attachment
// header. This is the only way to *force* a download: a cross-origin redirect
// to the TikTok CDN just plays inline (the CDN sends no attachment header and
// the browser ignores the `download` attribute across origins). Serving the
// bytes from our own origin with Content-Disposition: attachment makes the
// browser save the file. The response is streamed (chunked), so it isn't
// capped by Netlify's buffered-response size limit.
export const GET: APIRoute = async ({ url }) => {
  const src = url.searchParams.get("url");
  const filename = (url.searchParams.get("filename") || "tiktok").replace(
    /[^\w.-]/g,
    "_"
  );
  // `inline=1` serves the media for display (poster, avatar, thumbnails)
  // instead of forcing a download. Used for images that are referer-locked on
  // TikTok's CDN and so can't be loaded directly by the browser.
  const inline = url.searchParams.get("inline") === "1";

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

  // TikTok's CDN wants a tiktok.com referer; other hosts want their own origin.
  const referer = /tiktok/i.test(host) ? "https://www.tiktok.com/" : origin + "/";

  try {
    const upstream = await fetch(src, {
      redirect: "follow",
      headers: { "User-Agent": DESKTOP_UA, Referer: referer, Accept: "*/*" },
    });

    // If we can't proxy it, fall back to sending the browser to the source so
    // the user still gets the media (it may play inline, but it's not empty).
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
      "Content-Disposition": inline
        ? "inline"
        : `attachment; filename="${filename}.${ext}"`,
      // Inline assets (posters/thumbnails) can be cached; downloads shouldn't.
      "Cache-Control": inline ? "public, max-age=86400" : "no-store",
    });
    // Deliberately no Content-Length: a mismatch can truncate a streamed body.

    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    console.error("stream error:", err);
    return new Response(null, { status: 302, headers: { Location: src } });
  }
};
