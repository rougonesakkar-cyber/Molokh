import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type AppTheme, useAppTheme } from '../../ui/theme';
import type { AppDestination } from './navigation';

interface HomeSectionProps {
  readonly coachInviteCount: number;
  readonly hostConfirmationCount: number;
  readonly matchCount: number;
  readonly operationalCount: number;
  readonly role: string;
  readonly sessionCount: number;
  readonly onNavigate: (destination: AppDestination) => void;
}

interface NextAction {
  readonly action: string;
  readonly destination: AppDestination;
  readonly explanation: string;
}

function nextAction(props: HomeSectionProps): NextAction {
  if (props.role !== 'Athlete') {
    return props.operationalCount > 0
      ? {
          action: 'Открыть рабочую очередь',
          destination: 'HOME',
          explanation: `Ожидают внимания: ${props.operationalCount}. Сначала обработайте старейшую заявку.`,
        }
      : {
          action: 'Рабочая очередь открыта',
          destination: 'HOME',
          explanation: 'Новых обязательных действий нет. Ниже доступны текущие рабочие процессы.',
        };
  }
  if (props.hostConfirmationCount > 0) return {
    action: 'Подтвердить бронирование',
    destination: 'COMMUNITY',
    explanation: `Ожидают ответа: ${props.hostConfirmationCount}. Подтверждение зала создаёт Session.`,
  };
  if (props.coachInviteCount > 0) return {
    action: 'Ответить на приглашение Coach',
    destination: 'COMMUNITY',
    explanation: `Новых приглашений: ${props.coachInviteCount}.`,
  };
  if (props.sessionCount > 0) return {
    action: 'Проверить ближайшую Session',
    destination: 'COMMUNITY',
    explanation: `Активных Session: ${props.sessionCount}.`,
  };
  if (props.matchCount > 0) return {
    action: 'Договориться о тренировке',
    destination: 'CHATS',
    explanation: `Активных Match: ${props.matchCount}. Выберите тренировку вместе в чате.`,
  };
  return {
    action: 'Найти партнёра',
    destination: 'DISCOVERY',
    explanation: 'Обязательных действий нет. Можно предложить кому-нибудь тренировку.',
  };
}

export function HomeSection(props: HomeSectionProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const next = nextAction(props);
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" aria-level={2} style={styles.eyebrow}>
        Следующее действие
      </Text>
      <Text style={styles.title}>{next.action}</Text>
      <Text style={styles.explanation}>{next.explanation}</Text>
      {next.destination !== 'HOME' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => props.onNavigate(next.destination)}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Перейти</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 20,
  },
  eyebrow: { color: theme.colors.primary, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: '800', lineHeight: 28 },
  explanation: { color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  buttonText: { color: theme.colors.onPrimary, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  });
}
