import mongoose, { Schema } from "mongoose";
const schema = new Schema({ userId: { type: Schema.Types.ObjectId, required: true }, requestId: { type: String, required: true },
  category: String, message: String, contactEmail: String, appVersion: String, androidVersion: String,
  status: { type: String, enum: ["NEW", "IN_REVIEW", "RESOLVED"], default: "NEW" } }, { timestamps: true });
schema.index({ userId: 1, requestId: 1 }, { unique: true }); schema.index({ createdAt: -1 });
export const Feedback = mongoose.models.Feedback || mongoose.model("Feedback", schema);
