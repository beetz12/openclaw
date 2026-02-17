import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export default {
  id: "vwp-consulting",
  name: "VWP Consulting",
  description: "IT consultancy domain skills for reports, proposals, documentation, and billing",
  register(api: OpenClawPluginApi) {
    // Plugin registers itself — skills are discovered via SKILL.md by skill-registry
    api.logger.info("vwp-consulting: plugin registered with 5 domain skills");
  },
};
