import type {
  MissingResultReviewCommandResponse,
  MissingResultReviewListResponse,
} from '@molokh/contracts';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';

type Review = MissingResultReviewListResponse['data'][number];
type ClaimOutcome = 'WIN_A' | 'WIN_B' | 'DRAW' | 'NO_CONTEST';

interface Props {
  readonly reviews: readonly Review[];
  readonly token: string;
  readonly onUpdated: (review: Review) => void;
}

const stateLabels: Record<Review['state'], string> = {
  OPEN: 'Собираем факты',
  UNDER_REVIEW: 'Central рассматривает',
  REVIEWER_ASSIGNED: 'Назначен независимый Coach',
  RESOLVED: 'Закрыто',
  REPEAT_ORDERED: 'Назначен повтор',
};

function outcomeLabel(review: Review, outcome: ClaimOutcome): string {
  if (outcome === 'WIN_A') return `Победил: ${review.participantDisplayNames[0]}`;
  if (outcome === 'WIN_B') return `Победил: ${review.participantDisplayNames[1]}`;
  if (outcome === 'DRAW') return 'Ничья';
  return 'Результат определить нельзя';
}

function ReviewCard({ review, token, onUpdated }: {
  readonly review: Review;
  readonly token: string;
  readonly onUpdated: (review: Review) => void;
}) {
  const [claim, setClaim] = useState<ClaimOutcome>('DRAW');
  const [statement, setStatement] = useState('');
  const [venueNote, setVenueNote] = useState('');
  const [centralReason, setCentralReason] = useState('');
  const [selectedCoachId, setSelectedCoachId] = useState(
    review.reviewerCoachOptions[0]?.userId ?? '',
  );
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = async (path: string, body: Record<string, unknown>, action: string) => {
    if (acting !== null) return;
    setActing(action);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `ui:${action}:${review.reviewId}:v${review.version}`,
          'If-Match': String(review.version),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as MissingResultReviewCommandResponse;
      onUpdated(result.data);
      setStatement('');
      setVenueNote('');
      setCentralReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить разбирательство');
    } finally {
      setActing(null);
    }
  };

  const disabled = acting !== null;
  const assignmentOutcome = review.allowedOutcomeCode
    ? outcomeLabel(review, review.allowedOutcomeCode)
    : null;
  return (
    <View style={styles.reviewCard}>
      <View style={styles.row}>
        <Text style={styles.title}>{review.participantDisplayNames.join(' + ')}</Text>
        <Text style={styles.state}>{stateLabels[review.state]}</Text>
      </View>
      <Text style={styles.meta}>{review.venueDisplayName}</Text>
      <Text style={styles.hint}>
        Исходный Coach: {review.originalCoachDisplayName}. Central координирует проверку,
        но не выбирает победителя и не записывает Result.
      </Text>

      {review.statements.map((item) => (
        <View key={item.statementId} style={styles.factCard}>
          <Text style={styles.factTitle}>{item.athleteDisplayName}</Text>
          <Text style={styles.value}>{outcomeLabel(review, item.outcomeCode)}</Text>
          <Text style={styles.hint}>{item.statement}</Text>
        </View>
      ))}
      {review.venueConfirmation ? (
        <View style={styles.factCard}>
          <Text style={styles.factTitle}>Подтверждение зала</Text>
          <Text style={styles.value}>
            {review.venueConfirmation.attendanceConfirmed
              ? 'Оба участника присутствовали' : 'Зал не подтверждает присутствие обоих'}
          </Text>
          <Text style={styles.hint}>{review.venueConfirmation.note}</Text>
        </View>
      ) : null}

      {review.viewerCanSubmitStatement ? (
        <View style={styles.actionGroup}>
          <Text style={styles.label}>Что произошло?</Text>
          <View style={styles.options}>
            {(['WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST'] as const).map((outcome) => (
              <Pressable
                key={outcome}
                accessibilityRole="button"
                accessibilityState={{ disabled, selected: claim === outcome }}
                disabled={disabled}
                onPress={() => setClaim(outcome)}
                style={[styles.option, claim === outcome && styles.optionSelected]}
              >
                <Text style={[styles.optionText, claim === outcome && styles.optionTextSelected]}>
                  {outcomeLabel(review, outcome)}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Описание результата Session"
            maxLength={2000}
            multiline
            onChangeText={setStatement}
            placeholder="Кратко опишите факты"
            style={styles.input}
            value={statement}
          />
          <ActionButton
            disabled={disabled || statement.trim().length === 0}
            loading={acting === 'statement'}
            label="Отправить свою версию"
            onPress={() => execute(
              `/api/v1/missing-result-reviews/${review.reviewId}/statements`,
              { outcomeCode: claim, statement: statement.trim() },
              'statement',
            )}
          />
          <Text style={styles.hint}>Версия второго спортсмена станет видна после ответа обеих сторон.</Text>
        </View>
      ) : null}

      {review.viewerCanConfirmVenue ? (
        <View style={styles.actionGroup}>
          <Text style={styles.label}>Подтверждение зала</Text>
          <TextInput
            accessibilityLabel="Комментарий зала"
            maxLength={2000}
            multiline
            onChangeText={setVenueNote}
            placeholder="Что подтверждает журнал или администратор?"
            style={styles.input}
            value={venueNote}
          />
          <View style={styles.options}>
            <ActionButton
              disabled={disabled || venueNote.trim().length === 0}
              loading={acting === 'venue-yes'}
              label="Оба присутствовали"
              onPress={() => execute(
                `/api/v1/missing-result-reviews/${review.reviewId}/venue-confirmation`,
                { attendanceConfirmed: true, note: venueNote.trim() },
                'venue-yes',
              )}
            />
            <ActionButton
              disabled={disabled || venueNote.trim().length === 0}
              loading={acting === 'venue-no'}
              label="Не подтверждаем"
              secondary
              onPress={() => execute(
                `/api/v1/missing-result-reviews/${review.reviewId}/venue-confirmation`,
                { attendanceConfirmed: false, note: venueNote.trim() },
                'venue-no',
              )}
            />
          </View>
        </View>
      ) : null}

      {review.viewerCanStartReview ? (
        <ActionButton
          disabled={disabled}
          loading={acting === 'start'}
          label="Взять в рассмотрение"
          onPress={() => execute(
            `/api/v1/central/missing-result-reviews/${review.reviewId}/start-review`,
            {},
            'start',
          )}
        />
      ) : null}

      {review.viewerCanAssignCoach || review.viewerCanOrderRepeat ? (
        <View style={styles.actionGroup}>
          <Text style={styles.label}>Следующее прозрачное действие</Text>
          <TextInput
            accessibilityLabel="Обоснование решения по отсутствующему результату"
            maxLength={2000}
            multiline
            onChangeText={setCentralReason}
            placeholder="Зафиксируйте проверенные факты и основание"
            style={styles.input}
            value={centralReason}
          />
          {review.viewerCanAssignCoach && review.reviewerCoachOptions.length > 0 ? (
            <>
              <View style={styles.options}>
                {review.reviewerCoachOptions.map((coach) => (
                  <Pressable
                    key={coach.userId}
                    accessibilityRole="button"
                    accessibilityState={{ disabled, selected: selectedCoachId === coach.userId }}
                    disabled={disabled}
                    onPress={() => setSelectedCoachId(coach.userId)}
                    style={[styles.option, selectedCoachId === coach.userId && styles.optionSelected]}
                  >
                    <Text style={[styles.optionText,
                      selectedCoachId === coach.userId && styles.optionTextSelected]}>
                      {coach.displayName}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <ActionButton
                disabled={disabled || !selectedCoachId || centralReason.trim().length === 0}
                loading={acting === 'assign'}
                label="Назначить независимого Coach"
                onPress={() => execute(
                  `/api/v1/central/missing-result-reviews/${review.reviewId}/assign-coach`,
                  {
                    reviewerCoachUserId: selectedCoachId,
                    repeatObjectivelyImpossible: false,
                    reason: centralReason.trim(),
                  },
                  'assign',
                )}
              />
              <ActionButton
                disabled={disabled || !selectedCoachId || centralReason.trim().length === 0}
                loading={acting === 'assign-no-contest'}
                label="Повтор невозможен — только NO CONTEST"
                secondary
                onPress={() => execute(
                  `/api/v1/central/missing-result-reviews/${review.reviewId}/assign-coach`,
                  {
                    reviewerCoachUserId: selectedCoachId,
                    repeatObjectivelyImpossible: true,
                    reason: centralReason.trim(),
                  },
                  'assign-no-contest',
                )}
              />
            </>
          ) : null}
          {review.viewerCanOrderRepeat ? (
            <ActionButton
              disabled={disabled || centralReason.trim().length === 0}
              loading={acting === 'repeat'}
              label="Назначить повтор без вины участников"
              secondary
              onPress={() => execute(
                `/api/v1/central/missing-result-reviews/${review.reviewId}/order-repeat`,
                { reason: centralReason.trim() },
                'repeat',
              )}
            />
          ) : null}
        </View>
      ) : null}

      {review.state === 'REVIEWER_ASSIGNED' ? (
        <View style={styles.factCard}>
          <Text style={styles.factTitle}>Результат фиксирует Coach</Text>
          <Text style={styles.value}>{review.assignedReviewerCoachDisplayName}</Text>
          <Text style={styles.hint}>
            Допустимый исход: {assignmentOutcome}. Он появится у назначенного Coach в Sessions.
          </Text>
        </View>
      ) : null}
      {review.resolutionReason ? <Text style={styles.hint}>{review.resolutionReason}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function ActionButton({ disabled, label, loading, onPress, secondary = false }: {
  readonly disabled: boolean;
  readonly label: string;
  readonly loading: boolean;
  readonly onPress: () => void;
  readonly secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? '#8b2f22' : '#ffffff'} /> : (
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function MissingResultReviewSection({ reviews, token, onUpdated }: Props) {
  if (reviews.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>
        Результат требует подтверждения
      </Text>
      <Text style={styles.hint}>
        Session состоялась, но Coach не записал Result за 24 часа. Каждая роль видит только своё действие.
      </Text>
      {reviews.map((review) => (
        <ReviewCard key={`${review.reviewId}:${review.version}`} review={review} token={token} onUpdated={onUpdated} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#fffaf4', borderColor: '#eadacb', borderRadius: 18,
    borderWidth: 1, gap: 14, padding: 18 },
  sectionTitle: { color: '#2d211b', fontSize: 20, fontWeight: '800' },
  reviewCard: { backgroundColor: '#ffffff', borderColor: '#eadacb', borderRadius: 14,
    borderWidth: 1, gap: 10, padding: 14 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  title: { color: '#2d211b', flex: 1, fontSize: 16, fontWeight: '800' },
  state: { backgroundColor: '#f3e8dc', borderRadius: 999, color: '#7d3c2c', fontSize: 12,
    fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  meta: { color: '#6d5147', fontSize: 14, fontWeight: '700' },
  hint: { color: '#786a63', fontSize: 13, lineHeight: 19 },
  value: { color: '#342822', fontSize: 14, lineHeight: 20 },
  factCard: { backgroundColor: '#faf5ef', borderRadius: 10, gap: 4, padding: 10 },
  factTitle: { color: '#5c3127', fontSize: 13, fontWeight: '800' },
  actionGroup: { borderTopColor: '#eee2d8', borderTopWidth: 1, gap: 9, paddingTop: 11 },
  label: { color: '#3a2922', fontSize: 14, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderColor: '#d9c3b3', borderRadius: 999, borderWidth: 1, paddingHorizontal: 11,
    paddingVertical: 8 },
  optionSelected: { backgroundColor: '#8b2f22', borderColor: '#8b2f22' },
  optionText: { color: '#6c463b', fontSize: 12, fontWeight: '700' },
  optionTextSelected: { color: '#ffffff' },
  input: { backgroundColor: '#ffffff', borderColor: '#d9c3b3', borderRadius: 10, borderWidth: 1,
    color: '#30231d', minHeight: 76, padding: 11, textAlignVertical: 'top' },
  button: { alignItems: 'center', backgroundColor: '#8b2f22', borderRadius: 10, justifyContent: 'center',
    minHeight: 44, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButton: { backgroundColor: '#fff7f1', borderColor: '#c98c76', borderWidth: 1 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  secondaryButtonText: { color: '#8b2f22' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  error: { color: '#a12b22', fontSize: 13, fontWeight: '700' },
});
