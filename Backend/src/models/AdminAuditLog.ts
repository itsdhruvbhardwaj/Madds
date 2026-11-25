import mongoose, { Schema } from "mongoose";

const AdminAuditLogSchema = new Schema(
  {
    adminUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        "ADD_CREDITS",
        "REMOVE_CREDITS",
        "ACCOUNT_DISABLE",
        "ACCOUNT_ENABLE",
        "REFUND_ADJUSTMENT",
      ],
      required: true,
    },
    amount: {
      type: Number,
      default: null,
    },
    reason: {
      type: String,
      default: "",
    },
    referenceId: {
      type: String,
      default: "",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AdminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ adminUserId: 1, createdAt: -1 });

export const AdminAuditLog =
  mongoose.models.AdminAuditLog || mongoose.model("AdminAuditLog", AdminAuditLogSchema);
