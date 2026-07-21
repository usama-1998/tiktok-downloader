import type { APIRoute } from "astro";
import {
  resolveFinalUrl,
  extractAwemeId,
  fetchAweme,
  buildResult,
} from "../../lib/tiktok";

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
    const finalUrl = await resolveFinalUrl(rawUrl);
    const awemeId = extractAwemeId(finalUrl) || extractAwemeId(rawUrl);
    if (!awemeId) {
      return json({ error: "Could not find a video id in that link." }, 422);
    }

    const aweme = await fetchAweme(awemeId);
    if (!aweme) {
      return json(
        {
          error:
            "TikTok did not return the video. It may be private, " +
            "region-locked, or removed. Please try again.",
        },
        502
      );
    }

    const result = buildResult(aweme);
    if (!result.video.noWatermark && result.images.length === 0) {
      return json({ error: "No downloadable media found for this post." }, 502);
    }
    return json(result);
  } catch (err) {
    console.error("download error:", err);
    return json({ error: "Something went wrong while fetching the video." }, 500);
  }
};
