import { User } from "../models/User.js";
import { Feedback } from "../models/Feedback.js";
export const ENGAGEMENT_WAIT_MS = 7 * 86400000;
export const ENGAGEMENT_MAX_PROMPTS = 2;
export const engagementFields = "engagementPromptCount engagementLastPromptId engagementLastPromptAt engagementNextPromptAt engagementFeedbackAt engagementRatingOpenedAt engagementOptOutAt";
export const validPromptId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export function engagementStopped(user: any) {
  return Boolean(user?.engagementFeedbackAt || user?.engagementRatingOpenedAt || user?.engagementOptOutAt);
}
export function engagementClaimFilter(userId: string, now: Date) {
  return { _id: userId, isActive: { $ne: false }, deletionScheduledAt: null, emailVerified: true,
    profileSetupComplete: { $ne: false }, stylePreferenceSetupComplete: { $ne: false },
    engagementFeedbackAt: null, engagementRatingOpenedAt: null, engagementOptOutAt: null,
    $and: [{ $or: [{ engagementPromptCount: { $lt: ENGAGEMENT_MAX_PROMPTS } }, { engagementPromptCount: { $exists: false } }] },
      { $or: [{ engagementNextPromptAt: null }, { engagementNextPromptAt: { $lte: now } }] }] };
}
export async function claimEngagementPrompt(userId: string, requestId: string, now = new Date()) {
  // Repair older feedback history once on an eligible claim. New submissions set the durable flag before 201.
  if (await Feedback.exists({ userId }).maxTimeMS(5000)) {
    await User.updateOne({ _id: userId }, { $set: { engagementFeedbackAt: now } }, { maxTimeMS: 5000 });
    return { eligible: false, stopped: true };
  }
  const user = await User.findOneAndUpdate({ ...engagementClaimFilter(userId, now), engagementPromptIds: { $ne: requestId } }, {
    $inc: { engagementPromptCount: 1 }, $addToSet: { engagementPromptIds: requestId },
    $set: { engagementLastPromptId: requestId, engagementLastPromptAt: now, engagementNextPromptAt: new Date(now.getTime() + ENGAGEMENT_WAIT_MS) }
  }, { new: true, maxTimeMS: 5000 }).select(engagementFields).lean();
  if (user) return { eligible: true, stopped: false, promptId: requestId, nextPromptAt: user.engagementNextPromptAt };
  const current = await User.findById(userId, engagementFields, { maxTimeMS: 5000 }).lean();
  if (!current) return { eligible: false, stopped: true };
  const stopped = engagementStopped(current);
  // Same-account retry of a lost claim response; only the latest claim can replay, briefly.
  if (!stopped && current.engagementLastPromptId === requestId && current.engagementLastPromptAt &&
      new Date(current.engagementLastPromptAt).getTime() >= now.getTime() - 5 * 60000) {
    return { eligible: true, stopped: false, promptId: requestId, nextPromptAt: current.engagementNextPromptAt };
  }
  return { eligible: false, stopped: stopped || (current.engagementPromptCount || 0) >= ENGAGEMENT_MAX_PROMPTS,
    nextPromptAt: current.engagementNextPromptAt || null };
}
export async function respondToEngagementPrompt(userId: string, promptId: string, action: string, now = new Date()) {
  const permanent = action === "RATE" ? { engagementRatingOpenedAt: now } : action === "OPT_OUT" ? { engagementOptOutAt: now } : null;
  const update = permanent ? { $set: permanent } : { $max: { engagementNextPromptAt: new Date(now.getTime() + ENGAGEMENT_WAIT_MS) } };
  const result = await User.updateOne({ _id: userId, engagementPromptIds: promptId, engagementResponseIds: { $ne: promptId } },
    { ...update, $addToSet: { engagementResponseIds: promptId } }, { maxTimeMS: 5000 });
  return result.matchedCount === 1 || Boolean(await User.exists({ _id: userId, engagementResponseIds: promptId }).maxTimeMS(5000));
}
