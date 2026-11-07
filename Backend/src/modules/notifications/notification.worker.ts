import { setTimeout } from "node:timers/promises";
import { connectToDatabase, disconnectFromDatabase } from "../../config/database.js";
import { getNotificationFirebaseApp } from "../../config/firebase.js";
import { deliveryEnabled } from "./notification.types.js";
import { notificationService } from "./notification.service.js";
import { processGenerationNotifications } from "../../services/generationNotifications.js";
import { processWelcomeBackGrants } from "../../services/welcomeBackCredits.js";

// Optional persistent process for hosting that must deliver while the web service sleeps.
async function main() {
  getNotificationFirebaseApp();
  if (!await connectToDatabase()) throw new Error("Notification database is not configured.");
  let stopping = false;
  process.once("SIGTERM", () => { stopping = true; });
  process.once("SIGINT", () => { stopping = true; });
  console.log("Notification worker ready.");
  while (!stopping) {
    try { await processWelcomeBackGrants(); }
    catch { console.warn("Welcome-back credits iteration deferred."); }
    try { if (deliveryEnabled()) await notificationService.tick(); }
    catch { console.warn("Notification worker iteration deferred."); }
    try { await processGenerationNotifications(); }
    catch { console.warn("Generation notification iteration deferred."); }
    if (!stopping) await setTimeout(5000);
  }
  await disconnectFromDatabase();
}
void main().catch(() => { console.error("Notification worker startup failed. Check server configuration."); process.exitCode = 1; });
