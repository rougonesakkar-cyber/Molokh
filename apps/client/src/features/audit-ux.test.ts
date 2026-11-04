import type { PublicAthleteProfile } from '@molokh/contracts';
import { createElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  ...require('react-native-web'),
  useColorScheme: () => 'light',
}));

import { DiscoverySection } from './discovery/DiscoverySection';
import { IntegrityCaseSection } from './integrity-case/IntegrityCaseSection';
import { PublicAthleteProfileCard } from './public-profile/PublicAthleteProfileCard';
import { ChoiceGroup } from '../ui/ChoiceGroup';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: ReactElement) => string;
};

function renderChats(chatLoadState: 'loading' | 'ready' | 'error', canDiscover: boolean) {
  const props = {
    actingCandidateId: null, actingAction: null, actingRelationshipId: null,
    blockedUsers: [], cards: [], matches: [], notice: null,
    onAction: vi.fn(), onBlock: vi.fn(), onOpenChat: vi.fn(), onOpenProfile: vi.fn(),
    onRefresh: vi.fn(), onUnblock: vi.fn(), onUnmatch: vi.fn(),
    showDiscovery: false, chatLoadState, onFindPartner: canDiscover ? vi.fn() : undefined,
  };
  return renderToStaticMarkup(createElement(DiscoverySection, props));
}

describe('audited client states', () => {
  it('only shows the empty chat state on success and offers Discovery only when available', () => {
    const empty = renderChats('ready', true);
    expect(empty).toContain('Чатов пока нет');
    expect(empty).toContain('после взаимного интереса');
    expect(empty).toContain('Найти партнёра');
    expect(renderChats('ready', false)).not.toContain('Найти партнёра');

    const loading = renderChats('loading', true);
    expect(loading).toContain('Загружаем чаты');
    expect(loading).not.toContain('Чатов пока нет');
    const error = renderChats('error', true);
    expect(error).toContain('Не удалось загрузить чаты');
    expect(error).toContain('Повторить');
    expect(error).not.toContain('Чатов пока нет');
    expect(error).not.toContain('Найти партнёра');
  });

  it('renders a neutral message for each empty profile section independently', () => {
    const profile: PublicAthleteProfile = {
      userId: 'athlete', displayName: 'Athlete', ageDivision: 'ADULT',
      primarySport: 'BOXING', secondarySport: null, selectedCompetitionScope: null,
      competitionScopes: [], currentStatuses: [], statusHistory: [],
      officialRecord: { wins: 0, losses: 0, draws: 0 }, recentOfficialResults: [],
      completedTrainingCount: 0,
    };
    const empty = renderToStaticMarkup(createElement(PublicAthleteProfileCard, { profile }));
    expect(empty).toContain('Официальных результатов пока нет.');
    expect(empty).toContain('Истории статусов пока нет.');

    const withResult = renderToStaticMarkup(createElement(PublicAthleteProfileCard, {
      profile: {
        ...profile, recentOfficialResults: [{
          resultId: 'result', competitionId: 'competition', outcome: 'DRAW', publicMethod: null,
          reviewState: null, occurredAt: '2026-10-01T10:00:00Z',
        }],
      },
    }));
    expect(withResult).toContain('Ничья');
    expect(withResult).not.toContain('Официальных результатов пока нет.');
    expect(withResult).toContain('Истории статусов пока нет.');
  });

  it('exposes the default case type as pressed and leaves explicit submission disabled', () => {
    const markup = renderToStaticMarkup(createElement(IntegrityCaseSection, {
      cases: [], central: true, token: 'test', onUpdated: vi.fn(),
    }));
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(markup).toMatch(/<[^>]+aria-pressed="true"[^>]*><[^>]*>Проверка системной ошибки/);
    expect(markup).toMatch(/<[^>]+aria-disabled="true"[^>]*><[^>]*>Открыть IntegrityCase/);
  });

  it('keeps a disabled choice selected and takes all disabled choices out of the tab order', () => {
    const markup = renderToStaticMarkup(createElement(ChoiceGroup, {
      label: 'Тип тренировки',
      options: [['SLOT', 'Персональная'], ['GROUP', 'Групповая']],
      value: 'SLOT',
      disabled: true,
      onChange: vi.fn(),
    }));
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(markup).toMatch(/<[^>]+aria-pressed="true"[^>]*><[^>]*>Персональная/);
  });
});
