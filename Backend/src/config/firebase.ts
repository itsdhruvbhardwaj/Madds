import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const APP_NAME = "madds-notifications";

/** Lazy: an unconfigured notification service must not break unrelated app APIs. */
export function getNotificationFirebaseApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!projectId || !path) throw new Error("Firebase notification credentials are not configured.");

  try {
    const account = JSON.parse(readFileSync(path, "utf8"));
    if (account.type !== "service_account" || account.project_id !== projectId ||
        typeof account.client_email !== "string" ||
        typeof account.private_key !== "string" || !account.private_key.includes("BEGIN PRIVATE KEY")) {
      throw new Error("Invalid service account");
    }
    return initializeApp({ projectId, credential: cert({
      projectId, clientEmail: account.client_email, privateKey: account.private_key,
    }) }, APP_NAME);
  } catch {
    // Do not propagate parser errors, key contents, or filesystem paths to callers.
    throw new Error("Firebase notification credentials could not be loaded.");
  }
}

export function getNotificationMessaging() {
  return getMessaging(getNotificationFirebaseApp());
}
