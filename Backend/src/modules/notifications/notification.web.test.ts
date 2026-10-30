import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ firebase: vi.fn(), tick: vi.fn() }));
vi.mock("../../config/firebase.js", () => ({ getNotificationFirebaseApp: mocks.firebase }));
vi.mock("./notification.service.js", () => ({ notificationService: { tick: mocks.tick } }));
import { startWebNotificationProcessor } from "./notification.web.js";

describe("notification processing on free web hosting", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.resetAllMocks();
    vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "true");
    vi.stubEnv("NOTIFICATION_PROCESSOR_MODE", "web");
    mocks.tick.mockResolvedValue(false);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  });
  it.each([
    ["false", "web"], ["true", "worker"], ["true", ""],
  ])("leaves jobs untouched with delivery=%s and mode=%s", (enabled, mode) => {
    vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", enabled);
    vi.stubEnv("NOTIFICATION_PROCESSOR_MODE", mode);
    expect(startWebNotificationProcessor()).toBeUndefined();
    expect(mocks.firebase).not.toHaveBeenCalled(); expect(mocks.tick).not.toHaveBeenCalled();
  });
  it("validates credentials before claiming any jobs", () => {
    mocks.firebase.mockImplementation(() => { throw new Error("Not configured"); });
    expect(() => startWebNotificationProcessor()).toThrow("Not configured");
    expect(mocks.tick).not.toHaveBeenCalled();
  });
  it("does not overlap slow batches and waits for the batch on shutdown", async () => {
    let finish!: () => void;
    mocks.tick.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const stop = startWebNotificationProcessor()!;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.tick).toHaveBeenCalledTimes(1);
    let stopped = false;
    const shutdown = stop().then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false);
    finish(); await shutdown;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.tick).toHaveBeenCalledTimes(1);
  });
  it("recovers from a transient failure and cancels polling on shutdown", async () => {
    mocks.tick.mockRejectedValueOnce(new Error("Database unavailable"));
    const stop = startWebNotificationProcessor()!;
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.tick).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith("Web notification processing deferred.");
    await stop(); await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.tick).toHaveBeenCalledTimes(2);
  });
});
