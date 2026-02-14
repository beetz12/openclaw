import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "dist");
const PATH_PREFIX = "/vwp-dashboard";

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function isSafeRelativePath(relPath: string): boolean {
  if (!relPath) return false;
  const normalized = path.posix.normalize(relPath);
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.includes("\0")) return false;
  return true;
}

export default {
  id: "vwp-dashboard",
  name: "VWP Dashboard",
  description: "Mobile-first approval dashboard for SMB owners",

  register(api: OpenClawPluginApi) {
    api.registerHttpHandler((req, res) => {
      const urlRaw = req.url;
      if (!urlRaw) return false;

      const url = new URL(urlRaw, "http://localhost");
      const pathname = url.pathname;

      // Handle exact /vwp-dashboard → redirect to /vwp-dashboard/
      if (pathname === PATH_PREFIX) {
        res.statusCode = 302;
        res.setHeader("Location", `${PATH_PREFIX}/${url.search}`);
        res.end();
        return true;
      }

      // Only handle /vwp-dashboard/ prefix
      if (!pathname.startsWith(`${PATH_PREFIX}/`)) {
        return false;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Method Not Allowed");
        return true;
      }

      // Check dist directory exists
      if (!fs.existsSync(DIST_DIR)) {
        res.statusCode = 503;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(
          "VWP Dashboard assets not found. Build with: cd extensions/vwp-dashboard && npx vite build",
        );
        return true;
      }

      // Strip prefix to get the relative file path
      const uiPath = pathname.slice(PATH_PREFIX.length);
      const rel = uiPath === "/" ? "" : uiPath.slice(1);
      const fileRel = rel && !rel.endsWith("/") ? rel : `${rel}index.html`;

      if (!isSafeRelativePath(fileRel)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not Found");
        return true;
      }

      const filePath = path.join(DIST_DIR, fileRel);
      if (!filePath.startsWith(DIST_DIR)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not Found");
        return true;
      }

      // Serve existing file
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader("Content-Type", contentTypeForExt(ext));
        res.setHeader("Cache-Control", "no-cache");
        res.end(fs.readFileSync(filePath));
        return true;
      }

      // SPA fallback: serve index.html for unknown paths
      const indexPath = path.join(DIST_DIR, "index.html");
      if (fs.existsSync(indexPath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(fs.readFileSync(indexPath));
        return true;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not Found");
      return true;
    });

    api.logger.info("vwp-dashboard: plugin registered, serving at /vwp-dashboard/");
  },
};
