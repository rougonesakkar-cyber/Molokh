import type {
  PlatformIncidentCommandResponse,
  PlatformIncidentListResponse,
} from '@molokh/contracts';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';

type PlatformIncident = PlatformIncidentListResponse['data'][number];
type IncidentAction = 'confirm' | 'reject' | 'resolve';

const stateLabels: Record<PlatformIncident['state'], string> = {
  DETECTED: 'Требует проверки',
  CONFIRMED_ACTIVE: 'Подтверждён, активен',
  RESOLVED: 'Компенсация выполняется',
  COMPENSATED: 'Завершён',
  REJECTED: 'Отклонён',
};

function IncidentCard({ incident, token, onUpdated }: {
  readonly incident: PlatformIncident;
  readonly token: string;
  readonly onUpdated: (value: PlatformIncident) => void;
}) {
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState<IncidentAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAct = reason.trim().length >= 3 && acting === null;

  const execute = async (action: IncidentAction) => {
    if (!canAct) return;
    setActing(action);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/platform-incidents/${incident.incidentId}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `ui:incident:${action}:${incident.incidentId}:v${incident.version}`,
            'If-Match': String(incident.version),
          },
          body: JSON.stringify(action === 'resolve'
            ? { endedAt: new Date().toISOString(), reason: reason.trim() }
            : { reason: reason.trim() }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as PlatformIncidentCommandResponse;
      onUpdated(result.data);
      setReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить инцидент');
    } finally {
      setActing(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>{incident.severity} · {incident.incidentId.slice(0, 8)}…</Text>
        <Text style={styles.state}>{stateLabels[incident.state]}</Text>
      </View>
      <Text style={styles.value}>{incident.affectedServices.join(', ')}</Text>
      <Text style={styles.hint}>Контуры: {incident.affectedSurfaces.join(', ')}</Text>
      <Text style={styles.hint}>
        Начало: {new Date(incident.startedAt).toLocaleString('ru-RU')}
        {incident.endedAt ? ` · окончание: ${new Date(incident.endedAt).toLocaleString('ru-RU')}` : ''}
      </Text>
      <Text style={styles.hint}>Источник: {incident.monitoringEvidenceReference}</Text>
      {incident.state === 'COMPENSATED' ? (
        <Text style={styles.success}>Компенсировано объектов: {incident.impactCount}</Text>
      ) : null}
      {incident.state === 'DETECTED' || incident.state === 'CONFIRMED_ACTIVE' ? (
        <View style={styles.actions}>
          <TextInput
            accessibilityLabel="Основание решения по Platform Incident"
            maxLength={2000}
            multiline
            onChangeText={setReason}
            placeholder={incident.state === 'DETECTED'
              ? 'Объективное основание подтверждения или отклонения'
              : 'Почему восстановление считается подтверждённым'}
            style={styles.input}
            value={reason}
          />
          {incident.state === 'DETECTED' ? (
            <View style={styles.buttonRow}>
              <ActionButton action="confirm" disabled={!canAct} acting={acting}
                label="Подтвердить" onPress={execute} />
              <ActionButton action="reject" disabled={!canAct} acting={acting}
                label="Отклонить" onPress={execute} secondary />
            </View>
          ) : (
            <ActionButton action="resolve" disabled={!canAct} acting={acting}
              label="Подтвердить восстановление" onPress={execute} />
          )}
        </View>
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function ActionButton({ action, acting, disabled, label, onPress, secondary = false }: {
  readonly action: IncidentAction;
  readonly acting: IncidentAction | null;
  readonly disabled: boolean;
  readonly label: string;
  readonly onPress: (action: IncidentAction) => void;
  readonly secondary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={() => onPress(action)} style={({ pressed }) => [styles.button,
        secondary && styles.secondaryButton, disabled && styles.disabled,
        pressed && !disabled && styles.pressed]}>
      {acting === action ? <ActivityIndicator color={secondary ? '#74372b' : '#ffffff'} /> : (
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function PlatformIncidentSection({ token }: { readonly token: string }) {
  const [incidents, setIncidents] = useState<PlatformIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/central/platform-incidents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as PlatformIncidentListResponse;
      setIncidents(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить инциденты');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>
            Platform Incidents
          </Text>
          <Text style={styles.hint}>
            Только объективно зарегистрированные сбои. Пользовательские сроки компенсируются автоматически.
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading }}
          disabled={loading} onPress={() => void load()}
          style={[styles.refresh, loading && styles.disabled]}>
          <Text style={styles.refreshText}>Обновить</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color="#74372b" /> : null}
      {!loading && incidents.length === 0 ? (
        <Text style={styles.hint}>Зарегистрированных инцидентов нет.</Text>
      ) : null}
      {incidents.map((incident) => (
        <IncidentCard key={`${incident.incidentId}:${incident.version}`} incident={incident}
          token={token} onUpdated={(updated) => setIncidents((current) => current.map((item) =>
            item.incidentId === updated.incidentId ? updated : item))} />
      ))}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#f9f6f2', borderColor: '#ddd2c8', borderRadius: 18,
    borderWidth: 1, gap: 14, padding: 18 },
  heading: { flex: 1, gap: 4 },
  sectionTitle: { color: '#2d211b', fontSize: 20, fontWeight: '800' },
  card: { backgroundColor: '#ffffff', borderColor: '#d9c8b9', borderRadius: 14,
    borderWidth: 1, gap: 8, padding: 14 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  title: { color: '#2d211b', flex: 1, fontSize: 15, fontWeight: '800' },
  state: { backgroundColor: '#eee5dc', borderRadius: 999, color: '#704637', fontSize: 12,
    fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  value: { color: '#342822', fontSize: 14, fontWeight: '700' },
  hint: { color: '#786a63', fontSize: 13, lineHeight: 19 },
  success: { color: '#35613c', fontSize: 13, fontWeight: '800' },
  actions: { borderTopColor: '#eee2d8', borderTopWidth: 1, gap: 9, paddingTop: 10 },
  input: { backgroundColor: '#ffffff', borderColor: '#d9c3b3', borderRadius: 10,
    borderWidth: 1, color: '#30231d', minHeight: 70, padding: 11, textAlignVertical: 'top' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  button: { alignItems: 'center', backgroundColor: '#74372b', borderRadius: 10, flex: 1,
    justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButton: { backgroundColor: '#fff9f4', borderColor: '#bc8a77', borderWidth: 1 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  secondaryButtonText: { color: '#74372b' },
  refresh: { borderColor: '#bc8a77', borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 7 },
  refreshText: { color: '#74372b', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  error: { color: '#a12b22', fontSize: 13, fontWeight: '700' },
});
