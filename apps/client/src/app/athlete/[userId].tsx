import type { PublicAthleteProfileResponse } from '@molokh/contracts';
import { useQuery } from '@tanstack/react-query';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PublicAthleteProfileCard } from '../../features/public-profile/PublicAthleteProfileCard';
import { localToken } from '../../lib/api';
import { clientQueryKeys, fetchApiQuery, queryFreshness } from '../../lib/query';
import { type AppTheme, useAppTheme } from '../../ui/theme';

function firstParameter(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function AthleteProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    userId?: string | string[];
    competitionId?: string | string[];
    returnTo?: string | string[];
  }>();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const userId = firstParameter(params.userId);
  const competitionId = firstParameter(params.competitionId);
  const requestedReturn = firstParameter(params.returnTo);
  const returnTo = ['discovery', 'chats', 'community'].includes(requestedReturn)
    ? requestedReturn
    : 'discovery';
  const profileQuery = useQuery({
    enabled: userId.length > 0,
    queryKey: clientQueryKeys.resource(
      `public-profile:${userId}`,
      'profile',
      competitionId || 'primary',
    ),
    queryFn: async (context) => {
      const query = competitionId ? `?competitionId=${encodeURIComponent(competitionId)}` : '';
      const response = await fetchApiQuery<PublicAthleteProfileResponse>({
        path: `/api/v1/athletes/${encodeURIComponent(userId)}/profile${query}`,
        token: localToken,
      }, context);
      if (!response) throw new Error('Профиль не найден.');
      return response;
    },
    staleTime: queryFreshness.profile,
  });

  const leaveProfile = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(({
      pathname: '/',
      params: { section: returnTo },
    } as unknown) as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={leaveProfile} style={styles.backButton}>
          <Text style={styles.backText}>Назад</Text>
        </Pressable>
        <Text accessibilityRole="header" aria-level={1} style={styles.title}>
          Спортивный профиль
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!userId || profileQuery.isPending ? (
          <View accessibilityLiveRegion="polite" style={styles.stateCard}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.muted}>Загружаем публичный профиль…</Text>
          </View>
        ) : profileQuery.data ? (
          <PublicAthleteProfileCard profile={profileQuery.data.data} />
        ) : (
          <View style={styles.errorCard}>
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
              {profileQuery.error instanceof Error
                ? profileQuery.error.message
                : 'Профиль временно недоступен.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void profileQuery.refetch()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Повторить</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: { backgroundColor: theme.colors.background, flex: 1 },
    header: {
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 16,
    },
    backButton: { justifyContent: 'center', minHeight: theme.touchTarget, paddingRight: 8 },
    backText: { color: theme.colors.primary, fontSize: 15, fontWeight: '700' },
    title: { color: theme.colors.text, flex: 1, fontSize: 20, fontWeight: '800' },
    content: { alignSelf: 'center', maxWidth: 760, padding: 20, width: '100%' },
    stateCard: { alignItems: 'center', gap: 12, padding: 32 },
    muted: { color: theme.colors.textMuted, fontSize: 14 },
    errorCard: {
      backgroundColor: theme.colors.dangerBackground,
      borderColor: theme.colors.dangerBorder,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 18,
    },
    errorText: { color: theme.colors.dangerText, fontSize: 14, lineHeight: 20 },
    retryButton: { justifyContent: 'center', minHeight: theme.touchTarget },
    retryText: { color: theme.colors.primary, fontSize: 15, fontWeight: '700' },
  });
}
