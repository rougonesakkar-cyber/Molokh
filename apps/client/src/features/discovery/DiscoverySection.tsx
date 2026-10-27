import type {
  BlockedUsersResponse,
  DiscoveryCardsResponse,
  MatchesResponse,
} from '@molokh/contracts';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { sportLabel } from '../../lib/sports';

type DiscoveryCard = DiscoveryCardsResponse['data'][number];
type Match = MatchesResponse['data'][number];
type BlockedUser = BlockedUsersResponse['data'][number];
type PendingRelationshipAction = {
  readonly action: 'block' | 'unmatch';
  readonly matchId: string;
};

export type DiscoveryAction = 'like' | 'skip';

export interface DiscoverySectionProps {
  readonly actingCandidateId: string | null;
  readonly actingAction: DiscoveryAction | null;
  readonly actingRelationshipId: string | null;
  readonly blockedUsers: readonly BlockedUser[];
  readonly cards: readonly DiscoveryCard[];
  readonly matches: readonly Match[];
  readonly notice: string | null;
  readonly onAction: (candidate: DiscoveryCard, action: DiscoveryAction) => void;
  readonly onBlock: (match: Match) => void;
  readonly onOpenChat: (match: Match) => void;
  readonly onRefresh: () => void;
  readonly onUnblock: (blocked: BlockedUser) => void;
  readonly onUnmatch: (match: Match) => void;
  readonly showConnections?: boolean;
  readonly showDiscovery?: boolean;
}

export const DISCOVERY_PRESENTATION_COPY = {
  orderHint: 'Сначала показываем людей внутри вашего радиуса, затем расширяем поиск в пределах города.',
  inboundInterest: 'Хочет тренироваться с вами',
  cityExpansion: 'Расширение поиска в пределах города',
} as const;

export function DiscoverySection({
  actingAction,
  actingCandidateId,
  actingRelationshipId,
  blockedUsers,
  cards,
  matches,
  notice,
  onAction,
  onBlock,
  onOpenChat,
  onRefresh,
  onUnblock,
  onUnmatch,
  showConnections = true,
  showDiscovery = true,
}: DiscoverySectionProps) {
  const [pendingRelationshipAction, setPendingRelationshipAction] =
    useState<PendingRelationshipAction | null>(null);

  const matchesSection = matches.length > 0 ? (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" aria-level={2} style={styles.title}>Ваши Match</Text>
        <Text style={styles.countBadge}>{matches.length}</Text>
      </View>
      <Text style={styles.muted}>
        Взаимный интерес открыт. Следующий шаг — выбрать тренировку в чате.
      </Text>
      {matches.map((match) => (
        <View key={match.matchId} style={styles.match}>
          <View style={styles.matchIdentity}>
            <Text style={styles.name}>{match.counterpartDisplayName}</Text>
            <Text style={styles.hint}>
              {match.state === 'ACTIVE' ? 'Активный Match' : 'Архив'}
            </Text>
          </View>
          <View style={styles.matchActions}>
            {actingRelationshipId === match.matchId ? (
              <ActivityIndicator color="#8b2f22" />
            ) : (
              <>
                <Pressable
                  accessibilityLabel={`Открыть чат с ${match.counterpartDisplayName}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: actingRelationshipId !== null }}
                  disabled={actingRelationshipId !== null}
                  onPress={() => onOpenChat(match)}
                  style={({ pressed }) => [
                    styles.openChatAction,
                    actingRelationshipId !== null && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.openChatActionText}>Открыть чат</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Завершить Match с ${match.counterpartDisplayName}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: actingRelationshipId !== null }}
                  disabled={actingRelationshipId !== null}
                  onPress={() => setPendingRelationshipAction({ action: 'unmatch', matchId: match.matchId })}
                  style={({ pressed }) => [
                    styles.matchAction,
                    actingRelationshipId !== null && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.matchActionText}>Разъединить</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Заблокировать ${match.counterpartDisplayName}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: actingRelationshipId !== null }}
                  disabled={actingRelationshipId !== null}
                  onPress={() => setPendingRelationshipAction({ action: 'block', matchId: match.matchId })}
                  style={({ pressed }) => [
                    styles.blockAction,
                    actingRelationshipId !== null && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.blockActionText}>Заблокировать</Text>
                </Pressable>
              </>
            )}
          </View>
          {pendingRelationshipAction?.matchId === match.matchId ? (
            <View accessibilityLiveRegion="polite" style={styles.confirmation}>
              <Text style={styles.confirmationText}>
                {pendingRelationshipAction.action === 'unmatch'
                  ? 'Завершить Match? Чат закроется, а ваши анкеты не будут показываться друг другу 15 дней.'
                  : 'Заблокировать пользователя? Личный контакт закроется, но спортивные обязательства сохранятся.'}
              </Text>
              <View style={styles.confirmationActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPendingRelationshipAction(null)}
                  style={styles.confirmationCancel}
                >
                  <Text style={styles.matchActionText}>Отмена</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const action = pendingRelationshipAction.action;
                    setPendingRelationshipAction(null);
                    if (action === 'unmatch') onUnmatch(match);
                    else onBlock(match);
                  }}
                  style={styles.confirmationConfirm}
                >
                  <Text style={styles.confirmationConfirmText}>
                    {pendingRelationshipAction.action === 'unmatch' ? 'Завершить Match' : 'Заблокировать'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  ) : null;

  return (
    <>
      {showConnections ? matchesSection : null}

      {showDiscovery ? <View style={styles.section}>
        <Text accessibilityRole="header" aria-level={2} style={styles.title}>Люди для тренировки</Text>
        <Text style={styles.muted}>
          {DISCOVERY_PRESENTATION_COPY.orderHint}
        </Text>
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        {cards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Новых анкет пока нет</Text>
            <Text style={styles.hint}>
              Мы покажем подходящих спортсменов, когда они появятся. После пропуска или завершения Match анкета скрывается на 15 дней.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onRefresh}
              style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
            >
              <Text style={styles.refreshText}>Проверить снова</Text>
            </Pressable>
          </View>
        ) : (
          cards.map((candidate) => {
            const acting = actingCandidateId === candidate.candidateUserId;
            return (
              <View
                key={candidate.candidateUserId}
                style={[styles.candidate, candidate.inboundLike && styles.candidateInterested]}
              >
                <View style={styles.header}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {candidate.displayName.slice(0, 1).toLocaleUpperCase('ru-RU')}
                    </Text>
                  </View>
                  <View style={styles.identity}>
                    <Text style={styles.name}>{candidate.displayName}</Text>
                    <Text style={styles.muted}>
                      {sportLabel(candidate.primarySport)}
                      {candidate.secondarySport ? ` · ${sportLabel(candidate.secondarySport)}` : ''}
                    </Text>
                  </View>
                </View>
                {candidate.inboundLike ? (
                  <View style={styles.interestBadge}>
                    <Text style={styles.interestText}>{DISCOVERY_PRESENTATION_COPY.inboundInterest}</Text>
                  </View>
                ) : null}
                <Text style={styles.muted}>{candidate.homeVenue.displayName}</Text>
                <Text style={styles.hint}>
                  {candidate.geographyTier === 'WITHIN_RADIUS'
                    ? candidate.distanceKm === 0
                      ? 'Ваш домашний зал'
                      : `${candidate.distanceKm ?? '—'} км · внутри радиуса`
                    : DISCOVERY_PRESENTATION_COPY.cityExpansion}
                </Text>
                {candidate.experienceText ? (
                  <Text style={styles.experience}>{candidate.experienceText}</Text>
                ) : null}
                <View style={styles.actions}>
                  <Pressable
                    accessibilityLabel={`Пропустить ${candidate.displayName}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: actingCandidateId !== null }}
                    disabled={actingCandidateId !== null}
                    onPress={() => onAction(candidate, 'skip')}
                    style={({ pressed }) => [
                      styles.skipButton,
                      actingCandidateId !== null && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {acting && actingAction === 'skip' ? (
                      <ActivityIndicator color="#8b2f22" />
                    ) : (
                      <Text style={styles.skipText}>Пропустить</Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Предложить тренировку ${candidate.displayName}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: actingCandidateId !== null }}
                    disabled={actingCandidateId !== null}
                    onPress={() => onAction(candidate, 'like')}
                    style={({ pressed }) => [
                      styles.likeButton,
                      actingCandidateId !== null && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {acting && actingAction === 'like' ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.likeText}>
                        {candidate.inboundLike ? 'Создать Match' : 'Хочу тренироваться'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View> : null}

      {showConnections && blockedUsers.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" aria-level={2} style={styles.title}>Заблокированные пользователи</Text>
          <Text style={styles.muted}>
            Снятие блокировки не восстанавливает старый Match или личный чат.
          </Text>
          {blockedUsers.map((blocked) => (
            <View key={blocked.blockId} style={styles.match}>
              <View style={styles.matchIdentity}>
                <Text style={styles.name}>{blocked.blockedDisplayName}</Text>
                <Text style={styles.hint}>Личный контакт закрыт</Text>
              </View>
              <Pressable
                accessibilityLabel={`Снять блокировку с ${blocked.blockedDisplayName}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: actingRelationshipId !== null }}
                disabled={actingRelationshipId !== null}
                onPress={() => onUnblock(blocked)}
                style={({ pressed }) => [
                  styles.matchAction,
                  actingRelationshipId !== null && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {actingRelationshipId === blocked.blockId ? (
                  <ActivityIndicator color="#8b2f22" />
                ) : (
                  <Text style={styles.matchActionText}>Разблокировать</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#ffffff',
    borderColor: '#ded9cf',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  title: { color: '#171512', fontSize: 18, fontWeight: '700' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  countBadge: {
    backgroundColor: '#8b2f22',
    borderRadius: 999,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 24,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: 'center',
  },
  muted: { color: '#777168', flexShrink: 1, fontSize: 14, lineHeight: 20 },
  hint: { color: '#777168', fontSize: 13, lineHeight: 19 },
  emptyState: { gap: 8, paddingVertical: 4 },
  emptyTitle: { color: '#171512', fontSize: 15, fontWeight: '700' },
  refreshButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#8b2f22',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  refreshText: { color: '#8b2f22', fontSize: 14, fontWeight: '700' },
  notice: {
    backgroundColor: '#e8f1e9',
    borderRadius: 12,
    color: '#285d35',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    padding: 12,
  },
  candidate: {
    backgroundColor: '#faf9f6',
    borderColor: '#ded9cf',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  candidateInterested: { borderColor: '#8b2f22', borderWidth: 2 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  identity: { flex: 1, gap: 3 },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e9ddd7',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarText: { color: '#8b2f22', fontSize: 22, fontWeight: '800' },
  name: { color: '#171512', fontSize: 17, fontWeight: '700' },
  experience: { color: '#4c4943', fontSize: 14, lineHeight: 20 },
  interestBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f4dfda',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  interestText: { color: '#7a261b', fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  skipButton: {
    alignItems: 'center',
    borderColor: '#8b2f22',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  skipText: { color: '#8b2f22', fontSize: 14, fontWeight: '700' },
  likeButton: {
    alignItems: 'center',
    backgroundColor: '#8b2f22',
    borderRadius: 12,
    flex: 1.4,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  likeText: { color: '#ffffff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
  match: {
    alignItems: 'stretch',
    backgroundColor: '#faf9f6',
    borderRadius: 14,
    gap: 12,
    padding: 16,
  },
  matchIdentity: { gap: 4 },
  matchActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  openChatAction: {
    backgroundColor: '#8b2f22',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  openChatActionText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  matchAction: {
    borderColor: '#8b2f22',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  matchActionText: { color: '#8b2f22', fontSize: 12, fontWeight: '700' },
  blockAction: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  blockActionText: { color: '#777168', fontSize: 12, fontWeight: '600' },
  confirmation: {
    backgroundColor: '#fff7e6',
    borderColor: '#dfc994',
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  confirmationText: { color: '#5d4610', fontSize: 13, lineHeight: 19 },
  confirmationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  confirmationCancel: {
    alignItems: 'center',
    borderColor: '#8b2f22',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  confirmationConfirm: {
    alignItems: 'center',
    backgroundColor: '#8b2f22',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  confirmationConfirmText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
});
