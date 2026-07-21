// @ts-check
import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";

// Static-first: the homepage is prerendered to plain HTML (great SEO), while the
// API routes opt out of prerendering (`export const prerender = false`) and are
// deployed as on-demand Netlify Functions.
export default defineConfig({
  output: "static",
  adapter: netlify(),
  // Set this to your production URL for correct canonical/OG tags & sitemaps.
  site: process.env.SITE_URL || "https://your-site.netlify.app",
});
