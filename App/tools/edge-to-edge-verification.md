# Edge-to-edge verification

The app enables edge-to-edge with `WindowCompat.setDecorFitsSystemWindows`.
Versioned themes provide transparent system bars below API 35 and `always`
cutout mode on API 30+. Existing Compose system-bar and display-cutout insets
remain in place.

Verified on 2026-11-03:

- `:app:assembleDebug` and `:app:bundleRelease` passed, including release vital lint.
- The optimized AAB has no references to `Window.setStatusBarColor` or
  `Window.setNavigationBarColor`, and retains no `androidx.activity.EdgeToEdgeApi*`
  classes. Run `python tools/check_edge_to_edge_bundle.py <bundle>` to repeat this check.
- Google Mobile Ads was updated from 23.6.0 to 25.5.0. Its internal `zzx` / `zzw`
  compatibility code still sets cutout modes, including `SHORT_EDGES`. This is a
  remaining third-party source of the Play deprecated-API warning. The checker
  reports cutout field references for manual inspection; a zero exit code does
  **not** certify that every cutout write is free of deprecated constants.
- Visual device verification remains pending: the API 36.1 test emulator stayed
  offline after restarting with software graphics. Do not treat the build checks
  as confirmation of layout on all navigation modes and cutout devices.

The previously uploaded version 5 is unchanged. Play must analyze a newly signed
release with a higher version code; the generated local release bundle is unsigned.
