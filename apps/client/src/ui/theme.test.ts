import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ useColorScheme: () => 'light' }));

import { contrastRatio, darkTheme, lightTheme } from './theme';

describe('semantic client theme', () => {
  it('keeps light and dark token contracts aligned', () => {
    expect(Object.keys(darkTheme.colors).sort()).toEqual(Object.keys(lightTheme.colors).sort());
    expect(lightTheme.touchTarget).toBe(48);
    expect(darkTheme.touchTarget).toBe(48);
  });

  it.each([lightTheme, darkTheme])('meets body text contrast in both themes', (theme) => {
    expect(contrastRatio(theme.colors.text, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.colors.textSecondary, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.colors.textMuted, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
