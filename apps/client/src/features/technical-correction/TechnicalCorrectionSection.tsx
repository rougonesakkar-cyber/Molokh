import type {
  MySessionsResponse,
  ResultResponse,
  TechnicalCorrectionCommandResponse,
  TechnicalCorrectionListResponse,
} from '@molokh/contracts';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';

type Correction = TechnicalCorrectionListResponse['data'][number];
type OfficialResult = ResultResponse['data'];
type Session = MySessionsResponse['data']['sessions'][number];
type Category = Correction['category'];
type Outcome = Correction['proposedOutcomeCode'];

const outcomeLabels: Readonly<Record<Outcome, string>> = {
  WIN_A: 'Победил первый Athlete',
  WIN_B: 'Победил второй Athlete',
  DRAW: 'Ничья',
  NO_CONTEST: 'Без результата',
  FORFEIT: 'Forfeit',
  NO_SHOW: 'Неявка',
};

const categoryLabels: Readonly<Record<Category, string>> = {
  OUTCOME_OR_WINNER_ERROR: 'Ошибка в исходе или победителе',
  LATE_RESULT_CORRECTION: 'Поздно обнаруженная ошибка Result',
};

export function TechnicalCorrectionRequestCard(props: {
  readonly correction: Correction | null;
  readonly currentUserId: string | null;
  readonly currentRole: string;
  readonly result: OfficialResult;
  readonly session: Session;
  readonly token: string;
  readonly onCreated: (correction: Correction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<Category>('OUTCOME_OR_WINNER_ERROR');
  const initialOutcome = props.result.outcomeCode === 'WIN_A' ? 'WIN_B' : 'WIN_A';
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [reason, setReason] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const allowed = props.currentRole === 'Coach'
    && props.currentUserId === props.session.coachUserId
    && (props.result.state === 'RECORDED' || props.result.state === 'UNDER_APPEAL');
  const proposedWinnerUserId = outcome === 'WIN_A'
    ? props.session.athleteUserIds[0]
    : outcome === 'WIN_B'
      ? props.session.athleteUserIds[1]
      : null;
  const unchanged = outcome === props.result.outcomeCode
    && proposedWinnerUserId === props.result.winnerUserId;
  const ready = !acting && !unchanged && reason.trim().length > 0
    && evidenceReference.trim().length > 0;

  if (!allowed && !props.correction) return null;
  if (props.correction) {
    return (
      <View style={styles.noticeCard}>
        <Text style={styles.label}>Запрос Coach на исправление · {props.correction.state}</Text>
        <Text style={styles.text}>
          {outcomeLabels[props.correction.originalOutcomeCode]} → {outcomeLabels[props.correction.proposedOutcomeCode]}
        </Text>
        <Text style={styles.hint}>
          Это только заявка для независимого Central. Result, статус и Cooldown не изменены.
        </Text>
      </View>
    );
  }

  const submit = async () => {
    if (!ready) return;
    const operation = [props.result.resultId, props.result.version, category, outcome,
      proposedWinnerUserId ?? 'NONE', reason.trim(), evidenceReference.trim()].join(':');
    const idempotencyKey = keys.current.get(operation)
      ?? `technical-correction:${props.result.resultId}:${Date.now().toString(36)}`;
    keys.current.set(operation, idempotencyKey);
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/results/${props.result.resultId}/technical-corrections`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${props.token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(props.result.version),
          },
          body: JSON.stringify({
            category,
            proposedOutcomeCode: outcome,
            proposedWinnerUserId,
            internalReason: reason.trim(),
            evidenceReference: evidenceReference.trim(),
          }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const created = (await response.json()) as TechnicalCorrectionCommandResponse;
      keys.current.delete(operation);
      props.onCreated(created.data);
      setExpanded(false);
      setNotice('Запрос передан Central. Исходный Result и спортивный статус не изменены.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить запрос');
    } finally {
      setActing(false);
    }
  };

  return (
    <View style={styles.section}>
      {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!expanded ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>Сообщить об ошибке Result</Text>
        </Pressable>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Запрос на техническое исправление</Text>
          <Text style={styles.hint}>
            Это не Athlete Appeal и не немедленное изменение. Central отдельно проверит запрос.
          </Text>
          {(['OUTCOME_OR_WINNER_ERROR', 'LATE_RESULT_CORRECTION'] as const).map((item) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: category === item }}
              key={item}
              onPress={() => setCategory(item)}
              style={[styles.choice, category === item && styles.choiceSelected]}
            >
              <Text style={styles.text}>{categoryLabels[item]}</Text>
            </Pressable>
          ))}
          {(['WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST'] as const).map((item) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: outcome === item }}
              key={item}
              onPress={() => setOutcome(item)}
              style={[styles.choice, outcome === item && styles.choiceSelected]}
            >
              <Text style={styles.text}>{outcomeLabels[item]}</Text>
            </Pressable>
          ))}
          <TextInput
            accessibilityLabel="Закрытая причина технического исправления"
            maxLength={2000}
            multiline
            onChangeText={setReason}
            placeholder="Что именно записано неверно"
            style={styles.input}
            value={reason}
          />
          <TextInput
            accessibilityLabel="Ссылка на подтверждающий факт"
            maxLength={500}
            onChangeText={setEvidenceReference}
            placeholder="Например, запись в журнале Session — без загрузки файла"
            style={styles.input}
            value={evidenceReference}
          />
          {unchanged ? <Text style={styles.error}>Предложенный исход должен отличаться.</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={() => void submit()}
            style={[styles.primaryButton, !ready && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>{acting ? 'Отправляем…' : 'Передать Central'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: acting }}
            disabled={acting}
            onPress={() => setExpanded(false)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Закрыть без отправки</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function TechnicalCorrectionQueue(props: {
  readonly corrections: readonly Correction[];
  readonly central: boolean;
}) {
  const visible = useMemo(
    () => props.corrections.filter((item) => item.state === 'SUBMITTED' || item.state === 'UNDER_REVIEW'),
    [props.corrections],
  );
  if (!props.central) return null;
  return (
    <View style={styles.queue}>
      <Text accessibilityRole="header" aria-level={2} style={styles.heading}>
        Technical Corrections · Central
      </Text>
      <Text style={styles.hint}>
        Независимая FIFO-очередь запросов Coach. В этом этапе доступен только приём заявки.
      </Text>
      {visible.length === 0 ? <Text style={styles.hint}>Новых запросов нет.</Text> : visible.map((item) => (
        <View key={item.correctionId} style={styles.noticeCard}>
          <Text style={styles.label}>{item.requesterDisplayName} · {categoryLabels[item.category]}</Text>
          <Text style={styles.text}>
            {outcomeLabels[item.originalOutcomeCode]} → {outcomeLabels[item.proposedOutcomeCode]}
          </Text>
          <Text style={styles.hint}>Причина: {item.internalReason}</Text>
          <Text style={styles.hint}>Подтверждение: {item.evidenceReference}</Text>
          <Text style={styles.hint}>Result ID: {item.resultId} · версия заявки {item.version}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 10 },
  queue: { backgroundColor: '#ffffff', borderColor: '#d8dee8', borderRadius: 18,
    borderWidth: 1, gap: 10, marginTop: 14, padding: 16 },
  heading: { color: '#14213d', fontSize: 20, fontWeight: '800' },
  form: { borderColor: '#d8dee8', borderRadius: 14, borderWidth: 1, gap: 8, padding: 12 },
  noticeCard: { backgroundColor: '#f5f7fb', borderRadius: 12, gap: 4, padding: 12 },
  label: { color: '#14213d', fontSize: 14, fontWeight: '800' },
  text: { color: '#26344d', fontSize: 14 },
  hint: { color: '#667085', fontSize: 13, lineHeight: 18 },
  success: { color: '#18794e', fontSize: 13, fontWeight: '700' },
  error: { color: '#b42318', fontSize: 13, fontWeight: '700' },
  choice: { borderColor: '#ccd3df', borderRadius: 10, borderWidth: 1, padding: 10 },
  choiceSelected: { backgroundColor: '#eef4ff', borderColor: '#315efb' },
  input: { borderColor: '#ccd3df', borderRadius: 10, borderWidth: 1, minHeight: 46,
    paddingHorizontal: 12, paddingVertical: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: '#315efb', borderRadius: 10, padding: 12 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: { alignItems: 'center', borderColor: '#315efb', borderRadius: 10,
    borderWidth: 1, padding: 11 },
  secondaryButtonText: { color: '#2448bd', fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
