import { createRequire } from 'node:module';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement } = await import('react');
  const tag = (name: string) => ({ children }: { children?: ReactNode }) => createElement(name, null, children);
  return {
    Platform: { OS: 'web' }, useColorScheme: () => 'light',
    StyleSheet: { create: <T>(styles: T): T => styles },
    View: tag('div'), Text: tag('span'), Pressable: tag('button'),
  };
});

import { HomeSection } from './HomeSection';
import { activeSessionCount } from './navigation';

// Reuse the installed renderer without adding test-only dependency types.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: ReactNode) => string;
};

const defaults = {
  coachInviteCount: 0, hostConfirmationCount: 0, matchCount: 1,
  operationalCount: 0, role: 'Athlete', sessionCount: 0, onNavigate: () => {},
};
const home = (overrides: Partial<ComponentProps<typeof HomeSection>> = {}) =>
  renderToStaticMarkup(createElement(HomeSection, { ...defaults, ...overrides }));

describe('Home active Sessions and next action', () => {
  it('does not direct an Athlete back to terminal Sessions or remove their history', () => {
    const sessions = [{ state: 'ENDED' }, { state: 'CANCELLED' }] as const;
    const html = home({ sessionCount: activeSessionCount(sessions) });
    expect(html).toContain('Договориться о тренировке');
    expect(html).not.toContain('Активных Session');
    expect(html).not.toContain('Проверить ближайшую Session');
    expect(sessions).toHaveLength(2);
  });

  it('counts only canonical live states in a mixed historical projection', () => {
    const sessions = [
      { state: 'SCHEDULED' }, { state: 'READY_FOR_COACH' }, { state: 'IN_PROGRESS' },
      { state: 'ENDED' }, { state: 'CANCELLED' },
    ] as const;
    expect(activeSessionCount(sessions)).toBe(3);
    expect(home({ sessionCount: activeSessionCount(sessions) })).toContain('Активных Session: 3.');
  });

  it('retains the existing empty and live-Session next actions', () => {
    expect(home({ matchCount: 0, sessionCount: activeSessionCount([]) })).toContain('Найти партнёра');
    expect(home({ sessionCount: activeSessionCount([{ state: 'SCHEDULED' }]) }))
      .toContain('Проверить ближайшую Session');
  });

  it('preserves higher-priority actions and Coach work after physical Session end', () => {
    expect(home({ hostConfirmationCount: 1, sessionCount: 1 })).toContain('Подтвердить бронирование');
    expect(home({ coachInviteCount: 1, sessionCount: 1 })).toContain('Ответить на приглашение Coach');
    expect(home({ role: 'Coach', operationalCount: 1, sessionCount: activeSessionCount([{ state: 'ENDED' }]) }))
      .toContain('Открыть рабочую очередь');
  });

  it('does not present loading or a failed Session read as a successful zero', () => {
    const loading = home({ sessionCount: null });
    expect(loading).toContain('Загружаем Session');
    expect(loading).not.toContain('Договориться о тренировке');
    expect(loading).not.toContain('Обязательных действий нет');
    const failed = home({ sessionCount: null, sessionReadFailed: true });
    expect(failed).toContain('Session временно недоступны');
    expect(failed).not.toContain('Активных Session: 0');
    expect(failed).not.toContain('Договориться о тренировке');
  });
});
