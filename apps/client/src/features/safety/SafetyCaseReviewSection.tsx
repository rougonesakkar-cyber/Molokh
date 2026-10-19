import type {
  CentralModerationCaseListResponse,
  ResolveSafetyCaseBody,
  SafetyCaseReviewCommandResponse,
} from '@molokh/contracts';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';
import { safetyCaseResolutionPresentation } from './presentation';

type ModerationCase = CentralModerationCaseListResponse['data'][number];
type Remedy = ResolveSafetyCaseBody['remedyCode'];

const remedyLabels: Readonly<Record<Remedy, string>> = {
  REPLACE_COACH: 'Заменить Coach',
  REPLACE_VENUE: 'Заменить зал',
  REPLACE_COACH_AND_VENUE: 'Заменить Coach и зал',
  FORFEIT_BY_ENFORCEMENT: 'Forfeit по решению Central',
};

export function SafetyCaseReviewSection(props: {
  readonly cases: readonly ModerationCase[];
  readonly token: string;
  readonly onUpdated: (caseId: string, state: 'UNDER_REVIEW' | 'CLOSED') => void;
}) {
  const safetyCases = useMemo(() => props.cases.filter((item) => item.caseType === 'SAFETY'), [props.cases]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [remedyByCase, setRemedyByCase] = useState<Record<string, Remedy>>({});
  const [coachByCase, setCoachByCase] = useState<Record<string, string>>({});
  const [venueByCase, setVenueByCase] = useState<Record<string, string>>({});
  const [reasonByCase, setReasonByCase] = useState<Record<string, string>>({});
  const [enforcementConfirmedByCase, setEnforcementConfirmedByCase] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());

  if (safetyCases.length === 0) return null;

  const run = async (item: ModerationCase, action: 'review' | 'resolve') => {
    const remedy = remedyByCase[item.caseId] ?? 'REPLACE_COACH';
    const coach = coachByCase[item.caseId] ?? '';
    const venue = venueByCase[item.caseId] ?? '';
    const reason = reasonByCase[item.caseId]?.trim() ?? '';
    const enforcementConfirmed = enforcementConfirmedByCase[item.caseId] === true;
    const signature = [
      item.caseId, item.version, action, remedy, coach, venue, reason, enforcementConfirmed,
    ].join(':');
    const key = keys.current.get(signature) ?? `safety-case:${action}:${item.caseId}:${Date.now().toString(36)}`;
    keys.current.set(signature, key);
    setActingId(item.caseId);
    setError(null);
    setNotice(null);
    try {
      const body = action === 'review' ? {} : remedy === 'FORFEIT_BY_ENFORCEMENT' ? {
        remedyCode: remedy,
        replacementCoachUserId: null,
        replacementVenueId: null,
        causalLinkConfirmed: enforcementConfirmed,
        consequencesConfirmed: enforcementConfirmed,
        reason,
        expectedChallengeVersion: item.challengeVersion,
        expectedHoldVersion: item.holdVersion,
      } : {
        remedyCode: remedy,
        replacementCoachUserId: remedy === 'REPLACE_VENUE' ? null : coach || null,
        replacementVenueId: remedy === 'REPLACE_COACH' ? null : venue || null,
        reason,
        expectedChallengeVersion: item.challengeVersion,
        expectedHoldVersion: item.holdVersion,
      };
      const response = await fetch(
        `${apiUrl}/api/v1/central/moderation-cases/${item.caseId}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${props.token}`, 'Content-Type': 'application/json',
            'Idempotency-Key': key, 'If-Match': String(item.version),
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as SafetyCaseReviewCommandResponse;
      keys.current.delete(signature);
      props.onUpdated(item.caseId, result.data.state);
      setNotice(result.data.action === 'SAFETY_ENFORCEMENT_FORFEIT_APPLIED'
        ? 'Решение применено: Result записан, hold освобождён, открыт 48-часовой Appeal.'
        : result.data.state === 'CLOSED'
          ? 'Hold освобождён. Тот же Challenge вернулся к выбору слота; новая Session не создана.'
          : 'SafetyCase назначен вам для независимой проверки.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обработать SafetyCase');
    } finally {
      setActingId(null);
    }
  };

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" aria-level={2} style={styles.title}>SafetyCase Central</Text>
      <Text style={styles.hint}>Reporter и закрытая причина видны только Central.</Text>
      {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {safetyCases.map((item) => {
        const presentation = safetyCaseResolutionPresentation(item);
        const remedy = remedyByCase[item.caseId] ?? 'REPLACE_COACH';
        const coaches = item.replacementCoachOptions.filter((option) =>
          option.userId !== item.originalCoachUserId
          && (remedy !== 'REPLACE_COACH_AND_VENUE'
            || option.venueId === (venueByCase[item.caseId] ?? '')));
        const venues = item.replacementVenueOptions.filter((option) =>
          option.venueId !== item.originalVenueId);
        const reason = reasonByCase[item.caseId] ?? '';
        const coach = coachByCase[item.caseId] ?? '';
        const venue = venueByCase[item.caseId] ?? '';
        const isEnforcement = remedy === 'FORFEIT_BY_ENFORCEMENT';
        const needsCoach = !isEnforcement && remedy !== 'REPLACE_VENUE';
        const needsVenue = !isEnforcement && remedy !== 'REPLACE_COACH';
        const enforcementConfirmed = enforcementConfirmedByCase[item.caseId] === true;
        const canResolve = presentation.action === 'RESOLVE' && reason.trim().length >= 10
          && (!needsCoach || coach.length > 0) && (!needsVenue || venue.length > 0)
          && (!isEnforcement || enforcementConfirmed)
          && item.challengeVersion !== null && item.holdVersion !== null;
        return (
          <View key={item.caseId} style={styles.card}>
            <Text style={styles.label}>{presentation.title}</Text>
            <Text style={styles.hint}>{presentation.explanation}</Text>
            <Text style={styles.meta}>Case {item.caseId} · Session {item.sessionId}</Text>
            <Text style={styles.meta}>SLA: {item.finalDueAt ?? 'не задан'} · состояние {item.state}</Text>
            {presentation.action === 'START_REVIEW' ? (
              <Pressable
                accessibilityRole="button" accessibilityState={{ disabled: actingId !== null }}
                disabled={actingId !== null}
                onPress={() => void run(item, 'review')}
                style={[styles.primaryButton, actingId !== null && styles.disabled]}
              >
                <Text style={styles.primaryText}>Взять в независимую проверку</Text>
              </Pressable>
            ) : null}
            {presentation.action === 'RESOLVE' ? (
              <View style={styles.form}>
                {(Object.keys(remedyLabels) as Remedy[]).map((value) => (
                  <Pressable
                    accessibilityRole="radio" accessibilityState={{ selected: remedy === value }}
                    key={value} onPress={() => setRemedyByCase((current) => ({ ...current, [item.caseId]: value }))}
                    style={[styles.choice, remedy === value && styles.selected]}
                  ><Text>{remedyLabels[value]}</Text></Pressable>
                ))}
                {needsVenue ? <Text style={styles.label}>Безопасный зал</Text> : null}
                {needsVenue ? venues.map((option) => (
                  <Pressable
                    accessibilityRole="radio" accessibilityState={{ selected: venue === option.venueId }}
                    key={option.venueId} onPress={() => setVenueByCase((current) => ({ ...current, [item.caseId]: option.venueId }))}
                    style={[styles.choice, venue === option.venueId && styles.selected]}
                  ><Text>{option.displayName}</Text></Pressable>
                )) : null}
                {needsCoach ? <Text style={styles.label}>Безопасный Coach</Text> : null}
                {needsCoach ? coaches.map((option) => (
                  <Pressable
                    accessibilityRole="radio" accessibilityState={{ selected: coach === option.userId }}
                    key={`${option.userId}:${option.venueId}`}
                    onPress={() => setCoachByCase((current) => ({ ...current, [item.caseId]: option.userId }))}
                    style={[styles.choice, coach === option.userId && styles.selected]}
                  ><Text>{option.displayName}</Text></Pressable>
                )) : null}
                {isEnforcement ? (
                  <View style={styles.warning}>
                    <Text style={styles.label}>Спортивные последствия</Text>
                    <Text style={styles.hint}>
                      Подтвердите прямую причинную связь. Athlete получит FORFEIT и поражение.
                      Возможны статусный переход и Cooldown. Result можно обжаловать в течение 48 часов.
                    </Text>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: enforcementConfirmed }}
                      onPress={() => setEnforcementConfirmedByCase((current) => ({
                        ...current, [item.caseId]: !enforcementConfirmed,
                      }))}
                      style={[styles.choice, enforcementConfirmed && styles.selected]}
                    >
                      <Text>Причинная связь доказана, последствия подтверждены</Text>
                    </Pressable>
                  </View>
                ) : null}
                <TextInput
                  accessibilityLabel="Закрытая причина решения SafetyCase"
                  multiline maxLength={1000}
                  placeholder={isEnforcement
                    ? 'Почему поведение Athlete напрямую сорвало Session'
                    : 'Почему эта замена безопасна'}
                  style={styles.input} value={reason}
                  onChangeText={(value) => setReasonByCase((current) => ({ ...current, [item.caseId]: value }))}
                />
                <Pressable
                  accessibilityRole="button" accessibilityState={{ disabled: !canResolve || actingId !== null }}
                  disabled={!canResolve || actingId !== null}
                  onPress={() => void run(item, 'resolve')}
                  style={[styles.primaryButton, (!canResolve || actingId !== null) && styles.disabled]}
                ><Text style={styles.primaryText}>{isEnforcement
                  ? 'Записать Forfeit и освободить hold'
                  : 'Применить замену и освободить hold'}</Text></Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 }, title: { fontSize: 18, fontWeight: '700' },
  card: { borderColor: '#D8DEE9', borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 },
  form: { gap: 8 }, label: { fontWeight: '700' }, hint: { color: '#4B5563' },
  meta: { color: '#6B7280', fontSize: 12 }, choice: { borderColor: '#CBD5E1', borderRadius: 8, borderWidth: 1, padding: 10 },
  selected: { backgroundColor: '#E6F2FF', borderColor: '#2563EB' },
  warning: { backgroundColor: '#FFF7ED', borderRadius: 8, gap: 8, padding: 10 },
  input: { borderColor: '#CBD5E1', borderRadius: 8, borderWidth: 1, minHeight: 72, padding: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: '#16325C', borderRadius: 8, padding: 12 },
  primaryText: { color: '#FFFFFF', fontWeight: '700' }, disabled: { opacity: 0.45 },
  success: { color: '#116329' }, error: { color: '#B42318' },
});
