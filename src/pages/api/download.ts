import type { APIRoute } from "astro";
import { resolve } from "../../lib/tiktok";

// Opt out of prerendering: this runs on-demand as a Netlify Function.
export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let rawUrl = "";
  try {
    const body = await request.json();
    rawUrl = (body?.url || "").trim();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (!rawUrl || !/tiktok\.com/i.test(rawUrl)) {
    return json({ error: "Please provide a valid TikTok URL." }, 400);
  }

  try {
    const result = await resolve(rawUrl);
    if (!result) {
      return json(
        {
          error:
            "Couldn't fetch this video. It may be private, region-locked, " +
            "or removed. Please check the link and try again.",
        },
        502
      );
    }
    if (!result.video.noWatermark && result.images.length === 0) {
      return json({ error: "No downloadable media found for this post." }, 502);
    }
    return json(result);
  } catch (err) {
    console.error("download error:", err);
    return json({ error: "Something went wrong while fetching the video." }, 500);
  }
};
