import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

function readWranglerVars() {
  const source = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  const vars = {};
  let inVarsSection = false;
  for (const line of source.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      inVarsSection = section[1] === "vars";
      continue;
    }
    if (!inVarsSection) continue;
    const assignment = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*$/);
    if (assignment) vars[assignment[1]] = assignment[2];
  }
  return vars;
}

const wranglerVars = readWranglerVars();

export default defineConfig({
  plugins: [
    react(),
    {
      name: "google-sheets-worker-dev-bridge",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = new URL(req.url || "/", "http://localhost").pathname;
          const isAuthRequest = ["POST", "post"].includes(req.method) && ["/admin/login", "/admin/logout"].includes(path);
          const isCoverRequest = path.startsWith("/_covers/");
          if (!path.startsWith("/api/") && !isAuthRequest && !isCoverRequest) return next();

          const env = {
            GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
            GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || wranglerVars.GOOGLE_SHEETS_SPREADSHEET_ID || "",
            GOOGLE_SHEETS_WORKSHEET: process.env.GOOGLE_SHEETS_WORKSHEET || wranglerVars.GOOGLE_SHEETS_WORKSHEET || "",
            GOOGLE_SHEETS_SETTINGS_WORKSHEET: process.env.GOOGLE_SHEETS_SETTINGS_WORKSHEET || wranglerVars.GOOGLE_SHEETS_SETTINGS_WORKSHEET || "",
            WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER || "",
            ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
            SESSION_SECRET: process.env.SESSION_SECRET || "",
          };
          const hasAnyCatalogConfig = [
            env.GOOGLE_SERVICE_ACCOUNT_JSON,
            env.GOOGLE_SHEETS_SPREADSHEET_ID,
            env.GOOGLE_SHEETS_WORKSHEET,
          ].some(Boolean);
          if (!hasAnyCatalogConfig && !isCoverRequest) return next();

          try {
            const { default: worker } = await server.ssrLoadModule("/worker/index.js");
            const method = req.method || "GET";
            const body = method === "GET" || method === "HEAD"
              ? undefined
              : await new Promise((resolve, reject) => {
                const chunks = [];
                req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
                req.on("end", () => resolve(Buffer.concat(chunks)));
                req.on("error", reject);
              });
            const forwardedProto = req.headers["x-forwarded-proto"]?.split(",")[0].trim().toLowerCase();
            const protocol = forwardedProto === "https" ? "https" : "http";
            const request = new Request(new URL(req.url || "/", `${protocol}://${req.headers.host || "localhost"}`), {
              method,
              headers: req.headers,
              body,
            });
            const response = await worker.fetch(request, env);
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (error) {
            console.error("Local Worker API request failed:", error);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "The local catalog API could not complete the request." }));
          }
        });
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
});