// Local-only UI fixture. All campaigns are in memory; this server never contacts FCM.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
let serial = 10;
let styleGroups = [];
let rewardedCredits = { credits: 2, revision: 0, source: 'environment' };
let dailyRewards = { enabled: false, credits: 2, revision: 0, maximum: 10, history: [] };
let adSettings = { enabled: true, bannersEnabled: true, rewardedEnabled: true, nativeHomeEnabled: true, nativeExploreEnabled: true,
  minGapSeconds: 90, timedIntervalSeconds: 120, homeNativeEverySections: 3, exploreNativeEveryStyles: 12, revision: 0,
  placements: Object.fromEntries(['generation_continue','custom_generate','avatar_saved','buy_more','my_generations','home_see_all','collection_open','image_download','appearance_applied','timed_navigation','daily_bonus_claim'].map(key => [key, key !== 'daily_bonus_claim'])) };
let dailyReminder = { enabled: false, sendTime: '20:00', title: 'Your daily credits are waiting ✨', body: 'Hi {firstName}, claim your {credits} free credits before midnight.', revision: 0, history: [], runs: [] };
const previewPort = Number(process.env.WORKSPACE_PREVIEW_PORT) || 4178;
let welcomeBackBatches = [];
let watermark = { enabled:false, logoUrl:"", logoPublicId:"", widthPercent:18, opacityPercent:85, paddingPercent:2, revision:0 };
const tagging = { version: 1, maxTags: 10, maxTagLength: 40, aliases: { sari: 'saree', saari: 'saree', deepavali: 'diwali' }, suggestions: ['saree', 'red', 'silk', 'wedding', 'golden hour', 'portrait', 'cinematic'] };
let catalogueStyles = [
  { id: 'golden-hour', name: 'Golden hour', verified: true, collections: ['Portraits'], tags: [], description: 'Golden light', prompt: 'Create a golden hour portrait.', imageCount: 1, tokensRequired: 5, thumbnail: '/assets/madds-title.png', thumbnailPublicId: 'fixture-cover', previewImages: [], lastEditedByName: 'Preview Editor', updatedAt: new Date().toISOString() },
  { id: 'festive-portrait', name: 'Festive portrait', verified: true, collections: ['Portraits'], tags: ['red', 'saree', 'wedding'], description: 'A festive look', prompt: 'Create a festive portrait.', imageCount: 1, tokensRequired: 5, thumbnail: '/assets/madds-title.png', thumbnailPublicId: 'fixture-cover-2', previewImages: [], lastEditedByName: 'Preview Editor', updatedAt: new Date().toISOString() },
];
const campaigns = [
  { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "A little inspiration, just for you", body: "Find a fresh look in the latest Madds collection.", notificationType: "PRODUCT_UPDATE", targetAudience: "ALL_USERS", targetConditions: { userIds: [], recentDays: 7 }, status: "DRAFT", revision: 0, deepLink: "picme://home", createdAt: new Date().toISOString() },
  { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Weekend portraits are here", body: "Create something new this weekend.", notificationType: "NEW_STYLE", targetAudience: "ACTIVE_USERS", targetConditions: { userIds: [], recentDays: 7 }, relatedStyleId: "golden-hour", deepLink: "picme://styles/golden-hour", status: "SENT", revision: 0, createdAt: new Date().toISOString() },
];
const json = (res, data, status = 200) => {
  const send = () => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  const delay = Math.min(5000, Math.max(0, Number(process.env.WORKSPACE_PREVIEW_DELAY_MS) || 0));
  if (delay) setTimeout(send, delay); else send();
};
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/api/admin/feedback") return json(res, { items: [
    { _id: "cccccccccccccccccccccccc", userId: "dddddddddddddddddddddddd", userName: "Preview User", userEmail: "preview@example.com",
      contactEmail: "reply@example.com", category: "SUGGESTION", status: "NEW", message: "Please add more styles for couples.",
      appVersion: "1.2.3", androidVersion: "13", createdAt: new Date().toISOString() },
  ], hasMore: false });
  if (url.pathname === "/api/admin/notifications/device-versions") return json(res, { versions: [] });
  if (!url.pathname.startsWith("/api/")) {
    if (url.pathname === "/fixture-watermark.png" && process.env.WORKSPACE_PREVIEW_LOGO) {
      res.writeHead(200, {"Content-Type":"image/png"}); return fs.createReadStream(process.env.WORKSPACE_PREVIEW_LOGO).pipe(res);
    }
    if (url.pathname === "/config.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end("window.PICMEE_API_BASE = location.origin;"); }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" }[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" }); return fs.createReadStream(file).pipe(res);
  }
  if (url.pathname === "/api/admin/settings/watermark/logo" && req.method === "POST") {
    for await (const _chunk of req) { /* Local-only fixture discards the upload. */ }
    return json(res,{logoUrl:process.env.WORKSPACE_PREVIEW_LOGO?"/fixture-watermark.png":"/assets/madds-title.png",logoPublicId:"fixture-watermark"});
  }
  let body = ""; for await (const chunk of req) body += chunk;
  let input = {}; try { input = body ? JSON.parse(body) : {}; } catch { return json(res, { error: "Invalid JSON" }, 400); }
  if (url.pathname === "/api/auth/login") return json(res, { accessToken: "fixture-access", refreshToken: "fixture-refresh", user: { email: "preview@example.com" } });
  if (url.pathname === "/api/auth/logout") return json(res, { ok: true });
  if (url.pathname === '/api/admin/settings/ads') {
    if (req.method === 'PATCH') {
      if (input.expectedRevision !== adSettings.revision) return json(res, { error: 'Ad settings changed. Refresh before saving.' }, 409);
      const { expectedRevision, ...values } = input;
      adSettings = { ...adSettings, ...values, revision: adSettings.revision + 1, updatedByName: 'Preview Owner', updatedAt: new Date().toISOString() };
    }
    return json(res, { ok: true, ...adSettings });
  }
  if (url.pathname === '/api/admin/notifications/daily-reminder') {
    if (req.method === 'PATCH') {
      if (input.expectedRevision !== dailyReminder.revision) return json(res, { error: 'Reminders changed. Refresh before saving.' }, 409);
      const previous = { ...dailyReminder }; delete previous.history; delete previous.runs;
      dailyReminder = { ...dailyReminder, enabled: input.enabled, sendTime: input.sendTime, title: input.title, body: input.body,
        revision: dailyReminder.revision + 1, updatedByName: 'Preview Owner', updatedAt: new Date().toISOString(),
        history: [{ actorName: 'Preview Owner', createdAt: new Date().toISOString(), previous, next: input }, ...dailyReminder.history] };
    }
    return json(res, { ...dailyReminder, timezone: 'Asia/Kolkata', credits: dailyRewards.credits, rewardsEnabled: dailyRewards.enabled,
      deliveryEnabled: false, processorMode: 'worker', nextRunAt: new Date(Date.now() + 86400000).toISOString() });
  }
  if (url.pathname === '/api/admin/settings/daily-rewards') {
    if (req.method === 'PATCH') {
      if (input.expectedRevision !== dailyRewards.revision) return json(res, { error: 'Daily rewards changed. Refresh and review.' }, 409);
      if (typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.credits) || input.credits < 1 || input.credits > 10) return json(res, { error: 'Use 1–10 whole credits.' }, 400);
      const previous = { enabled: dailyRewards.enabled, credits: dailyRewards.credits, revision: dailyRewards.revision };
      const updatedAt = new Date().toISOString();
      dailyRewards = { ...dailyRewards, enabled: input.enabled, credits: input.credits, revision: dailyRewards.revision + 1, updatedByName: 'Preview Owner', updatedAt,
        history: [{ actorName: 'Preview Owner', createdAt: updatedAt, previous, next: { enabled: input.enabled, credits: input.credits, revision: dailyRewards.revision + 1 } }, ...dailyRewards.history] };
    }
    return json(res, dailyRewards);
  }
  if (url.pathname === '/api/admin/settings/rewarded-credits') {
    if (req.method === 'PATCH') {
      if (input.expectedRevision !== rewardedCredits.revision) return json(res, { error: 'Ad reward changed. Refresh and review.' }, 409);
      if (!Number.isSafeInteger(input.credits) || input.credits < 1 || input.credits > 100000) return json(res, { error: 'Use 1 to 100,000 whole credits.' }, 400);
      rewardedCredits = { credits: input.credits, revision: rewardedCredits.revision + 1, source: 'workspace', updatedByName: 'Preview Editor', updatedAt: new Date().toISOString() };
    }
    return json(res, rewardedCredits);
  }
  if (url.pathname === "/api/admin/settings/credits") return json(res,{welcomeCredits:100,revision:1});
  if (url.pathname === "/api/admin/settings/watermark") {
    if (req.method === "PATCH") watermark={...watermark,...input,revision:watermark.revision+1,updatedByName:"Preview Editor",updatedAt:new Date().toISOString()};
    return json(res,watermark);
  }
  const welcomeBackBase = "/api/admin/notifications/welcome-back";
  if (url.pathname === welcomeBackBase) return json(res,{batches:welcomeBackBatches.filter(b=>b.status!=="DRAFT"),deliveryEnabled:true});
  if (url.pathname === `${welcomeBackBase}/preview`) {
    const batch={id:"111111111111111111111111",actorName:"Preview Editor",createdAt:new Date().toISOString(),inactiveDays:input.inactiveDays,amount:input.amount,status:"DRAFT",total:2,granted:0,skipped:0,pending:2,creditsGranted:0,maximumCredits:2*input.amount,
      recipients:[{userId:"222222222222222222222222",name:"Dhruv Sharma",credits:4,lastActiveAt:"2026-10-01T12:00:00Z",status:"PENDING"},{userId:"333333333333333333333333",name:"Meenal Yadav",credits:9,lastActiveAt:"2026-09-25T12:00:00Z",status:"PENDING"}]};
    welcomeBackBatches=[batch];return json(res,{batch});
  }
  if (url.pathname === `${welcomeBackBase}/111111111111111111111111/confirm`) {
    const batch=welcomeBackBatches[0];batch.recipients=batch.recipients.filter(r=>input.userIds.includes(r.userId)).map(r=>({...r,status:"GRANTED",balanceAfter:r.credits+batch.amount}));
    Object.assign(batch,{status:"DONE",granted:batch.recipients.length,skipped:0,pending:0,creditsGranted:batch.recipients.length*batch.amount});
    return json(res,{batch});
  }
  const groupBase = '/api/admin/catalog/groups';
  if (url.pathname === groupBase && req.method === 'GET') return json(res, { groups: styleGroups });
  if (url.pathname === groupBase && req.method === 'POST') {
    const group = { ...input, id: `fixture-group-${++serial}`, updatedAt: new Date().toISOString() };
    styleGroups.push(group); return json(res, { group }, 201);
  }
  if (url.pathname.startsWith(groupBase + '/')) {
    const id = url.pathname.split('/').pop(); const group = styleGroups.find(g => g.id === id);
    if (!group) return json(res, { error: 'Group not found' }, 404);
    if (input.expectedUpdatedAt !== group.updatedAt) return json(res, { error: 'Group changed. Reopen it.' }, 409);
    if (req.method === 'DELETE') { styleGroups = styleGroups.filter(g => g.id !== id); return json(res, { ok: true }); }
    Object.assign(group, input, { id, updatedAt: new Date().toISOString() }); return json(res, { group });
  }
  if (url.pathname === '/api/admin/catalog') return json(res, { styles: catalogueStyles, tagging, collections: [{ id: 'portraits', name: 'Portraits' }], sections: [] });
  if (url.pathname === '/api/admin/catalog/styles/tags' && req.method === 'PATCH') {
    const changes = catalogueStyles.filter(s => input.ids.includes(s.id)).map(s => ({ ...s, tags: [...new Set([...s.tags, ...input.tags])], updatedAt: new Date().toISOString() }));
    if (changes.some(s => s.tags.length > 10)) return json(res, { error: 'Use no more than 10 tags per style.' }, 400);
    catalogueStyles = catalogueStyles.map(s => changes.find(c => c.id === s.id) || s);
    return json(res, { changed: changes.length });
  }
  if (url.pathname.startsWith('/api/admin/catalog/styles/')) {
    const id = url.pathname.split('/').pop(); const style = catalogueStyles.find(s => s.id === id);
    if (!style) return json(res, { error: 'Style not found' }, 404);
    if (req.method === 'PUT') { Object.assign(style, input, { id, updatedAt: new Date().toISOString() }); }
    return json(res, { style });
  }
  const prefix = "/api/admin/notifications";
  if (!url.pathname.startsWith(prefix)) return json(res, { error: "Fixture route not found" }, 404);
  if (!req.headers.authorization) return json(res, { error: "Sign in required" }, 401);
  const parts = url.pathname.slice(prefix.length).split("/").filter(Boolean);
  if (parts.join('/') === 'history/clear-selected' && req.method === 'POST') {
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 500 || input.ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{24}$/i.test(id))) return json(res, { error: 'Select 1–500 valid finished notifications.' }, 400);
    let clearedCount = 0;
    for (const item of campaigns) {
      if (input.ids.includes(item._id) && ['SENT', 'FAILED', 'CANCELLED'].includes(item.status) && !item.historyClearedAt) { item.historyClearedAt = new Date().toISOString(); clearedCount++; }
    }
    return json(res, { ok: true, clearedCount });
  }
  if (!parts.length && req.method === "GET") return json(res, { campaigns: campaigns.filter(item => !item.historyClearedAt), nextCursor: null, deliveryEnabled: process.argv.includes("--enabled") });
  if (!parts.length && req.method === "POST") {
    const campaign = { ...input, _id: (++serial).toString(16).padStart(24, "0"), revision: 0, status: "DRAFT", createdAt: new Date().toISOString(), deepLink: input.relatedStyleId ? `picme://styles/${input.relatedStyleId}` : input.collectionId ? `picme://collections/${input.collectionId}` : "picme://home" };
    campaigns.unshift(campaign); return json(res, { campaign }, 201);
  }
  const campaign = campaigns.find((item) => item._id === parts[0]);
  if (!campaign) return json(res, { error: "Campaign not found" }, 404);
  if (input.expectedRevision !== undefined && input.expectedRevision !== campaign.revision) return json(res, { error: "Campaign changed" }, 409);
  if (parts.length === 1 && req.method === 'DELETE') {
    if (campaign.status !== 'DRAFT' || input.expectedRevision !== campaign.revision) return json(res, { error: 'Draft changed. Refresh before clearing it.' }, 409);
    campaigns.splice(campaigns.indexOf(campaign), 1); return json(res, { ok: true });
  }
  if (parts.length === 1 && req.method === "PATCH") { Object.assign(campaign, input, { revision: campaign.revision + 1 }); return json(res, { campaign }); }
  if (parts[1] === "preview") return json(res, { audience: { scannedDevices: 100, eligibleDevicesInSample: 73, hasMoreDevices: true } });
  if (parts[1] === "stats") return json(res, { stats: { totalRecipients: campaign.status === "SENT" ? 100 : 0, successfulDeliveries: campaign.status === "SENT" ? 92 : 0, failedDeliveries: campaign.status === "SENT" ? 3 : 0, skippedDeliveries: campaign.status === "SENT" ? 5 : 0, pendingDeliveries: 0 } });
  if (parts[1] === "logs") return json(res, { logs: campaign.status === "SENT" ? [{ status: "ACCEPTED", attempts: 1, sentAt: new Date().toISOString() }, { status: "FAILED", attempts: 5, error: "messaging/server-unavailable" }] : [], nextCursor: null });
  if (["send", "schedule", "cancel"].includes(parts[1])) { campaign.status = parts[1] === "cancel" ? "CANCELLED" : "SCHEDULED"; campaign.scheduledAt = input.scheduledAt || new Date().toISOString(); console.log(`Fixture action: ${parts[1]}`); return json(res, { campaign }); }
  return json(res, { campaign });
}).listen(previewPort, "127.0.0.1", () => console.log(`Local fixture: http://127.0.0.1:${previewPort} — no live sends`));
