import type { APIRoute } from "astro";
import { isAllowedMediaHost } from "../../lib/tiktok";

// Opt out of prerendering: this runs on-demand as a Netlify Function.
export const prerender = false;

// Validate the media URL and redirect the browser straight to it.
//
// We deliberately do NOT proxy the bytes through this function: Netlify
// serverless functions cap response payloads (~6 MB), so piping a video
// through silently truncates it to an empty download. The resolver's CDN
// serves its media with `Content-Disposition: attachment`, so a plain
// redirect downloads the file directly with no size limit.
export const GET: APIRoute = async ({ url }) => {
  const src = url.searchParams.get("url");

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

  return new Response(null, {
    status: 302,
    headers: { Location: src, "Cache-Control": "no-store" },
  });
};
