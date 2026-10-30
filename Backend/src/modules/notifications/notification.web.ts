import { getNotificationFirebaseApp } from "../../config/firebase.js";
import { notificationService } from "./notification.service.js";
import { deliveryEnabled } from "./notification.types.js";

/** Free hosting: process durable jobs only while the web service is awake. */
export function startWebNotificationProcessor(): (() => Promise<void>) | undefined {
  if (!deliveryEnabled() || process.env.NOTIFICATION_PROCESSOR_MODE !== "web") return;
  // Fail before claiming jobs if credentials are missing. The caller keeps app APIs up.
  getNotificationFirebaseApp();
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void>;
  const run = async () => {
    try { await notificationService.tick(); }
    catch { console.warn("Web notification processing deferred."); }
    finally {
      if (!stopping) {
        timer = setTimeout(() => { inFlight = run(); }, 5000);
        timer.unref();
      }
    }
  };
  inFlight = run();
  console.log("Web notification processor ready (runs while backend is awake).");
  return async () => {
    stopping = true;
    clearTimeout(timer);
    await inFlight;
  };
}
