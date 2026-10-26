import type {
  AccountExportDownloadResponse,
  AccountExportResponse,
  AccountLifecycleResponse,
  CentralAccountClosuresResponse,
  IdentityCommandResponse,
} from '@molokh/contracts';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';

type Lifecycle = AccountLifecycleResponse['data'];
type ClosureQueueItem = CentralAccountClosuresResponse['data'][number];

async function saveExport(result: AccountExportDownloadResponse): Promise<void> {
  const content = JSON.stringify(result.data, null, 2);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `molokh-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: 'Экспорт данных Molokh', message: content });
}

export function AccountLifecycleSection({ token }: { readonly token: string }) {
  const [lifecycle, setLifecycle] = useState<Lifecycle>({ closure: null, dataExport: null });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [closureArmed, setClosureArmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/me/account-lifecycle`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setLifecycle(((await response.json()) as AccountLifecycleResponse).data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить настройки данных');
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const run = async (input: { readonly path: string; readonly key: string;
    readonly version?: number; readonly body?: unknown; readonly success: string }) => {
    setActing(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`${apiUrl}${input.path}`, { method: 'POST', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
        'Idempotency-Key': input.key,
        ...(input.version ? { 'If-Match': String(input.version) } : {}),
      }, ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }) });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as AccountLifecycleResponse | AccountExportResponse;
      if ('closure' in result.data) setLifecycle(result.data);
      await load(); setNotice(input.success); setClosureArmed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Операция не выполнена');
    } finally { setActing(false); }
  };

  const download = async () => {
    if (!lifecycle.dataExport || lifecycle.dataExport.state !== 'READY') return;
    setActing(true); setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/me/account-exports/${lifecycle.dataExport.exportId}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      await saveExport((await response.json()) as AccountExportDownloadResponse);
      setNotice('Экспорт подготовлен. Контрольная сумма показана рядом со сроком хранения.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось скачать экспорт');
    } finally { setActing(false); }
  };

  const closure = lifecycle.closure;
  const dataExport = lifecycle.dataExport;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" aria-level={2} style={styles.title}>Данные и закрытие аккаунта</Text>
      <Text style={styles.hint}>Экспорт готовится автоматически и хранится 48 часов. Закрытие можно отменить в течение 30 дней. Спортивная и audit-история не удаляются.</Text>
      {loading ? <ActivityIndicator color="#74372b" /> : null}
      {dataExport ? (
        <View style={styles.info}>
          <Text style={styles.value}>Экспорт: {dataExport.state === 'REQUESTED' ? 'готовится' : dataExport.state === 'READY' ? 'готов' : 'удалён по сроку'}</Text>
          {dataExport.expiresAt ? <Text style={styles.hint}>Доступен до {new Date(dataExport.expiresAt).toLocaleString('ru-RU')}</Text> : null}
          {dataExport.payloadSha256 ? <Text selectable style={styles.hash}>SHA-256: {dataExport.payloadSha256}</Text> : null}
          {dataExport.state === 'READY' ? <Action label="Скачать JSON" disabled={acting} onPress={() => void download()} /> : null}
        </View>
      ) : (
        <Action label="Запросить экспорт данных" disabled={acting || loading}
          onPress={() => void run({ path: '/api/v1/me/account-exports',
            key: `ui:account-export:${Date.now()}`, success: 'Экспорт поставлен в очередь.' })} />
      )}
      {closure?.state === 'REQUESTED' ? (
        <View style={styles.warning}>
          <Text style={styles.value}>Закрытие запрошено</Text>
          <Text style={styles.hint}>Можно отменить до {new Date(closure.recoveryUntil).toLocaleString('ru-RU')}. После срока Central проверит активные обязательства, статус, Session, Membership и роли.</Text>
          <Action label="Отменить закрытие" disabled={acting} secondary
            onPress={() => void run({ path: `/api/v1/me/account-closures/${closure.closureId}/cancel`,
              key: `ui:account-closure:cancel:${closure.closureId}:v${closure.version}`,
              version: closure.version, success: 'Закрытие аккаунта отменено.' })} />
        </View>
      ) : closure?.state === 'EXECUTED' ? (
        <Text style={styles.hint}>Аккаунт закрыт, публичная identity обезличена.</Text>
      ) : closureArmed ? (
        <View style={styles.warning}>
          <Text style={styles.value}>Подтвердите запрос</Text>
          <Text style={styles.hint}>Аккаунт останется доступен ещё 30 дней. Экспорт данных будет запрошен сразу.</Text>
          <View style={styles.row}>
            <Action label="Подтверждаю" disabled={acting} danger onPress={() => void run({
              path: '/api/v1/me/account-closure', key: `ui:account-closure:${Date.now()}`,
              body: { exportRequested: true }, success: 'Запрос принят. Началось 30-дневное окно восстановления.',
            })} />
            <Action label="Назад" disabled={acting} secondary onPress={() => setClosureArmed(false)} />
          </View>
        </View>
      ) : (
        <Action label="Запросить закрытие аккаунта" disabled={acting || loading} danger
          onPress={() => setClosureArmed(true)} />
      )}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function CentralAccountClosureSection({ token, onExecuted }: {
  readonly token: string; readonly onExecuted: () => void;
}) {
  const [items, setItems] = useState<ClosureQueueItem[]>([]);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/central/account-closures`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setItems(((await response.json()) as CentralAccountClosuresResponse).data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить очередь закрытия');
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const execute = async (item: ClosureQueueItem) => {
    const reason = reasonById[item.closureId]?.trim() ?? '';
    if (!item.executable || reason.length < 3) return;
    setActingId(item.closureId); setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/central/account-closures/${item.closureId}/execute`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json', 'If-Match': String(item.userVersion),
          'Idempotency-Key': `ui:account-closure:execute:${item.closureId}:v${item.userVersion}` },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      (await response.json()) as IdentityCommandResponse;
      await load(); onExecuted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось закрыть аккаунт');
    } finally { setActingId(null); }
  };
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" aria-level={2} style={styles.title}>Закрытие аккаунтов</Text>
      <Text style={styles.hint}>Central не управляет решением пользователя: только проверяет recovery-срок и отсутствие активных обязательств.</Text>
      {items.length === 0 ? <Text style={styles.hint}>Очередь пуста.</Text> : items.map((item) => {
        const blockerCount = Object.values(item.blockers).reduce((sum, value) => sum + value, 0);
        return <View key={item.closureId} style={styles.info}>
          <Text style={styles.value}>{item.displayName}</Text>
          <Text style={styles.hint}>Recovery до {new Date(item.recoveryUntil).toLocaleString('ru-RU')} · блокеров: {blockerCount}</Text>
          <TextInput accessibilityLabel="Основание исполнения закрытия" maxLength={500}
            onChangeText={(value) => setReasonById((current) => ({ ...current, [item.closureId]: value }))}
            placeholder="Проверка recovery и обязательств" style={styles.input}
            value={reasonById[item.closureId] ?? ''} />
          <Action label={item.executable ? 'Закрыть и обезличить' : 'Пока недоступно'}
            disabled={!item.executable || (reasonById[item.closureId]?.trim().length ?? 0) < 3
              || actingId !== null} danger onPress={() => void execute(item)} />
        </View>;
      })}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Action({ label, disabled, onPress, secondary = false, danger = false }: {
  readonly label: string; readonly disabled: boolean; readonly onPress: () => void;
  readonly secondary?: boolean; readonly danger?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary,
      danger && styles.danger, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#f9f6f2', borderColor: '#ddd2c8', borderRadius: 18,
    borderWidth: 1, gap: 12, padding: 18 },
  title: { color: '#2d211b', fontSize: 20, fontWeight: '800' },
  hint: { color: '#786a63', fontSize: 13, lineHeight: 19 },
  value: { color: '#342822', fontSize: 14, fontWeight: '800' },
  info: { backgroundColor: '#ffffff', borderColor: '#ded1c6', borderRadius: 12,
    borderWidth: 1, gap: 8, padding: 12 },
  warning: { backgroundColor: '#fff8ef', borderColor: '#dcbf9c', borderRadius: 12,
    borderWidth: 1, gap: 9, padding: 12 },
  row: { flexDirection: 'row', gap: 8 },
  button: { alignItems: 'center', backgroundColor: '#74372b', borderRadius: 10, flex: 1,
    justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 },
  secondary: { backgroundColor: '#fffaf6', borderColor: '#b98371', borderWidth: 1 },
  danger: { backgroundColor: '#8e2c25' },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  secondaryText: { color: '#74372b' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.78 },
  input: { backgroundColor: '#ffffff', borderColor: '#d9c3b3', borderRadius: 10,
    borderWidth: 1, color: '#30231d', minHeight: 44, padding: 11 },
  hash: { color: '#786a63', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10, lineHeight: 15 },
  success: { color: '#35613c', fontSize: 13, fontWeight: '800' },
  error: { color: '#a12b22', fontSize: 13, fontWeight: '700' },
});
