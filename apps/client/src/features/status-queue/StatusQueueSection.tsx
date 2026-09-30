import type { CompetitionStatusResponse, StatusReleaseCommandResponse } from '@molokh/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type CompetitionStatus = CompetitionStatusResponse['data'];
type QueueEntry = CompetitionStatus['queue'][number];
type StatusRelease = StatusReleaseCommandResponse['data'];

interface StatusQueueSectionProps {
  readonly competition: CompetitionStatus;
  readonly acting: boolean;
  readonly notice: string | null;
  readonly releasePreview: StatusRelease | null;
  readonly onJoin: () => void;
  readonly onReconfirm: (entry: QueueEntry) => void;
  readonly onWithdraw: (entry: QueueEntry) => void;
  readonly onGenesisResponse: (decision: 'ACCEPT' | 'DECLINE') => void;
  readonly onOpenGenesisChat: () => void;
  readonly onOpenActiveChallenge: () => void;
  readonly onPreviewRelease: () => void;
  readonly onConfirmRelease: () => void;
  readonly onCancelRelease: () => void;
}

const phaseLabels: Readonly<Record<CompetitionStatus['phase'], string>> = {
  FOUNDING_OPEN: 'Формирование первых статусов',
  FOUNDING_CHALLENGE: 'Первый статусный Challenge',
  RUNNING: 'Статусы активны',
  CONTENDER_VACANT_OPEN: 'Выбор нового Претендента',
  CONTENDER_GENESIS: 'Challenge за статус Претендента',
  CLOSED: 'Competition закрыта',
};

const queueStateLabels: Readonly<Record<QueueEntry['state'], string>> = {
  WAITING: 'В очереди',
  PAIRED_PENDING_ACCEPTANCE: 'Ожидает взаимного подтверждения',
  RECONFIRMATION_REQUIRED: 'Нужно подтвердить готовность',
  ACTIVATED: 'Challenge создаётся',
  CONSUMED: 'Использована',
  WITHDRAWN: 'Отозвана',
  INVALIDATED: 'Закрыта без поражения',
  EXPIRED: 'Срок подтверждения истёк',
};

const denialLabels: Partial<Record<NonNullable<CompetitionStatus['joinDenialCode']>, string>> = {
  ACCOUNT_NOT_VERIFIED: 'Для борьбы за статус нужна верификация аккаунта.',
  MEMBERSHIP_NOT_ACTIVE: 'Нужно активное Membership в этом Community.',
  COMPETITION_NOT_ACTIVE: 'Статусные действия временно приостановлены.',
  COMPETITION_INTEGRITY_HOLD: 'Статусные действия остановлены до завершения независимой проверки.',
  COMPETITION_PHASE_UNAVAILABLE: 'Сейчас идёт статусный Challenge. Очередь откроется после его завершения.',
  ALREADY_STATUS_HOLDER: 'У вас уже есть спортивный статус в Community.',
  PAIR_COOLDOWN_ACTIVE: 'С текущим Претендентом ещё действует 15-дневный cooldown.',
};

function localDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function joinCopy(competition: CompetitionStatus): { readonly title: string; readonly detail: string } {
  if (competition.phase === 'FOUNDING_OPEN') {
    return {
      title: 'Бороться за статус',
      detail: 'Вы явно вступите в GENESIS. Ожидание не имеет скрытого срока и не считается обязательством.',
    };
  }
  if (competition.phase === 'CONTENDER_VACANT_OPEN') {
    return {
      title: 'Бороться за статус',
      detail: 'Вы встанете в прозрачную очередь кандидатов на статус Претендента.',
    };
  }
  return {
    title: 'Встать в очередь',
    detail: 'Вызов текущему Претенденту активируется строго по FIFO, когда статусный слот освободится.',
  };
}

function releaseCopy(release: StatusRelease): { readonly title: string; readonly detail: string } {
  if (release.consequence === 'CHAMPION_SUCCESSION') {
    return {
      title: 'Передать статус №1',
      detail: `${release.successorDisplayName ?? 'Текущий Претендент'} станет №1. Место Претендента освободится.`,
    };
  }
  if (release.consequence === 'CHAMPION_VACANCY') {
    return {
      title: 'Освободить статус №1',
      detail: 'Сейчас Претендента нет, поэтому оба статусных места станут свободными.',
    };
  }
  return {
    title: 'Освободить статус Претендента',
    detail: '№1 сохранит свой статус, а место Претендента станет свободным.',
  };
}

export function StatusQueueSection({
  competition,
  acting,
  notice,
  releasePreview,
  onJoin,
  onReconfirm,
  onWithdraw,
  onGenesisResponse,
  onOpenGenesisChat,
  onOpenActiveChallenge,
  onPreviewRelease,
  onConfirmRelease,
  onCancelRelease,
}: StatusQueueSectionProps) {
  const ownEntry = competition.queue.find((entry) => entry.isViewerEntry) ?? null;
  const actionCopy = joinCopy(competition);

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text accessibilityRole="header" aria-level={2} style={styles.title}>Статусы Community</Text>
          <Text style={styles.phase}>{phaseLabels[competition.phase]}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>
            {competition.viewerStatus === 'CHAMPION'
              ? '№1'
              : competition.viewerStatus === 'CONTENDER'
                ? 'Претендент'
                : 'Участник'}
          </Text>
        </View>
      </View>

      <View style={styles.holders}>
        <View style={[styles.holder, styles.championHolder]}>
          <Text style={styles.holderLabel}>№1</Text>
          <Text style={styles.holderName}>{competition.champion?.displayName ?? 'Пока не определён'}</Text>
        </View>
        <View style={styles.holder}>
          <Text style={styles.holderLabel}>Претендент</Text>
          <Text style={styles.holderName}>{competition.contender?.displayName ?? 'Место свободно'}</Text>
        </View>
      </View>

      {releasePreview ? (
        <View style={styles.releaseCard}>
          <Text style={styles.releaseEyebrow}>Подтвердите последствия</Text>
          <Text style={styles.releaseTitle}>{releaseCopy(releasePreview).title}</Text>
          <Text style={styles.hint}>{releaseCopy(releasePreview).detail}</Text>
          <Text style={styles.releaseSafeText}>
            Membership останется активным. Поражение, Result и cooldown не создаются.
          </Text>
          <Text style={styles.hint}>
            Подтверждение доступно до {localDate(releasePreview.previewExpiresAt)}.
          </Text>
          <View style={styles.genesisActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: acting }}
              disabled={acting}
              onPress={onCancelRelease}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.genesisActionButton,
                acting && styles.disabled,
                pressed && !acting && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Оставить статус</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: acting }}
              disabled={acting}
              onPress={onConfirmRelease}
              style={({ pressed }) => [
                styles.releaseConfirmButton,
                styles.genesisActionButton,
                acting && styles.disabled,
                pressed && !acting && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>{acting ? 'Подтверждаем…' : 'Да, освободить'}</Text>
            </Pressable>
          </View>
        </View>
      ) : competition.viewerStatus === 'CHAMPION' || competition.viewerStatus === 'CONTENDER' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: acting }}
          disabled={acting}
          onPress={onPreviewRelease}
          style={({ pressed }) => [
            styles.statusReleaseButton,
            acting && styles.disabled,
            pressed && !acting && styles.pressed,
          ]}
        >
          <Text style={styles.statusReleaseButtonText}>Освободить спортивный статус</Text>
        </Pressable>
      ) : null}

      {competition.activeChallenge ? (
        <View style={styles.activeChallenge}>
          <Text style={styles.activeChallengeLabel}>Активный статусный Challenge</Text>
          <Text style={styles.activeChallengeText}>
            {competition.activeChallenge.initiatorDisplayName} · {competition.activeChallenge.recipientDisplayName}
          </Text>
          {competition.activeChallenge.viewerIsParticipant ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenActiveChallenge}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryChallengeText}>Открыть статусный Challenge</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {competition.viewerGenesisAction ? (
        <View style={styles.genesisCard}>
          <Text style={styles.genesisEyebrow}>GENESIS · взаимное решение</Text>
          <Text style={styles.genesisTitle}>
            Ваша пара — {competition.viewerGenesisAction.opponentDisplayName}
          </Text>
          <Text style={styles.hint}>
            Ответьте до {localDate(competition.viewerGenesisAction.responseDeadlineAt)}. До двух подтверждений обязательство и поражение не возникают.
          </Text>
          <View style={styles.rulesetBox}>
            <Text style={styles.rulesetLabel}>Правила Challenge</Text>
            <Text style={styles.rulesetText}>{competition.viewerGenesisAction.rulesetRef}</Text>
            {competition.viewerGenesisAction.rulesetAckMode === 'EXPLICIT_ACK_REQUIRED' ? (
              <Text style={styles.hint}>Нажимая «Готов участвовать», вы явно подтверждаете эти правила.</Text>
            ) : null}
          </View>
          {competition.viewerGenesisAction.acceptedCount === 2
            && ['ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED'].includes(
              competition.viewerGenesisAction.state,
            ) ? (
            <>
              <Text style={styles.successText}>
                {competition.viewerGenesisAction.state === 'BOOKED'
                  ? 'Official Session подтверждена залом.'
                  : competition.viewerGenesisAction.state === 'BOOKING_PENDING'
                    ? 'Оба участника готовы. Завершите совместный выбор слота и дождитесь подтверждения зала.'
                    : 'Оба участника готовы. Теперь выберите персональный слот с тренером.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenGenesisChat}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>
                  {competition.viewerGenesisAction.state === 'BOOKED'
                    ? 'Открыть Official Challenge'
                    : 'Перейти к выбору слота'}
                </Text>
              </Pressable>
            </>
          ) : competition.viewerGenesisAction.viewerDecision === 'ACCEPT' ? (
            <Text style={styles.successText}>Ваш ответ принят. Ждём подтверждение соперника.</Text>
          ) : competition.viewerGenesisAction.canAccept || competition.viewerGenesisAction.canDecline ? (
            <>
              {!competition.viewerGenesisAction.canAccept ? (
                <Text style={styles.hint}>
                  Сейчас подтвердить участие нельзя: изменились условия допуска одного из участников. Отказ остаётся без поражения.
                </Text>
              ) : null}
              <View style={styles.genesisActions}>
                {competition.viewerGenesisAction.canAccept ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: acting }}
                    disabled={acting}
                    onPress={() => onGenesisResponse('ACCEPT')}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      styles.genesisActionButton,
                      acting && styles.disabled,
                      pressed && !acting && styles.pressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>{acting ? 'Сохраняем…' : 'Готов участвовать'}</Text>
                  </Pressable>
                ) : null}
                {competition.viewerGenesisAction.canDecline ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: acting }}
                    disabled={acting}
                    onPress={() => onGenesisResponse('DECLINE')}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      styles.genesisActionButton,
                      acting && styles.disabled,
                      pressed && !acting && styles.pressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Отказаться без поражения</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.queueHeader}>
        <Text style={styles.queueTitle}>Прозрачная очередь</Text>
        <Text style={styles.queueCount}>{competition.queueSize}</Text>
      </View>
      <Text style={styles.hint}>Порядок задают только время сервера и ID заявки — без ручных привилегий.</Text>

      {competition.visibility === 'FULL' ? (
        competition.queue.length > 0 ? (
          <View style={styles.queueList}>
            {competition.queue.map((entry) => (
              <View
                key={entry.queueEntryId}
                style={[styles.queueRow, entry.isViewerEntry && styles.ownQueueRow]}
              >
                <View style={styles.positionCircle}>
                  <Text style={styles.positionText}>{entry.position ?? '—'}</Text>
                </View>
                <View style={styles.queueIdentity}>
                  <Text style={styles.queueName}>
                    {entry.initiatorDisplayName}{entry.isViewerEntry ? ' · Вы' : ''}
                  </Text>
                  <Text style={styles.queueMeta}>
                    {queueStateLabels[entry.state]} · {localDate(entry.submittedAt)}
                  </Text>
                  {entry.isViewerEntry && entry.singleCandidateDeadlineAt ? (
                    <Text style={styles.singleCandidateText}>
                      Если второй кандидат не появится, статус будет назначен после{' '}
                      {localDate(entry.singleCandidateDeadlineAt)}.
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Очередь пока пуста</Text>
            <Text style={styles.hint}>Первое место получит первая валидная заявка.</Text>
          </View>
        )
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>В очереди заявок: {competition.queueSize}</Text>
          <Text style={styles.hint}>Имена и точные позиции видны только активным участникам Community.</Text>
        </View>
      )}

      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

      {competition.visibility === 'FULL' && ownEntry?.state === 'RECONFIRMATION_REQUIRED' ? (
        <View style={styles.reconfirmationCard}>
          <Text style={styles.reconfirmationTitle}>Претендент изменился</Text>
          <Text style={styles.hint}>
            Новый Претендент — {competition.contender?.displayName ?? 'ещё не определён'}.
            Подтвердите готовность до {ownEntry.reconfirmationDeadlineAt
              ? localDate(ownEntry.reconfirmationDeadlineAt)
              : 'окончания срока'}. Ваше FIFO-место сохранено.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: acting }}
            disabled={acting}
            onPress={() => onReconfirm(ownEntry)}
            style={({ pressed }) => [
              styles.primaryButton,
              acting && styles.disabled,
              pressed && !acting && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>{acting ? 'Подтверждаем…' : 'Я готов сразиться'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: acting }}
            disabled={acting}
            onPress={() => onWithdraw(ownEntry)}
            style={({ pressed }) => [
              styles.secondaryButton,
              acting && styles.disabled,
              pressed && !acting && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Выйти без поражения</Text>
          </Pressable>
        </View>
      ) : competition.visibility === 'FULL' && ownEntry?.state === 'WAITING' ? (
        <View style={styles.actionBlock}>
          <Text style={styles.hint}>Выход не считается поражением. При повторном входе заявка окажется в конце очереди.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: acting }}
            disabled={acting}
            onPress={() => onWithdraw(ownEntry)}
            style={({ pressed }) => [
              styles.secondaryButton,
              acting && styles.disabled,
              pressed && !acting && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>{acting ? 'Отзываем…' : 'Покинуть очередь'}</Text>
          </Pressable>
        </View>
      ) : competition.visibility === 'FULL' && competition.canJoinQueue ? (
        <View style={styles.actionBlock}>
          <Text style={styles.hint}>{actionCopy.detail}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: acting }}
            disabled={acting}
            onPress={onJoin}
            style={({ pressed }) => [
              styles.primaryButton,
              acting && styles.disabled,
              pressed && !acting && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>{acting ? 'Добавляем…' : actionCopy.title}</Text>
          </Pressable>
        </View>
      ) : competition.visibility === 'FULL'
        && competition.joinDenialCode !== 'LIVE_QUEUE_ENTRY_EXISTS' ? (
        <Text style={styles.denial}>
          {competition.joinDenialCode
            ? denialLabels[competition.joinDenialCode] ?? 'Сейчас вступить в очередь нельзя.'
            : 'Сейчас вступить в очередь нельзя.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionBlock: { gap: 10 },
  activeChallenge: { backgroundColor: '#fff4db', borderRadius: 12, gap: 3, padding: 12 },
  activeChallengeLabel: { color: '#806218', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  activeChallengeText: { color: '#3f310c', fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderColor: '#ded9d0', borderRadius: 16, borderWidth: 1, gap: 14, padding: 18 },
  championHolder: { backgroundColor: '#fff7e6', borderColor: '#dfc994' },
  denial: { color: '#9b2c2c', fontSize: 14, lineHeight: 20 },
  disabled: { opacity: 0.55 },
  emptyState: { backgroundColor: '#f6f4ef', borderRadius: 12, gap: 4, padding: 13 },
  emptyTitle: { color: '#302d28', fontSize: 15, fontWeight: '700' },
  genesisActionButton: { flex: 1 },
  genesisActions: { flexDirection: 'row', gap: 9 },
  genesisCard: { backgroundColor: '#f0f6f2', borderColor: '#9ab9ad', borderRadius: 13, borderWidth: 1, gap: 9, padding: 14 },
  genesisEyebrow: { color: '#2f6254', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  genesisTitle: { color: '#17372f', fontSize: 17, fontWeight: '800' },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  headingText: { flex: 1, gap: 4 },
  hint: { color: '#6f6960', fontSize: 13, lineHeight: 19 },
  holder: { backgroundColor: '#f6f4ef', borderColor: '#ded9d0', borderRadius: 12, borderWidth: 1, flex: 1, gap: 5, minHeight: 82, padding: 12 },
  holderLabel: { color: '#8b2f22', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  holderName: { color: '#211f1b', fontSize: 15, fontWeight: '700' },
  holders: { flexDirection: 'row', gap: 10 },
  notice: { backgroundColor: '#eaf5e9', borderRadius: 10, color: '#2e6633', fontSize: 14, padding: 11 },
  ownQueueRow: { backgroundColor: '#fff7e6', borderColor: '#bf8b2e' },
  phase: { color: '#6f6960', fontSize: 13 },
  positionCircle: { alignItems: 'center', backgroundColor: '#8b2f22', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  positionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  primaryButton: { alignItems: 'center', backgroundColor: '#8b2f22', borderRadius: 11, paddingHorizontal: 15, paddingVertical: 13 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  queueCount: { backgroundColor: '#eee8df', borderRadius: 12, color: '#554f46', fontSize: 13, fontWeight: '800', minWidth: 25, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, textAlign: 'center' },
  queueHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  queueIdentity: { flex: 1, gap: 3 },
  queueList: { gap: 8 },
  queueMeta: { color: '#6f6960', fontSize: 12 },
  queueName: { color: '#211f1b', fontSize: 15, fontWeight: '700' },
  queueRow: { alignItems: 'center', borderColor: '#e3ded6', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 10 },
  queueTitle: { color: '#302d28', fontSize: 16, fontWeight: '800' },
  reconfirmationCard: { backgroundColor: '#fff4db', borderColor: '#dfc994', borderRadius: 12, borderWidth: 1, gap: 10, padding: 13 },
  reconfirmationTitle: { color: '#5f4309', fontSize: 16, fontWeight: '800' },
  releaseCard: { backgroundColor: '#fff1ee', borderColor: '#d8a59c', borderRadius: 13, borderWidth: 1, gap: 9, padding: 14 },
  releaseConfirmButton: { alignItems: 'center', backgroundColor: '#7d251c', borderRadius: 11, paddingHorizontal: 15, paddingVertical: 13 },
  releaseEyebrow: { color: '#8b2f22', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  releaseSafeText: { color: '#2e6633', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  releaseTitle: { color: '#4f1e18', fontSize: 17, fontWeight: '800' },
  rulesetBox: { backgroundColor: '#fff', borderColor: '#cddfd8', borderRadius: 10, borderWidth: 1, gap: 4, padding: 10 },
  rulesetLabel: { color: '#2f6254', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  rulesetText: { color: '#211f1b', fontSize: 14, fontWeight: '600', lineHeight: 19 },
  secondaryButton: { alignItems: 'center', borderColor: '#8b2f22', borderRadius: 11, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 12 },
  secondaryButtonText: { color: '#8b2f22', fontSize: 15, fontWeight: '800' },
  secondaryChallengeText: { color: '#8b2f22', fontSize: 14, fontWeight: '800' },
  statusBadge: { backgroundColor: '#2f6254', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  statusReleaseButton: { alignItems: 'center', paddingHorizontal: 15, paddingVertical: 8 },
  statusReleaseButtonText: { color: '#8b2f22', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  singleCandidateText: { color: '#2f6254', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  successText: { color: '#2e6633', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  title: { color: '#171512', fontSize: 18, fontWeight: '800' },
});
