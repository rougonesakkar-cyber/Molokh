import type {
  PublicYouthConsentResponse,
  PublicYouthConsentContract,
} from '@molokh/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiErrorMessage, apiUrl } from '../lib/api';
import { guardianConsentStateLabel } from '../lib/chat-message-presentation';

function firstParameter(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function actionKey(action: string, consentId: string, version: number): string {
  return `guardian-consent:${action}:${consentId}:v${version}`;
}

export default function GuardianConsentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstParameter(params.token);
  const [consent, setConsent] = useState<PublicYouthConsentContract | null>(null);
  const [guardianDisplayName, setGuardianDisplayName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    if (!token) {
      setError('В ссылке отсутствует защищённый токен.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/youth-consents/by-token/${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as PublicYouthConsentResponse;
      setConsent(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть согласие');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (action: 'grant' | 'decline' | 'revoke') => {
    if (!consent || acting) return;
    const operation = actionKey(action, consent.consentId, consent.version);
    const idempotencyKey = keys.current.get(operation) ?? operation;
    keys.current.set(operation, idempotencyKey);
    setActing(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/youth-consents/by-token/${encodeURIComponent(token)}/${action}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(consent.version),
          },
          body: JSON.stringify(action === 'grant'
            ? { guardianDisplayName, relationship, consentTextAccepted: accepted }
            : {}),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as PublicYouthConsentResponse;
      keys.current.delete(operation);
      setConsent(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить решение');
    } finally {
      setActing(false);
    }
  };

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={leave}>
          <Text style={styles.back}>← Вернуться</Text>
        </Pressable>
        <View style={styles.header}>
          <Text accessibilityRole="header" aria-level={1} style={styles.title}>
            Согласие на Youth Challenge
          </Text>
          <Text style={styles.subtitle}>
            Защищённая одноразовая ссылка. Аккаунт Molokh и загрузка документов не требуются.
          </Text>
        </View>

        {loading ? <ActivityIndicator color="#8b2f22" /> : null}
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

        {!loading && consent ? (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>СПОРТСМЕН</Text>
            <Text style={styles.athlete}>{consent.athleteDisplayName}</Text>
            <Text style={styles.meta}>Состояние: {guardianConsentStateLabel(consent.state)}</Text>
            <Text style={styles.meta}>
              Ссылка действует до {new Date(consent.expiresAt).toLocaleString('ru-RU')}.
            </Text>

            {consent.canGrant ? (
              <View style={styles.form}>
                <TextInput
                  accessibilityLabel="Имя представителя"
                  onChangeText={setGuardianDisplayName}
                  placeholder="Имя представителя"
                  style={styles.input}
                  value={guardianDisplayName}
                />
                <TextInput
                  accessibilityLabel="Кем вы приходитесь спортсмену"
                  onChangeText={setRelationship}
                  placeholder="Кем вы приходитесь спортсмену"
                  style={styles.input}
                  value={relationship}
                />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: accepted }}
                  onPress={() => setAccepted((value) => !value)}
                  style={styles.checkRow}
                >
                  <View style={[styles.checkbox, accepted && styles.checkboxActive]}>
                    <Text style={styles.checkmark}>{accepted ? '✓' : ''}</Text>
                  </View>
                  <Text style={styles.checkText}>
                    Я подтверждаю полномочия представителя и согласие на участие спортсмена в указанном Official Challenge.
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: acting || !accepted || guardianDisplayName.trim().length < 2 || relationship.trim().length < 2 }}
                  disabled={acting || !accepted || guardianDisplayName.trim().length < 2 || relationship.trim().length < 2}
                  onPress={() => void decide('grant')}
                  style={({ pressed }) => [
                    styles.primary,
                    (acting || !accepted || guardianDisplayName.trim().length < 2
                      || relationship.trim().length < 2) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryText}>{acting ? 'Сохраняем…' : 'Дать согласие'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: acting }}
                  disabled={acting}
                  onPress={() => void decide('decline')}
                  style={({ pressed }) => [styles.secondary, acting && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryText}>Отказать без спортивных последствий</Text>
                </Pressable>
              </View>
            ) : null}

            {consent.canRevoke ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: acting }}
                disabled={acting}
                onPress={() => void decide('revoke')}
                style={({ pressed }) => [styles.secondary, acting && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryText}>Отозвать согласие до начала Session</Text>
              </Pressable>
            ) : null}

            {!consent.canGrant && !consent.canDecline && !consent.canRevoke ? (
              <Text style={styles.done}>Решение сохранено. Эту страницу можно закрыть.</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.footnote}>
          Youth-контур включается для пилота только после утверждения текста согласия и процесса доставки.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: '#f7f4ee', flex: 1 },
  content: { alignSelf: 'center', gap: 18, maxWidth: 640, padding: 20, width: '100%' },
  back: { color: '#8b2f22', fontSize: 15, fontWeight: '800' },
  header: { gap: 8 },
  title: { color: '#171512', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#5f5a52', fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: '#fff', borderColor: '#ddd4c7', borderRadius: 18, borderWidth: 1, gap: 12, padding: 18 },
  eyebrow: { color: '#8b2f22', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  athlete: { color: '#171512', fontSize: 22, fontWeight: '900' },
  meta: { color: '#6f685f', fontSize: 13, lineHeight: 19 },
  form: { gap: 12, marginTop: 6 },
  input: { backgroundColor: '#fff', borderColor: '#cfc6b8', borderRadius: 12, borderWidth: 1, minHeight: 48, paddingHorizontal: 14 },
  checkRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  checkbox: { alignItems: 'center', borderColor: '#8b2f22', borderRadius: 5, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  checkboxActive: { backgroundColor: '#8b2f22' },
  checkmark: { color: '#fff', fontWeight: '900' },
  checkText: { color: '#38342f', flex: 1, fontSize: 14, lineHeight: 20 },
  primary: { alignItems: 'center', backgroundColor: '#8b2f22', borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  secondary: { alignItems: 'center', borderColor: '#8b2f22', borderRadius: 12, borderWidth: 1, minHeight: 46, justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { color: '#8b2f22', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  done: { color: '#2f6846', fontSize: 15, fontWeight: '800', lineHeight: 21 },
  error: { backgroundColor: '#fee8e4', borderRadius: 10, color: '#8b2f22', padding: 12 },
  footnote: { color: '#777168', fontSize: 12, lineHeight: 18 },
});
