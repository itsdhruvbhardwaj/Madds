export const notificationCategories = ["newStyles", "offers", "productUpdates", "reengagement"] as const;
export type NotificationCategory = typeof notificationCategories[number];
export const notificationTypes = { NEW_STYLE: "newStyles", OFFER: "offers", PRODUCT_UPDATE: "productUpdates", REENGAGEMENT: "reengagement" } as const;
export const audiences = ["ALL_USERS", "ACTIVE_USERS", "INACTIVE_7_DAYS", "INACTIVE_14_DAYS", "INACTIVE_30_DAYS", "SPECIFIC_USERS", "USERS_WITHOUT_RECENT_GENERATIONS"] as const;
export type Audience = typeof audiences[number];
export interface CampaignInput {
  title: string; body: string; imageUrl?: string;
  notificationType: keyof typeof notificationTypes;
  category: NotificationCategory;
  targetAudience: Audience;
  targetConditions: { userIds: string[]; recentDays: number };
  relatedStyleId?: string; collectionId?: string; deepLink: string;
}
export const DAY = 86_400_000;
export const deliveryEnabled = () => process.env.NOTIFICATION_DELIVERY_ENABLED === "true";
// Testing default: deliberately ignore existing gate records and HOURS until
// explicitly re-enabled. This does not disable per-delivery idempotency.
export function notificationCooldownHours(): number {
  if (process.env.NOTIFICATION_COOLDOWN_ENABLED !== "true") return 0;
  const hours = Number(process.env.NOTIFICATION_COOLDOWN_HOURS ?? 6);
  return Number.isFinite(hours) ? Math.min(168, Math.max(0, hours)) : 6;
}
