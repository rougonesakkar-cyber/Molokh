import type { PublicAthleteProfile } from '@molokh/contracts';
import { StyleSheet, Text, View } from 'react-native';

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

export interface PublicAthleteProfileCardProps {
  readonly profile: PublicAthleteProfile;
}

export function PublicAthleteProfileCard({ profile }: PublicAthleteProfileCardProps) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" aria-level={2} style={styles.name}>
        {profile.displayName}
      </Text>
      <Text style={styles.muted}>{profile.primarySport}</Text>

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

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderColor: '#e6ded7', borderRadius: 16,
    borderWidth: 1, gap: 12, padding: 16 },
  name: { color: '#241813', fontSize: 22, fontWeight: '700' },
  muted: { color: '#746761', fontSize: 14 },
  privacy: { color: '#746761', fontSize: 12, lineHeight: 18 },
  section: { gap: 4 },
  title: { color: '#5e2018', fontSize: 14, fontWeight: '700' },
  value: { color: '#241813', fontSize: 15 },
});
