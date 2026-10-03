import type { AuthSessionTokens, RequestAuthOtpResponse } from '@molokh/contracts';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { requestAuthOtp, verifyAuthOtp } from '../../lib/auth-session';

interface Props {
  readonly activeSession: boolean;
  readonly onAuthenticated: (session: AuthSessionTokens) => void;
  readonly onLogout: () => Promise<void>;
}

export function LocalPhoneAuthPanel({ activeSession, onAuthenticated, onLogout }: Props) {
  const [phone, setPhone] = useState('+79990000001');
  const [challenge, setChallenge] = useState<RequestAuthOtpResponse['data'] | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const requestCode = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await requestAuthOtp(phone.trim());
      setChallenge(response.data);
      setCode(response.data.developmentCode ?? '');
      setNotice(response.data.developmentCode
        ? 'Локальный код уже подставлен. В production он будет доставлен выбранным адаптером.'
        : 'Код отправлен выбранным способом.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось запросить код');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!challenge) return;
    setBusy(true);
    setNotice(null);
    try {
      const session = await verifyAuthOtp({ challengeId: challenge.challengeId,
        challengeVersion: challenge.version, code: code.trim(),
        deviceLabel: 'Molokh universal client' });
      onAuthenticated(session);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось подтвердить код');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setNotice(null);
    try { await onLogout(); }
    catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось завершить сессию');
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Настоящая сессия</Text>
      <Text style={styles.hint}>
        {__DEV__
          ? 'Пилотный вход по телефону без обязательной SMS. Код доступен только в локальной сборке.'
          : 'Введите подтверждённый номер. SMS отправляется только с вашего согласия.'}
      </Text>
      {activeSession ? (
        <>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy}
            onPress={() => { void logout(); }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed,
              busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Выйти из session</Text>}
          </Pressable>
        </>
      ) : (
        <>
      <TextInput accessibilityLabel="Номер телефона" autoCapitalize="none"
        keyboardType="phone-pad" onChangeText={setPhone} placeholder="+79990000001"
        style={styles.input} value={phone} />
      {challenge ? (
        <TextInput accessibilityLabel="Код подтверждения" keyboardType="number-pad"
          maxLength={6} onChangeText={setCode} placeholder="000000"
          style={styles.input} value={code} />
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy}
        onPress={() => { void (challenge ? confirmCode() : requestCode()); }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed,
          busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.buttonText}>{challenge ? 'Войти' : 'Получить код'}</Text>
        )}
      </Pressable>
      {challenge ? (
        <Pressable accessibilityRole="button" disabled={busy}
          onPress={() => { setChallenge(null); setCode(''); setNotice(null); }}>
          <Text style={styles.link}>Изменить номер</Text>
        </Pressable>
      ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopColor: '#d8d2c4', borderTopWidth: 1, gap: 10,
    marginTop: 14, paddingTop: 14 },
  title: { color: '#201d18', fontSize: 16, fontWeight: '700' },
  hint: { color: '#645f55', fontSize: 13, lineHeight: 18 },
  input: { backgroundColor: '#fff', borderColor: '#cfc7b8', borderRadius: 10,
    borderWidth: 1, color: '#201d18', fontSize: 16, minHeight: 44,
    paddingHorizontal: 12, paddingVertical: 10 },
  notice: { color: '#645f55', fontSize: 13, lineHeight: 18 },
  button: { alignItems: 'center', backgroundColor: '#221f1a', borderRadius: 10,
    justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  link: { color: '#59462e', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});
