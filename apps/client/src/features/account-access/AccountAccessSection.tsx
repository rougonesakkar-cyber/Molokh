import type {
  AccountAccessListResponse,
  AccountAccessResponse,
  DuplicateAccountListResponse,
  DuplicateAccountResponse,
} from '@molokh/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';

type AccessCase = NonNullable<AccountAccessResponse['data']>;
type DuplicateCase = DuplicateAccountListResponse['data'][number];

async function post(token: string, path: string, body: unknown, version?: number) {
  const response = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
    'Idempotency-Key': `ui:account-access:${path}:${version ?? 0}:${Date.now()}`,
    ...(version ? { 'If-Match': String(version) } : {}),
  }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await apiErrorMessage(response));
  return response;
}

export function AccountAccessSection({ token }: { readonly token: string }) {
  const [accessCase, setAccessCase] = useState<AccessCase | null>(null);
  const [route, setRoute] = useState<'VERIFIED_ROUTE' | 'PHONE_CHANGE'>('VERIFIED_ROUTE');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/me/account-access`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setAccessCase(((await response.json()) as AccountAccessResponse).data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить восстановление');
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const request = async () => {
    setActing(true); setError(null); setNotice(null);
    try {
      const response = await post(token, '/api/v1/me/recovery-cases', {
        route, signals: [route === 'PHONE_CHANGE' ? 'TRUSTED_SESSION' : 'VERIFIED_PHONE'],
        requestedPhoneE164: route === 'PHONE_CHANGE' ? phone.trim() : null,
        reason: reason.trim(),
      });
      setAccessCase(((await response.json()) as AccountAccessResponse).data);
      setNotice('Запрос принят. Спортивные обязательства остаются без изменений.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить запрос');
    } finally { setActing(false); }
  };
  const live = accessCase?.state === 'PENDING' || accessCase?.state === 'SECURITY_HOLD';
  return <View style={styles.section}>
    <Text accessibilityRole="header" aria-level={2} style={styles.title}>Доступ к аккаунту</Text>
    <Text style={styles.hint}>Документы не загружаются. Восстановление не отменяет Challenge и Session.</Text>
    {loading ? <ActivityIndicator color="#74372b" /> : live ? <View style={styles.info}>
      <Text style={styles.value}>{accessCase.state === 'PENDING'
        ? 'Запрос рассматривается' : 'Номер изменён · защита 24 часа'}</Text>
      <Text style={styles.hint}>{accessCase.route === 'PHONE_CHANGE'
        ? 'Central проверяет сигналы контроля аккаунта.'
        : 'Подтвердите доступ через уже проверенный канал.'}</Text>
      {accessCase.securityHoldUntil ? <Text style={styles.hint}>Чувствительные действия станут доступны {new Date(accessCase.securityHoldUntil).toLocaleString('ru-RU')}. На существующие обязательства можно отвечать.</Text> : null}
    </View> : <>
      <View style={styles.row}>
        <Action label="Есть доступ к номеру" selected={route === 'VERIFIED_ROUTE'}
          disabled={acting} onPress={() => setRoute('VERIFIED_ROUTE')} />
        <Action label="Сменить номер" selected={route === 'PHONE_CHANGE'}
          disabled={acting} onPress={() => setRoute('PHONE_CHANGE')} />
      </View>
      {route === 'PHONE_CHANGE' ? <TextInput accessibilityLabel="Новый номер телефона"
        autoComplete="tel" keyboardType="phone-pad" onChangeText={setPhone}
        placeholder="+7 999 000-00-00" style={styles.input} value={phone} /> : null}
      <TextInput accessibilityLabel="Причина восстановления" maxLength={1000}
        multiline onChangeText={setReason} placeholder="Кратко опишите, что произошло"
        style={[styles.input, styles.multiline]} value={reason} />
      <Action label="Отправить запрос" disabled={acting || reason.trim().length < 10
        || (route === 'PHONE_CHANGE' && phone.trim().length < 8)}
      onPress={() => void request()} />
    </>}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
  </View>;
}

export function CentralAccountAccessSection({ token }: { readonly token: string }) {
  const [recovery, setRecovery] = useState<AccessCase[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCase[]>([]);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [recoveryResponse, duplicateResponse] = await Promise.all([
        fetch(`${apiUrl}/api/v1/central/account-recovery-cases`, { headers }),
        fetch(`${apiUrl}/api/v1/central/duplicate-account-cases`, { headers }),
      ]);
      if (!recoveryResponse.ok) throw new Error(await apiErrorMessage(recoveryResponse));
      if (!duplicateResponse.ok) throw new Error(await apiErrorMessage(duplicateResponse));
      setRecovery(((await recoveryResponse.json()) as AccountAccessListResponse).data);
      setDuplicates(((await duplicateResponse.json()) as DuplicateAccountListResponse).data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить identity-очереди');
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const act = async (item: AccessCase, action: 'approve-phone' | 'complete-verified' | 'reject') => {
    const reason = reasonById[item.caseId]?.trim() ?? '';
    if (action !== 'complete-verified' && reason.length < 10) return;
    setActingId(item.caseId); setError(null);
    try {
      await post(token, `/api/v1/central/account-recovery-cases/${item.caseId}/${action}`,
        action === 'complete-verified' ? { verifiedRouteSucceeded: true } : { reason }, item.version);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Операция не выполнена'); }
    finally { setActingId(null); }
  };
  const decideDuplicate = async (item: DuplicateCase, action: 'clear' | 'resolve') => {
    const reason = reasonById[item.caseId]?.trim() ?? '';
    if (reason.length < 10) return;
    setActingId(item.caseId); setError(null);
    try {
      const body = action === 'clear' ? { reason } : { reason, canonicalUserId: item.userIds[0],
        dispositions: item.processes.map((process) => ({ ...process,
          decision: 'SEPARATE_GOVERNED_REVIEW' as const })) };
      await post(token, `/api/v1/central/duplicate-account-cases/${item.caseId}/${action}`,
        body, item.version);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Операция не выполнена'); }
    finally { setActingId(null); }
  };
  return <View style={styles.section}>
    <Text accessibilityRole="header" aria-level={2} style={styles.title}>Доступ и дубликаты</Text>
    <Text style={styles.hint}>Central проверяет сигналы без хранения документов. История и статус не объединяются автоматически.</Text>
    {recovery.length === 0 && duplicates.length === 0
      ? <Text style={styles.hint}>Очереди пусты.</Text> : null}
    {recovery.map((item) => <View key={item.caseId} style={styles.info}>
      <Text style={styles.value}>Recovery · {item.route === 'PHONE_CHANGE' ? 'смена номера' : 'проверенный канал'}</Text>
      <Text style={styles.hint}>User {item.userId.slice(-8)} · {item.state}</Text>
      {item.state === 'PENDING' ? <>
        <Reason value={reasonById[item.caseId] ?? ''}
          onChange={(value) => setReasonById((current) => ({ ...current, [item.caseId]: value }))} />
        <View style={styles.row}>
          <Action label={item.route === 'PHONE_CHANGE' ? 'Одобрить' : 'Доступ подтверждён'}
            disabled={actingId !== null || (item.route === 'PHONE_CHANGE'
              && (reasonById[item.caseId]?.trim().length ?? 0) < 10)}
            onPress={() => void act(item, item.route === 'PHONE_CHANGE'
              ? 'approve-phone' : 'complete-verified')} />
          <Action label="Отклонить" danger disabled={actingId !== null
            || (reasonById[item.caseId]?.trim().length ?? 0) < 10}
          onPress={() => void act(item, 'reject')} />
        </View>
      </> : <Text style={styles.hint}>Защита действует до {item.securityHoldUntil
        ? new Date(item.securityHoldUntil).toLocaleString('ru-RU') : '—'}.</Text>}
    </View>)}
    {duplicates.map((item) => <View key={item.caseId} style={styles.warning}>
      <Text style={styles.value}>Duplicate review · {item.userIds.length} аккаунта</Text>
      <Text selectable style={styles.hint}>{item.userIds.join('\n')}</Text>
      <Text style={styles.hint}>Затронуто процессов: {item.processes.length}. Безопасное решение оставит их на отдельном регулируемом рассмотрении.</Text>
      <Reason value={reasonById[item.caseId] ?? ''}
        onChange={(value) => setReasonById((current) => ({ ...current, [item.caseId]: value }))} />
      <View style={styles.row}>
        <Action label="Сигнал ошибочен" disabled={actingId !== null
          || (reasonById[item.caseId]?.trim().length ?? 0) < 10}
        onPress={() => void decideDuplicate(item, 'clear')} />
        <Action label="Подтвердить дубликат" danger disabled={actingId !== null
          || (reasonById[item.caseId]?.trim().length ?? 0) < 10}
        onPress={() => void decideDuplicate(item, 'resolve')} />
      </View>
    </View>)}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
  </View>;
}

function Reason({ value, onChange }: { readonly value: string;
  readonly onChange: (value: string) => void }) {
  return <TextInput accessibilityLabel="Обоснование решения" maxLength={1000}
    onChangeText={onChange} placeholder="Объективное основание решения"
    style={styles.input} value={value} />;
}
function Action({ label, disabled, onPress, selected = false, danger = false }: {
  readonly label: string; readonly disabled: boolean; readonly onPress: () => void;
  readonly selected?: boolean; readonly danger?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button,
      selected && styles.selected, danger && styles.danger,
      disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#f9f6f2', borderColor: '#ddd2c8', borderRadius: 18,
    borderWidth: 1, gap: 12, padding: 18 },
  title: { color: '#2d211b', fontSize: 20, fontWeight: '800' },
  hint: { color: '#786a63', fontSize: 13, lineHeight: 19 },
  value: { color: '#342822', fontSize: 14, fontWeight: '800' },
  info: { backgroundColor: '#fff', borderColor: '#ded1c6', borderRadius: 12,
    borderWidth: 1, gap: 8, padding: 12 },
  warning: { backgroundColor: '#fff8ef', borderColor: '#dcbf9c', borderRadius: 12,
    borderWidth: 1, gap: 8, padding: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: '#fff', borderColor: '#d9c3b3', borderRadius: 10,
    borderWidth: 1, color: '#30231d', minHeight: 44, padding: 11 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  button: { alignItems: 'center', backgroundColor: '#74372b', borderRadius: 10,
    flexGrow: 1, justifyContent: 'center', minHeight: 44, minWidth: 130, padding: 10 },
  selected: { backgroundColor: '#315c43' }, danger: { backgroundColor: '#8e2c25' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.78 },
  success: { color: '#35613c', fontSize: 13, fontWeight: '800' },
  error: { color: '#a12b22', fontSize: 13, fontWeight: '700' },
});
