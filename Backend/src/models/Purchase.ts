import mongoose, { Schema } from "mongoose";

const PurchaseSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: String,
      required: true,
    },
    purchaseOptionId: {
      type: String,
      default: null,
    },
    purchaseToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    orderId: {
      type: String,
      default: "",
    },
    creditsGranted: {
      type: Number,
      default: 0,
    },
    quantity: { type: Number, default: 1 },
    amount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["pending", "verified", "refunded", "cancelled", "failed"],
      default: "pending",
    },
    purchaseTime: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

PurchaseSchema.index({ userId: 1, createdAt: -1 });

export const Purchase = mongoose.models.Purchase || mongoose.model("Purchase", PurchaseSchema);
