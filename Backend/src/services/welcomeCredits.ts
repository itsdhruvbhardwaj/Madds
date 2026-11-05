import { AppSettings } from "../models/AppSettings.js";
export const DEFAULT_WELCOME_CREDITS = 100;
export function validWelcomeCredits(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100000;
}
export async function getWelcomeCreditSetting() {
  const setting = await AppSettings.findById("credits").lean();
  if (setting && !validWelcomeCredits(setting.welcomeCredits)) throw new Error("Welcome credits are not configured correctly.");
  return { welcomeCredits: setting?.welcomeCredits ?? DEFAULT_WELCOME_CREDITS, revision: setting?.revision ?? 0,
    updatedByName: setting?.updatedByName || null, updatedAt: setting?.updatedAt || null };
}
export async function getWelcomeCredits(): Promise<number> {
  // No cache: saved Studio changes apply to subsequent account creations on every backend instance.
  return (await getWelcomeCreditSetting()).welcomeCredits;
}
