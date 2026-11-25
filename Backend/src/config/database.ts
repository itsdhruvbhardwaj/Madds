import mongoose from "mongoose";

import { env } from "./env.js";

let connectionAttempt: Promise<typeof mongoose> | null = null;

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!env.mongodbUri) {
    console.error("MONGODB_URI is missing. MongoDB connection disabled.");
    return null;
  }

  if (!connectionAttempt) {
    connectionAttempt = mongoose
      .connect(env.mongodbUri, {
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 10,
        autoIndex: true,
      })
      .then((connectedMongoose) => {
        console.log("MongoDB connected successfully.");
        return connectedMongoose;
      })
      .catch((error: unknown) => {
        connectionAttempt = null;
        const message = error instanceof Error ? error.message : String(error);
        console.error("MongoDB connection error:", message);
        throw error;
      });
  }

  return connectionAttempt;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  connectionAttempt = null;
}
