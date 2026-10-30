import { setTimeout } from "node:timers/promises";
import { connectToDatabase, disconnectFromDatabase } from "../../config/database.js";
import { getNotificationFirebaseApp } from "../../config/firebase.js";
import { deliveryEnabled } from "./notification.types.js";
import { notificationService } from "./notification.service.js";

// Separate persistent process, never a timer hidden inside the web service.
async function main() {
  if (!deliveryEnabled()) throw new Error("Notification delivery is disabled.");
  getNotificationFirebaseApp();
  if (!await connectToDatabase()) throw new Error("Notification database is not configured.");
  let stopping = false;
  process.once("SIGTERM", () => { stopping = true; });
  process.once("SIGINT", () => { stopping = true; });
  console.log("Notification worker ready.");
  while (!stopping) {
    try { await notificationService.tick(); }
    catch { console.warn("Notification worker iteration deferred."); }
    if (!stopping) await setTimeout(5000);
  }
  await disconnectFromDatabase();
}
void main().catch(() => { console.error("Notification worker startup failed. Check server configuration."); process.exitCode = 1; });
