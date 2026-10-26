import type { ResultCommandResponse, ResultResponse } from '@molokh/contracts';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';
import { resultMetadataRevisionPresentation } from './presentation';

type OfficialResult = ResultResponse['data'];

function displayedScore(result: OfficialResult): string {
  const display = result.scorePayload?.display;
  return typeof display === 'string' ? display : '';
}

export function ResultMetadataRevisionCard(props: {
  readonly currentRole: string;
  readonly result: OfficialResult;
  readonly token: string;
  readonly onUpdated: (result: OfficialResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [methodText, setMethodText] = useState(props.result.methodText ?? '');
  const [score, setScore] = useState(displayedScore(props.result));
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const presentation = resultMetadataRevisionPresentation({
    currentRole: props.currentRole,
    viewerCanReviseMetadata: props.result.viewerCanReviseMetadata,
  });
  const currentMethodText = props.result.methodText ?? '';
  const currentScore = displayedScore(props.result);
  const changed = methodText.trim() !== currentMethodText || score.trim() !== currentScore;

  if (!presentation && props.result.metadataRevisionCount === 0) return null;

  const submit = async () => {
    if (!presentation || !changed || acting) return;
    const payload = {
      ...(methodText.trim() !== currentMethodText
        ? { methodText: methodText.trim().length > 0 ? methodText.trim() : null }
        : {}),
      ...(score.trim() !== currentScore
        ? { scorePayload: score.trim().length > 0 ? { display: score.trim() } : null }
        : {}),
    };
    const operation = `${props.result.resultId}:v${props.result.version}:${JSON.stringify(payload)}`;
    const idempotencyKey = keys.current.get(operation)
      ?? `result-metadata:${props.result.resultId}:${Date.now().toString(36)}`;
    keys.current.set(operation, idempotencyKey);
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/results/${props.result.resultId}/metadata-revisions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${props.token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(props.result.version),
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const updated = (await response.json()) as ResultCommandResponse;
      keys.current.delete(operation);
      props.onUpdated(updated.data);
      setExpanded(false);
      setNotice('Описание обновлено. Победитель, исход, статус и Appeal не изменились.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось исправить описание Result');
    } finally {
      setActing(false);
    }
  };

  return (
    <View style={styles.section}>
      {props.result.metadataRevisionCount > 0 ? (
        <Text style={styles.hint}>
          Исправлений описания: {props.result.metadataRevisionCount}.
          Исходная запись Coach сохранена.
        </Text>
      ) : null}
      {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {presentation && !expanded ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded(true)}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>{presentation.actionLabel}</Text>
        </Pressable>
      ) : null}
      {presentation && expanded ? (
        <View style={styles.form}>
          <Text style={styles.label}>Исправление описания Result</Text>
          <Text style={styles.hint}>{presentation.explanation}</Text>
          <Text style={styles.hint}>
            Для изменения победителя или исхода используйте отдельный запрос в Central.
          </Text>
          <TextInput accessibilityLabel="Исправленное описание метода"
            maxLength={500} onChangeText={setMethodText}
            placeholder="Например, победа решением судьи"
            style={styles.input} value={methodText} />
          <TextInput accessibilityLabel="Исправленный счёт"
            maxLength={120} onChangeText={setScore}
            placeholder="Например, 3:0" style={styles.input} value={score} />
          <Text style={styles.hint}>
            Доступно до {new Date(props.result.metadataRevisionDeadlineAt).toLocaleString('ru-RU')}.
          </Text>
          <Pressable accessibilityRole="button"
            accessibilityState={{ disabled: !changed || acting }}
            disabled={!changed || acting} onPress={() => void submit()}
            style={[styles.primaryButton, (!changed || acting) && styles.disabled]}>
            <Text style={styles.primaryButtonText}>{acting ? 'Сохраняем…' : 'Сохранить исправление'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: acting }}
            disabled={acting} onPress={() => setExpanded(false)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Закрыть без изменений</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 10 },
  form: { borderColor: '#d8dee8', borderRadius: 14, borderWidth: 1, gap: 8, padding: 12 },
  label: { color: '#14213d', fontSize: 14, fontWeight: '800' },
  hint: { color: '#667085', fontSize: 13, lineHeight: 18 },
  success: { color: '#18794e', fontSize: 13, fontWeight: '700' },
  error: { color: '#b42318', fontSize: 13, fontWeight: '700' },
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
