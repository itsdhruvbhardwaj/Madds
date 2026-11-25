import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const { prepareDelivery, buildDraft } = createRequire(import.meta.url)("../../../../Admin-Portal/notifications.js");
const campaign = { _id: "draft", status: "DRAFT", revision: 3, title: "Hi {firstName}" };
const audience = { eligibleDevicesInSample: 1, scannedDevices: 1 };
describe("streamlined Studio notification review", () => {
  it("saves a new notification and checks its audience without sending anything", async () => {
    const api = vi.fn().mockResolvedValueOnce({ campaign }).mockResolvedValueOnce({ preview: { title: "Hi Gov" }, audience });
    const saved = vi.fn();
    const result = await prepareDelivery({ api, base: "/push", selected: null, draft: { title: campaign.title }, dirty: true, previewName: "Gov", onSaved: saved });
    expect(api.mock.calls[0][0]).toBe("/push"); expect(api.mock.calls[0][1].method).toBe("POST");
    expect(api.mock.calls[1][0]).toBe("/push/draft/preview");
    expect(saved).toHaveBeenCalledWith(campaign); expect(result.audience).toEqual(audience);
    expect(api.mock.calls.some(([path]) => path.endsWith("/send"))).toBe(false);
  });
  it("saves edited content using the reviewed revision before checking audience", async () => {
    const api = vi.fn().mockResolvedValueOnce({ campaign: { ...campaign, revision: 4 } }).mockResolvedValueOnce({ audience });
    await prepareDelivery({ api, base: "/push", selected: campaign, draft: { title: "Edited" }, dirty: true, onSaved: vi.fn() });
    expect(api.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ title: "Edited", expectedRevision: 3 });
  });
  it("does not resave unchanged content and rejects another administrator's revision", async () => {
    const api = vi.fn().mockResolvedValue({ campaign: { ...campaign, revision: 4 } });
    await expect(prepareDelivery({ api, base: "/push", selected: campaign, dirty: false, onSaved: vi.fn() })).rejects.toThrow("changed");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("keeps a successfully saved draft when audience checking fails", async () => {
    const api = vi.fn().mockResolvedValueOnce({ campaign }).mockRejectedValueOnce(new Error("Offline"));
    const saved = vi.fn();
    await expect(prepareDelivery({ api, base: "/push", dirty: true, onSaved: saved })).rejects.toThrow("Offline");
    expect(saved).toHaveBeenCalledWith(campaign);
  });
  it("ignores a response from a previous signed-in Studio session", async () => {
    const api = vi.fn().mockResolvedValue({ campaign }); const saved = vi.fn();
    expect(await prepareDelivery({ api, base: "/push", dirty: true, onSaved: saved, isCurrent: () => false })).toBeNull();
    expect(saved).not.toHaveBeenCalled(); expect(api).toHaveBeenCalledTimes(1);
  });
});

describe("Studio version targeting", () => {
  const form = { title: "Update Madds", body: "Get the new version", notificationType: "APP_UPDATE", targetAudience: "OLDER_APP_VERSION",
    minimumVersionCode: "10", recentDays: "7", userIds: "", imageUrl: "", destination: "update" };
  it("saves the release threshold numerically without leaking an old style destination", () => {
    const draft = buildDraft({...form, destination: "style", styleId: "portrait"});
    expect(draft.targetConditions.minimumVersionCode).toBe(10);
    expect(draft.relatedStyleId).toBeUndefined();
  });
  it("requires a release code for older devices", () => {
    expect(() => buildDraft({...form, minimumVersionCode: ""})).toThrow("version code");
  });
  it("explains why legacy unknown devices need a regular notification", () => {
    expect(() => buildDraft({...form, targetAudience: "UNKNOWN_APP_VERSION"})).toThrow("Older builds");
    expect(buildDraft({...form, notificationType: "PRODUCT_UPDATE", targetAudience: "UNKNOWN_APP_VERSION", destination: "home"}).targetConditions.minimumVersionCode).toBeUndefined();
  });
});
