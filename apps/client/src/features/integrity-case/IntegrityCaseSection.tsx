import type {
  IntegrityCaseCommandResponse,
  IntegrityCaseListResponse,
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

type IntegrityCase = IntegrityCaseListResponse['data'][number];
type Category = IntegrityCase['category'];
type Disposition = NonNullable<IntegrityCase['requestedDisposition']>;
type CorrectedOutcome = 'WIN_A' | 'WIN_B' | 'DRAW' | 'NO_CONTEST';

interface Props {
  readonly cases: readonly IntegrityCase[];
  readonly central: boolean;
  readonly token: string;
  readonly onUpdated: (integrityCase: IntegrityCase) => void;
}

const categoryLabels: Record<Category, string> = {
  FRAUD: 'Проверка достоверности',
  SYSTEM_ERROR: 'Проверка системной ошибки',
  IDENTITY_ERROR: 'Проверка личности участника',
};

const stateLabels: Record<IntegrityCase['state'], string> = {
  OPEN: 'Открыта',
  UNDER_REVIEW: 'На рассмотрении',
  DECIDED_UPHELD: 'Результат подтверждён',
  DECIDED_CORRECTED: 'Результат исправлен',
  DECIDED_ANNULLED: 'Результат аннулирован',
};

const dispositionLabels: Record<Disposition, string> = {
  UPHOLD: 'Подтвердить Result',
  CORRECT: 'Исправить исход',
  ANNUL: 'Аннулировать Result',
  REPEAT: 'Назначить повтор',
};

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
      {loading ? <ActivityIndicator color={secondary ? '#74372b' : '#ffffff'} /> : (
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
      )}
    </Pressable>
  );
}

function IntegrityCard({ integrityCase, token, onUpdated }: {
  readonly integrityCase: IntegrityCase;
  readonly token: string;
  readonly onUpdated: (value: IntegrityCase) => void;
}) {
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<CorrectedOutcome>('DRAW');
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = async (
    suffix: 'start-review' | 'decision',
    body: Record<string, unknown>,
    operation: string,
  ) => {
    if (acting !== null) return;
    setActing(operation);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/integrity-cases/${integrityCase.caseId}/${suffix}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `ui:${operation}:${integrityCase.caseId}:v${integrityCase.version}`,
            'If-Match': String(integrityCase.version),
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as IntegrityCaseCommandResponse;
      onUpdated(result.data);
      setReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить проверку');
    } finally {
      setActing(null);
    }
  };

  const decide = (disposition: Disposition) => execute('decision', {
    disposition,
    correctedOutcomeCode: disposition === 'CORRECT' ? outcome : null,
    reason: reason.trim(),
  }, `decision:${disposition}`);
  const busy = acting !== null;

  return (
    <View style={styles.caseCard}>
      <View style={styles.row}>
        <Text style={styles.title}>{integrityCase.participantDisplayNames.join(' + ')}</Text>
        <Text style={styles.state}>{stateLabels[integrityCase.state]}</Text>
      </View>
      <Text style={styles.category}>{categoryLabels[integrityCase.publicReasonCategory]}</Text>
      <Text style={styles.hint}>
        Result {integrityCase.resultId.slice(0, 8)}… · контрольный срок{' '}
        {new Date(integrityCase.slaDueAt).toLocaleString('ru-RU')}
      </Text>
      <Text style={styles.hint}>
        Исходная запись неизменна. Central фиксирует отдельное решение, а спортивные статусы
        пересчитываются по журналу событий.
      </Text>

      {integrityCase.evidenceReference ? (
        <View style={styles.privateCard}>
          <Text style={styles.privateTitle}>Только Central</Text>
          <Text style={styles.value}>Источник: {integrityCase.evidenceReference}</Text>
          <Text style={styles.hint}>{integrityCase.internalReason}</Text>
        </View>
      ) : null}

      {integrityCase.viewerCanStartReview ? (
        <ActionButton
          disabled={busy}
          label="Взять независимое рассмотрение"
          loading={acting === 'start'}
          onPress={() => execute('start-review', {}, 'start')}
        />
      ) : null}

      {integrityCase.viewerCanDecide ? (
        <View style={styles.actionGroup}>
          <Text style={styles.label}>Проверенное основание решения</Text>
          <TextInput
            accessibilityLabel="Основание решения IntegrityCase"
            maxLength={2000}
            multiline
            onChangeText={setReason}
            placeholder="Зафиксируйте факты; участники увидят только категорию и итог"
            style={styles.input}
            value={reason}
          />
          <Text style={styles.label}>Исправленный исход</Text>
          <View style={styles.options}>
            {(['WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST'] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setOutcome(item)}
                style={[styles.option, outcome === item && styles.optionSelected]}
              >
                <Text style={[styles.optionText, outcome === item && styles.optionTextSelected]}>
                  {item === 'WIN_A' ? integrityCase.participantDisplayNames[0]
                    : item === 'WIN_B' ? integrityCase.participantDisplayNames[1]
                      : item === 'DRAW' ? 'Ничья' : 'NO CONTEST'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            {(['UPHOLD', 'CORRECT', 'ANNUL', 'REPEAT'] as const).map((disposition) => (
              <ActionButton
                key={disposition}
                disabled={busy || reason.trim().length === 0}
                label={dispositionLabels[disposition]}
                loading={acting === `decision:${disposition}`}
                onPress={() => decide(disposition)}
                secondary={disposition !== 'CORRECT'}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            Если повтор уже объективно невозможен, система безопасно аннулирует Result.
          </Text>
        </View>
      ) : null}

      {integrityCase.effectiveDisposition ? (
        <View style={styles.decisionCard}>
          <Text style={styles.privateTitle}>Решение зафиксировано</Text>
          <Text style={styles.value}>{dispositionLabels[integrityCase.effectiveDisposition]}</Text>
          {integrityCase.effectiveOutcomeCode ? (
            <Text style={styles.hint}>Итог: {integrityCase.effectiveOutcomeCode}</Text>
          ) : null}
        </View>
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function OpenIntegrityCaseForm({ token, onUpdated }: {
  readonly token: string;
  readonly onUpdated: (value: IntegrityCase) => void;
}) {
  const [resultId, setResultId] = useState('');
  const [resultVersion, setResultVersion] = useState('');
  const [category, setCategory] = useState<Category>('SYSTEM_ERROR');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [internalReason, setInternalReason] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validVersion = Number.isSafeInteger(Number(resultVersion)) && Number(resultVersion) > 0;
  const disabled = acting || resultId.trim().length === 0 || !validVersion
    || evidenceReference.trim().length === 0 || internalReason.trim().length === 0;

  const open = async () => {
    if (disabled) return;
    setActing(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/central/integrity-cases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `ui:open-integrity:${resultId.trim()}:v${resultVersion}`,
          'If-Match': resultVersion,
        },
        body: JSON.stringify({
          resultId: resultId.trim(), category,
          evidenceReference: evidenceReference.trim(), internalReason: internalReason.trim(),
        }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as IntegrityCaseCommandResponse;
      onUpdated(result.data);
      setResultId('');
      setResultVersion('');
      setEvidenceReference('');
      setInternalReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть проверку');
    } finally {
      setActing(false);
    }
  };

  return (
    <View style={styles.openCard}>
      <Text style={styles.title}>Открыть проверку Final Result</Text>
      <Text style={styles.hint}>
        Только по конкретному доказательству мошенничества, системной ошибки или ошибки личности.
        Обычное несогласие после Final не является основанием.
      </Text>
      <View style={styles.options}>
        {(Object.keys(categoryLabels) as Category[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            disabled={acting}
            onPress={() => setCategory(item)}
            style={[styles.option, category === item && styles.optionSelected]}
          >
            <Text style={[styles.optionText, category === item && styles.optionTextSelected]}>
              {categoryLabels[item]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.inlineInputs}>
        <TextInput
          accessibilityLabel="Result ID"
          autoCapitalize="none"
          onChangeText={setResultId}
          placeholder="Result ID"
          style={[styles.input, styles.inlineInputWide]}
          value={resultId}
        />
        <TextInput
          accessibilityLabel="Версия Result"
          inputMode="numeric"
          onChangeText={setResultVersion}
          placeholder="Версия"
          style={[styles.input, styles.inlineInputVersion]}
          value={resultVersion}
        />
      </View>
      <TextInput
        accessibilityLabel="Ссылка на доказательство"
        maxLength={500}
        onChangeText={setEvidenceReference}
        placeholder="Ссылка или номер записи в защищённом хранилище"
        style={styles.input}
        value={evidenceReference}
      />
      <TextInput
        accessibilityLabel="Внутреннее основание проверки"
        maxLength={2000}
        multiline
        onChangeText={setInternalReason}
        placeholder="Что именно требует проверки"
        style={styles.input}
        value={internalReason}
      />
      <ActionButton disabled={disabled} label="Открыть IntegrityCase" loading={acting} onPress={open} />
      <Text style={styles.hint}>
        Версия защищает от открытия дела по уже изменённому Result. В пилоте она берётся из карточки Result/API.
      </Text>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function IntegrityCaseSection({ cases, central, token, onUpdated }: Props) {
  if (!central && cases.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>
        Проверка финального результата
      </Text>
      <Text style={styles.hint}>
        Это исключительный контур после Final. Он не заменяет Appeal и не позволяет редактировать
        исходную запись результата.
      </Text>
      {central ? <OpenIntegrityCaseForm token={token} onUpdated={onUpdated} /> : null}
      {cases.length === 0 ? <Text style={styles.muted}>Открытых проверок сейчас нет.</Text> : null}
      {cases.map((item) => (
        <IntegrityCard
          key={`${item.caseId}:${item.version}`}
          integrityCase={item}
          onUpdated={onUpdated}
          token={token}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#f9f6f2', borderColor: '#ddd2c8', borderRadius: 18,
    borderWidth: 1, gap: 14, padding: 18 },
  sectionTitle: { color: '#2d211b', fontSize: 20, fontWeight: '800' },
  openCard: { backgroundColor: '#ffffff', borderColor: '#d9c8b9', borderRadius: 14,
    borderWidth: 1, gap: 10, padding: 14 },
  caseCard: { backgroundColor: '#ffffff', borderColor: '#d9c8b9', borderRadius: 14,
    borderWidth: 1, gap: 10, padding: 14 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  title: { color: '#2d211b', flex: 1, fontSize: 16, fontWeight: '800' },
  state: { backgroundColor: '#eee5dc', borderRadius: 999, color: '#704637', fontSize: 12,
    fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  category: { color: '#74372b', fontSize: 14, fontWeight: '800' },
  hint: { color: '#786a63', fontSize: 13, lineHeight: 19 },
  muted: { color: '#8d817a', fontSize: 14 },
  value: { color: '#342822', fontSize: 14, lineHeight: 20 },
  privateCard: { backgroundColor: '#fff7e8', borderRadius: 10, gap: 4, padding: 10 },
  decisionCard: { backgroundColor: '#edf5ed', borderRadius: 10, gap: 4, padding: 10 },
  privateTitle: { color: '#5c3127', fontSize: 13, fontWeight: '800' },
  actionGroup: { borderTopColor: '#eee2d8', borderTopWidth: 1, gap: 9, paddingTop: 11 },
  label: { color: '#3a2922', fontSize: 14, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderColor: '#d9c3b3', borderRadius: 999, borderWidth: 1, paddingHorizontal: 11,
    paddingVertical: 8 },
  optionSelected: { backgroundColor: '#74372b', borderColor: '#74372b' },
  optionText: { color: '#6c463b', fontSize: 12, fontWeight: '700' },
  optionTextSelected: { color: '#ffffff' },
  input: { backgroundColor: '#ffffff', borderColor: '#d9c3b3', borderRadius: 10, borderWidth: 1,
    color: '#30231d', minHeight: 46, padding: 11, textAlignVertical: 'top' },
  inlineInputs: { flexDirection: 'row', gap: 8 },
  inlineInputWide: { flex: 1 },
  inlineInputVersion: { width: 92 },
  actions: { gap: 8 },
  button: { alignItems: 'center', backgroundColor: '#74372b', borderRadius: 10,
    justifyContent: 'center', minHeight: 44, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButton: { backgroundColor: '#fff9f4', borderColor: '#bc8a77', borderWidth: 1 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  secondaryButtonText: { color: '#74372b' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  error: { color: '#a12b22', fontSize: 13, fontWeight: '700' },
});
