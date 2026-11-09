import mongoose, { Schema } from "mongoose";

export const AD_PLACEMENTS = ["generation_continue", "custom_generate", "avatar_saved", "buy_more", "my_generations", "home_see_all", "image_download", "appearance_applied", "timed_navigation"] as const;
export const DEFAULT_AD_SETTINGS = {
  enabled: true, bannersEnabled: true, rewardedEnabled: true,
  minGapSeconds: 90, timedIntervalSeconds: 180,
  placements: Object.fromEntries(AD_PLACEMENTS.map(key => [key, true])) as Record<string, boolean>,
};
const schema = new Schema({
  _id: {type: String, default: "ads"},
  enabled: Boolean, bannersEnabled: Boolean, rewardedEnabled: Boolean,
  minGapSeconds: {type: Number, min: 60, max: 3600},
  timedIntervalSeconds: {type: Number, min: 60, max: 3600},
  placements: Object.fromEntries(AD_PLACEMENTS.map(key => [key, {type: Boolean, required: true}])),
  revision: {type: Number, default: 0, min: 0},
  updatedByName: {type: String, maxlength: 160},
}, {timestamps: true});
export const AdSettings = mongoose.models.AdSettings || mongoose.model("AdSettings", schema);
