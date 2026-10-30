// Local-only UI fixture. All campaigns are in memory; this server never contacts FCM.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
let serial = 10;
const campaigns = [
  { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "A little inspiration, just for you", body: "Find a fresh look in the latest Madds collection.", notificationType: "PRODUCT_UPDATE", targetAudience: "ALL_USERS", targetConditions: { userIds: [], recentDays: 7 }, status: "DRAFT", revision: 0, deepLink: "picme://home", createdAt: new Date().toISOString() },
  { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Weekend portraits are here", body: "Create something new this weekend.", notificationType: "NEW_STYLE", targetAudience: "ACTIVE_USERS", targetConditions: { userIds: [], recentDays: 7 }, relatedStyleId: "golden-hour", deepLink: "picme://styles/golden-hour", status: "SENT", revision: 0, createdAt: new Date().toISOString() },
];
const json = (res, data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (!url.pathname.startsWith("/api/")) {
    if (url.pathname === "/config.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end("window.PICMEE_API_BASE = location.origin;"); }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml" }[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime }); return fs.createReadStream(file).pipe(res);
  }
  let body = ""; for await (const chunk of req) body += chunk;
  let input = {}; try { input = body ? JSON.parse(body) : {}; } catch { return json(res, { error: "Invalid JSON" }, 400); }
  if (url.pathname === "/api/auth/login") return json(res, { accessToken: "fixture-access", refreshToken: "fixture-refresh", user: { email: "preview@example.com" } });
  if (url.pathname === "/api/auth/logout") return json(res, { ok: true });
  if (url.pathname === "/api/admin/catalog") return json(res, { styles: [{ id: "golden-hour", name: "Golden hour", verified: true, collections: ["Portraits"], description: "Golden light", imageCount: 1, tokensRequired: 5 }], collections: [{ id: "portraits", name: "Portraits" }], sections: [] });
  const prefix = "/api/admin/notifications";
  if (!url.pathname.startsWith(prefix)) return json(res, { error: "Fixture route not found" }, 404);
  if (!req.headers.authorization) return json(res, { error: "Sign in required" }, 401);
  const parts = url.pathname.slice(prefix.length).split("/").filter(Boolean);
  if (!parts.length && req.method === "GET") return json(res, { campaigns, nextCursor: null, deliveryEnabled: process.argv.includes("--enabled") });
  if (!parts.length && req.method === "POST") {
    const campaign = { ...input, _id: (++serial).toString(16).padStart(24, "0"), revision: 0, status: "DRAFT", createdAt: new Date().toISOString(), deepLink: input.relatedStyleId ? `picme://styles/${input.relatedStyleId}` : input.collectionId ? `picme://collections/${input.collectionId}` : "picme://home" };
    campaigns.unshift(campaign); return json(res, { campaign }, 201);
  }
  const campaign = campaigns.find((item) => item._id === parts[0]);
  if (!campaign) return json(res, { error: "Campaign not found" }, 404);
  if (input.expectedRevision !== undefined && input.expectedRevision !== campaign.revision) return json(res, { error: "Campaign changed" }, 409);
  if (parts.length === 1 && req.method === "PATCH") { Object.assign(campaign, input, { revision: campaign.revision + 1 }); return json(res, { campaign }); }
  if (parts[1] === "preview") return json(res, { audience: { scannedDevices: 100, eligibleDevicesInSample: 73, hasMoreDevices: true } });
  if (parts[1] === "stats") return json(res, { stats: { totalRecipients: campaign.status === "SENT" ? 100 : 0, successfulDeliveries: campaign.status === "SENT" ? 92 : 0, failedDeliveries: campaign.status === "SENT" ? 3 : 0, skippedDeliveries: campaign.status === "SENT" ? 5 : 0, pendingDeliveries: 0 } });
  if (parts[1] === "logs") return json(res, { logs: campaign.status === "SENT" ? [{ status: "ACCEPTED", attempts: 1, sentAt: new Date().toISOString() }, { status: "FAILED", attempts: 5, error: "messaging/server-unavailable" }] : [], nextCursor: null });
  if (["send", "schedule", "cancel"].includes(parts[1])) { campaign.status = parts[1] === "cancel" ? "CANCELLED" : "SCHEDULED"; campaign.scheduledAt = input.scheduledAt || new Date().toISOString(); console.log(`Fixture action: ${parts[1]}`); return json(res, { campaign }); }
  return json(res, { campaign });
}).listen(4178, "127.0.0.1", () => console.log("Local fixture: http://127.0.0.1:4178 — no live sends"));
