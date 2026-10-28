import type { PublicAthleteProfile } from '@molokh/contracts';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { sportOptions } from '../../lib/sports';
import { type AppTheme, useAppTheme } from '../../ui/theme';

type PublicResult = PublicAthleteProfile['recentOfficialResults'][number];
type PublicReviewState = PublicResult['reviewState'];

export const PUBLIC_PROFILE_COPY = {
  officialRecord: 'Официальные результаты',
  completedTraining: 'Завершённые тренировки',
  recentResults: 'Последние официальные результаты',
  statusHistory: 'История статусов',
  privacy: 'Обычные партнёры по тренировкам и внутренние причины не публикуются.',
  reviewPending: 'на проверке',
  reviewed: 'пересмотрено',
  selectedScope: 'Выбранный соревновательный контур',
  scopedStatistics: 'Статус и результаты показаны только для выбранного контура. Глобального рейтинга нет.',
} as const;

export function publicReviewLabel(reviewState: PublicReviewState): string {
  if (reviewState === 'PENDING') return PUBLIC_PROFILE_COPY.reviewPending;
  if (reviewState === 'REVIEWED') return PUBLIC_PROFILE_COPY.reviewed;
  return '';
}

export function publicResultLabel(result: PublicResult): string {
  const outcome = {
    WIN: 'Победа',
    LOSS: 'Поражение',
    DRAW: 'Ничья',
    NO_CONTEST: 'Без результата',
  }[result.outcome];
  const method = result.publicMethod === 'FORFEIT'
    ? 'административное завершение'
    : result.publicMethod === 'NO_SHOW'
      ? 'неявка'
      : null;
  return [outcome, method, publicReviewLabel(result.reviewState)].filter(Boolean).join(' · ');
}

export function publicSportLabel(code: string): string {
  return sportOptions.find((sport) => sport.code === code)?.label ?? 'Другой вид спорта';
}

export function publicAgeLabel(ageDivision: PublicAthleteProfile['ageDivision']): string {
  return ageDivision === 'YOUTH' ? 'Youth · 14–17 лет' : 'Взрослый контур';
}

export interface PublicAthleteProfileCardProps {
  readonly profile: PublicAthleteProfile;
}

export function PublicAthleteProfileCard({ profile }: PublicAthleteProfileCardProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" aria-level={2} style={styles.name}>
        {profile.displayName}
      </Text>
      <Text style={styles.muted}>
        {publicSportLabel(profile.primarySport)}
        {profile.secondarySport ? ` · ${publicSportLabel(profile.secondarySport)}` : ''}
        {' · '}{publicAgeLabel(profile.ageDivision)}
      </Text>

      {profile.selectedCompetitionScope ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" aria-level={3} style={styles.title}>
            {PUBLIC_PROFILE_COPY.selectedScope}
          </Text>
          <Text style={styles.value}>
            {profile.selectedCompetitionScope.communityName}
            {' · '}{publicAgeLabel(profile.selectedCompetitionScope.ageDivision)}
            {profile.selectedCompetitionScope.disciplineKey
              ? ` · ${publicSportLabel(profile.selectedCompetitionScope.disciplineKey)}`
              : ''}
            {profile.selectedCompetitionScope.primaryForHomeDiscovery ? ' · основное сообщество' : ''}
          </Text>
          <Text style={styles.muted}>{PUBLIC_PROFILE_COPY.scopedStatistics}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text accessibilityRole="header" aria-level={3} style={styles.title}>
          Текущий статус
        </Text>
        {profile.currentStatuses.length === 0 ? (
          <Text style={styles.muted}>Без соревновательного статуса</Text>
        ) : profile.currentStatuses.map((status) => (
          <Text key={`${status.competitionId}:${status.status}`} style={styles.value}>
            {status.status === 'CHAMPION' ? 'Чемпион' : 'Претендент'}
            {status.reviewState ? ` · ${publicReviewLabel(status.reviewState)}` : ''}
          </Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" aria-level={3} style={styles.title}>
          {PUBLIC_PROFILE_COPY.officialRecord}
        </Text>
        <Text style={styles.value}>
          {profile.officialRecord.wins} В · {profile.officialRecord.losses} П · {profile.officialRecord.draws} Н
        </Text>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" aria-level={3} style={styles.title}>
          {PUBLIC_PROFILE_COPY.recentResults}
        </Text>
        {profile.recentOfficialResults.map((result) => (
          <Text key={result.resultId} style={styles.value}>
            {publicResultLabel(result)} · {new Date(result.occurredAt).toLocaleDateString('ru-RU')}
          </Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" aria-level={3} style={styles.title}>
          {PUBLIC_PROFILE_COPY.statusHistory}
        </Text>
        {profile.statusHistory.map((tenure) => (
          <Text key={tenure.tenureId} style={styles.value}>
            {tenure.status === 'CHAMPION' ? 'Чемпион' : 'Претендент'}
            {tenure.endedAt === null ? ' · сейчас' : ' · завершён'}
            {tenure.reviewState ? ` · ${publicReviewLabel(tenure.reviewState)}` : ''}
          </Text>
        ))}
      </View>

      <Text style={styles.value}>
        {PUBLIC_PROFILE_COPY.completedTraining}: {profile.completedTrainingCount}
      </Text>
      <Text style={styles.privacy}>{PUBLIC_PROFILE_COPY.privacy}</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 16,
    borderWidth: 1, gap: 12, padding: 16 },
  name: { color: theme.colors.text, fontSize: 22, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: 14 },
  privacy: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  section: { gap: 4 },
  title: { color: theme.colors.primary, fontSize: 14, fontWeight: '700' },
  value: { color: theme.colors.text, fontSize: 15 },
  });
}
