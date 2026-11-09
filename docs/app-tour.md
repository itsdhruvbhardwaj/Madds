# Guided app tour

New email and Google accounts are explicitly enrolled with `appTourVersionSeen:0`
in the existing account creation transaction. Existing accounts (including those
missing the field) are treated as version 1 already seen. No migration enrolls
existing users. Tour completion and Skip both persist version 1 on the account
through authenticated `POST /api/profile/app-tour`, with `$max` and a bounded DB
operation. User IDs cannot be supplied to modify another account.

Android starts on a loaded Home after avatar and preference setup. A seven-step
spotlight highlights a real style, See All, the action dock, Explore, Collections,
Favourites, and Profile. The tab steps highlight their real navigation icons
without changing screens or triggering ads. The
tooltip uses the exact shared `actionGlass` modifier as the dock: 36dp Haze blur,
neutral white/black tints, noise, gradient highlights and translucent border.
Target geometry is measured at runtime; the tooltip chooses above/below placement
and scrolls on small displays or large fonts. Missing targets skip automatically.
Home and the first style row scroll to the beginning for replay.

Next advances; Skip and Android Back finish the tour. A per-account local receipt
prevents repeat display offline, while pending completion sync retries once per
foreground minute and survives process death. An old cached profile cannot undo
the local receipt. Account changes use a separate receipt and authenticated
repository ownership checks. No image generation, credits or real ads are needed.

Profile → Replay app tour is available to existing users. While the tour is
pending/visible, automatic/event ads and engagement prompts pause. The dock stays
visible and expanded, then returns to its previous expansion state. Banners are
hidden while the tour is visible. Updated backend and Android are both required;
old app versions ignore the new profile field.
