import { audiences, notificationTypes, type CampaignInput } from "./notification.types.js";

const slug = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
export function validateCampaign(input: unknown): CampaignInput {
  const value = input as Record<string, any>;
  const bad = () => { throw new Error("Invalid notification campaign."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const body = typeof value.body === "string" ? value.body.trim() : "";
  if (!title || title.length > 120 || !body || body.length > 500 ||
      !Object.hasOwn(notificationTypes, value.notificationType ?? "") ||
      !audiences.includes(value.targetAudience)) return bad();
  const type = value.notificationType as keyof typeof notificationTypes;
  const conditions = value.targetConditions ?? {};
  const userIds = conditions.userIds ?? [];
  const recentDays = conditions.recentDays ?? 7;
  if (!Array.isArray(userIds) || userIds.length > 1000 || userIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{24}$/i.test(id)) ||
      !Number.isInteger(recentDays) || recentDays < 1 || recentDays > 365 ||
      (value.targetAudience === "SPECIFIC_USERS" && userIds.length === 0)) return bad();
  for (const key of ["relatedStyleId", "collectionId"]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !slug.test(value[key]))) return bad();
  }
  if (value.relatedStyleId && value.collectionId) return bad();
  if (type === "NEW_STYLE" && !value.relatedStyleId) return bad();
  const deepLink = value.relatedStyleId ? `picme://styles/${value.relatedStyleId}` :
    value.collectionId ? `picme://collections/${value.collectionId}` : "picme://home";
  if (value.deepLink !== undefined && value.deepLink !== deepLink) return bad();
  if (value.imageUrl !== undefined) {
    try {
      const url = new URL(value.imageUrl);
      if (typeof value.imageUrl !== "string" || value.imageUrl.length > 1000 || url.protocol !== "https:" || url.username || url.password) return bad();
    } catch { return bad(); }
  }
  const campaign: CampaignInput = { title, body, notificationType: type, category: notificationTypes[type],
    targetAudience: value.targetAudience, targetConditions: { userIds: [...new Set<string>(userIds)], recentDays },
    relatedStyleId: value.relatedStyleId, collectionId: value.collectionId, imageUrl: value.imageUrl, deepLink };
  const { targetConditions: _conditions, targetAudience: _audience, ...payload } = campaign;
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 3200) return bad();
  return campaign;
}

export function validateSchedule(value: unknown, now = Date.now()): Date {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error("Provide a schedule with a timezone.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now || date.getTime() > now + 365 * 86_400_000) {
    throw new Error("Schedule must be within the next year.");
  }
  return date;
}
