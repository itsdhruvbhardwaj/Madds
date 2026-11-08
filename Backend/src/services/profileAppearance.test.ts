import { describe, expect, it } from "vitest";
import { appearanceFields } from "./profileAppearance.js";
describe("account setup compatibility", () => {
  it("does not enroll older accounts with missing flags", () => {
    expect(appearanceFields({})).toMatchObject({ profileSetupComplete: true, stylePreferenceSetupComplete: true });
  });
  it("keeps a newly created account pending until it explicitly saves or skips", () => {
    expect(appearanceFields({ profileSetupComplete: false, stylePreferenceSetupComplete: false })).toMatchObject({ profileSetupComplete: false, stylePreferenceSetupComplete: false });
  });
});
