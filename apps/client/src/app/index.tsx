import type {
  ApiError,
  CommunityContextResponse,
  IdentityCommandResponse,
  MeResponse,
} from '@molokh/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const defaultApiUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl).replace(/\/$/, '');
const localToken = process.env.EXPO_PUBLIC_LOCAL_AUTH_TOKEN ?? 'molokh-local-athlete-token';

type Identity = MeResponse['data'];
type CommunityContext = CommunityContextResponse['data'];
type Capability = Identity['capabilities'][number];
type CommunityDenialCode = CommunityContext['access']['denials'][number]['code'];

const capabilityLabels: Record<Capability, string> = {
  USE_DISCOVERY: 'Discovery доступен',
  EDIT_PROFILE: 'Профиль можно изменять',
  BOOK_ORDINARY_TRAINING: 'Обычные тренировки доступны',
  CREATE_OFFICIAL_CHALLENGE: 'Официальные Challenge доступны',
};

const verificationLabels: Record<Identity['accountVerificationState'], string> = {
  NOT_STARTED: 'Не начата',
  PENDING: 'На рассмотрении Central',
  VERIFIED: 'Аккаунт подтверждён',
  REJECTED: 'Отклонена',
  EXPIRED: 'Истекла',
  REVOKED: 'Отозвана',
};

const officialDenialLabels: Record<CommunityDenialCode, string> = {
  ACCOUNT_NOT_ACTIVE: 'Аккаунт временно не может участвовать в Official Challenge.',
  ACCOUNT_NOT_VERIFIED: 'Official Challenge откроется после верификации аккаунта Central.',
  COMMUNITY_NOT_ACTIVE: 'Новые Challenge недоступны, пока Community не активна.',
  MEMBERSHIP_ALREADY_EXISTS: 'Membership в этой Community уже существует.',
  MEMBERSHIP_NOT_ACTIVE: 'Для Official Challenge нужен активный competitive Membership.',
  AGE_CONTOUR_MISMATCH: 'Возрастной контур Membership должен совпадать с профилем.',
  MVP_ACTIVE_COMMUNITY_LIMIT: 'В MVP доступна одна активная competitive Community.',
  ROLE_SCOPE_MISMATCH: 'Эта роль не действует в выбранной Community.',
  CENTRAL_ONLY: 'Действие доступно только Central.',
};

async function errorMessage(response: Response): Promise<string> {
  try {
    const error = (await response.json()) as ApiError;
    return error.message;
  } catch {
    return `API вернул ошибку ${response.status}`;
  }
}

export default function IdentityScreen() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [communityContext, setCommunityContext] = useState<CommunityContext | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIdentity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/me`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = (await response.json()) as MeResponse;
      setIdentity(result.data);
      setDisplayName(result.data.displayName);
      const communityResponse = await fetch(`${apiUrl}/api/v1/me/community`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (communityResponse.status === 404) {
        setCommunityContext(null);
      } else {
        if (!communityResponse.ok) throw new Error(await errorMessage(communityResponse));
        const communityResult = (await communityResponse.json()) as CommunityContextResponse;
        setCommunityContext(communityResult.data);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIdentity();
  }, [loadIdentity]);

  const normalizedName = displayName.trim();
  const officialChallengeDenial = communityContext?.access.denials.find(
    (denial) => denial.capability === 'CREATE_OFFICIAL_CHALLENGE',
  );
  const canSave = useMemo(
    () =>
      identity !== null &&
      normalizedName.length > 0 &&
      normalizedName.length <= 80 &&
      normalizedName !== identity.displayName &&
      !saving,
    [identity, normalizedName, saving],
  );

  const saveDisplayName = async () => {
    if (!identity || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/me/profile`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `identity:${identity.userId}:display-name:v${identity.version}`,
          'If-Match': String(identity.version),
        },
        body: JSON.stringify({ displayName: normalizedName }),
      });
      if (!response.ok) {
        const message = await errorMessage(response);
        if (response.status === 409) await loadIdentity();
        throw new Error(message);
      }
      const result = (await response.json()) as IdentityCommandResponse;
      setIdentity(result.data);
      setDisplayName(result.data.displayName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить имя');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>MOLOKH · IDENTITY</Text>
        <Text style={styles.title}>Профиль атлета</Text>
        <Text style={styles.lead}>
          Первый рабочий вертикальный срез MVP: аккаунт, публичные возможности и свободное имя.
        </Text>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#8b2f22" />
            <Text style={styles.muted}>Подключаемся к Molokh API…</Text>
          </View>
        ) : identity ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Отображаемое имя</Text>
              <TextInput
                accessibilityLabel="Отображаемое имя"
                autoCapitalize="words"
                maxLength={80}
                onChangeText={setDisplayName}
                placeholder="Как вас называть"
                style={styles.input}
                value={displayName}
              />
              <Text style={styles.hint}>Имя меняется сразу. История доступна только Central.</Text>
              <Pressable
                accessibilityRole="button"
                disabled={!canSave}
                onPress={() => void saveDisplayName()}
                style={({ pressed }) => [
                  styles.button,
                  !canSave && styles.buttonDisabled,
                  pressed && canSave && styles.buttonPressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Сохранить имя</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Статус аккаунта</Text>
              <View style={styles.row}>
                <Text style={styles.muted}>Возрастной контур</Text>
                <Text style={styles.value}>{identity.ageDivision === 'ADULT' ? '18+' : '14–17'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.muted}>Телефон</Text>
                <Text style={styles.value}>{identity.phoneVerified ? 'Подтверждён' : 'Не подтверждён'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.muted}>Верификация</Text>
                <Text style={styles.value}>{verificationLabels[identity.accountVerificationState]}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.muted}>Основной спорт</Text>
                <Text style={styles.value}>{identity.primarySport}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Что уже доступно</Text>
              <View style={styles.chips}>
                {identity.capabilities.map((capability) => (
                  <View key={capability} style={styles.chip}>
                    <Text style={styles.chipText}>{capabilityLabels[capability]}</Text>
                  </View>
                ))}
              </View>
              {identity.capabilityDenials.map((denial) => (
                <Text key={denial.capability} style={styles.denial}>
                  {denial.capability === 'CREATE_OFFICIAL_CHALLENGE'
                    ? 'Для официального Challenge потребуется верификация Central.'
                    : capabilityLabels[denial.capability]}
                </Text>
              ))}
            </View>

            {communityContext ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{communityContext.community.name}</Text>
                <Text style={styles.venueName}>{communityContext.venue.displayName}</Text>
                <Text style={styles.muted}>{communityContext.venue.address}</Text>
                <View style={styles.row}>
                  <Text style={styles.muted}>Membership</Text>
                  <Text style={styles.value}>{communityContext.membership?.state ?? 'Нет'}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.muted}>Pair Cooldown</Text>
                  <Text style={styles.value}>{communityContext.community.pairCooldownDays} дней</Text>
                </View>
                {communityContext.access.capabilities.includes('CREATE_OFFICIAL_CHALLENGE') ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>Official Challenge доступен</Text>
                  </View>
                ) : (
                  <Text style={styles.denial}>
                    {officialChallengeDenial
                      ? officialDenialLabels[officialChallengeDenial.code]
                      : 'Official Challenge сейчас недоступен.'}
                  </Text>
                )}
              </View>
            ) : null}
          </>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadIdentity()} style={styles.retryButton}>
              <Text style={styles.retryText}>Повторить</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.footer}>API: {apiUrl}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f6f4ef', flex: 1 },
  container: {
    alignSelf: 'center',
    gap: 18,
    maxWidth: 680,
    paddingHorizontal: 20,
    paddingVertical: 32,
    width: '100%',
  },
  eyebrow: { color: '#8b2f22', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#171512', fontSize: 36, fontWeight: '800', letterSpacing: -1, lineHeight: 42 },
  lead: { color: '#4c4943', fontSize: 17, lineHeight: 25 },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#ded9cf',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    gap: 12,
    padding: 28,
  },
  label: { color: '#171512', fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: '#faf9f6',
    borderColor: '#c9c3b9',
    borderRadius: 12,
    borderWidth: 1,
    color: '#171512',
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { color: '#777168', fontSize: 13, lineHeight: 19 },
  button: {
    alignItems: 'center',
    backgroundColor: '#8b2f22',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  buttonDisabled: { backgroundColor: '#bbb5ad' },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  cardTitle: { color: '#171512', fontSize: 18, fontWeight: '700' },
  venueName: { color: '#4c4943', fontSize: 16, fontWeight: '600' },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  muted: { color: '#777168', flexShrink: 1, fontSize: 14 },
  value: { color: '#171512', flexShrink: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#e8f1e9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: '#285d35', fontSize: 13, fontWeight: '600' },
  denial: { color: '#8b2f22', fontSize: 14, lineHeight: 20 },
  errorCard: {
    backgroundColor: '#fff0ed',
    borderColor: '#e5b3aa',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  errorText: { color: '#7a261b', fontSize: 14, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 48, paddingHorizontal: 4 },
  retryText: { color: '#8b2f22', fontSize: 15, fontWeight: '700' },
  footer: { color: '#8c867e', fontSize: 12, textAlign: 'center' },
});
