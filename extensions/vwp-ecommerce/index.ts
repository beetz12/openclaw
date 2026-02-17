import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export default {
  id: "vwp-ecommerce",
  name: "VWP E-Commerce",
  description: "E-commerce domain skills for product, marketing, and sales operations",
  register(api: OpenClawPluginApi) {
    // Plugin registers itself — skills are discovered via SKILL.md by skill-registry
    api.logger.info("vwp-ecommerce: plugin registered with 5 domain skills");
  },
};
