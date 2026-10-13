import type {
  BookingIntentCommandResponse,
  ChallengeCommandResponse,
  ChatChallengeResponse,
  ChatMessageActionResponse,
  ChatMessageCommandResponse,
  ChatMessagesResponse,
  GroupPlanCommandResponse,
  GroupPlanOfficialConversionCommandResponse,
  MyGroupPlanOfficialConversionsResponse,
  MutualChallengeRescheduleRequestResponse,
  TrainingOptionsResponse,
  YouthConsentCommandResponse,
  YouthConsentSummaryResponse,
} from '@molokh/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiErrorMessage, apiUrl, localToken } from '../lib/api';

type ChatMessage = ChatMessagesResponse['data'][number];
type TrainingOptions = TrainingOptionsResponse['data'];
type GroupPlanOfficialConversion = MyGroupPlanOfficialConversionsResponse['data'][number];
type ChatChallenge = ChatChallengeResponse['data'];
type ChatState = ChatMessagesResponse['meta']['chatState'];
type YouthConsentSummary = YouthConsentSummaryResponse['data'];
type PendingMessageAction = {
  readonly action: 'hide' | 'report';
  readonly messageId: string;
};

function firstParameter(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function newAsciiIdempotencyKey(scope: 'chat' | 'scheduling'): string {
  const time = Date.now().toString(36);
  const nonce = Math.random().toString(36).slice(2);
  return `${scope}:${time}:${nonce}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    chatId?: string | string[];
    counterpart?: string | string[];
  }>();
  const chatId = firstParameter(params.chatId);
  const counterpart = firstParameter(params.counterpart) || 'Партнёр по тренировке';
  const [viewerUserId, setViewerUserId] = useState('');
  const [chatState, setChatState] = useState<ChatState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [trainingOptions, setTrainingOptions] = useState<TrainingOptions | null>(null);
  const [groupPlanConversions, setGroupPlanConversions] = useState<GroupPlanOfficialConversion[]>([]);
  const [chatChallenge, setChatChallenge] = useState<ChatChallenge | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [actingChallenge, setActingChallenge] = useState(false);
  const [youthConsent, setYouthConsent] = useState<YouthConsentSummary | null>(null);
  const [guardianEmail, setGuardianEmail] = useState('');
  const [requestingYouthConsent, setRequestingYouthConsent] = useState(false);
  const [developmentConsentUrl, setDevelopmentConsentUrl] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [actingTrainingId, setActingTrainingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingMessageId, setActingMessageId] = useState<string | null>(null);
  const [pendingMessageAction, setPendingMessageAction] =
    useState<PendingMessageAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionKeys = useRef(new Map<string, string>());

  const leaveChat = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  const loadMessages = useCallback(async () => {
    if (!chatId) {
      setError('Не указан Chat. Вернитесь к списку Match.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/chats/${chatId}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as ChatMessagesResponse;
      setMessages(result.data);
      setViewerUserId(result.meta.viewerUserId);
      setChatState(result.meta.chatState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить сообщения');
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const loadChallenge = useCallback(async () => {
    if (!chatId) return;
    setChallengeLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/chats/${chatId}/challenge`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as ChatChallengeResponse;
      setChatChallenge(result.data);
    } catch (caught) {
      setChatChallenge(null);
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить Official Challenge');
    } finally {
      setChallengeLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const activeChallengeId = chatChallenge?.challenge?.challengeId ?? '';
  const loadYouthConsent = useCallback(async () => {
    if (!activeChallengeId) {
      setYouthConsent(null);
      return;
    }
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/challenges/${activeChallengeId}/youth-consents`,
        { headers: { Authorization: `Bearer ${localToken}` } },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as YouthConsentSummaryResponse;
      setYouthConsent(result.data);
    } catch (caught) {
      setYouthConsent(null);
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить согласие представителя');
    }
  }, [activeChallengeId]);

  useEffect(() => {
    void loadYouthConsent();
  }, [loadYouthConsent]);

  const loadTrainingOptions = useCallback(async () => {
    if (!chatId) {
      setOptionsLoading(false);
      return;
    }
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const headers = { Authorization: `Bearer ${localToken}` };
      const [response, conversionResponse] = await Promise.all([
        fetch(`${apiUrl}/api/v1/chats/${chatId}/training-options`, { headers }),
        fetch(`${apiUrl}/api/v1/me/group-plan-official-conversions`, { headers }),
      ]);
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      if (!conversionResponse.ok) throw new Error(await apiErrorMessage(conversionResponse));
      const [result, conversionResult] = await Promise.all([
        response.json() as Promise<TrainingOptionsResponse>,
        conversionResponse.json() as Promise<MyGroupPlanOfficialConversionsResponse>,
      ]);
      setTrainingOptions(result.data);
      setGroupPlanConversions(conversionResult.data.filter((item) => item.chatId === chatId));
      setViewerUserId(result.meta.viewerUserId);
    } catch (caught) {
      setTrainingOptions(null);
      setGroupPlanConversions([]);
      setOptionsError(
        caught instanceof Error ? caught.message : 'Не удалось загрузить расписание',
      );
    } finally {
      setOptionsLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    if (chatState === 'OPEN') {
      void loadTrainingOptions();
      return;
    }
    if (chatState !== null) {
      setTrainingOptions(null);
      setOptionsError(null);
      setOptionsLoading(false);
    }
  }, [chatState, loadTrainingOptions]);

  const normalizedDraft = draft.trim();
  const chatIsOpen = chatState === 'OPEN';
  const challengeIsTerminal = chatChallenge?.challenge
    ? ['COMPLETED', 'DECLINED', 'WITHDRAWN', 'CANCELLED_NO_FAULT', 'EXPIRED_NO_FAULT'].includes(chatChallenge.challenge.state)
    : false;
  const chatStateMessage =
    chatState === 'CLOSED'
      ? 'Match завершён. История чата сохранена, но новые сообщения и тренировки недоступны.'
      : chatState === 'READ_ONLY'
        ? 'Чат доступен только для чтения.'
        : chatState === 'ARCHIVED'
          ? 'Чат перенесён в архив и доступен только для чтения.'
          : null;
  const editingMessage = useMemo(
    () => messages.find((message) => message.messageId === editingMessageId) ?? null,
    [editingMessageId, messages],
  );

  const runTrainingAction = async (input: {
    operation: string;
    resourceId: string;
    path: string;
    version: number;
    body: Record<string, unknown>;
  }) => {
    if (actingTrainingId !== null) return;
    const idempotencyKey =
      actionKeys.current.get(input.operation) ??
      newAsciiIdempotencyKey('scheduling');
    actionKeys.current.set(input.operation, idempotencyKey);
    setActingTrainingId(input.resourceId);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}${input.path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': String(input.version),
        },
        body: JSON.stringify(input.body),
      });
      if (!response.ok) {
        if (response.status === 409) {
          await Promise.all([loadTrainingOptions(), loadChallenge()]);
        }
        throw new Error(await apiErrorMessage(response));
      }
      await response.json() as BookingIntentCommandResponse | GroupPlanCommandResponse
        | GroupPlanOfficialConversionCommandResponse;
      actionKeys.current.delete(input.operation);
      await Promise.all([loadTrainingOptions(), loadChallenge()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить план тренировки');
    } finally {
      setActingTrainingId(null);
    }
  };

  const runChallengeAction = async (
    action: 'create' | 'accept' | 'decline' | 'withdraw',
  ) => {
    if (!chatId || actingChallenge) return;
    const challenge = chatChallenge?.challenge;
    if (action !== 'create' && !challenge) return;
    const resourceVersion = action === 'create' ? 0 : challenge!.version;
    const operation = `challenge:${action}:${chatId}:v${resourceVersion}`;
    const idempotencyKey =
      actionKeys.current.get(operation) ?? newAsciiIdempotencyKey('scheduling');
    actionKeys.current.set(operation, idempotencyKey);
    setActingChallenge(true);
    setError(null);
    try {
      const path = action === 'create'
        ? '/api/v1/challenges'
        : `/api/v1/challenges/${challenge!.challengeId}/${action}`;
      const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': String(resourceVersion),
        },
        body: JSON.stringify(action === 'create' ? { sourceChatId: chatId } : {}),
      });
      if (!response.ok) {
        if (response.status === 409) await loadChallenge();
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as ChallengeCommandResponse;
      actionKeys.current.delete(operation);
      setChatChallenge((current) => current ? { ...current, challenge: result.data, canCreate: false, createDenialCode: 'PAIR_CHALLENGE_EXISTS' } : current);
      await loadChallenge();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить Official Challenge');
    } finally {
      setActingChallenge(false);
    }
  };

  const runChallengeReschedule = async (
    reasonCode: 'SCHEDULE_CHANGED' | 'OTHER',
    confirmForfeit = false,
  ) => {
    const challenge = chatChallenge?.challenge;
    if (!challenge || actingChallenge) return;
    const operation = `challenge:reschedule:${challenge.challengeId}:v${challenge.version}:${reasonCode}:${confirmForfeit}`;
    const idempotencyKey = actionKeys.current.get(operation)
      ?? newAsciiIdempotencyKey('scheduling');
    actionKeys.current.set(operation, idempotencyKey);
    setActingChallenge(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/challenges/${challenge.challengeId}/reschedule`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(challenge.version),
          },
          body: JSON.stringify({ reasonCode, confirmForfeit }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) {
          await Promise.all([loadChallenge(), loadTrainingOptions()]);
        }
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as ChallengeCommandResponse;
      actionKeys.current.delete(operation);
      setChatChallenge((current) => current ? { ...current, challenge: result.data } : current);
      await Promise.all([loadChallenge(), loadTrainingOptions()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось перенести Challenge');
    } finally {
      setActingChallenge(false);
    }
  };

  const confirmChallengeReschedule = () => {
    const challenge = chatChallenge?.challenge;
    if (!challenge) return;
    if (challenge.userRescheduleCount >= 2) {
      Alert.alert(
        'Переносы закончились',
        'Ещё один виновный перенос немедленно зафиксирует ваш FORFEIT и поражение. Партнёр станет победителем, возможное изменение статуса и Cooldown начнутся сразу. Result можно обжаловать в течение 48 часов.',
        [
          { text: 'Вернуться', style: 'cancel' },
          {
            text: 'Подтвердить FORFEIT',
            style: 'destructive',
            onPress: () => void runChallengeReschedule('OTHER', true),
          },
        ],
      );
      return;
    }
    Alert.alert(
      'Перенести Challenge?',
      `Будет использован перенос ${challenge.userRescheduleCount + 1} из 2. Текущий выбор слота отменится без поражения, а Challenge останется принятым.`,
      [
        { text: 'Не переносить', style: 'cancel' },
        {
          text: 'Изменилось расписание',
          onPress: () => void runChallengeReschedule('SCHEDULE_CHANGED'),
        },
        { text: 'Другая причина', onPress: () => void runChallengeReschedule('OTHER') },
      ],
    );
  };

  const runMutualRescheduleProposal = async (
    reasonCode: 'SCHEDULE_CHANGED' | 'OTHER',
  ) => {
    const challenge = chatChallenge?.challenge;
    if (!challenge || actingChallenge) return;
    const operation = `challenge:mutual-reschedule:propose:${challenge.challengeId}:v${challenge.version}:${reasonCode}`;
    const idempotencyKey = actionKeys.current.get(operation)
      ?? newAsciiIdempotencyKey('scheduling');
    actionKeys.current.set(operation, idempotencyKey);
    setActingChallenge(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/challenges/${challenge.challengeId}/mutual-reschedules`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(challenge.version),
          },
          body: JSON.stringify({ reasonCode }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadChallenge();
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as MutualChallengeRescheduleRequestResponse;
      actionKeys.current.delete(operation);
      setChatChallenge((current) => current
        ? { ...current, mutualRescheduleRequest: result.data }
        : current);
      await loadChallenge();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось предложить взаимный перенос');
    } finally {
      setActingChallenge(false);
    }
  };

  const confirmMutualRescheduleProposal = async () => {
    const challenge = chatChallenge?.challenge;
    const request = chatChallenge?.mutualRescheduleRequest;
    if (!challenge || !request || actingChallenge || request.proposedByUserId === viewerUserId) return;
    const operation = `challenge:mutual-reschedule:confirm:${request.requestId}:v${request.version}`;
    const idempotencyKey = actionKeys.current.get(operation)
      ?? newAsciiIdempotencyKey('scheduling');
    actionKeys.current.set(operation, idempotencyKey);
    setActingChallenge(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/challenges/${challenge.challengeId}/mutual-reschedules/${request.requestId}/confirm`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(challenge.version),
          },
          body: JSON.stringify({ requestVersion: request.version }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) {
          await Promise.all([loadChallenge(), loadTrainingOptions()]);
        }
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as ChallengeCommandResponse;
      actionKeys.current.delete(operation);
      setChatChallenge((current) => current
        ? { ...current, challenge: result.data, mutualRescheduleRequest: null }
        : current);
      await Promise.all([loadChallenge(), loadTrainingOptions()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подтвердить взаимный перенос');
    } finally {
      setActingChallenge(false);
    }
  };

  const proposeMutualReschedule = () => {
    const challenge = chatChallenge?.challenge;
    if (!challenge || challenge.userRescheduleCount >= 2) return;
    Alert.alert(
      'Предложить взаимный перенос?',
      `Пока партнёр не подтвердит, Session и Challenge не изменятся. После подтверждения будет использован перенос ${challenge.userRescheduleCount + 1} из 2 без назначения виновного.`,
      [
        { text: 'Не предлагать', style: 'cancel' },
        {
          text: 'Изменилось расписание',
          onPress: () => void runMutualRescheduleProposal('SCHEDULE_CHANGED'),
        },
        { text: 'Другая причина', onPress: () => void runMutualRescheduleProposal('OTHER') },
      ],
    );
  };

  const confirmMutualReschedule = () => {
    Alert.alert(
      'Подтвердить взаимный перенос?',
      'Текущая бронь будет закрыта без поражения. Challenge вернётся к выбору времени, а общий счётчик переносов увеличится на один.',
      [
        { text: 'Не подтверждать', style: 'cancel' },
        { text: 'Подтвердить перенос', onPress: () => void confirmMutualRescheduleProposal() },
      ],
    );
  };

  const requestGuardianConsent = async () => {
    const challengeId = chatChallenge?.challenge?.challengeId;
    const normalizedEmail = guardianEmail.trim();
    if (!challengeId || requestingYouthConsent || !normalizedEmail) return;
    const operation = `youth-consent:request:${challengeId}`;
    const idempotencyKey = actionKeys.current.get(operation)
      ?? newAsciiIdempotencyKey('scheduling');
    actionKeys.current.set(operation, idempotencyKey);
    setRequestingYouthConsent(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/challenges/${challengeId}/youth-consents`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': '0',
          },
          body: JSON.stringify({ channel: 'EMAIL', guardianContact: normalizedEmail }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as YouthConsentCommandResponse;
      setDevelopmentConsentUrl(result.meta.developmentActionUrl ?? null);
      actionKeys.current.delete(operation);
      await loadYouthConsent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить ссылку представителю');
    } finally {
      setRequestingYouthConsent(false);
    }
  };

  const chooseSlot = async (slot: TrainingOptions['slots'][number]) => {
    if (!chatId || !viewerUserId) return;
    const booking = trainingOptions?.activeIntent.booking;
    if (!booking) {
      const acceptedChallenge = chatChallenge?.challenge?.state === 'ACCEPTED_UNSCHEDULED'
        ? chatChallenge.challenge
        : null;
      await runTrainingAction({
        operation: `select-slot:${chatId}:${slot.slotId}:v${slot.commercialVersion}:${acceptedChallenge?.challengeId ?? 'training'}`,
        resourceId: slot.slotId,
        path: '/api/v1/bookings',
        version: 0,
        body: {
          chatId,
          slotId: slot.slotId,
          commercialVersion: slot.commercialVersion,
          ...(acceptedChallenge ? { challengeId: acceptedChallenge.challengeId } : {}),
        },
      });
      return;
    }
    if (
      booking.state === 'SELECTING' &&
      booking.slotId === slot.slotId &&
      !booking.selectedByUserIds.includes(viewerUserId)
    ) {
      await runTrainingAction({
        operation: `select-same:${booking.bookingId}:v${booking.version}`,
        resourceId: slot.slotId,
        path: `/api/v1/bookings/${booking.bookingId}/select-same`,
        version: booking.version,
        body: { commercialVersion: slot.commercialVersion },
      });
    }
  };

  const confirmBookingWithdrawal = (
    booking: NonNullable<TrainingOptions['activeIntent']['booking']>,
  ) => {
    Alert.alert(
      'Отменить выбор слота?',
      booking.purpose === 'OFFICIAL_CHALLENGE'
        ? 'Challenge останется принятым. Вы сможете выбрать другое время без поражения, Cooldown или переноса.'
        : 'Запрос будет закрыт без бронирования и спортивных последствий.',
      [
        { text: 'Оставить выбор', style: 'cancel' },
        {
          text: 'Отменить выбор',
          style: 'destructive',
          onPress: () => {
            void runTrainingAction({
              operation: `withdraw-booking:${booking.bookingId}:v${booking.version}`,
              resourceId: booking.bookingId,
              path: `/api/v1/bookings/${booking.bookingId}/withdraw`,
              version: booking.version,
              body: {},
            });
          },
        },
      ],
    );
  };

  const chooseGroup = async (offering: TrainingOptions['groupOfferings'][number]) => {
    if (!chatId || !viewerUserId) return;
    const plan = trainingOptions?.activeIntent.groupPlan;
    if (!plan) {
      await runTrainingAction({
        operation: `propose-group:${chatId}:${offering.groupOfferingId}:v${offering.version}`,
        resourceId: offering.groupOfferingId,
        path: '/api/v1/group-plans',
        version: 0,
        body: { chatId, groupOfferingId: offering.groupOfferingId, offeringVersion: offering.version },
      });
      return;
    }
    if (
      plan.state === 'PROPOSED' &&
      plan.groupOfferingId === offering.groupOfferingId &&
      plan.proposedByUserId !== viewerUserId
    ) {
      await runTrainingAction({
        operation: `confirm-group:${plan.groupPlanId}:v${plan.version}`,
        resourceId: offering.groupOfferingId,
        path: `/api/v1/group-plans/${plan.groupPlanId}/confirm`,
        version: plan.version,
        body: {},
      });
    }
  };

  const requestGroupOfficialConversion = async (
    plan: NonNullable<TrainingOptions['activeIntent']['groupPlan']>,
  ) => {
    await runTrainingAction({
      operation: `request-group-official:${plan.groupPlanId}:v${plan.version}`,
      resourceId: plan.groupPlanId,
      path: `/api/v1/group-plans/${plan.groupPlanId}/request-official-conversion`,
      version: plan.version,
      body: { explicitRulesetAcknowledged: true },
    });
  };

  const decideGroupOfficialConversion = async (
    conversion: GroupPlanOfficialConversion,
    decision: 'ACCEPT' | 'DECLINE',
  ) => {
    await runTrainingAction({
      operation: `decide-group-official:${conversion.conversionId}:${decision}:v${conversion.version}`,
      resourceId: conversion.conversionId,
      path: `/api/v1/group-plan-official-conversions/${conversion.conversionId}/decision`,
      version: conversion.version,
      body: { decision, explicitRulesetAcknowledged: decision === 'ACCEPT' },
    });
  };

  const sendOrEdit = async () => {
    if (!chatId || !normalizedDraft || actingMessageId !== null) return;
    const operation = editingMessage
      ? `edit:${editingMessage.messageId}:v${editingMessage.version}:${normalizedDraft}`
      : `send:${chatId}:${normalizedDraft}`;
    const idempotencyKey =
      actionKeys.current.get(operation) ?? newAsciiIdempotencyKey('chat');
    actionKeys.current.set(operation, idempotencyKey);
    setActingMessageId(editingMessage?.messageId ?? 'new');
    setError(null);
    try {
      const response = await fetch(
        editingMessage
          ? `${apiUrl}/api/v1/messages/${editingMessage.messageId}`
          : `${apiUrl}/api/v1/chats/${chatId}/messages`,
        {
          method: editingMessage ? 'PATCH' : 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(editingMessage?.version ?? 0),
          },
          body: JSON.stringify({ text: normalizedDraft }),
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await loadMessages();
        throw new Error(message);
      }
      const result = (await response.json()) as ChatMessageCommandResponse;
      actionKeys.current.delete(operation);
      setMessages((current) =>
        editingMessage
          ? current.map((message) =>
              message.messageId === result.data.messageId ? result.data : message,
            )
          : [...current, result.data],
      );
      setDraft('');
      setEditingMessageId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить сообщение');
    } finally {
      setActingMessageId(null);
    }
  };

  const hideForSelf = async (message: ChatMessage) => {
    if (actingMessageId !== null) return;
    const operation = `hide:${message.messageId}`;
    const idempotencyKey =
      actionKeys.current.get(operation) ?? newAsciiIdempotencyKey('chat');
    actionKeys.current.set(operation, idempotencyKey);
    setActingMessageId(message.messageId);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/messages/${message.messageId}/visibility`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Idempotency-Key': idempotencyKey,
            'If-Match': '0',
          },
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      actionKeys.current.delete(operation);
      setMessages((current) => current.filter((item) => item.messageId !== message.messageId));
      if (editingMessageId === message.messageId) {
        setEditingMessageId(null);
        setDraft('');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось скрыть сообщение');
    } finally {
      setActingMessageId(null);
    }
  };

  const report = async (message: ChatMessage) => {
    if (actingMessageId !== null || message.senderUserId === null) return;
    const operation = `report:${message.messageId}:v${message.version}`;
    const idempotencyKey =
      actionKeys.current.get(operation) ?? newAsciiIdempotencyKey('chat');
    actionKeys.current.set(operation, idempotencyKey);
    setActingMessageId(message.messageId);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/messages/${message.messageId}/reports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': String(message.version),
        },
        body: JSON.stringify({ reasonCode: 'INAPPROPRIATE_CONTENT' }),
      });
      if (!response.ok) {
        const reason = await apiErrorMessage(response);
        if (response.status === 409) await loadMessages();
        throw new Error(reason);
      }
      const result = (await response.json()) as ChatMessageActionResponse;
      actionKeys.current.delete(operation);
      if (result.data.action === 'REPORTED') {
        const reportedVersion = result.data.version;
        setMessages((current) =>
          current.map((item) =>
            item.messageId === message.messageId
              ? { ...item, reported: true, version: reportedVersion }
              : item,
          ),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить жалобу');
    } finally {
      setActingMessageId(null);
    }
  };

  const startEdit = (message: ChatMessage) => {
    if (message.content.kind !== 'PERSONAL_TEXT') return;
    setEditingMessageId(message.messageId);
    setDraft(message.content.text);
  };

  const statusChallengeScheduling = chatChallenge?.challenge
    && chatChallenge.challenge.stake !== 'NONE'
    && ['ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED'].includes(
      chatChallenge.challenge.state,
    );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={leaveChat} style={styles.backButton}>
          <Text style={styles.backText}>Назад</Text>
        </Pressable>
        <View style={styles.headerIdentity}>
          <Text accessibilityRole="header" aria-level={1} style={styles.title}>{counterpart}</Text>
          <Text style={styles.subtitle}>
            {chatIsOpen
              ? chatChallenge?.challenge?.responsePolicy === 'MUTUAL_GENESIS'
                ? 'Сервисный чат · статусный Challenge'
                : 'Личный чат · тренировки выбираются вместе'
              : 'Личный чат · история сообщений'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#8b2f22" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.messages}>
          {chatStateMessage ? (
            <View accessibilityLiveRegion="polite" style={styles.readOnlyNotice}>
              <Text style={styles.readOnlyNoticeTitle}>Чат закрыт</Text>
              <Text style={styles.readOnlyNoticeText}>{chatStateMessage}</Text>
            </View>
          ) : null}
          {chatIsOpen ? (
            <View style={styles.challengeSection}>
              <View style={styles.challengeHeader}>
                <View style={styles.optionsHeading}>
                  <Text accessibilityRole="header" aria-level={2} style={styles.challengeTitle}>
                    Official Challenge
                  </Text>
                  <Text style={styles.optionsSubtitle}>
                    Спортивный результат подтверждает Coach. До принятия это только приглашение.
                  </Text>
                </View>
                {challengeLoading ? <ActivityIndicator color="#8b2f22" size="small" /> : null}
              </View>
              {!challengeLoading && !chatChallenge?.challenge && chatChallenge?.canCreate ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: actingChallenge }}
                  disabled={actingChallenge}
                  onPress={() => void runChallengeAction('create')}
                  style={({ pressed }) => [styles.challengeCreateButton, actingChallenge && styles.disabled, pressed && styles.pressed]}
                >
                  {actingChallenge ? <ActivityIndicator color="#8b2f22" size="small" /> : (
                    <Text style={styles.challengeCreateButtonText}>Бросить официальный вызов</Text>
                  )}
                </Pressable>
              ) : null}
              {!challengeLoading && !chatChallenge?.challenge && chatChallenge?.canCreate === false ? (
                <Text style={styles.trainingTerms}>
                  {chatChallenge.createDenialCode === 'YOUTH_OFFICIAL_DISABLED'
                    ? 'Youth Challenge пока выключен до утверждения пилотного процесса согласия.'
                    : 'Официальный вызов сейчас недоступен для этой пары.'}
                </Text>
              ) : null}
              {chatChallenge?.challenge ? (
                <View style={styles.challengeCard}>
                  <Text style={styles.challengeBadge}>
                    {chatChallenge.challenge.stake === 'NONE' ? 'Открытый поединок · без статуса' : 'Статусный поединок'}
                  </Text>
                  <Text style={styles.trainingTitle}>
                    {chatChallenge.challenge.initiatorDisplayName} → {chatChallenge.challenge.recipientDisplayName}
                  </Text>
                  {youthConsent && youthConsent.requiredCount > 0 ? (
                    <View style={styles.youthConsentCard}>
                      <Text style={styles.youthConsentTitle}>Согласие представителя</Text>
                      <Text style={styles.trainingTerms}>
                        Получено {youthConsent.grantedCount} из {youthConsent.requiredCount}. У каждого Youth-спортсмена — отдельная защищённая ссылка; аккаунт и документы представителя не нужны.
                      </Text>
                      {youthConsent.viewerAgeDivision === 'YOUTH'
                        && youthConsent.consents.find((item) => item.athleteUserId === viewerUserId)?.state === 'NOT_REQUESTED' ? (
                        <View style={styles.challengeActions}>
                          <TextInput
                            accessibilityLabel="E-mail представителя"
                            autoCapitalize="none"
                            autoCorrect={false}
                            inputMode="email"
                            onChangeText={setGuardianEmail}
                            placeholder="E-mail представителя"
                            style={styles.guardianInput}
                            value={guardianEmail}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ disabled: requestingYouthConsent || guardianEmail.trim().length === 0 }}
                            disabled={requestingYouthConsent || guardianEmail.trim().length === 0}
                            onPress={() => void requestGuardianConsent()}
                            style={({ pressed }) => [
                              styles.challengeButton,
                              (requestingYouthConsent || guardianEmail.trim().length === 0) && styles.disabled,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.trainingButtonText}>
                              {requestingYouthConsent ? 'Отправляем…' : 'Отправить защищённую ссылку'}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {youthConsent.viewerAgeDivision === 'YOUTH'
                        && youthConsent.consents.find((item) => item.athleteUserId === viewerUserId)?.state === 'PENDING' ? (
                        <Text style={styles.youthConsentPending}>Ссылка отправлена. Ожидаем решение представителя.</Text>
                      ) : null}
                      {developmentConsentUrl ? (
                        <Pressable
                          accessibilityRole="link"
                          onPress={() => void Linking.openURL(developmentConsentUrl)}
                        >
                          <Text style={styles.developmentLink}>Открыть тестовую ссылку представителя</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {chatChallenge.challenge.state === 'AWAITING_RESPONSE'
                    && chatChallenge.challenge.responsePolicy === 'OPTIONAL' ? (
                    <>
                      <Text style={styles.trainingTerms}>
                        Ответ до {formatDateTime(chatChallenge.challenge.responseDeadlineAt)}. Отказ не считается поражением.
                      </Text>
                      {chatChallenge.challenge.viewerRole === 'RECIPIENT' ? (
                        <View style={styles.challengeActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ disabled: actingChallenge || (youthConsent?.requiredCount ?? 0) > 0 && youthConsent?.ready !== true }}
                            disabled={actingChallenge || (youthConsent?.requiredCount ?? 0) > 0 && youthConsent?.ready !== true}
                            onPress={() => void runChallengeAction('accept')}
                            style={({ pressed }) => [styles.challengeButton, (actingChallenge || (youthConsent?.requiredCount ?? 0) > 0 && youthConsent?.ready !== true) && styles.disabled, pressed && styles.pressed]}
                          >
                            <Text style={styles.trainingButtonText}>Принять Challenge</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ disabled: actingChallenge }}
                            disabled={actingChallenge}
                            onPress={() => void runChallengeAction('decline')}
                            style={({ pressed }) => [styles.secondaryChallengeButton, actingChallenge && styles.disabled, pressed && styles.pressed]}
                          >
                            <Text style={styles.secondaryChallengeText}>Отказаться без поражения</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: actingChallenge }}
                          disabled={actingChallenge}
                          onPress={() => void runChallengeAction('withdraw')}
                          style={({ pressed }) => [styles.secondaryChallengeButton, actingChallenge && styles.disabled, pressed && styles.pressed]}
                        >
                          <Text style={styles.secondaryChallengeText}>Отозвать приглашение</Text>
                        </Pressable>
                      )}
                    </>
                  ) : chatChallenge.challenge.state === 'AWAITING_RESPONSE'
                    && chatChallenge.challenge.responsePolicy === 'MANDATORY' ? (
                    <>
                      <Text style={styles.trainingTerms}>
                        Обязательный статусный Challenge. Ответ до {formatDateTime(chatChallenge.challenge.responseDeadlineAt)}. Через 48 часов после вызова придёт напоминание. Отказ или отсутствие ответа фиксируется как Forfeit; затем доступен Appeal в течение 48 часов.
                      </Text>
                      {chatChallenge.challenge.viewerRole === 'RECIPIENT' ? (
                        <View style={styles.challengeActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ disabled: actingChallenge }}
                            disabled={actingChallenge}
                            onPress={() => void runChallengeAction('accept')}
                            style={({ pressed }) => [styles.challengeButton, (actingChallenge || (youthConsent?.requiredCount ?? 0) > 0 && youthConsent?.ready !== true) && styles.disabled, pressed && styles.pressed]}
                          >
                            <Text style={styles.trainingButtonText}>Принять Challenge</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ disabled: actingChallenge }}
                            disabled={actingChallenge}
                            onPress={() => Alert.alert(
                              'Подтвердить отказ?',
                              'Отказ будет записан как Forfeit. Результат можно обжаловать в течение 48 часов.',
                              [
                                { text: 'Вернуться', style: 'cancel' },
                                { text: 'Отказаться', style: 'destructive', onPress: () => void runChallengeAction('decline') },
                              ],
                            )}
                            style={({ pressed }) => [styles.secondaryChallengeButton, actingChallenge && styles.disabled, pressed && styles.pressed]}
                          >
                            <Text style={styles.secondaryChallengeText}>Отказаться · Forfeit</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: actingChallenge }}
                          disabled={actingChallenge}
                          onPress={() => void runChallengeAction('withdraw')}
                          style={({ pressed }) => [styles.secondaryChallengeButton, actingChallenge && styles.disabled, pressed && styles.pressed]}
                        >
                          <Text style={styles.secondaryChallengeText}>Отозвать вызов без последствий</Text>
                        </Pressable>
                      )}
                    </>
                  ) : chatChallenge.challenge.state === 'ACCEPTED_UNSCHEDULED' ? (
                    <>
                      <Text style={styles.acceptedChallengeText}>Challenge принят обоими</Text>
                      <Text style={styles.trainingTerms}>
                        Договоритесь о времени до {chatChallenge.challenge.schedulingDeadlineAt ? formatDateTime(chatChallenge.challenge.schedulingDeadlineAt) : 'назначенного срока'}. Официальная Session будет связана с этим Challenge.
                      </Text>
                      <Text style={styles.trainingTerms}>
                        Пользовательские переносы: {chatChallenge.challenge.userRescheduleCount} из 2.
                      </Text>
                      <Pressable
                        accessibilityLabel={chatChallenge.challenge.userRescheduleCount >= 2
                          ? 'Запросить ещё один перенос с немедленным FORFEIT'
                          : 'Перенести Challenge без поражения'}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: actingChallenge }}
                        disabled={actingChallenge}
                        onPress={confirmChallengeReschedule}
                        style={({ pressed }) => [
                          chatChallenge.challenge!.userRescheduleCount >= 2
                            ? styles.challengeButton
                            : styles.secondaryChallengeButton,
                          actingChallenge && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={chatChallenge.challenge.userRescheduleCount >= 2
                          ? styles.trainingButtonText
                          : styles.secondaryChallengeText}>
                          {chatChallenge.challenge.userRescheduleCount >= 2
                            ? 'Ещё один перенос · FORFEIT'
                            : 'Перенести Challenge'}
                        </Text>
                      </Pressable>
                    </>
                  ) : chatChallenge.challenge.state === 'BOOKING_PENDING' ? (
                    <>
                      <Text style={styles.acceptedChallengeText}>Официальный слот выбран</Text>
                      <Text style={styles.trainingTerms}>
                        Подтвердите один вариант вместе. После этого зал или Coach создаст Official Session одной кнопкой.
                      </Text>
                      <Text style={styles.trainingTerms}>
                        {chatChallenge.challenge.userRescheduleCount >= 2
                          ? '«Отменить выбор слота» не расходует перенос. Ещё один виновный перенос возможен только с немедленным FORFEIT.'
                          : `«Отменить выбор слота» не расходует перенос. «Перенести Challenge» использует один из ${2 - chatChallenge.challenge.userRescheduleCount} оставшихся переносов.`}
                      </Text>
                      <Pressable
                        accessibilityLabel={chatChallenge.challenge.userRescheduleCount >= 2
                          ? 'Запросить ещё один перенос с немедленным FORFEIT'
                          : 'Перенести Challenge без поражения'}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: actingChallenge }}
                        disabled={actingChallenge}
                        onPress={confirmChallengeReschedule}
                        style={({ pressed }) => [
                          chatChallenge.challenge!.userRescheduleCount >= 2
                            ? styles.challengeButton
                            : styles.secondaryChallengeButton,
                          actingChallenge && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={chatChallenge.challenge.userRescheduleCount >= 2
                          ? styles.trainingButtonText
                          : styles.secondaryChallengeText}>
                          {chatChallenge.challenge.userRescheduleCount >= 2
                            ? 'Ещё один перенос · FORFEIT'
                            : 'Перенести Challenge'}
                        </Text>
                      </Pressable>
                    </>
                  ) : chatChallenge.challenge.state === 'BOOKED' ? (
                    <>
                      <Text style={styles.acceptedChallengeText}>Official Session подтверждена</Text>
                      <Text style={styles.trainingTerms}>
                        Время закреплено залом. Coach проведёт Session и зафиксирует результат.
                      </Text>
                    </>
                  ) : chatChallenge.challenge.state === 'IN_SESSION' ? (
                    <>
                      <Text style={styles.acceptedChallengeText}>Official Challenge идёт</Text>
                      <Text style={styles.trainingTerms}>
                        Coach зафиксировал фактическое начало. Условия и спортивная ставка уже заморожены.
                      </Text>
                    </>
                  ) : chatChallenge.challenge.state === 'RESULT_PENDING' ? (
                    <>
                      <Text style={styles.acceptedChallengeText}>Ожидается результат Coach</Text>
                      <Text style={styles.trainingTerms}>
                        Session завершена. Статус изменится только после подтверждённого результата.
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.trainingTerms}>
                      {chatChallenge.challenge.state === 'DECLINED'
                        ? `Приглашение отклонено без поражения${chatChallenge.challenge.pairQuietUntil ? `. Новый вызов доступен после ${formatDateTime(chatChallenge.challenge.pairQuietUntil)}` : ''}.`
                        : chatChallenge.challenge.state === 'WITHDRAWN'
                          ? 'Инициатор отозвал приглашение без спортивных последствий.'
                          : chatChallenge.challenge.state === 'EXPIRED_NO_FAULT'
                            ? 'Срок ответа истёк без вины сторон. Поражения и других спортивных последствий нет.'
                            : chatChallenge.challenge.state === 'RESULT_RECORDED'
                              ? 'Зафиксирован предварительный Result. Проигравший может подать Appeal в течение 48 часов.'
                            : `Статус: ${chatChallenge.challenge.state}`}
                    </Text>
                  )}
                  {['ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED']
                    .includes(chatChallenge.challenge.state) ? (
                    <View style={styles.challengeActions}>
                      {chatChallenge.mutualRescheduleRequest ? (
                        chatChallenge.mutualRescheduleRequest.proposedByUserId === viewerUserId ? (
                          <Text style={styles.trainingTerms}>
                            Взаимный перенос предложен. До ответа партнёра бронь и Challenge не изменяются.
                          </Text>
                        ) : (
                          <Pressable
                            accessibilityLabel="Подтвердить взаимный перенос без назначения виновного"
                            accessibilityRole="button"
                            accessibilityState={{ disabled: actingChallenge }}
                            disabled={actingChallenge}
                            onPress={confirmMutualReschedule}
                            style={({ pressed }) => [
                              styles.challengeButton,
                              actingChallenge && styles.disabled,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.trainingButtonText}>Подтвердить взаимный перенос</Text>
                          </Pressable>
                        )
                      ) : (
                        <Pressable
                          accessibilityLabel="Предложить партнёру взаимный перенос"
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled: actingChallenge
                              || chatChallenge.challenge.userRescheduleCount >= 2,
                          }}
                          disabled={actingChallenge
                            || chatChallenge.challenge.userRescheduleCount >= 2}
                          onPress={proposeMutualReschedule}
                          style={({ pressed }) => [
                            styles.secondaryChallengeButton,
                            (actingChallenge
                              || chatChallenge.challenge!.userRescheduleCount >= 2)
                              && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.secondaryChallengeText}>
                            {chatChallenge.challenge.userRescheduleCount >= 2
                              ? 'Лимит взаимных переносов использован'
                              : 'Предложить взаимный перенос'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  ) : null}
                </View>
              ) : null}
              {challengeIsTerminal && chatChallenge?.canCreate ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: actingChallenge }}
                  disabled={actingChallenge}
                  onPress={() => void runChallengeAction('create')}
                  style={({ pressed }) => [styles.challengeCreateButton, actingChallenge && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.challengeCreateButtonText}>Отправить новый вызов</Text>
                </Pressable>
              ) : null}
              {!challengeLoading && !chatChallenge?.challenge && chatChallenge && !chatChallenge.canCreate ? (
                <Text style={styles.challengeUnavailable}>
                  Официальный вызов сейчас недоступен. Обычная совместная тренировка остаётся доступной.
                </Text>
              ) : null}
            </View>
          ) : null}
          {chatIsOpen ? <View style={styles.optionsSection}>
            <View style={styles.optionsHeader}>
              <View style={styles.optionsHeading}>
                <Text accessibilityRole="header" aria-level={2} style={styles.optionsTitle}>Куда пойдём?</Text>
                <Text style={styles.optionsSubtitle}>
                  {chatChallenge?.challenge?.state === 'ACCEPTED_UNSCHEDULED'
                    ? 'Выберите персональный слот для Official Challenge. Он бронируется только после подтверждения залом или Coach.'
                    : 'Варианты видны обоим. Слот бронируется только после подтверждения залом или Coach.'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Обновить варианты тренировок"
                accessibilityRole="button"
                accessibilityState={{ disabled: optionsLoading }}
                disabled={optionsLoading}
                onPress={() => void loadTrainingOptions()}
                style={({ pressed }) => [
                  styles.optionsRefreshButton,
                  optionsLoading && styles.disabled,
                  pressed && !optionsLoading && styles.pressed,
                ]}
              >
                <Text style={styles.actionLink}>Обновить</Text>
              </Pressable>
            </View>
            {optionsLoading ? <ActivityIndicator color="#8b2f22" size="small" /> : null}
            {!optionsLoading && optionsError ? (
              <Text accessibilityLiveRegion="polite" style={styles.optionsError}>
                {optionsError}
              </Text>
            ) : null}
            {!optionsLoading &&
            trainingOptions &&
            trainingOptions.slots.length === 0 &&
            (statusChallengeScheduling || trainingOptions.groupOfferings.length === 0) ? (
              <Text style={styles.optionsEmpty}>Зал ещё не опубликовал подходящие варианты.</Text>
            ) : null}
            {trainingOptions?.activeIntent.booking?.state === 'CONFIRMED_PAIR' &&
            trainingOptions.activeIntent.booking.commercialTermsSnapshot ? (
              <View style={[styles.trainingCard, styles.confirmedTrainingCard]}>
                <Text style={styles.confirmedTrainingBadge}>
                  {trainingOptions.activeIntent.booking.purpose === 'OFFICIAL_CHALLENGE'
                    ? 'Official Session подтверждена'
                    : 'Тренировка подтверждена'}
                </Text>
                <Text style={styles.trainingTitle}>
                  {formatDateTime(
                    trainingOptions.activeIntent.booking.commercialTermsSnapshot.startAt,
                  )}{' '}
                  · {trainingOptions.activeIntent.booking.commercialTermsSnapshot.venueDisplayName}
                </Text>
                <Text style={styles.trainingMeta}>
                  Тренер: {trainingOptions.activeIntent.booking.commercialTermsSnapshot.coachDisplayName}
                </Text>
                <Text style={styles.trainingTerms}>
                  Session запланирована. В назначенное время Coach зафиксирует фактическое начало и посещение.
                </Text>
              </View>
            ) : null}
            {trainingOptions?.slots.map((slot) => {
              const booking = trainingOptions.activeIntent.booking;
              const selected = booking?.slotId === slot.slotId;
              const ownSelection =
                selected && booking.selectedByUserIds.includes(viewerUserId);
              const canConfirm =
                selected && booking.state === 'SELECTING' && !ownSelection;
              const waitingForHost =
                selected && booking.state === 'HOST_CONFIRMATION_PENDING';
              const disabled =
                actingTrainingId !== null ||
                waitingForHost ||
                ownSelection ||
                (booking !== null && !selected);
              const buttonLabel = waitingForHost
                ? 'Ждём подтверждения зала'
                : canConfirm
                  ? 'Подтвердить этот слот'
                  : ownSelection
                    ? 'Предложено партнёру'
                    : booking
                      ? 'Сначала завершите текущий выбор'
                      : 'Предложить этот слот';
              return (
                <View
                  key={slot.slotId}
                  style={[styles.trainingCard, selected && styles.selectedTrainingCard]}
                >
                  <Text style={styles.trainingKind}>
                    {booking?.purpose === 'OFFICIAL_CHALLENGE'
                      || (!booking && chatChallenge?.challenge?.state === 'ACCEPTED_UNSCHEDULED')
                      ? 'Official Challenge · персональная Session'
                      : 'Персональная тренировка'}
                  </Text>
                  <Text style={styles.trainingTitle}>
                    {formatDateTime(slot.startAt)} · {slot.venueDisplayName}
                  </Text>
                  <Text style={styles.trainingMeta}>Тренер: {slot.coachDisplayName}</Text>
                  {slot.priceAmount && slot.priceCurrency ? (
                    <Text style={styles.trainingMeta}>
                      {slot.priceAmount} {slot.priceCurrency}
                    </Text>
                  ) : slot.priceText ? (
                    <Text style={styles.trainingMeta}>{slot.priceText}</Text>
                  ) : null}
                  {slot.cancellationTermsText ? (
                    <Text style={styles.trainingTerms}>{slot.cancellationTermsText}</Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => void chooseSlot(slot)}
                    style={({ pressed }) => [
                      styles.trainingButton,
                      disabled && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {actingTrainingId === slot.slotId ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.trainingButtonText}>{buttonLabel}</Text>
                    )}
                  </Pressable>
                  {booking && selected && ['SELECTING', 'HOST_CONFIRMATION_PENDING'].includes(booking.state) ? (
                    <Pressable
                      accessibilityLabel="Отменить выбор этого слота без спортивных последствий"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: actingTrainingId !== null }}
                      disabled={actingTrainingId !== null}
                      onPress={() => confirmBookingWithdrawal(booking)}
                      style={({ pressed }) => [
                        styles.secondaryChallengeButton,
                        actingTrainingId !== null && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      {actingTrainingId === booking.bookingId ? (
                        <ActivityIndicator color="#8b2f22" size="small" />
                      ) : (
                        <Text style={styles.secondaryChallengeText}>Отменить выбор слота</Text>
                      )}
                    </Pressable>
                  ) : null}
                  {selected && booking.state === 'SELECTING' ? (
                    <Text style={styles.intentDeadline}>
                      Выбор действует до{' '}
                      {new Date(booking.selectionExpiresAt).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {statusChallengeScheduling && trainingOptions
              && trainingOptions.groupOfferings.length > 0 ? (
              <View style={styles.statusSchedulingNotice}>
                <Text style={styles.trainingTerms}>
                  Для этого статусного Challenge сейчас доступна персональная Session с Coach. Групповые варианты остаются видны в обычном Match-чате.
                </Text>
              </View>
            ) : null}
            {!statusChallengeScheduling ? trainingOptions?.groupOfferings.map((offering) => {
              const phone =
                typeof offering.contact.phone === 'string' ? offering.contact.phone : null;
              const plan = trainingOptions.activeIntent.groupPlan;
              const selected = plan?.groupOfferingId === offering.groupOfferingId;
              const ownProposal = selected && plan.proposedByUserId === viewerUserId;
              const canConfirm = selected && plan.state === 'PROPOSED' && !ownProposal;
              const notified = selected && plan.state === 'NOTIFIED';
              const conversion = selected
                ? groupPlanConversions.find((item) => item.groupPlanId === plan?.groupPlanId) ?? null
                : null;
              const conversionPending = selected && plan.state === 'CONVERSION_PENDING';
              const disabled =
                actingTrainingId !== null ||
                notified ||
                conversionPending ||
                ownProposal ||
                (plan !== null && !selected);
              const buttonLabel = notified
                ? 'План подтверждён обоими'
                : canConfirm
                  ? 'Пойдём сюда'
                  : ownProposal
                    ? 'Ждём ответа партнёра'
                    : plan
                      ? 'Сначала завершите текущий план'
                      : 'Предложить групповую';
              return (
                <View
                  key={offering.groupOfferingId}
                  style={[styles.groupTrainingCard, selected && styles.selectedGroupCard]}
                >
                  <Text style={styles.trainingKind}>Групповая тренировка</Text>
                  <Text style={styles.trainingTitle}>{offering.classLabel}</Text>
                  <Text style={styles.trainingMeta}>
                    {formatDateTime(offering.startAt)} ·{' '}
                    {offering.venueDisplayName}
                  </Text>
                  {offering.coachDisplayName ? (
                    <Text style={styles.trainingMeta}>Тренер: {offering.coachDisplayName}</Text>
                  ) : null}
                  {offering.priceText ? (
                    <Text style={styles.trainingMeta}>{offering.priceText}</Text>
                  ) : null}
                  <Text style={styles.capacityNotice}>
                    Molokh не бронирует место в группе. Уточните наличие у зала.
                  </Text>
                  {phone ? (
                    <Pressable
                      accessibilityLabel={`Позвонить в зал по номеру ${phone}`}
                      accessibilityRole="link"
                      onPress={() => {
                        void Linking.openURL(`tel:${phone}`).catch(() => {
                          setError('Не удалось открыть приложение для звонка. Скопируйте номер вручную.');
                        });
                      }}
                      style={({ pressed }) => [styles.phoneAction, pressed && styles.pressed]}
                    >
                      <Text style={styles.phoneActionText}>Позвонить в зал · {phone}</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.freshness}>
                    Обновлено {formatDateTime(offering.lastUpdatedAt)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => void chooseGroup(offering)}
                    style={({ pressed }) => [
                      styles.groupButton,
                      disabled && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {actingTrainingId === offering.groupOfferingId ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.trainingButtonText}>{buttonLabel}</Text>
                    )}
                  </Pressable>
                  {notified && plan ? (
                    <View style={styles.statusSchedulingNotice}>
                      {plan.offeringSnapshot.coachUserId ? (
                        <>
                          <Text style={styles.trainingTerms}>
                            Хотите сделать эту тренировку Official? Нужны отдельные подтверждения обоих Athlete и Coach. До третьего подтверждения Challenge и Session не создаются.
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ disabled: actingTrainingId !== null }}
                            disabled={actingTrainingId !== null}
                            onPress={() => void requestGroupOfficialConversion(plan)}
                            style={({ pressed }) => [
                              styles.groupButton,
                              actingTrainingId !== null && styles.disabled,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.trainingButtonText}>Предложить сделать Official</Text>
                          </Pressable>
                        </>
                      ) : (
                        <Text style={styles.trainingTerms}>
                          Это социальный план. Для Official зал должен заранее назначить авторизованного Coach.
                        </Text>
                      )}
                    </View>
                  ) : null}
                  {conversionPending && conversion ? (
                    <View style={styles.statusSchedulingNotice}>
                      <Text style={styles.trainingTerms}>
                        Official подтверждают 3 стороны: инициатор, второй Athlete и Coach {conversion.coachDisplayName}. Сейчас подтверждено {conversion.confirmations.filter((item) => item.decision === 'ACCEPT').length} из 3. Срок: {formatDateTime(conversion.confirmationDeadlineAt)}.
                      </Text>
                      {conversion.viewerHasDecided ? (
                        <Text style={styles.trainingMeta}>Ваш ответ уже зафиксирован.</Text>
                      ) : null}
                      {conversion.viewerCanConfirm ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: actingTrainingId !== null }}
                          disabled={actingTrainingId !== null}
                          onPress={() => void decideGroupOfficialConversion(conversion, 'ACCEPT')}
                          style={({ pressed }) => [styles.groupButton,
                            actingTrainingId !== null && styles.disabled, pressed && styles.pressed]}
                        >
                          <Text style={styles.trainingButtonText}>Подтвердить Official</Text>
                        </Pressable>
                      ) : null}
                      {conversion.viewerCanDecline ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: actingTrainingId !== null }}
                          disabled={actingTrainingId !== null}
                          onPress={() => Alert.alert(
                            'Отказаться от Official?',
                            'Групповой план сохранится. Challenge, поражение и Cooldown не появятся.',
                            [
                              { text: 'Назад', style: 'cancel' },
                              { text: 'Отказаться', style: 'destructive', onPress: () => {
                                void decideGroupOfficialConversion(conversion, 'DECLINE');
                              } },
                            ],
                          )}
                          style={({ pressed }) => [styles.phoneAction,
                            actingTrainingId !== null && styles.disabled, pressed && styles.pressed]}
                        >
                          <Text style={styles.phoneActionText}>Оставить только групповой план</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            }) : null}
          </View> : null}
          {messages.length === 0 ? (
            <Text style={styles.empty}>Напишите первое сообщение и договоритесь о тренировке.</Text>
          ) : null}
          {messages.map((message) => {
            const own = message.senderUserId !== null && message.senderUserId === viewerUserId;
            const acting = actingMessageId === message.messageId;
            return (
              <View key={message.messageId} style={[styles.message, own && styles.ownMessage]}>
                <Text style={styles.sender}>{message.senderDisplayName ?? 'Molokh'}</Text>
                {message.content.kind === 'PERSONAL_TEXT' ? (
                  <Text style={styles.messageText}>{message.content.text}</Text>
                ) : message.content.kind === 'ACTION' ? (
                  <View style={styles.actionCard}>
                    <Text style={styles.actionTitle}>{message.content.renderKey}</Text>
                    <Text style={styles.actionMeta}>
                      {message.content.resourceType} · версия {message.content.stateVersion}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.serviceText}>{message.content.renderKey}</Text>
                )}
                <Text style={styles.messageMeta}>
                  {formatDateTime(message.createdAt)}
                  {message.edited ? ' · изменено' : ''}
                  {message.reported ? ' · передано Central' : ''}
                </Text>
                <View style={styles.messageActions}>
                  {chatIsOpen && own && message.content.kind === 'PERSONAL_TEXT' && !message.reported ? (
                    <Pressable accessibilityRole="button" onPress={() => startEdit(message)} style={styles.messageAction}>
                      <Text style={styles.actionLink}>Изменить</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPendingMessageAction({ action: 'hide', messageId: message.messageId })}
                    style={styles.messageAction}
                  >
                    <Text style={styles.actionLink}>Удалить у себя</Text>
                  </Pressable>
                  {!own && message.senderUserId !== null && !message.reported ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setPendingMessageAction({ action: 'report', messageId: message.messageId })}
                      style={styles.messageAction}
                    >
                      <Text style={styles.reportLink}>Пожаловаться</Text>
                    </Pressable>
                  ) : null}
                  {acting ? <ActivityIndicator color="#8b2f22" size="small" /> : null}
                </View>
                {pendingMessageAction?.messageId === message.messageId ? (
                  <View accessibilityLiveRegion="polite" style={styles.confirmation}>
                    <Text style={styles.confirmationText}>
                      {pendingMessageAction.action === 'hide'
                        ? 'Удалить сообщение только из вашей истории? Отменить это действие нельзя.'
                        : 'Передать сообщение команде Central для рассмотрения?'}
                    </Text>
                    <View style={styles.confirmationActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setPendingMessageAction(null)}
                        style={styles.confirmationCancel}
                      >
                        <Text style={styles.actionLink}>Отмена</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          const action = pendingMessageAction.action;
                          setPendingMessageAction(null);
                          if (action === 'hide') void hideForSelf(message);
                          else void report(message);
                        }}
                        style={styles.confirmationConfirm}
                      >
                        <Text style={styles.confirmationConfirmText}>
                          {pendingMessageAction.action === 'hide' ? 'Удалить' : 'Отправить жалобу'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      {chatIsOpen ? <View style={styles.composer}>
        {editingMessage ? (
          <View style={styles.editingRow}>
            <Text style={styles.editingText}>Редактирование сообщения</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditingMessageId(null);
                setDraft('');
              }}
            >
              <Text style={styles.actionLink}>Отмена</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composerRow}>
          <TextInput
            accessibilityLabel="Сообщение"
            maxLength={2_000}
            multiline
            onChangeText={setDraft}
            placeholder="Напишите сообщение"
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !normalizedDraft || actingMessageId !== null }}
            disabled={!normalizedDraft || actingMessageId !== null}
            onPress={() => void sendOrEdit()}
            style={({ pressed }) => [
              styles.sendButton,
              (!normalizedDraft || actingMessageId !== null) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {actingMessageId === 'new' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.sendText}>{editingMessage ? 'Сохранить' : 'Отправить'}</Text>
            )}
          </Pressable>
        </View>
      </View> : (
        <View style={styles.closedComposer}>
          <Text style={styles.closedComposerText}>Новые сообщения недоступны</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f6f4ef', flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#ded9cf',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  backButton: { justifyContent: 'center', minHeight: 44, paddingRight: 6 },
  backText: { color: '#8b2f22', fontSize: 15, fontWeight: '700' },
  headerIdentity: { flex: 1, gap: 2 },
  title: { color: '#171512', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#777168', fontSize: 12 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  messages: {
    alignSelf: 'center',
    gap: 12,
    maxWidth: 760,
    padding: 18,
    width: '100%',
  },
  empty: { color: '#777168', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  optionsSection: {
    backgroundColor: '#ffffff',
    borderColor: '#ded9cf',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  challengeSection: {
    backgroundColor: '#faf9f6',
    borderColor: '#ded9cf',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  challengeHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  challengeTitle: { color: '#171512', fontSize: 17, fontWeight: '800' },
  challengeCard: { gap: 8 },
  challengeBadge: { color: '#8b2f22', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  challengeActions: { gap: 8 },
  challengeButton: { alignItems: 'center', backgroundColor: '#8b2f22', borderRadius: 12, minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  challengeCreateButton: {
    alignItems: 'center',
    borderColor: '#8b2f22',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  challengeCreateButtonText: { color: '#8b2f22', fontSize: 14, fontWeight: '800' },
  secondaryChallengeButton: { alignItems: 'center', borderColor: '#8b2f22', borderRadius: 12, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  secondaryChallengeText: { color: '#8b2f22', fontSize: 14, fontWeight: '800' },
  acceptedChallengeText: { color: '#2f6846', fontSize: 14, fontWeight: '900' },
  challengeUnavailable: { color: '#777168', fontSize: 13, lineHeight: 19 },
  youthConsentCard: { backgroundColor: '#fff7e8', borderColor: '#e7c98d', borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 },
  youthConsentTitle: { color: '#5e451b', fontSize: 14, fontWeight: '900' },
  youthConsentPending: { color: '#7a5b23', fontSize: 13, fontWeight: '700' },
  guardianInput: { backgroundColor: '#fff', borderColor: '#cfc6b8', borderRadius: 10, borderWidth: 1, minHeight: 44, paddingHorizontal: 12 },
  developmentLink: { color: '#8b2f22', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  optionsHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  optionsRefreshButton: {
    alignItems: 'center',
    borderColor: '#8b2f22',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  optionsHeading: { flex: 1, gap: 3 },
  optionsTitle: { color: '#171512', fontSize: 17, fontWeight: '800' },
  optionsSubtitle: { color: '#777168', fontSize: 12, lineHeight: 17 },
  optionsEmpty: { color: '#777168', fontSize: 13 },
  optionsError: { color: '#7a261b', fontSize: 13, lineHeight: 18 },
  readOnlyNotice: {
    backgroundColor: '#fff7e6',
    borderColor: '#dfc994',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  readOnlyNoticeTitle: { color: '#5d4610', fontSize: 15, fontWeight: '800' },
  readOnlyNoticeText: { color: '#6b551d', fontSize: 13, lineHeight: 19 },
  trainingCard: {
    backgroundColor: '#f6f4ef',
    borderColor: '#ded9cf',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  selectedTrainingCard: {
    borderColor: '#8b2f22',
    borderWidth: 2,
  },
  confirmedTrainingCard: {
    backgroundColor: '#eef7ef',
    borderColor: '#79a682',
    borderWidth: 2,
  },
  confirmedTrainingBadge: { color: '#285d35', fontSize: 12, fontWeight: '800' },
  groupTrainingCard: {
    backgroundColor: '#edf4ef',
    borderColor: '#cbdccf',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  selectedGroupCard: {
    borderColor: '#31533a',
    borderWidth: 2,
  },
  statusSchedulingNotice: { backgroundColor: '#f6f4ef', borderRadius: 10, padding: 12 },
  trainingKind: { color: '#8b2f22', fontSize: 11, fontWeight: '800' },
  trainingTitle: { color: '#171512', fontSize: 14, fontWeight: '700' },
  trainingMeta: { color: '#625d55', fontSize: 12 },
  trainingTerms: { color: '#777168', fontSize: 11, lineHeight: 16, marginTop: 2 },
  trainingButton: {
    alignItems: 'center',
    backgroundColor: '#8b2f22',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 7,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  groupButton: {
    alignItems: 'center',
    backgroundColor: '#31533a',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 7,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  trainingButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  intentDeadline: { color: '#8b2f22', fontSize: 11, textAlign: 'center' },
  capacityNotice: { color: '#31533a', fontSize: 12, lineHeight: 17, marginTop: 4 },
  phoneAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#31533a',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  phoneActionText: { color: '#31533a', fontSize: 12, fontWeight: '800' },
  freshness: { color: '#777168', fontSize: 10 },
  message: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderColor: '#ded9cf',
    borderRadius: 14,
    borderWidth: 1,
    gap: 7,
    maxWidth: '88%',
    padding: 13,
  },
  ownMessage: { alignSelf: 'flex-end', backgroundColor: '#f4e9e5' },
  sender: { color: '#777168', fontSize: 12, fontWeight: '700' },
  messageText: { color: '#171512', fontSize: 16, lineHeight: 22 },
  serviceText: { color: '#4c4943', fontSize: 14, fontWeight: '600' },
  actionCard: { backgroundColor: '#f6f4ef', borderRadius: 10, gap: 4, padding: 12 },
  actionTitle: { color: '#171512', fontSize: 14, fontWeight: '700' },
  actionMeta: { color: '#777168', fontSize: 12 },
  messageMeta: { color: '#8c867e', fontSize: 11 },
  messageActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  messageAction: { justifyContent: 'center', minHeight: 44 },
  actionLink: { color: '#625d55', fontSize: 12, fontWeight: '600' },
  reportLink: { color: '#8b2f22', fontSize: 12, fontWeight: '600' },
  confirmation: {
    backgroundColor: '#faf6ef',
    borderRadius: 10,
    gap: 10,
    padding: 10,
  },
  confirmationText: { color: '#4c4943', fontSize: 12, lineHeight: 18 },
  confirmationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  confirmationCancel: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  confirmationConfirm: {
    alignItems: 'center',
    backgroundColor: '#8b2f22',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  confirmationConfirmText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  error: {
    backgroundColor: '#fff0ed',
    color: '#7a261b',
    fontSize: 13,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  composer: {
    backgroundColor: '#ffffff',
    borderTopColor: '#ded9cf',
    borderTopWidth: 1,
    gap: 8,
    padding: 14,
  },
  closedComposer: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopColor: '#ded9cf',
    borderTopWidth: 1,
    justifyContent: 'center',
    minHeight: 68,
    padding: 14,
  },
  closedComposerText: { color: '#777168', fontSize: 14, fontWeight: '600' },
  editingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  editingText: { color: '#777168', fontSize: 12 },
  composerRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
  input: {
    backgroundColor: '#faf9f6',
    borderColor: '#c9c3b9',
    borderRadius: 12,
    borderWidth: 1,
    color: '#171512',
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#8b2f22',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 94,
    paddingHorizontal: 14,
  },
  sendText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.82 },
});
