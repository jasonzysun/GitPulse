import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://goldenzqqq.github.io",
  base: "/GitPulse",
  output: "static",
  integrations: [sitemap()],
});
