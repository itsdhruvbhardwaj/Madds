import mongoose, { Schema } from "mongoose";

const CatalogAuditLogSchema = new Schema(
  {
    actorEmail: { type: String, required: true, lowercase: true, trim: true },
    actorName: { type: String, default: "", trim: true },
    action: { type: String, enum: ["STYLE_CREATED", "STYLE_UPDATED", "STYLE_DELETED", "COLLECTION_CREATED", "COLLECTION_RENAMED", "HOME_SECTION_UPDATED"], required: true },
    itemId: { type: String, required: true },
    itemName: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CatalogAuditLogSchema.index({ createdAt: -1 });

export const CatalogAuditLog =
  mongoose.models.CatalogAuditLog || mongoose.model("CatalogAuditLog", CatalogAuditLogSchema);
