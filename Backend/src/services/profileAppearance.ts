export type AppearanceFields = {
  profileAppearance?: string;
  avatarId?: string | null;
  avatarBackground?: string | null;
  profileSetupComplete?: boolean;
};

export function appearanceFields(user: AppearanceFields) {
  return {
    profileAppearance: user.profileAppearance ?? "photo",
    avatarId: user.avatarId ?? null,
    avatarBackground: user.avatarBackground ?? "gold",
    // Existing accounts without this field retain their current appearance.
    profileSetupComplete: user.profileSetupComplete !== false,
  };
}
