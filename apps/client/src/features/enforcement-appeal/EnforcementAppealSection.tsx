import type {
  EnforcementAppealCommandResponse,
  EnforcementAppealListResponse,
  MyEnforcementAppealResponse,
} from '@molokh/contracts';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';
import { enforcementAppealPresentation } from './presentation';

type Context = Exclude<MyEnforcementAppealResponse['data'], null>;
type Appeal = EnforcementAppealListResponse['data'][number];

export function EnforcementAppealSection(props: {
  readonly context: Context;
  readonly token: string;
  readonly onUpdated: (appeal: Appeal) => void;
}) {
  const [statement, setStatement] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const state = props.context.appeal?.state ?? 'NOT_SUBMITTED';
  const copy = enforcementAppealPresentation({
    state, restrictionRemainsActive: props.context.restrictionRemainsActive,
    viewerCanStartReview: false, viewerCanDecide: false,
  });
  const submit = async () => {
    if (statement.trim().length < 10 || acting || props.context.appeal) return;
    key.current ??= `enforcement-appeal:${props.context.enforcementId}:${Date.now().toString(36)}`;
    setActing(true); setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/enforcements/${props.context.enforcementId}/appeals`, {
          method: 'POST', headers: { Authorization: `Bearer ${props.token}`,
            'Content-Type': 'application/json', 'Idempotency-Key': key.current,
            'If-Match': String(props.context.enforcementVersion) },
          body: JSON.stringify({ statement: statement.trim() }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as EnforcementAppealCommandResponse;
      props.onUpdated(result.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось отправить Appeal.'); }
    finally { setActing(false); }
  };
  return <View style={styles.card}>
    <Text accessibilityRole="header" aria-level={2} style={styles.title}>{copy.title}</Text>
    <Text style={styles.hint}>{copy.explanation}</Text>
    <Text style={styles.hint}>Срок подачи: {new Date(props.context.appealDeadlineAt).toLocaleString('ru-RU')}</Text>
    {props.context.appeal ? <Text style={styles.state}>Состояние: {props.context.appeal.state}</Text> : <>
      <TextInput accessibilityLabel="Заявление Enforcement Appeal" multiline value={statement}
        onChangeText={setStatement} placeholder="Опишите основание пересмотра"
        style={styles.input} maxLength={2000} />
      <Pressable accessibilityRole="button"
        accessibilityState={{ disabled: acting || statement.trim().length < 10 }}
        disabled={acting || statement.trim().length < 10}
        onPress={() => void submit()} style={styles.button}>
        <Text style={styles.buttonText}>{acting ? 'Отправляем…' : 'Подать Appeal'}</Text>
      </Pressable>
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

export function CentralEnforcementAppealQueue(props: {
  readonly appeals: Appeal[];
  readonly token: string;
  readonly onUpdated: (appeal: Appeal) => void;
}) {
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const keys = useRef(new Map<string, string>());
  const start = async (appeal: Appeal) => {
    setActing(appeal.appealId); setError(null);
    const keyId = `start:${appeal.appealId}`;
    const key = keys.current.get(keyId)
      ?? `enforcement-appeal-review:${appeal.appealId}:${Date.now().toString(36)}`;
    keys.current.set(keyId, key);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/enforcement-appeals/${appeal.appealId}/start-review`, {
          method: 'POST', headers: { Authorization: `Bearer ${props.token}`,
            'Content-Type': 'application/json', 'Idempotency-Key': key,
            'If-Match': String(appeal.version) }, body: '{}',
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      props.onUpdated(((await response.json()) as EnforcementAppealCommandResponse).data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось начать review.'); }
    finally { setActing(null); }
  };
  const revoke = async (appeal: Appeal) => {
    const reason = decisionReasons[appeal.appealId]?.trim() ?? '';
    if (reason.length < 10) return;
    setActing(appeal.appealId); setError(null);
    const keyId = `revoke:${appeal.appealId}`;
    const key = keys.current.get(keyId)
      ?? `enforcement-appeal-revoke:${appeal.appealId}:${Date.now().toString(36)}`;
    keys.current.set(keyId, key);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/enforcement-appeals/${appeal.appealId}/revoke`, {
          method: 'POST', headers: { Authorization: `Bearer ${props.token}`,
            'Content-Type': 'application/json', 'Idempotency-Key': key,
            'If-Match': String(appeal.version) }, body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      props.onUpdated(((await response.json()) as EnforcementAppealCommandResponse).data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось отозвать ограничение.'); }
    finally { setActing(null); }
  };
  if (props.appeals.length === 0) return null;
  return <View style={styles.card}>
    <Text accessibilityRole="header" aria-level={2} style={styles.title}>Enforcement Appeals · FIFO</Text>
    {props.appeals.map((appeal) => {
      const copy = enforcementAppealPresentation({ state: appeal.state,
        restrictionRemainsActive: appeal.restrictionRemainsActive,
        viewerCanStartReview: appeal.viewerCanStartReview,
        viewerCanDecide: appeal.viewerCanDecide });
      return <View key={appeal.appealId} style={styles.item}>
        <Text style={styles.state}>{copy.title}</Text><Text style={styles.hint}>{copy.explanation}</Text>
        <Text style={styles.hint}>{new Date(appeal.submittedAt).toLocaleString('ru-RU')}</Text>
        {copy.action === 'START_REVIEW' ? <Pressable accessibilityRole="button"
          accessibilityState={{ disabled: acting !== null }} disabled={acting !== null}
          onPress={() => void start(appeal)} style={styles.button}>
          <Text style={styles.buttonText}>{acting === appeal.appealId ? 'Назначаем…' : 'Взять в review'}</Text>
        </Pressable> : null}
        {copy.action === 'REVOKE' ? <>
          <TextInput accessibilityLabel="Причина отзыва ограничения" multiline
            value={decisionReasons[appeal.appealId] ?? ''}
            onChangeText={(value) => setDecisionReasons((current) => ({
              ...current, [appeal.appealId]: value,
            }))}
            placeholder="Укажите защищённую причину решения" style={styles.input} maxLength={2000} />
          <Pressable accessibilityRole="button"
            accessibilityState={{ disabled: acting !== null
              || (decisionReasons[appeal.appealId]?.trim().length ?? 0) < 10 }}
            disabled={acting !== null || (decisionReasons[appeal.appealId]?.trim().length ?? 0) < 10}
            onPress={() => void revoke(appeal)} style={styles.button}>
            <Text style={styles.buttonText}>{acting === appeal.appealId
              ? 'Отзываем…' : 'Отозвать ограничение'}</Text>
          </Pressable>
        </> : null}
      </View>;
    })}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 14, padding: 16, gap: 10, backgroundColor: '#fff' },
  item: { borderTopWidth: 1, borderTopColor: '#e7e9ec', paddingTop: 10, gap: 6 },
  title: { fontSize: 18, fontWeight: '700', color: '#15181c' },
  state: { fontWeight: '600', color: '#15181c' }, hint: { color: '#56606b', lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#b9c0c8', borderRadius: 10, padding: 12, minHeight: 88, textAlignVertical: 'top' },
  button: { backgroundColor: '#20252b', borderRadius: 10, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' }, error: { color: '#b42318' },
});
