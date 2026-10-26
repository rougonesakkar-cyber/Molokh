import type { MembershipExitCommandResponse } from '@molokh/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type MembershipExit = MembershipExitCommandResponse['data'];

interface MembershipExitSectionProps {
  readonly acting: boolean;
  readonly notice: string | null;
  readonly preview: MembershipExit | null;
  readonly onPreview: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function localDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function consequenceCopy(exit: MembershipExit): string {
  if (exit.consequence === 'ACCEPTED_CHALLENGE_FORFEIT') {
    return `${exit.opponentDisplayName ?? 'Соперник'} получит победу по Forfeit. Результат станет FINAL сразу, начнётся cooldown, а вы безвозвратно откажетесь от Appeal.`;
  }
  if (exit.consequence === 'CHAMPION_SUCCESSION') {
    return `${exit.successorDisplayName ?? 'Текущий Претендент'} станет №1, а место Претендента освободится.`;
  }
  if (exit.consequence === 'CHAMPION_VACANCY') {
    return 'Статусы №1 и Претендента станут свободными.';
  }
  if (exit.consequence === 'CONTENDER_VACANCY') {
    return '№1 сохранит статус, а место Претендента освободится.';
  }
  return 'Непринятые приглашения на Challenge закроются без поражения.';
}

export function MembershipExitSection({
  acting, notice, preview, onPreview, onConfirm, onCancel,
}: MembershipExitSectionProps) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" aria-level={2} style={styles.title}>
        Membership
      </Text>
      {preview ? (
        <View style={styles.confirmation}>
          <Text style={styles.warning}>Покинуть Community?</Text>
          <Text style={styles.detail}>{consequenceCopy(preview)}</Text>
          <Text style={preview.createsForfeit ? styles.risk : styles.safe}>
            {preview.createsForfeit
              ? 'Это действие создаст подтверждённое поражение и сразу закроет право на Appeal. Отменить его после подтверждения нельзя.'
              : 'В этом сценарии Result, поражение и cooldown не создаются. История останется сохранённой.'}
          </Text>
          <Text style={styles.detail}>
            Подтверждение доступно до {localDate(preview.previewExpiresAt)}.
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: acting }}
              disabled={acting}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.secondaryButton, acting && styles.disabled,
                pressed && !acting && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryText}>Остаться</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: acting }}
              disabled={acting}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.dangerButton, acting && styles.disabled,
                pressed && !acting && styles.pressed,
              ]}
            >
              <Text style={styles.dangerText}>{acting ? 'Подтверждаем…' : 'Да, покинуть'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.detail}>
            Вы можете добровольно выйти. Система сначала покажет точные последствия и попросит подтверждение.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: acting }}
            disabled={acting}
            onPress={onPreview}
            style={({ pressed }) => [
              styles.secondaryButton, acting && styles.disabled,
              pressed && !acting && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryText}>{acting ? 'Проверяем…' : 'Покинуть Community'}</Text>
          </Pressable>
        </>
      )}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderColor: '#ded8cc', borderRadius: 18,
    borderWidth: 1, gap: 10, padding: 18,
  },
  title: { color: '#1f2522', fontSize: 19, fontWeight: '800' },
  detail: { color: '#626760', fontSize: 14, lineHeight: 20 },
  confirmation: { gap: 10 },
  warning: { color: '#7d2d25', fontSize: 17, fontWeight: '800' },
  safe: {
    backgroundColor: '#edf5ef', borderRadius: 10, color: '#326044',
    fontSize: 13, lineHeight: 19, padding: 10,
  },
  risk: {
    backgroundColor: '#f8e9e7', borderRadius: 10, color: '#7d2d25',
    fontSize: 13, lineHeight: 19, padding: 10,
  },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryButton: {
    alignItems: 'center', borderColor: '#b7b0a4', borderRadius: 12,
    borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12,
  },
  secondaryText: { color: '#3f4641', fontSize: 14, fontWeight: '700' },
  dangerButton: {
    alignItems: 'center', backgroundColor: '#8f382f', borderRadius: 12,
    flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12,
  },
  dangerText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  notice: { color: '#326044', fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.78 },
});
