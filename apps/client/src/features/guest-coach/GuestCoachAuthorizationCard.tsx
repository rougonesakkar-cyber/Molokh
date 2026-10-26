import type { MySessionsResponse } from '@molokh/contracts';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage, apiUrl } from '../../lib/api';
import { guestCoachPresentation } from './presentation';

type Session = MySessionsResponse['data']['sessions'][number];

export function GuestCoachAuthorizationCard(props: {
  readonly currentRole: string;
  readonly session: Session;
  readonly token: string;
  readonly onAuthorized: () => Promise<void> | void;
}) {
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(`guest-coach:${props.session.sessionId}:${Date.now().toString(36)}`);
  const presentation = guestCoachPresentation({
    currentRole: props.currentRole,
    viewerCanAuthorizeGuestCoach: props.session.viewerCanAuthorizeGuestCoach,
    guestCoachGrantState: props.session.guestCoachGrantState,
  });
  if (!presentation) return null;

  const authorize = async () => {
    if (!presentation.canAuthorize || acting) return;
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/sessions/${props.session.sessionId}/guest-coach`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${props.token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': key.current,
            'If-Match': '0',
          },
          body: JSON.stringify({
            coachUserId: props.session.coachUserId,
            reasonCode: 'SESSION_GUEST_COVERAGE',
          }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      await response.json();
      setNotice('Доступ выдан только к этой Session.');
      await props.onAuthorized();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось авторизовать Guest Coach');
    } finally {
      setActing(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{presentation.title}</Text>
      <Text style={styles.hint}>{presentation.explanation}</Text>
      <Text style={styles.hint}>Coach: {props.session.coachDisplayName}</Text>
      {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {presentation.canAuthorize ? (
        <Pressable accessibilityRole="button"
          accessibilityState={{ disabled: acting }} disabled={acting}
          onPress={() => void authorize()}
          style={({ pressed }) => [styles.button, acting && styles.disabled, pressed && styles.pressed]}>
          {acting ? <ActivityIndicator color="#ffffff" /> : (
            <Text style={styles.buttonText}>Дать доступ к этой Session</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: '#d8dee8', borderRadius: 14, borderWidth: 1, gap: 8,
    marginTop: 10, padding: 12 },
  label: { color: '#14213d', fontSize: 14, fontWeight: '800' },
  hint: { color: '#667085', fontSize: 13, lineHeight: 18 },
  success: { color: '#18794e', fontSize: 13, fontWeight: '700' },
  error: { color: '#b42318', fontSize: 13, fontWeight: '700' },
  button: { alignItems: 'center', backgroundColor: '#315efb', borderRadius: 10, padding: 12 },
  buttonText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
