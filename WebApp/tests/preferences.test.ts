import { describe, expect, it } from 'vitest';
import { normalizePreference, preferenceLabel, preferenceOptions } from '../src/preferences';
import { matchesStylePreference, validStylePreference } from '../../Backend/src/services/styles/stylePreference';

describe('web preference and backend contract', () => {
  it('submits backend-supported values for every selectable preference', () => {
    for (const [value] of preferenceOptions) {
      expect(validStylePreference(value)).toBe(true);
    }
    expect(preferenceOptions.map(([value]) => value)).toEqual(['all', 'female', 'male']);
  });

  it('restores canonical account values and upgrades old browser values without losing the choice', () => {
    for (const [oldValue, accountValue] of [['her', 'female'], ['him', 'male']]) {
      expect(normalizePreference(oldValue)).toBe(accountValue);
      expect(normalizePreference(accountValue)).toBe(accountValue);
      expect(validStylePreference(normalizePreference(oldValue))).toBe(true);
    }
    expect(normalizePreference(undefined)).toBe('all');
  });

  it('filters to the selected audience plus universal styles and keeps friendly labels', () => {
    const styles = [{ genderTag: 'her' }, { genderTag: 'him' }, { genderTag: 'none' }];
    expect(styles.filter(s => matchesStylePreference(s, preferenceOptions[1][0]))).toEqual([styles[0], styles[2]]);
    expect(styles.filter(s => matchesStylePreference(s, preferenceOptions[2][0]))).toEqual([styles[1], styles[2]]);
    expect(styles.filter(s => matchesStylePreference(s, preferenceOptions[0][0]))).toEqual(styles);
    expect(preferenceLabel('female')).toBe('For her');
    expect(preferenceLabel('male')).toBe('For him');
  });
});
