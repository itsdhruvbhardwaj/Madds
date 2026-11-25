export type StylePreference = "all" | "male" | "female";
export function validStylePreference(value: unknown): value is StylePreference {
  return value === "all" || value === "male" || value === "female";
}
export function matchesStylePreference(style: { genderTag?: string | null }, preference: string) {
  return preference === "all" || !style.genderTag || style.genderTag === "none" ||
    style.genderTag === (preference === "male" ? "him" : "her");
}
