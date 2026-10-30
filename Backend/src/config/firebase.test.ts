import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readFileSync: vi.fn(), cert: vi.fn(), getApps: vi.fn(), initializeApp: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: mocks.readFileSync }));
vi.mock("firebase-admin/app", () => ({ cert: mocks.cert, getApps: mocks.getApps, initializeApp: mocks.initializeApp }));
vi.mock("firebase-admin/messaging", () => ({ getMessaging: vi.fn() }));
import { getNotificationFirebaseApp } from "./firebase.js";

describe("notification Firebase configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getApps.mockReturnValue([]);
    vi.stubEnv("FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_PATH", "/private/key.json");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires explicit notification credentials rather than using billing ADC", () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_PATH", "");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "/billing/key.json");
    expect(() => getNotificationFirebaseApp()).toThrow("not configured");
    expect(mocks.readFileSync).not.toHaveBeenCalled();
  });
  it("rejects a key from another project", () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({ type: "service_account", project_id: "wrong-project" }));
    expect(() => getNotificationFirebaseApp()).toThrow("could not be loaded");
    expect(mocks.cert).not.toHaveBeenCalled();
  });
  it("does not expose file errors or key contents", () => {
    mocks.readFileSync.mockImplementation(() => { throw new Error("secret private key and path"); });
    expect(() => getNotificationFirebaseApp()).toThrow(/^Firebase notification credentials could not be loaded\.$/);
  });
  it("initializes a separate named application and reuses it", () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({ type: "service_account", project_id: "test-project",
      client_email: "test@example.com", private_key: "-----BEGIN PRIVATE KEY-----test" }));
    const app = { name: "madds-notifications" };
    mocks.initializeApp.mockReturnValue(app);
    expect(getNotificationFirebaseApp()).toBe(app);
    expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: "test-project" }), "madds-notifications");
    mocks.getApps.mockReturnValue([app]);
    expect(getNotificationFirebaseApp()).toBe(app);
    expect(mocks.readFileSync).toHaveBeenCalledTimes(1);
  });
});
