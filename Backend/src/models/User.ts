import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    profileImagePublicId: { type: String, default: "" },
    profileImageCleanupIds: { type: [String], default: [] },
    profileAppearance: { type: String, enum: ["photo", "avatar", "default"], default: "photo" },
    avatarId: { type: String, default: null },
    avatarBackground: { type: String, default: "gold" },
    profileSetupComplete: { type: Boolean, default: true },
    lastActiveAt: { type: Date, default: null, index: true },
    notificationPreferences: {
      newStyles: { type: Boolean, default: false },
      offers: { type: Boolean, default: false },
      productUpdates: { type: Boolean, default: false },
      reengagement: { type: Boolean, default: false },
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    credits: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deletionScheduledAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletionCleanupStartedAt: {
      type: Date,
      default: null,
    },
    authVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
