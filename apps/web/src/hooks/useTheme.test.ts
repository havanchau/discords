import { describe, expect, it } from 'vitest';
import { migrateStoredTheme, resolveTheme } from './useTheme';

describe('migrateStoredTheme', () => {
  it('keeps a value the current system supports', () => {
    expect(migrateStoredTheme('light')).toBe('light');
    expect(migrateStoredTheme('dark')).toBe('dark');
    expect(migrateStoredTheme('system')).toBe('system');
  });

  it('maps every retired dark variant to dark', () => {
    expect(migrateStoredTheme('midnight')).toBe('dark');
    expect(migrateStoredTheme('slate')).toBe('dark');
    expect(migrateStoredTheme('oled')).toBe('dark');
  });

  it('falls back to system for an absent or unrecognised value', () => {
    expect(migrateStoredTheme(null)).toBe('system');
    expect(migrateStoredTheme('')).toBe('system');
    expect(migrateStoredTheme('neon')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('returns an explicit choice regardless of the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system preference when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
