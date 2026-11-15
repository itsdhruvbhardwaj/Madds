import type { Preference } from './types';

// Accept the old browser-only values when restoring existing installations.
// API requests and new cached catalogues always use the backend's values.
export function normalizePreference(value: unknown): Preference {
  if (value === 'female' || value === 'her') return 'female';
  if (value === 'male' || value === 'him') return 'male';
  return 'all';
}

export const preferenceOptions: [Preference, string, string][] = [
  ['all', 'For everyone', 'Discover the complete Madds collection'],
  ['female', 'For her', 'Styles for her, plus universal looks'],
  ['male', 'For him', 'Styles for him, plus universal looks'],
];

export const preferenceLabel = (preference: Preference) =>
  preference === 'female' ? 'For her' : preference === 'male' ? 'For him' : 'For everyone';
