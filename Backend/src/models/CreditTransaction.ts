import mongoose, { Schema } from "mongoose";

const CreditTransactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "INITIAL_GRANT",
        "GENERATION",
        "REWARDED_AD",
        "PURCHASE",
        "REFUND",
        "ADMIN_ADJUSTMENT",
      ],
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    referenceId: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CreditTransactionSchema.index({ userId: 1, createdAt: -1 });
CreditTransactionSchema.index(
  { type: 1, referenceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "REWARDED_AD",
      referenceId: { $type: "string", $gt: "" },
    },
  },
);

export const CreditTransaction =
  mongoose.models.CreditTransaction ||
  mongoose.model("CreditTransaction", CreditTransactionSchema);
