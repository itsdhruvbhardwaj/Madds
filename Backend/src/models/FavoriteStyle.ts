import mongoose, { Schema } from "mongoose";

const FavoriteStyleSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    styleId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

FavoriteStyleSchema.index({ userId: 1, styleId: 1 }, { unique: true });

export const FavoriteStyle =
  mongoose.models.FavoriteStyle || mongoose.model("FavoriteStyle", FavoriteStyleSchema);
