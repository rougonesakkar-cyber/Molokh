import type {
  AppealCommandResponse,
  AppealDetailResponse,
  AppealQueueResponse,
  BlockedUsersResponse,
  BookingOfficialConversionCommandResponse,
  BookingSoloContinuationCommandResponse,
  BookingTrainingRetentionCommandResponse,
  CommunityLifecycleCommandResponse,
  CommunityLifecycleResponse,
  CommunityClosureCandidatesResponse,
  CommunityClosureCommandResponse,
  CommunityClosurePlanResponse,
  CommunityContextResponse,
  CompetitionStatusResponse,
  DiscoveryActionResponse,
  DiscoveryCardsResponse,
  GroupOfferingCommandResponse,
  GenesisResponseCommandResponse,
  HostConfirmationCommandResponse,
  HostConfirmationQueueResponse,
  HostRejectionCommandResponse,
  IdentityCommandResponse,
  IntegrityCaseListResponse,
  MeResponse,
  MatchesResponse,
  MissingResultReviewListResponse,
  MembershipExitCommandResponse,
  MembershipRemovalCommandResponse,
  MembershipRemovalListResponse,
  MySessionsResponse,
  PendingCoachInviteListResponse,
  RecordSessionResultBody,
  ResultCommandResponse,
  ResultResponse,
  RoleGrantCommandResponse,
  SocialRelationshipCommandResponse,
  SessionCommandResponse,
  ScheduleMutationReasonBody,
  SlotCommandResponse,
  StatusQueueEntryCommandResponse,
  StatusReleaseCommandResponse,
  VenueAdminDashboardResponse,
  VenueMemberListResponse,
} from '@molokh/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Href, useRouter } from 'expo-router';
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

import {
  DiscoverySection,
  type DiscoveryAction,
} from '../features/discovery/DiscoverySection';
import { MissingResultReviewSection } from '../features/missing-result/MissingResultReviewSection';
import { IntegrityCaseSection } from '../features/integrity-case/IntegrityCaseSection';
import { PlatformIncidentSection } from '../features/platform-incident/PlatformIncidentSection';
import { MembershipExitSection } from '../features/membership-exit/MembershipExitSection';
import { StatusQueueSection } from '../features/status-queue/StatusQueueSection';
import {
  apiErrorMessage,
  apiUrl,
  localTestAccounts,
  localToken,
  setLocalToken,
  type LocalTestAccount,
} from '../lib/api';
import { sportLabel, sportOptions } from '../lib/sports';

type Identity = MeResponse['data'];
type CommunityContext = CommunityContextResponse['data'];
type CommunityLifecycle = CommunityLifecycleResponse['data'];
type CommunityClosureCandidate = CommunityClosureCandidatesResponse['data'][number];
type CommunityClosurePlan = CommunityClosurePlanResponse['data'];
type CommunityClosureDisposition = 'RETAIN_TO_COMPLETION' | 'CANCEL_NO_FAULT';
type CompetitionStatus = CompetitionStatusResponse['data'];
type StatusReleasePreview = StatusReleaseCommandResponse['data'];
type MembershipExitPreview = MembershipExitCommandResponse['data'];
type MembershipRemoval = MembershipRemovalListResponse['data'][number];
type VenueMember = VenueMemberListResponse['data'][number];
type Capability = Identity['capabilities'][number];
type CommunityDenialCode = CommunityContext['access']['denials'][number]['code'];
type CoachInvite = PendingCoachInviteListResponse['data'][number];
type HostConfirmation = HostConfirmationQueueResponse['data'][number];
type Session = MySessionsResponse['data']['sessions'][number];
type AttendanceStatus = Session['attendance'][number]['status'];
type OfficialResult = ResultResponse['data'];
type CentralAppeal = AppealQueueResponse['data'][number];
type AppealDetail = AppealDetailResponse['data'];
type ResultOutcomeCode = RecordSessionResultBody['outcomeCode'];
type DiscoveryCard = DiscoveryCardsResponse['data'][number];
type Match = MatchesResponse['data'][number];
type BlockedUser = BlockedUsersResponse['data'][number];
type MissingResultReview = MissingResultReviewListResponse['data'][number];
type IntegrityCase = IntegrityCaseListResponse['data'][number];
type VenueAdminDashboard = VenueAdminDashboardResponse['data'];
type MainSection = 'DISCOVERY' | 'PROFILE' | 'COMMUNITY';
type AdminPublicationKind = 'SLOT' | 'GROUP';
type AdminDurationMinutes = 60 | 90;
type ScheduleReasonCode = ScheduleMutationReasonBody['reasonCode'];

interface EditingAdminSchedule {
  readonly id: string;
  readonly kind: AdminPublicationKind;
  readonly version: number;
}

interface PendingScheduleWithdrawal extends EditingAdminSchedule {
  readonly label: string;
}
type SessionAction =
  | 'replace-coach'
  | 'cancel-after-coach-replacement'
  | 'fail-external'
  | 'cancel-training-participation';

interface PendingSessionAction {
  readonly action: SessionAction;
  readonly body: Record<string, unknown>;
  readonly confirmLabel: string;
  readonly description: string;
  readonly operationSuffix: string;
  readonly sessionId: string;
  readonly title: string;
  readonly tone: 'neutral' | 'danger';
}

const appealDecisionOptions: ReadonlyArray<{
  readonly decision: NonNullable<CentralAppeal['decision']>;
  readonly label: string;
  readonly consequence: string;
}> = [
  { decision: 'UPHOLD', label: 'Подтвердить', consequence: 'Исход и статус станут финальными.' },
  { decision: 'REVERSE', label: 'Сменить победителя', consequence: 'Победитель и статус будут пересчитаны.' },
  { decision: 'ANNUL', label: 'Аннулировать', consequence: 'Исход и cooldown отменятся, прежний статус вернётся.' },
  { decision: 'REPEAT', label: 'Назначить повтор', consequence: 'Статус вернётся, участники снова выберут слот.' },
];

const scheduleReasonOptions: ReadonlyArray<{
  readonly code: ScheduleReasonCode;
  readonly label: string;
}> = [
  { code: 'COACH_UNAVAILABLE', label: 'Coach недоступен' },
  { code: 'VENUE_UNAVAILABLE', label: 'Зал недоступен' },
  { code: 'SCHEDULE_CHANGED', label: 'Расписание изменилось' },
  { code: 'OTHER', label: 'Другая причина' },
];

const mainSections: ReadonlyArray<{
  readonly id: MainSection;
  readonly label: string;
  readonly title: string;
  readonly lead: string;
}> = [
  {
    id: 'DISCOVERY',
    label: 'Discovery',
    title: 'Найдите партнёра',
    lead: 'Выберите человека, с которым хотите потренироваться. Общение откроется после взаимного интереса.',
  },
  {
    id: 'PROFILE',
    label: 'Профиль',
    title: 'Ваш профиль',
    lead: 'Управляйте именем и смотрите текущие состояния аккаунта.',
  },
  {
    id: 'COMMUNITY',
    label: 'Community',
    title: 'Ваше Community',
    lead: 'Зал, Membership и доступ к официальным Challenge.',
  },
];

const operationalSectionCopy: Readonly<Record<string, Readonly<Partial<Record<MainSection, {
  readonly label: string;
  readonly title: string;
  readonly lead: string;
}>>>>> = {
  Coach: {
    COMMUNITY: {
      label: 'Сессии',
      title: 'Рабочие сессии',
      lead: 'Начинайте тренировки, отмечайте присутствие и подтверждайте результат.',
    },
    PROFILE: {
      label: 'Профиль',
      title: 'Профиль тренера',
      lead: 'Проверьте данные аккаунта и полномочия Coach.',
    },
  },
  'Gym Admin': {
    COMMUNITY: {
      label: 'Заявки',
      title: 'Управление залом',
      lead: 'Подтверждайте бронирования и управляйте назначенными сессиями.',
    },
    PROFILE: {
      label: 'Профиль',
      title: 'Профиль администратора',
      lead: 'Проверьте данные аккаунта и полномочия Gym Admin.',
    },
  },
  Central: {
    COMMUNITY: {
      label: 'Обращения',
      title: 'Центральное рассмотрение',
      lead: 'Рассматривайте Appeal прозрачно и фиксируйте обоснование каждого решения.',
    },
  },
};

function sectionsForRole(role: string) {
  const availableIds: readonly MainSection[] = role === 'Athlete'
    ? ['DISCOVERY', 'PROFILE', 'COMMUNITY']
    : role === 'Central'
      ? ['COMMUNITY']
      : ['COMMUNITY', 'PROFILE'];
  const overrides = operationalSectionCopy[role];
  return availableIds
    .map((id) => mainSections.find((section) => section.id === id)!)
    .map((section) => ({ ...section, ...overrides?.[section.id] }));
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function defaultClosureEffectiveAt(): string {
  const value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  value.setMinutes(0, 0, 0);
  return value.toISOString().slice(0, 16);
}

function venueDateTimeToIso(
  dateText: string,
  timeText: string,
  timeZone: string,
): string | null {
  const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateText.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeText.trim());
  if (!dateMatch || !timeMatch) return null;
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (year < 2020 || month < 1 || month > 12 || day < 1 || day > 31
    || hour > 23 || minute > 59) return null;
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  const desiredDate = new Date(desiredUtc);
  if (desiredDate.getUTCFullYear() !== year || desiredDate.getUTCMonth() !== month - 1
    || desiredDate.getUTCDate() !== day) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit',
    month: '2-digit', second: '2-digit', timeZone, year: 'numeric',
  });
  const partsAt = (epochMs: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(epochMs))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    return {
      day: parts.day, hour: parts.hour, minute: parts.minute,
      month: parts.month, second: parts.second, year: parts.year,
    };
  };
  try {
    const first = partsAt(desiredUtc);
    let candidate = desiredUtc - (
      Date.UTC(first.year!, first.month! - 1, first.day!, first.hour!, first.minute!, first.second!)
      - desiredUtc
    );
    const second = partsAt(candidate);
    candidate += desiredUtc - Date.UTC(
      second.year!, second.month! - 1, second.day!, second.hour!, second.minute!, second.second!,
    );
    const resolved = partsAt(candidate);
    if (resolved.year !== year || resolved.month !== month || resolved.day !== day
      || resolved.hour !== hour || resolved.minute !== minute) return null;
    return new Date(candidate).toISOString();
  } catch {
    return null;
  }
}

function isoToVenueDateTime(value: string, timeZone: string): {
  readonly date: string;
  readonly time: string;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit',
      month: '2-digit', timeZone, year: 'numeric',
    }).formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.day}.${parts.month}.${parts.year}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

const capabilityLabels: Record<Capability, string> = {
  USE_DISCOVERY: 'Discovery доступен',
  EDIT_PROFILE: 'Профиль можно изменять',
  BOOK_ORDINARY_TRAINING: 'Обычные тренировки доступны',
  ACCOUNT_VERIFIED: 'Верификация аккаунта пройдена',
};

const verificationLabels: Record<Identity['accountVerificationState'], string> = {
  NOT_STARTED: 'Не начата',
  PENDING: 'На рассмотрении Central',
  VERIFIED: 'Аккаунт подтверждён',
  REJECTED: 'Отклонена',
  EXPIRED: 'Истекла',
  REVOKED: 'Отозвана',
};

const accountStateLabels: Record<Identity['accountState'], string> = {
  ACTIVE: 'Активен',
  RESTRICTED: 'Ограничен',
  CLOSED: 'Закрыт',
};

const sessionStateLabels: Record<Session['state'], string> = {
  SCHEDULED: 'Запланирована',
  READY_FOR_COACH: 'Ожидает Coach',
  IN_PROGRESS: 'Идёт сейчас',
  ENDED: 'Завершена',
  CANCELLED: 'Отменена',
};

const attendanceLabels: Record<AttendanceStatus, string> = {
  PRESENT: 'Присутствовал',
  LATE: 'Опоздал',
  NO_SHOW: 'Не пришёл',
};

const resultStateLabels: Record<OfficialResult['state'], string> = {
  RECORDED: 'Предварительный результат',
  UNDER_APPEAL: 'Рассматривается Appeal',
  FINAL: 'Финальный результат',
  REVERSED: 'Результат исправлен решением Central',
  ANNULLED: 'Результат аннулирован',
  REPEAT_ORDERED: 'Назначена повторная Session',
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

export default function IdentityScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView | null>(null);
  const [activeSection, setActiveSection] = useState<MainSection>(() =>
    localTestAccounts.find((account) => account.token === localToken)?.startSection
      ?? 'DISCOVERY');
  const [activeTestToken, setActiveTestToken] = useState(localToken);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [communityContext, setCommunityContext] = useState<CommunityContext | null>(null);
  const [communityLifecycle, setCommunityLifecycle] = useState<CommunityLifecycle | null>(null);
  const [communityLifecycleReason, setCommunityLifecycleReason] = useState('');
  const [communityLifecycleNotice, setCommunityLifecycleNotice] = useState<string | null>(null);
  const [actingCommunityLifecycle, setActingCommunityLifecycle] = useState(false);
  const [communityClosurePlan, setCommunityClosurePlan] = useState<CommunityClosurePlan | null>(null);
  const [communityClosureCandidates, setCommunityClosureCandidates] =
    useState<CommunityClosureCandidate[]>([]);
  const [communityClosureDispositions, setCommunityClosureDispositions] =
    useState<Record<string, CommunityClosureDisposition>>({});
  const [communityClosureCategory, setCommunityClosureCategory] = useState('VENUE_EXIT');
  const [communityClosureReason, setCommunityClosureReason] = useState('');
  const [communityClosureEffectiveAt, setCommunityClosureEffectiveAt] =
    useState(defaultClosureEffectiveAt);
  const [communityClosureEmergency, setCommunityClosureEmergency] = useState(false);
  const [communityClosureArmed, setCommunityClosureArmed] = useState(false);
  const [communityClosureNotice, setCommunityClosureNotice] = useState<string | null>(null);
  const [actingCommunityClosure, setActingCommunityClosure] = useState(false);
  const [competitionStatus, setCompetitionStatus] = useState<CompetitionStatus | null>(null);
  const [statusReleasePreview, setStatusReleasePreview] =
    useState<StatusReleasePreview | null>(null);
  const [membershipExitPreview, setMembershipExitPreview] =
    useState<MembershipExitPreview | null>(null);
  const [membershipExitNotice, setMembershipExitNotice] = useState<string | null>(null);
  const [actingMembershipExit, setActingMembershipExit] = useState(false);
  const [membershipRemovals, setMembershipRemovals] = useState<MembershipRemoval[]>([]);
  const [venueMembers, setVenueMembers] = useState<VenueMember[]>([]);
  const [removalTargetId, setRemovalTargetId] = useState<string | null>(null);
  const [removalReason, setRemovalReason] = useState('');
  const [removalAppealCaseId, setRemovalAppealCaseId] = useState<string | null>(null);
  const [removalAppealReason, setRemovalAppealReason] = useState('');
  const [removalDecisionCaseId, setRemovalDecisionCaseId] = useState<string | null>(null);
  const [removalDecisionReason, setRemovalDecisionReason] = useState('');
  const [actingMembershipRemoval, setActingMembershipRemoval] = useState(false);
  const [membershipRemovalNotice, setMembershipRemovalNotice] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [primarySport, setPrimarySport] = useState('BOXING');
  const [secondarySport, setSecondarySport] = useState<string | null>(null);
  const [coachInvites, setCoachInvites] = useState<CoachInvite[]>([]);
  const [hostConfirmations, setHostConfirmations] = useState<HostConfirmation[]>([]);
  const [venueAdminDashboard, setVenueAdminDashboard] =
    useState<VenueAdminDashboard | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resultsById, setResultsById] = useState<Record<string, OfficialResult>>({});
  const [appealsByResultId, setAppealsByResultId] = useState<Record<string, AppealDetail>>({});
  const [completedTrainingCount, setCompletedTrainingCount] = useState(0);
  const [discoveryCards, setDiscoveryCards] = useState<DiscoveryCard[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [discoveryNotice, setDiscoveryNotice] = useState<string | null>(null);
  const [actingCandidateId, setActingCandidateId] = useState<string | null>(null);
  const [actingDiscoveryAction, setActingDiscoveryAction] =
    useState<DiscoveryAction | null>(null);
  const discoveryActionKeys = useRef(new Map<string, string>());
  const relationshipActionKeys = useRef(new Map<string, string>());
  const hostConfirmationKeys = useRef(new Map<string, string>());
  const adminPublicationKeys = useRef(new Map<string, string>());
  const sessionActionKeys = useRef(new Map<string, string>());
  const resultActionKeys = useRef(new Map<string, string>());
  const statusQueueActionKeys = useRef(new Map<string, string>());
  const membershipRemovalActionKeys = useRef(new Map<string, string>());
  const [actingRelationshipId, setActingRelationshipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSports, setSavingSports] = useState(false);
  const [startingVerification, setStartingVerification] = useState(false);
  const [acceptingCoachGrant, setAcceptingCoachGrant] = useState<string | null>(null);
  const [confirmingBookingId, setConfirmingBookingId] = useState<string | null>(null);
  const [hostRejectionDraftId, setHostRejectionDraftId] = useState<string | null>(null);
  const [hostRejectionReasonCode, setHostRejectionReasonCode] =
    useState<ScheduleReasonCode>('COACH_UNAVAILABLE');
  const [hostRejectionNote, setHostRejectionNote] = useState('');
  const [actingSessionKey, setActingSessionKey] = useState<string | null>(null);
  const [pendingSessionAction, setPendingSessionAction] =
    useState<PendingSessionAction | null>(null);
  const [actingResultKey, setActingResultKey] = useState<string | null>(null);
  const [appealDraftResultId, setAppealDraftResultId] = useState<string | null>(null);
  const [appealStatement, setAppealStatement] = useState('');
  const [appealResponseStatement, setAppealResponseStatement] = useState('');
  const [pendingAppealWithdrawalId, setPendingAppealWithdrawalId] = useState<string | null>(null);
  const [centralAppeals, setCentralAppeals] = useState<CentralAppeal[]>([]);
  const [missingResultReviews, setMissingResultReviews] = useState<MissingResultReview[]>([]);
  const [integrityCases, setIntegrityCases] = useState<IntegrityCase[]>([]);
  const [actingCentralAppealId, setActingCentralAppealId] = useState<string | null>(null);
  const [centralDecisionAppealId, setCentralDecisionAppealId] = useState<string | null>(null);
  const [centralDecisionReason, setCentralDecisionReason] = useState('');
  const [hostNotice, setHostNotice] = useState<string | null>(null);
  const [adminPublicationKind, setAdminPublicationKind] =
    useState<AdminPublicationKind>('SLOT');
  const [adminCoachId, setAdminCoachId] = useState('');
  const [adminScheduleDate, setAdminScheduleDate] = useState('');
  const [adminScheduleTime, setAdminScheduleTime] = useState('');
  const [adminDurationMinutes, setAdminDurationMinutes] =
    useState<AdminDurationMinutes>(60);
  const [adminPriceAmount, setAdminPriceAmount] = useState('');
  const [adminGroupClassLabel, setAdminGroupClassLabel] = useState('');
  const [adminGroupSportCode, setAdminGroupSportCode] = useState('BOXING');
  const [adminGroupCoachName, setAdminGroupCoachName] = useState('');
  const [adminGroupPriceText, setAdminGroupPriceText] = useState('');
  const [publishingSchedule, setPublishingSchedule] = useState(false);
  const [editingAdminSchedule, setEditingAdminSchedule] =
    useState<EditingAdminSchedule | null>(null);
  const [pendingScheduleWithdrawal, setPendingScheduleWithdrawal] =
    useState<PendingScheduleWithdrawal | null>(null);
  const [scheduleWithdrawalReasonCode, setScheduleWithdrawalReasonCode] =
    useState<ScheduleReasonCode>('SCHEDULE_CHANGED');
  const [scheduleWithdrawalNote, setScheduleWithdrawalNote] = useState('');
  const [withdrawingScheduleId, setWithdrawingScheduleId] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [statusQueueNotice, setStatusQueueNotice] = useState<string | null>(null);
  const [actingStatusQueue, setActingStatusQueue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIdentity = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDiscoveryNotice(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/me`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as MeResponse;
      setIdentity(result.data);
      setDisplayName(result.data.displayName);
      setPrimarySport(result.data.primarySport);
      setSecondarySport(result.data.secondarySport);
      const communityResponse = await fetch(`${apiUrl}/api/v1/me/community`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      let loadedCommunity: CommunityContext | null = null;
      if (communityResponse.status === 404) {
        setCommunityContext(null);
      } else {
        if (!communityResponse.ok) throw new Error(await apiErrorMessage(communityResponse));
        const communityResult = (await communityResponse.json()) as CommunityContextResponse;
        loadedCommunity = communityResult.data;
        setCommunityContext(communityResult.data);
      }
      const competitionResponse = await fetch(`${apiUrl}/api/v1/me/competition`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (competitionResponse.status === 404) {
        setCompetitionStatus(null);
      } else {
        if (!competitionResponse.ok) throw new Error(await apiErrorMessage(competitionResponse));
        const competitionResult = (await competitionResponse.json()) as CompetitionStatusResponse;
        setCompetitionStatus(competitionResult.data);
      }
      const currentAccount = localTestAccounts.find((account) => account.token === localToken);
      const myRemovalResponse = await fetch(`${apiUrl}/api/v1/me/membership-removals`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!myRemovalResponse.ok) throw new Error(await apiErrorMessage(myRemovalResponse));
      const myRemovalResult = (await myRemovalResponse.json()) as MembershipRemovalListResponse;
      setMembershipRemovals(myRemovalResult.data);
      if (currentAccount?.role === 'Central' && loadedCommunity) {
        const lifecycleResponse = await fetch(
          `${apiUrl}/api/v1/central/communities/${loadedCommunity.community.communityId}/lifecycle`,
          { headers: { Authorization: `Bearer ${localToken}` } },
        );
        if (!lifecycleResponse.ok) throw new Error(await apiErrorMessage(lifecycleResponse));
        const lifecycleResult = (await lifecycleResponse.json()) as CommunityLifecycleResponse;
        setCommunityLifecycle(lifecycleResult.data);
        const closureResponse = await fetch(
          `${apiUrl}/api/v1/central/communities/${loadedCommunity.community.communityId}/closure`,
          { headers: { Authorization: `Bearer ${localToken}` } },
        );
        if (closureResponse.status === 404) setCommunityClosurePlan(null);
        else {
          if (!closureResponse.ok) throw new Error(await apiErrorMessage(closureResponse));
          const closureResult = (await closureResponse.json()) as CommunityClosurePlanResponse;
          setCommunityClosurePlan(closureResult.data);
        }
        if (lifecycleResult.data.state === 'ACTIVE' || lifecycleResult.data.state === 'PAUSED') {
          const candidatesResponse = await fetch(
            `${apiUrl}/api/v1/central/communities/${loadedCommunity.community.communityId}/closure/candidates`,
            { headers: { Authorization: `Bearer ${localToken}` } },
          );
          if (!candidatesResponse.ok) throw new Error(await apiErrorMessage(candidatesResponse));
          const candidatesResult =
            (await candidatesResponse.json()) as CommunityClosureCandidatesResponse;
          setCommunityClosureCandidates(candidatesResult.data);
          setCommunityClosureDispositions(Object.fromEntries(
            candidatesResult.data.map((candidate) => [
              candidate.sessionId, candidate.recommendedDisposition,
            ]),
          ));
        } else {
          setCommunityClosureCandidates([]);
          setCommunityClosureDispositions({});
        }
      } else {
        setCommunityLifecycle(null);
        setCommunityClosurePlan(null);
        setCommunityClosureCandidates([]);
        setCommunityClosureDispositions({});
      }
      if (currentAccount?.role === 'Central') {
        const removalQueueResponse = await fetch(
          `${apiUrl}/api/v1/central/membership-removals`,
          { headers: { Authorization: `Bearer ${localToken}` } },
        );
        if (!removalQueueResponse.ok) {
          throw new Error(await apiErrorMessage(removalQueueResponse));
        }
        const removalQueue =
          (await removalQueueResponse.json()) as MembershipRemovalListResponse;
        setMembershipRemovals(removalQueue.data);
      }
      if (currentAccount?.role === 'Gym Admin' && loadedCommunity) {
        const dashboardResponse = await fetch(
          `${apiUrl}/api/v1/venues/${loadedCommunity.venue.venueId}/admin-dashboard`,
          { headers: { Authorization: `Bearer ${localToken}` } },
        );
        if (!dashboardResponse.ok) {
          throw new Error(await apiErrorMessage(dashboardResponse));
        }
        const dashboardResult =
          (await dashboardResponse.json()) as VenueAdminDashboardResponse;
        setVenueAdminDashboard(dashboardResult.data);
        setAdminCoachId((current) =>
          dashboardResult.data.coaches.some((coach) => coach.userId === current)
            ? current
            : dashboardResult.data.coaches[0]?.userId ?? '');
        const membersResponse = await fetch(
          `${apiUrl}/api/v1/venues/${loadedCommunity.venue.venueId}/members`,
          { headers: { Authorization: `Bearer ${localToken}` } },
        );
        if (!membersResponse.ok) throw new Error(await apiErrorMessage(membersResponse));
        const membersResult = (await membersResponse.json()) as VenueMemberListResponse;
        setVenueMembers(membersResult.data);
      } else {
        setVenueAdminDashboard(null);
        setVenueMembers([]);
      }
      const coachInviteResponse = await fetch(`${apiUrl}/api/v1/me/coach-invites`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!coachInviteResponse.ok) {
        throw new Error(await apiErrorMessage(coachInviteResponse));
      }
      const coachInviteResult =
        (await coachInviteResponse.json()) as PendingCoachInviteListResponse;
      setCoachInvites(coachInviteResult.data);
      const hostConfirmationsResponse = await fetch(
        `${apiUrl}/api/v1/me/host-confirmations`,
        { headers: { Authorization: `Bearer ${localToken}` } },
      );
      if (!hostConfirmationsResponse.ok) {
        throw new Error(await apiErrorMessage(hostConfirmationsResponse));
      }
      const hostConfirmationsResult =
        (await hostConfirmationsResponse.json()) as HostConfirmationQueueResponse;
      setHostConfirmations(hostConfirmationsResult.data);
      const sessionsResponse = await fetch(`${apiUrl}/api/v1/me/sessions`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!sessionsResponse.ok) {
        throw new Error(await apiErrorMessage(sessionsResponse));
      }
      const sessionsResult = (await sessionsResponse.json()) as MySessionsResponse;
      setSessions(sessionsResult.data.sessions);
      setCompletedTrainingCount(sessionsResult.data.completedTrainingCount);
      const missingResultResponse = await fetch(
        currentAccount?.role === 'Central'
          ? `${apiUrl}/api/v1/central/missing-result-reviews`
          : `${apiUrl}/api/v1/me/missing-result-reviews`,
        { headers: { Authorization: `Bearer ${localToken}` } },
      );
      if (!missingResultResponse.ok) {
        throw new Error(await apiErrorMessage(missingResultResponse));
      }
      const missingResultData = (await missingResultResponse.json()) as MissingResultReviewListResponse;
      setMissingResultReviews(missingResultData.data);
      const integrityCasesResponse = await fetch(
        currentAccount?.role === 'Central'
          ? `${apiUrl}/api/v1/central/integrity-cases`
          : `${apiUrl}/api/v1/me/integrity-cases`,
        { headers: { Authorization: `Bearer ${localToken}` } },
      );
      if (!integrityCasesResponse.ok) {
        throw new Error(await apiErrorMessage(integrityCasesResponse));
      }
      const integrityCasesResult =
        (await integrityCasesResponse.json()) as IntegrityCaseListResponse;
      setIntegrityCases(integrityCasesResult.data);
      const officialResults = await Promise.all(
        sessionsResult.data.sessions
          .filter((session) => session.resultId !== null)
          .map(async (session) => {
            const resultResponse = await fetch(`${apiUrl}/api/v1/results/${session.resultId}`, {
              headers: { Authorization: `Bearer ${localToken}` },
            });
            if (!resultResponse.ok) throw new Error(await apiErrorMessage(resultResponse));
            return ((await resultResponse.json()) as ResultResponse).data;
          }),
      );
      setResultsById(Object.fromEntries(officialResults.map((result) => [result.resultId, result])));
      const appealDetails = await Promise.all(
        officialResults.filter((result) => result.state === 'UNDER_APPEAL').map(async (result) => {
          const appealResponse = await fetch(`${apiUrl}/api/v1/results/${result.resultId}/appeal`, {
            headers: { Authorization: `Bearer ${localToken}` },
          });
          if (appealResponse.status === 404) return null;
          if (!appealResponse.ok) throw new Error(await apiErrorMessage(appealResponse));
          return ((await appealResponse.json()) as AppealDetailResponse).data;
        }),
      );
      setAppealsByResultId(Object.fromEntries(
        appealDetails.filter((appeal): appeal is AppealDetail => appeal !== null)
          .map((appeal) => [appeal.resultId, appeal]),
      ));
      const discoveryResponse = await fetch(`${apiUrl}/api/v1/discovery/cards?limit=20`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (discoveryResponse.status === 403) {
        setDiscoveryCards([]);
        setDiscoveryNotice('Discovery откроется после выбора города и домашнего зала.');
      } else if (!discoveryResponse.ok) {
        throw new Error(await apiErrorMessage(discoveryResponse));
      } else {
        const discoveryResult =
          (await discoveryResponse.json()) as DiscoveryCardsResponse;
        setDiscoveryCards(discoveryResult.data);
      }
      const matchesResponse = await fetch(`${apiUrl}/api/v1/matches`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!matchesResponse.ok) throw new Error(await apiErrorMessage(matchesResponse));
      const matchesResult = (await matchesResponse.json()) as MatchesResponse;
      setMatches(matchesResult.data);
      const blocksResponse = await fetch(`${apiUrl}/api/v1/me/blocks`, {
        headers: { Authorization: `Bearer ${localToken}` },
      });
      if (!blocksResponse.ok) throw new Error(await apiErrorMessage(blocksResponse));
      const blocksResult = (await blocksResponse.json()) as BlockedUsersResponse;
      setBlockedUsers(blocksResult.data);
      if (currentAccount?.role === 'Central') {
        const appealsResponse = await fetch(`${apiUrl}/api/v1/central/appeals`, {
          headers: { Authorization: `Bearer ${localToken}` },
        });
        if (!appealsResponse.ok) throw new Error(await apiErrorMessage(appealsResponse));
        const appealsResult = (await appealsResponse.json()) as AppealQueueResponse;
        setCentralAppeals(appealsResult.data);
      } else {
        setCentralAppeals([]);
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
  const canSaveSports =
    identity !== null &&
    !savingSports &&
    primarySport.length > 0 &&
    primarySport !== secondarySport &&
    (primarySport !== identity.primarySport || secondarySport !== identity.secondarySport);
  const canPublishAdminSchedule =
    venueAdminDashboard !== null &&
    !publishingSchedule &&
    /^\d{2}\.\d{2}\.\d{4}$/.test(adminScheduleDate.trim()) &&
    /^\d{2}:\d{2}$/.test(adminScheduleTime.trim()) &&
    (adminPublicationKind === 'SLOT'
      ? adminCoachId.length > 0
      : adminGroupClassLabel.trim().length > 0);
  const activeTestAccount =
    localTestAccounts.find((account) => account.token === activeTestToken) ??
    localTestAccounts[0]!;
  const visibleSections = sectionsForRole(activeTestAccount.role);
  const activeSectionCopy =
    visibleSections.find((section) => section.id === activeSection) ?? visibleSections[0]!;

  const openSection = (section: MainSection) => {
    setActiveSection(section);
    scrollRef.current?.scrollTo({ animated: false, y: 0 });
  };

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
        const message = await apiErrorMessage(response);
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

  const saveSports = async () => {
    if (!identity || !canSaveSports) return;
    setSavingSports(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/me/sports`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `identity:${identity.userId}:sports:${primarySport}:${secondarySport ?? 'NONE'}:v${identity.version}`,
          'If-Match': String(identity.version),
        },
        body: JSON.stringify({ primarySport, secondarySport }),
      });
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await loadIdentity();
        throw new Error(message);
      }
      const result = (await response.json()) as IdentityCommandResponse;
      setIdentity(result.data);
      setPrimarySport(result.data.primarySport);
      setSecondarySport(result.data.secondarySport);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить виды спорта');
    } finally {
      setSavingSports(false);
    }
  };

  const switchLocalAccount = (account: LocalTestAccount) => {
    if (account.token === activeTestToken) {
      setAccountMenuOpen(false);
      return;
    }
    setLocalToken(account.token);
    setActiveTestToken(account.token);
    setAccountMenuOpen(false);
    openSection(account.startSection);
    setIdentity(null);
    setCommunityContext(null);
    setCommunityLifecycle(null);
    setCommunityLifecycleReason('');
    setCommunityLifecycleNotice(null);
    setActingCommunityLifecycle(false);
    setCommunityClosurePlan(null);
    setCommunityClosureCandidates([]);
    setCommunityClosureDispositions({});
    setCommunityClosureCategory('VENUE_EXIT');
    setCommunityClosureReason('');
    setCommunityClosureEffectiveAt(defaultClosureEffectiveAt());
    setCommunityClosureEmergency(false);
    setCommunityClosureArmed(false);
    setCommunityClosureNotice(null);
    setActingCommunityClosure(false);
    setCompetitionStatus(null);
    setStatusReleasePreview(null);
    setMembershipExitPreview(null);
    setMembershipExitNotice(null);
    setActingMembershipExit(false);
    setMembershipRemovals([]);
    setVenueMembers([]);
    setRemovalTargetId(null);
    setRemovalReason('');
    setRemovalAppealCaseId(null);
    setRemovalAppealReason('');
    setRemovalDecisionCaseId(null);
    setRemovalDecisionReason('');
    setActingMembershipRemoval(false);
    setMembershipRemovalNotice(null);
    setCoachInvites([]);
    setHostConfirmations([]);
    setVenueAdminDashboard(null);
    setSessions([]);
    setResultsById({});
    setCompletedTrainingCount(0);
    setDiscoveryCards([]);
    setMatches([]);
    setBlockedUsers([]);
    setDiscoveryNotice(null);
    setHostNotice(null);
    setScheduleNotice(null);
    setAdminCoachId('');
    setAdminScheduleDate('');
    setAdminScheduleTime('');
    setAdminPriceAmount('');
    setAdminGroupClassLabel('');
    setAdminGroupCoachName('');
    setAdminGroupPriceText('');
    setEditingAdminSchedule(null);
    setPendingScheduleWithdrawal(null);
    setScheduleWithdrawalNote('');
    setWithdrawingScheduleId(null);
    setHostRejectionDraftId(null);
    setHostRejectionNote('');
    setSessionNotice(null);
    setStatusQueueNotice(null);
    setActingStatusQueue(false);
    setPendingSessionAction(null);
    setAppealDraftResultId(null);
    setAppealStatement('');
    setAppealResponseStatement('');
    setPendingAppealWithdrawalId(null);
    setAppealsByResultId({});
    setCentralAppeals([]);
    setMissingResultReviews([]);
    setIntegrityCases([]);
    setActingCentralAppealId(null);
    setCentralDecisionAppealId(null);
    setCentralDecisionReason('');
    void loadIdentity();
  };

  const publishAdminSchedule = async () => {
    if (!venueAdminDashboard || publishingSchedule) return;
    const startAt = venueDateTimeToIso(
      adminScheduleDate,
      adminScheduleTime,
      venueAdminDashboard.venue.timezone,
    );
    if (!startAt) {
      setError('Проверьте дату и время: формат ДД.ММ.ГГГГ и ЧЧ:ММ.');
      return;
    }
    const startTime = new Date(startAt).getTime();
    const horizonTime = Date.now()
      + venueAdminDashboard.venue.slotPublishHorizonDays * 24 * 60 * 60 * 1000;
    if (startTime <= Date.now()) {
      setError('Выберите будущую дату и время.');
      return;
    }
    if (startTime > horizonTime) {
      setError(
        `Этот зал публикует расписание не более чем на ${venueAdminDashboard.venue.slotPublishHorizonDays} дней вперёд.`,
      );
      return;
    }
    const normalizedPrice = adminPriceAmount.trim().replace(',', '.');
    if (adminPublicationKind === 'SLOT'
      && (!adminCoachId || (normalizedPrice.length > 0
        && !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(normalizedPrice)))) {
      setError(!adminCoachId
        ? 'Выберите Coach для персонального слота.'
        : 'Укажите стоимость числом, например 1500 или 1500,50.');
      return;
    }
    const classLabel = adminGroupClassLabel.trim();
    if (adminPublicationKind === 'GROUP' && classLabel.length === 0) {
      setError('Укажите название групповой тренировки.');
      return;
    }

    const endAt = new Date(startTime + adminDurationMinutes * 60 * 1000).toISOString();
    const signature = [
      editingAdminSchedule ? 'update' : 'publish',
      adminPublicationKind,
      editingAdminSchedule?.id ?? venueAdminDashboard.venue.venueId,
      editingAdminSchedule?.version ?? 0,
      startAt, endAt,
      adminPublicationKind === 'SLOT' ? adminCoachId : adminGroupSportCode,
      adminPublicationKind === 'SLOT' ? normalizedPrice : classLabel,
    ].join(':');
    const idempotencyKey = adminPublicationKeys.current.get(signature)
      ?? `venue-publication:${Date.now().toString(36)}`;
    adminPublicationKeys.current.set(signature, idempotencyKey);
    setPublishingSchedule(true);
    setScheduleNotice(null);
    setError(null);
    try {
      const response = await fetch(
        editingAdminSchedule
          ? `${apiUrl}/api/v1/${adminPublicationKind === 'SLOT'
            ? `slots/${editingAdminSchedule.id}`
            : `group-offerings/${editingAdminSchedule.id}`}`
          : `${apiUrl}/api/v1/venues/${venueAdminDashboard.venue.venueId}/${
            adminPublicationKind === 'SLOT' ? 'slots' : 'group-offerings'
          }`,
        {
          method: editingAdminSchedule ? 'PATCH' : 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(editingAdminSchedule?.version ?? 0),
          },
          body: JSON.stringify(adminPublicationKind === 'SLOT'
            ? {
                coachUserId: adminCoachId,
                startAt,
                endAt,
                priceAmount: normalizedPrice || null,
                priceCurrency: normalizedPrice ? 'RUB' : null,
                priceText: normalizedPrice ? 'Оплата напрямую залу' : null,
                cancellationTermsText: 'Уточните условия у зала',
              }
            : {
                sportCode: adminGroupSportCode,
                classLabel,
                startAt,
                endAt,
                coachDisplayName: adminGroupCoachName.trim() || null,
                priceText: adminGroupPriceText.trim() || null,
                externalInfoUrl: null,
              }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      if (adminPublicationKind === 'SLOT') {
        const result = (await response.json()) as SlotCommandResponse;
        setVenueAdminDashboard((current) => current ? {
          ...current,
          slots: [...current.slots.filter((slot) => slot.slotId !== result.data.slotId), result.data]
            .sort((left, right) => left.startAt.localeCompare(right.startAt)),
        } : current);
        setAdminPriceAmount('');
        setScheduleNotice(editingAdminSchedule
          ? 'Персональный слот обновлён. Пары в Chat уже видят новые условия.'
          : 'Персональный слот опубликован и уже доступен парам в Chat.');
      } else {
        const result = (await response.json()) as GroupOfferingCommandResponse;
        setVenueAdminDashboard((current) => current ? {
          ...current,
          groupOfferings: [
            ...current.groupOfferings.filter(
              (offering) => offering.groupOfferingId !== result.data.groupOfferingId,
            ),
            result.data,
          ].sort((left, right) => left.startAt.localeCompare(right.startAt)),
        } : current);
        setAdminGroupClassLabel('');
        setAdminGroupCoachName('');
        setAdminGroupPriceText('');
        setScheduleNotice(editingAdminSchedule
          ? 'Групповая тренировка обновлена.'
          : 'Групповая тренировка опубликована. Это предложение без автоматической брони места.');
      }
      setEditingAdminSchedule(null);
      adminPublicationKeys.current.delete(signature);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить расписание');
    } finally {
      setPublishingSchedule(false);
    }
  };

  const startEditingSlot = (slot: VenueAdminDashboard['slots'][number]) => {
    if (!venueAdminDashboard) return;
    const local = isoToVenueDateTime(slot.startAt, venueAdminDashboard.venue.timezone);
    const duration = Math.round(
      (new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime()) / 60_000,
    );
    setAdminPublicationKind('SLOT');
    setAdminCoachId(slot.coachUserId);
    setAdminScheduleDate(local.date);
    setAdminScheduleTime(local.time);
    setAdminDurationMinutes(duration === 90 ? 90 : 60);
    setAdminPriceAmount(slot.priceAmount ?? '');
    setEditingAdminSchedule({ id: slot.slotId, kind: 'SLOT', version: slot.version });
    setPendingScheduleWithdrawal(null);
    setScheduleNotice('Редактируете персональный слот. Сохраните или отмените изменения.');
    setError(null);
  };

  const startEditingGroupOffering = (
    offering: VenueAdminDashboard['groupOfferings'][number],
  ) => {
    if (!venueAdminDashboard) return;
    const local = isoToVenueDateTime(
      offering.startAt,
      venueAdminDashboard.venue.timezone,
    );
    const duration = Math.round(
      (new Date(offering.endAt).getTime() - new Date(offering.startAt).getTime()) / 60_000,
    );
    setAdminPublicationKind('GROUP');
    setAdminScheduleDate(local.date);
    setAdminScheduleTime(local.time);
    setAdminDurationMinutes(duration === 90 ? 90 : 60);
    setAdminGroupClassLabel(offering.classLabel);
    setAdminGroupSportCode(offering.sportCode);
    setAdminGroupCoachName(offering.coachDisplayName ?? '');
    setAdminGroupPriceText(offering.priceText ?? '');
    setEditingAdminSchedule({
      id: offering.groupOfferingId,
      kind: 'GROUP',
      version: offering.version,
    });
    setPendingScheduleWithdrawal(null);
    setScheduleNotice('Редактируете групповую тренировку. Сохраните или отмените изменения.');
    setError(null);
  };

  const cancelEditingAdminSchedule = () => {
    setEditingAdminSchedule(null);
    setAdminScheduleDate('');
    setAdminScheduleTime('');
    setAdminPriceAmount('');
    setAdminGroupClassLabel('');
    setAdminGroupCoachName('');
    setAdminGroupPriceText('');
    setScheduleNotice(null);
    setError(null);
  };

  const withdrawAdminSchedule = async () => {
    if (!pendingScheduleWithdrawal || withdrawingScheduleId !== null) return;
    const pending = pendingScheduleWithdrawal;
    const operation = `schedule-withdraw:${pending.kind}:${pending.id}:v${pending.version}`;
    const idempotencyKey = adminPublicationKeys.current.get(operation)
      ?? `venue-publication:${operation}`;
    adminPublicationKeys.current.set(operation, idempotencyKey);
    setWithdrawingScheduleId(pending.id);
    setScheduleNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/${pending.kind === 'SLOT'
          ? `slots/${pending.id}`
          : `group-offerings/${pending.id}`}/withdraw`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(pending.version),
          },
          body: JSON.stringify({
            reasonCode: scheduleWithdrawalReasonCode,
            reasonNote: scheduleWithdrawalNote.trim() || null,
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      if (pending.kind === 'SLOT') {
        const result = (await response.json()) as SlotCommandResponse;
        setVenueAdminDashboard((current) => current ? {
          ...current,
          slots: current.slots.filter((slot) => slot.slotId !== result.data.slotId),
        } : current);
      } else {
        const result = (await response.json()) as GroupOfferingCommandResponse;
        setVenueAdminDashboard((current) => current ? {
          ...current,
          groupOfferings: current.groupOfferings.filter(
            (offering) => offering.groupOfferingId !== result.data.groupOfferingId,
          ),
        } : current);
      }
      adminPublicationKeys.current.delete(operation);
      setPendingScheduleWithdrawal(null);
      setScheduleWithdrawalNote('');
      setScheduleNotice(`«${pending.label}» снято с публикации.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось снять публикацию');
    } finally {
      setWithdrawingScheduleId(null);
    }
  };

  const confirmHostBooking = async (item: HostConfirmation) => {
    if (confirmingBookingId !== null) return;
    const booking = item.booking;
    const operation = `host-confirm:${booking.bookingId}:v${booking.version}`;
    const idempotencyKey =
      hostConfirmationKeys.current.get(operation) ??
      `host-confirm:${booking.bookingId}:v${booking.version}`;
    hostConfirmationKeys.current.set(operation, idempotencyKey);
    setConfirmingBookingId(booking.bookingId);
    setHostNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/bookings/${booking.bookingId}/host-confirm`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(booking.version),
          },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as HostConfirmationCommandResponse;
      hostConfirmationKeys.current.delete(operation);
      setHostConfirmations((current) =>
        current.filter((candidate) => candidate.booking.bookingId !== booking.bookingId),
      );
      setVenueAdminDashboard((current) => current ? {
        ...current,
        hostConfirmations: current.hostConfirmations.filter(
          (candidate) => candidate.booking.bookingId !== booking.bookingId,
        ),
        slots: result.data.outcome === 'CONFIRMED'
          ? current.slots.filter((slot) => slot.slotId !== booking.slotId)
          : current.slots,
      } : current);
      setHostNotice(
        result.data.outcome === 'CONFIRMED'
          ? booking.purpose === 'OFFICIAL_CHALLENGE'
            ? 'Official Challenge подтверждён. Official Session создана и видна обоим спортсменам.'
            : 'Тренировка подтверждена. Session создана и видна обоим спортсменам.'
          : 'Этот слот уже заняла другая пара. Спортсмены получили уведомление.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подтвердить тренировку');
    } finally {
      setConfirmingBookingId(null);
    }
  };

  const rejectHostBooking = async (item: HostConfirmation) => {
    if (confirmingBookingId !== null) return;
    const booking = item.booking;
    const operation = `host-reject:${booking.bookingId}:v${booking.version}`;
    const idempotencyKey = hostConfirmationKeys.current.get(operation) ?? operation;
    hostConfirmationKeys.current.set(operation, idempotencyKey);
    setConfirmingBookingId(booking.bookingId);
    setHostNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/bookings/${booking.bookingId}/host-reject`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(booking.version),
          },
          body: JSON.stringify({
            reasonCode: hostRejectionReasonCode,
            reasonNote: hostRejectionNote.trim() || null,
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      await response.json() as HostRejectionCommandResponse;
      hostConfirmationKeys.current.delete(operation);
      setHostConfirmations((current) =>
        current.filter((candidate) => candidate.booking.bookingId !== booking.bookingId),
      );
      setVenueAdminDashboard((current) => current ? {
        ...current,
        hostConfirmations: current.hostConfirmations.filter(
          (candidate) => candidate.booking.bookingId !== booking.bookingId,
        ),
      } : current);
      setHostRejectionDraftId(null);
      setHostRejectionNote('');
      setHostNotice(booking.purpose === 'OFFICIAL_CHALLENGE'
        ? 'Заявка отклонена с причиной. Challenge возвращён участникам для выбора другого слота.'
        : 'Заявка отклонена с причиной. Спортсмены получили уведомление.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отклонить заявку');
    } finally {
      setConfirmingBookingId(null);
    }
  };

  const runSessionAction = async (
    session: Session,
    action:
      | 'start'
      | 'attendance'
      | 'end'
      | 'replace-coach'
      | 'cancel-after-coach-replacement'
      | 'fail-external',
    body: Record<string, unknown>,
    operationSuffix: string,
  ) => {
    if (actingSessionKey !== null) return;
    const operation = `${session.sessionId}:${action}:${operationSuffix}:v${session.version}`;
    const idempotencyKey =
      sessionActionKeys.current.get(operation) ?? `session:${operation}`;
    sessionActionKeys.current.set(operation, idempotencyKey);
    setActingSessionKey(operation);
    setSessionNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/sessions/${session.sessionId}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(session.version),
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as SessionCommandResponse;
      sessionActionKeys.current.delete(operation);
      setSessions((current) =>
        current.map((item) =>
          item.sessionId === result.data.sessionId ? result.data : item,
        ),
      );
      setSessionNotice(
        action === 'start'
          ? 'Session начата Coach. Спортсменам не требуется Check-in.'
          : action === 'attendance'
            ? 'Посещение зафиксировано Coach.'
            : action === 'end'
              ? 'Тренировка завершена. Статистика обновлена только для присутствовавших.'
              : action === 'replace-coach'
                ? 'Coach заменён без изменения времени, зала и условий. Спортсмены уведомлены.'
                : action === 'cancel-after-coach-replacement'
                  ? 'Session отменена без штрафа и без влияния на статистику.'
                  : 'Зал отменил Session по внешней причине. Для спортсменов нет штрафа.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить Session');
    } finally {
      setActingSessionKey(null);
    }
  };

  const recordAttendance = (
    session: Session,
    athleteUserId: string,
    status: AttendanceStatus,
  ) => runSessionAction(
    session,
    'attendance',
    {
      athleteUserId,
      status,
      ...(status === 'NO_SHOW'
        ? { comment: 'Отсутствие спортсмена не позволило провести тренировку.' }
        : {}),
    },
    `${athleteUserId}:${status}`,
  );

  const requestOfficialConversion = async (session: Session) => {
    if (actingSessionKey !== null) return;
    const operation = `${session.sessionId}:official-conversion:request:v${session.version}`;
    const idempotencyKey = sessionActionKeys.current.get(operation)
      ?? `booking-conversion:${operation}`;
    sessionActionKeys.current.set(operation, idempotencyKey);
    setActingSessionKey(operation);
    setSessionNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/sessions/${session.sessionId}/official-conversion`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': '0',
          },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as BookingOfficialConversionCommandResponse;
      sessionActionKeys.current.delete(operation);
      await loadIdentity();
      setSessionNotice(result.data.state === 'WAITING_FIFO'
        ? `Заявка поставлена в прозрачную очередь${result.data.queuePosition
          ? `, позиция ${result.data.queuePosition}` : ''}. Тренировка пока остаётся обычной.`
        : 'Запрос отправлен. Нужны подтверждения второго спортсмена и Coach.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось запросить Official Challenge');
    } finally {
      setActingSessionKey(null);
    }
  };

  const decideOfficialConversion = async (
    session: Session,
    decision: 'ACCEPT' | 'DECLINE',
  ) => {
    const conversion = session.officialConversion;
    if (!conversion || actingSessionKey !== null) return;
    const operation = `${conversion.conversionId}:conversion:${decision}:v${conversion.version}`;
    const idempotencyKey = sessionActionKeys.current.get(operation)
      ?? `booking-conversion:${operation}`;
    sessionActionKeys.current.set(operation, idempotencyKey);
    setActingSessionKey(operation);
    setSessionNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/booking-official-conversions/${conversion.conversionId}/decision`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(conversion.version),
          },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as BookingOfficialConversionCommandResponse;
      sessionActionKeys.current.delete(operation);
      await loadIdentity();
      setSessionNotice(result.data.state === 'CONVERTED'
        ? 'Все подтвердили. Тренировка стала Official Challenge; время и Coach сохранены.'
        : result.data.state === 'DECLINED'
          ? 'Конверсия отклонена без штрафа. Исходная тренировка сохранена.'
          : 'Ваше подтверждение принято. Ожидаем остальных участников.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось ответить на запрос');
    } finally {
      setActingSessionKey(null);
    }
  };

  const cancelTrainingParticipation = async (session: Session) => {
    if (actingSessionKey !== null) return;
    const operation = `${session.sessionId}:cancel-training-participation:v${session.version}`;
    const idempotencyKey = sessionActionKeys.current.get(operation)
      ?? `booking-solo:${operation}`;
    sessionActionKeys.current.set(operation, idempotencyKey);
    setActingSessionKey(operation);
    setSessionNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/sessions/${session.sessionId}/cancel-training-participation`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': '0',
          },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as BookingSoloContinuationCommandResponse;
      sessionActionKeys.current.delete(operation);
      await loadIdentity();
      setSessionNotice(
        `Вы отменили своё участие без поражения. До ${formatDateTime(result.data.deadlineAt)} `
        + 'оставшийся спортсмен и Coach могут подтвердить соло-тренировку.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отменить участие');
    } finally {
      setActingSessionKey(null);
    }
  };

  const decideSoloContinuation = async (
    session: Session,
    decision: 'ACCEPT' | 'DECLINE',
  ) => {
    const continuation = session.soloContinuation;
    if (!continuation || actingSessionKey !== null) return;
    const operation = `${continuation.continuationId}:solo:${decision}:v${continuation.version}`;
    const idempotencyKey = sessionActionKeys.current.get(operation)
      ?? `booking-solo:${operation}`;
    sessionActionKeys.current.set(operation, idempotencyKey);
    setActingSessionKey(operation);
    setSessionNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/booking-solo-continuations/${continuation.continuationId}/decision`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(continuation.version),
          },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as BookingSoloContinuationCommandResponse;
      sessionActionKeys.current.delete(operation);
      await loadIdentity();
      setSessionNotice(result.data.state === 'CONFIRMED'
        ? 'Оставшийся спортсмен и Coach подтвердили соло-тренировку. Время и слот сохранены.'
        : result.data.state === 'DECLINED'
          ? 'Соло-тренировка отклонена. Session отменена без штрафов и спортивных последствий.'
          : 'Ваш ответ принят. Ожидаем второе подтверждение.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось ответить на соло-запрос');
    } finally {
      setActingSessionKey(null);
    }
  };

  const decideTrainingRetention = async (
    session: Session,
    decision: 'ACCEPT' | 'DECLINE',
  ) => {
    const retention = session.trainingRetention;
    if (!retention || actingSessionKey !== null) return;
    const operation = `${retention.retentionId}:training-retention:${decision}:v${retention.version}`;
    const idempotencyKey = sessionActionKeys.current.get(operation)
      ?? `training-retention:${operation}`;
    sessionActionKeys.current.set(operation, idempotencyKey);
    setActingSessionKey(operation);
    setSessionNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/booking-training-retentions/${retention.retentionId}/decision`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(retention.version),
          },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as BookingTrainingRetentionCommandResponse;
      sessionActionKeys.current.delete(operation);
      await loadIdentity();
      setSessionNotice(result.data.state === 'CONFIRMED'
        ? 'Все подтвердили. Время и Coach сохранены, а Session продолжится как обычная тренировка.'
        : result.data.state === 'DECLINED'
          ? 'Продолжение отклонено. Session отменена без поражения и спортивных последствий.'
          : 'Ваш ответ принят. Ожидаем подтверждения остальных участников.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось ответить по сохранению тренировки');
    } finally {
      setActingSessionKey(null);
    }
  };

  const recordOfficialResult = async (
    session: Session,
    outcomeCode: ResultOutcomeCode,
    winnerUserId: string | null = null,
  ) => {
    if (!session.challengeId || !session.challengeVersion || actingResultKey !== null) return;
    const operation = `record:${session.challengeId}:${outcomeCode}:${winnerUserId ?? 'NONE'}:v${session.challengeVersion}`;
    const idempotencyKey = resultActionKeys.current.get(operation) ?? `result:${operation}`;
    resultActionKeys.current.set(operation, idempotencyKey);
    setActingResultKey(operation);
    setSessionNotice(null);
    setError(null);
    const explanationRequired = ['NO_SHOW', 'NO_CONTEST', 'FORFEIT'].includes(outcomeCode);
    try {
      const response = await fetch(`${apiUrl}/api/v1/challenges/${session.challengeId}/result`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': String(session.challengeVersion),
        },
        body: JSON.stringify({
          sessionId: session.sessionId, outcomeCode, winnerUserId,
          ...(explanationRequired
            ? {
                reasonCode: outcomeCode === 'NO_SHOW' ? 'ATTENDANCE_NO_SHOW' : 'COACH_NO_CONTEST',
                comment: outcomeCode === 'NO_SHOW'
                  ? 'Неявка зафиксирована Coach в Session.'
                  : 'Coach завершил Session без засчитываемого результата.',
              }
            : {}),
        }),
      });
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const result = (await response.json()) as ResultCommandResponse;
      resultActionKeys.current.delete(operation);
      setResultsById((current) => ({ ...current, [result.data.resultId]: result.data }));
      setSessions((current) => current.map((item) => item.sessionId === session.sessionId
        ? {
            ...item, resultId: result.data.resultId, challengeState: 'RESULT_RECORDED',
            challengeVersion: (item.challengeVersion ?? 0) + 1,
          }
        : item));
      setSessionNotice('Coach подтвердил результат. Он уже виден, но остаётся предварительным 48 часов.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подтвердить результат');
    } finally {
      setActingResultKey(null);
    }
  };

  const runResultAction = async (
    result: OfficialResult,
    action: 'appeal' | 'waive-appeal',
  ) => {
    if (actingResultKey !== null) return;
    const statement = appealStatement.trim();
    if (action === 'appeal' && statement.length === 0) return;
    const operation = `${action}:${result.resultId}:v${result.version}`;
    const idempotencyKey = resultActionKeys.current.get(operation) ?? `result:${operation}`;
    resultActionKeys.current.set(operation, idempotencyKey);
    setActingResultKey(operation);
    setSessionNotice(null);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/results/${result.resultId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': String(result.version),
        },
        body: JSON.stringify(action === 'appeal'
          ? { reasonCode: 'RESULT_DISPUTED', statement }
          : {}),
      });
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const updated = (await response.json()) as ResultCommandResponse;
      resultActionKeys.current.delete(operation);
      setResultsById((current) => ({ ...current, [updated.data.resultId]: updated.data }));
      if (action === 'appeal') {
        const appealResponse = await fetch(`${apiUrl}/api/v1/results/${updated.data.resultId}/appeal`, {
          headers: { Authorization: `Bearer ${localToken}` },
        });
        if (!appealResponse.ok) throw new Error(await apiErrorMessage(appealResponse));
        const detail = ((await appealResponse.json()) as AppealDetailResponse).data;
        setAppealsByResultId((current) => ({ ...current, [detail.resultId]: detail }));
      }
      setSessions((current) => current.map((item) => item.resultId === updated.data.resultId
        ? {
            ...item,
            challengeState: updated.data.state === 'FINAL'
              ? 'COMPLETED'
              : updated.data.state === 'UNDER_APPEAL'
                ? 'UNDER_APPEAL'
                : 'RESULT_RECORDED',
            challengeVersion: (item.challengeVersion ?? 0)
              + (updated.data.state === 'FINAL' || updated.data.state === 'UNDER_APPEAL' ? 1 : 0),
          }
        : item));
      setAppealDraftResultId(null);
      setAppealStatement('');
      setSessionNotice(action === 'appeal'
        ? 'Appeal отправлен Central. Рассмотрение продолжается, спортивный статус остаётся заблокирован.'
        : updated.data.state === 'FINAL'
          ? 'Результат финализирован досрочно, ограничения сняты.'
          : 'Отказ от Appeal сохранён. Финализация произойдёт после решения второго участника или окончания окна.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить Result');
    } finally {
      setActingResultKey(null);
    }
  };

  const runCommunityLifecycleAction = async () => {
    if (
      !communityLifecycle || actingCommunityLifecycle
      || (communityLifecycle.state !== 'ACTIVE' && communityLifecycle.state !== 'PAUSED')
    ) return;
    const reason = communityLifecycleReason.trim();
    if (reason.length === 0) return;
    const action = communityLifecycle.state === 'ACTIVE' ? 'pause' : 'reactivate';
    setActingCommunityLifecycle(true);
    setCommunityLifecycleNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/communities/${communityLifecycle.communityId}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `community-lifecycle:${action}:${communityLifecycle.communityId}:v${communityLifecycle.version}:${Date.now().toString(36)}`,
            'If-Match': String(communityLifecycle.version),
          },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await loadIdentity();
        throw new Error(message);
      }
      const result = (await response.json()) as CommunityLifecycleCommandResponse;
      setCommunityLifecycle(result.data);
      setCommunityLifecycleReason('');
      setCommunityLifecycleNotice(result.data.state === 'PAUSED'
        ? 'Community приостановлена. Новые статусные действия недоступны; подтверждённые Session продолжаются.'
        : `Community активна. Challenge-дедлайны продлены на ${Math.round((result.data.latestPauseDurationSeconds ?? 0) / 3600)} ч; cooldown не изменён.`);
      void loadIdentity();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить состояние Community');
    } finally {
      setActingCommunityLifecycle(false);
    }
  };

  const scheduleCommunityClosurePlan = async () => {
    if (
      !communityLifecycle || actingCommunityClosure
      || (communityLifecycle.state !== 'ACTIVE' && communityLifecycle.state !== 'PAUSED')
    ) return;
    const reason = communityClosureReason.trim();
    const parsedEffectiveAt = new Date(communityClosureEffectiveAt);
    if (reason.length === 0 || Number.isNaN(parsedEffectiveAt.getTime())) {
      setCommunityClosureNotice('Укажите причину и корректные дату и время закрытия.');
      return;
    }
    if (!communityClosureArmed) {
      setCommunityClosureArmed(true);
      setCommunityClosureNotice(
        `Проверьте план: ${communityClosureCandidates.length} подтверждённых Session, `
        + `${communityClosureCandidates.filter((candidate) =>
          communityClosureDispositions[candidate.sessionId] === 'CANCEL_NO_FAULT').length} будут отменены без вины.`,
      );
      return;
    }
    setActingCommunityClosure(true);
    setCommunityClosureNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/communities/${communityLifecycle.communityId}/closure/schedule`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `community-closure:schedule:${communityLifecycle.communityId}:v${communityLifecycle.version}:${Date.now().toString(36)}`,
            'If-Match': String(communityLifecycle.version),
          },
          body: JSON.stringify({
            category: communityClosureCategory, reason,
            emergency: communityClosureEmergency,
            effectiveAt: parsedEffectiveAt.toISOString(),
            sessionDispositions: communityClosureCandidates.map((candidate) => ({
              sessionId: candidate.sessionId,
              disposition: communityClosureDispositions[candidate.sessionId]
                ?? candidate.recommendedDisposition,
            })),
          }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as CommunityClosureCommandResponse;
      setCommunityClosurePlan(result.data);
      setCommunityClosureArmed(false);
      setCommunityClosureReason('');
      setCommunityClosureNotice(
        'Closure Plan запланирован. Новые статусные действия остановлены; '
        + 'сохранённые Session могут безопасно завершиться.',
      );
      await loadIdentity();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось запланировать закрытие Community');
    } finally {
      setActingCommunityClosure(false);
    }
  };

  const finalizeCommunityClosurePlan = async () => {
    if (!communityLifecycle || !communityClosurePlan || actingCommunityClosure) return;
    const reason = communityClosureReason.trim();
    if (reason.length === 0) {
      setCommunityClosureNotice('Укажите причину завершения Closure Plan.');
      return;
    }
    setActingCommunityClosure(true);
    setCommunityClosureNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/communities/${communityLifecycle.communityId}/closure/finalize`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `community-closure:finalize:${communityLifecycle.communityId}:v${communityLifecycle.version}:${Date.now().toString(36)}`,
            'If-Match': String(communityLifecycle.version),
          },
          body: JSON.stringify({ planId: communityClosurePlan.planId, reason }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as CommunityClosureCommandResponse;
      setCommunityClosurePlan(result.data);
      setCommunityClosureReason('');
      setCommunityClosureNotice('Community закрыта без переноса статусов и без поражений участникам.');
      await loadIdentity();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось завершить Closure Plan');
    } finally {
      setActingCommunityClosure(false);
    }
  };

  const runCentralAppealAction = async (
    appeal: CentralAppeal,
    decision: NonNullable<CentralAppeal['decision']> | null,
  ) => {
    if (actingCentralAppealId !== null) return;
    const reason = centralDecisionReason.trim();
    if (decision !== null && reason.length === 0) return;
    const action = decision === null ? 'start-review' : 'decision';
    const operation = `central-appeal:${action}:${appeal.appealId}:v${appeal.version}:${decision ?? 'START'}`;
    const idempotencyKey = resultActionKeys.current.get(operation) ?? operation;
    resultActionKeys.current.set(operation, idempotencyKey);
    setActingCentralAppealId(appeal.appealId);
    setSessionNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/appeals/${appeal.appealId}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(appeal.version),
          },
          body: JSON.stringify(decision === null ? {} : { decision, reason }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const updated = (await response.json()) as AppealCommandResponse;
      resultActionKeys.current.delete(operation);
      if (decision === null) {
        setCentralAppeals((current) => current.map((item) =>
          item.appealId === updated.data.appealId ? updated.data : item));
        setCentralDecisionAppealId(updated.data.appealId);
        setSessionNotice('Appeal взят в работу. Решение и его последствие будут записаны в историю.');
      } else {
        setCentralAppeals((current) => current.filter((item) => item.appealId !== updated.data.appealId));
        setCentralDecisionAppealId(null);
        setCentralDecisionReason('');
        setSessionNotice(decision === 'UPHOLD'
          ? 'Исход подтверждён, статус разблокирован.'
          : decision === 'REVERSE'
            ? 'Победитель исправлен, спортивный статус пересчитан.'
            : decision === 'ANNUL'
              ? 'Результат аннулирован, прежний статус восстановлен.'
              : 'Назначена повторная Session; участники снова выбирают слот.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить Appeal');
    } finally {
      setActingCentralAppealId(null);
    }
  };

  const runAppealParticipantAction = async (
    appeal: AppealDetail,
    action: 'response' | 'withdraw',
  ) => {
    if (actingResultKey !== null) return;
    const statement = appealResponseStatement.trim();
    if (action === 'response' && statement.length === 0) return;
    const operation = `appeal:${action}:${appeal.appealId}:v${appeal.version}`;
    const idempotencyKey = resultActionKeys.current.get(operation) ?? operation;
    resultActionKeys.current.set(operation, idempotencyKey);
    setActingResultKey(operation);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/appeals/${appeal.appealId}/${action === 'response' ? 'responses' : 'withdraw'}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(appeal.version),
          },
          body: JSON.stringify(action === 'response' ? { statement } : {}),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await loadIdentity();
        throw new Error(await apiErrorMessage(response));
      }
      const updated = (await response.json()) as AppealCommandResponse;
      resultActionKeys.current.delete(operation);
      setAppealsByResultId((current) => ({ ...current, [updated.data.resultId]: updated.data }));
      setAppealResponseStatement('');
      setPendingAppealWithdrawalId(null);
      setSessionNotice(action === 'response'
        ? 'Ответ добавлен к Appeal. Central продолжает рассмотрение без ожидания остальных сторон.'
        : 'Appeal отозван. Повторно подать его по этому результату нельзя.');
      if (action === 'withdraw') await loadIdentity();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить Appeal');
    } finally {
      setActingResultKey(null);
    }
  };

  const extendCentralAppealSla = async (appeal: CentralAppeal, durationHours: 24 | 48) => {
    const reason = centralDecisionReason.trim();
    if (actingCentralAppealId !== null || reason.length === 0) return;
    const operation = `central-appeal:extend:${appeal.appealId}:v${appeal.version}:${durationHours}`;
    const idempotencyKey = resultActionKeys.current.get(operation) ?? operation;
    resultActionKeys.current.set(operation, idempotencyKey);
    setActingCentralAppealId(appeal.appealId);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/central/appeals/${appeal.appealId}/extend-sla`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': String(appeal.version),
        },
        body: JSON.stringify({ durationHours, reason }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const updated = (await response.json()) as AppealCommandResponse;
      resultActionKeys.current.delete(operation);
      setCentralAppeals((current) => current.map((item) =>
        item.appealId === updated.data.appealId ? updated.data : item));
      setCentralDecisionReason('');
      setSessionNotice(`SLA Appeal продлён на ${durationHours} ч. Причина видна всем сторонам.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось продлить SLA Appeal');
    } finally {
      setActingCentralAppealId(null);
    }
  };

  const startVerification = async () => {
    if (!identity || identity.accountVerificationState !== 'NOT_STARTED') return;
    setStartingVerification(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/me/verification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Idempotency-Key': `identity:${identity.userId}:verification:first`,
        },
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as IdentityCommandResponse;
      setIdentity(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось начать верификацию');
    } finally {
      setStartingVerification(false);
    }
  };

  const acceptCoachRole = async (invite: CoachInvite) => {
    setAcceptingCoachGrant(invite.grantId);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/me/coach-invites/${invite.grantId}/accept`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Idempotency-Key': `role:${invite.grantId}:accept:v${invite.version}`,
            'If-Match': String(invite.version),
          },
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await loadIdentity();
        throw new Error(message);
      }
      const result = (await response.json()) as RoleGrantCommandResponse;
      setCoachInvites((current) =>
        current.filter((item) => item.grantId !== result.data.grantId),
      );
      await loadIdentity();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось принять роль Coach');
    } finally {
      setAcceptingCoachGrant(null);
    }
  };

  const actOnDiscovery = async (
    candidate: DiscoveryCard,
    action: DiscoveryAction,
  ) => {
    if (actingCandidateId !== null) return;
    const operation = `${action}:${candidate.candidateUserId}`;
    const existingKey = discoveryActionKeys.current.get(operation);
    const idempotencyKey =
      existingKey ??
      `discovery:${identity?.userId ?? 'unknown'}:${operation}:${Date.now().toString(36)}`;
    discoveryActionKeys.current.set(operation, idempotencyKey);
    setActingCandidateId(candidate.candidateUserId);
    setActingDiscoveryAction(action);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/discovery/${candidate.candidateUserId}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Idempotency-Key': idempotencyKey,
            'If-Match': '0',
          },
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await loadIdentity();
        throw new Error(message);
      }
      const result = (await response.json()) as DiscoveryActionResponse;
      discoveryActionKeys.current.delete(operation);
      setDiscoveryCards((current) =>
        current.filter((item) => item.candidateUserId !== candidate.candidateUserId),
      );
      const createdMatch = result.data.match;
      if (result.data.action === 'MATCHED' && createdMatch) {
        setMatches((current) => [
          createdMatch,
          ...current.filter((item) => item.matchId !== createdMatch.matchId),
        ]);
        setDiscoveryNotice(
          `У вас Match с ${candidate.displayName}. Теперь можно выбрать тренировку вместе.`,
        );
      } else if (result.data.action === 'LIKED') {
        setDiscoveryNotice(
          `${candidate.displayName} увидит ваш интерес в своей ленте.`,
        );
      } else {
        setDiscoveryNotice('Анкета скрыта на 15 дней.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выполнить действие');
    } finally {
      setActingCandidateId(null);
      setActingDiscoveryAction(null);
    }
  };

  const endMatch = async (match: Match, action: 'unmatch' | 'block') => {
    if (actingRelationshipId !== null) return;
    const operation = `${action}:${match.matchId}:v${match.version}`;
    const existingKey = relationshipActionKeys.current.get(operation);
    const idempotencyKey =
      existingKey ??
      `social:${identity?.userId ?? 'unknown'}:${operation}:${Date.now().toString(36)}`;
    relationshipActionKeys.current.set(operation, idempotencyKey);
    setActingRelationshipId(match.matchId);
    setError(null);
    try {
      const response = await fetch(
        action === 'unmatch'
          ? `${apiUrl}/api/v1/matches/${match.matchId}`
          : `${apiUrl}/api/v1/users/${match.counterpartUserId}/block`,
        {
          method: action === 'unmatch' ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Idempotency-Key': idempotencyKey,
            'If-Match': action === 'unmatch' ? String(match.version) : '0',
          },
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await loadIdentity();
        throw new Error(message);
      }
      const result = (await response.json()) as SocialRelationshipCommandResponse;
      relationshipActionKeys.current.delete(operation);
      setMatches((current) => current.filter((item) => item.matchId !== match.matchId));
      if (result.data.action === 'BLOCKED') {
        const createdBlock = result.data.block;
        setBlockedUsers((current) => [
          createdBlock,
          ...current.filter((item) => item.blockId !== createdBlock.blockId),
        ]);
        setDiscoveryNotice(
          'Пользователь заблокирован. Личный контакт закрыт, спортивные обязательства сохранены.',
        );
      } else {
        setDiscoveryNotice(
          'Match завершён, чат закрыт. Вы не будете видеть друг друга в Discovery 15 дней.',
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить Match');
    } finally {
      setActingRelationshipId(null);
    }
  };

  const unblock = async (blocked: BlockedUser) => {
    if (actingRelationshipId !== null) return;
    const operation = `unblock:${blocked.blockId}:v${blocked.version}`;
    const existingKey = relationshipActionKeys.current.get(operation);
    const idempotencyKey =
      existingKey ??
      `social:${identity?.userId ?? 'unknown'}:${operation}:${Date.now().toString(36)}`;
    relationshipActionKeys.current.set(operation, idempotencyKey);
    setActingRelationshipId(blocked.blockId);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/users/${blocked.blockedUserId}/block`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Idempotency-Key': idempotencyKey,
          'If-Match': String(blocked.version),
        },
      });
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await loadIdentity();
        throw new Error(message);
      }
      const result = (await response.json()) as SocialRelationshipCommandResponse;
      relationshipActionKeys.current.delete(operation);
      if (result.data.action === 'UNBLOCKED') {
        const revokedBlockId = result.data.block.blockId;
        setBlockedUsers((current) =>
          current.filter((item) => item.blockId !== revokedBlockId),
        );
        setDiscoveryNotice(
          'Блокировка снята. Старый Match не восстановлен — новый контакт начинается только через Discovery.',
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось снять блокировку');
    } finally {
      setActingRelationshipId(null);
    }
  };

  const refreshCompetitionStatus = async (): Promise<void> => {
    const response = await fetch(`${apiUrl}/api/v1/me/competition`, {
      headers: { Authorization: `Bearer ${localToken}` },
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const result = (await response.json()) as CompetitionStatusResponse;
    setCompetitionStatus(result.data);
  };

  const joinStatusQueue = async () => {
    if (!competitionStatus || actingStatusQueue) return;
    const operation = `join:${competitionStatus.competitionId}`;
    const idempotencyKey = statusQueueActionKeys.current.get(operation)
      ?? `status-queue:${operation}:${Date.now().toString(36)}`;
    statusQueueActionKeys.current.set(operation, idempotencyKey);
    setActingStatusQueue(true);
    setStatusQueueNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/competitions/${competitionStatus.competitionId}/queue-entries`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Idempotency-Key': idempotencyKey,
            'If-Match': '0',
          },
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await refreshCompetitionStatus();
        throw new Error(message);
      }
      await response.json() as StatusQueueEntryCommandResponse;
      statusQueueActionKeys.current.delete(operation);
      await refreshCompetitionStatus();
      setStatusQueueNotice('Заявка добавлена. Ваше место определяется только прозрачным FIFO.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось вступить в очередь');
    } finally {
      setActingStatusQueue(false);
    }
  };

  const withdrawStatusQueue = async (entry: CompetitionStatus['queue'][number]) => {
    if (actingStatusQueue) return;
    const operation = `withdraw:${entry.queueEntryId}:v${entry.version}`;
    const idempotencyKey = statusQueueActionKeys.current.get(operation)
      ?? `status-queue:${operation}`;
    statusQueueActionKeys.current.set(operation, idempotencyKey);
    setActingStatusQueue(true);
    setStatusQueueNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/queue-entries/${entry.queueEntryId}/withdraw`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(entry.version),
          },
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await refreshCompetitionStatus();
        throw new Error(message);
      }
      await response.json() as StatusQueueEntryCommandResponse;
      statusQueueActionKeys.current.delete(operation);
      await refreshCompetitionStatus();
      setStatusQueueNotice('Заявка отозвана без поражения. При новом входе будет создано новое место.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось покинуть очередь');
    } finally {
      setActingStatusQueue(false);
    }
  };

  const reconfirmStatusQueue = async (entry: CompetitionStatus['queue'][number]) => {
    if (actingStatusQueue) return;
    const operation = `reconfirm:${entry.queueEntryId}:v${entry.version}`;
    const idempotencyKey = statusQueueActionKeys.current.get(operation)
      ?? `status-queue:${operation}`;
    statusQueueActionKeys.current.set(operation, idempotencyKey);
    setActingStatusQueue(true);
    setStatusQueueNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/queue-entries/${entry.queueEntryId}/reconfirm`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(entry.version),
          },
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await refreshCompetitionStatus();
        throw new Error(message);
      }
      await response.json() as StatusQueueEntryCommandResponse;
      statusQueueActionKeys.current.delete(operation);
      await refreshCompetitionStatus();
      setStatusQueueNotice('Готовность подтверждена. Исходное FIFO-место сохранено.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подтвердить готовность');
    } finally {
      setActingStatusQueue(false);
    }
  };

  const respondToGenesis = async (decision: 'ACCEPT' | 'DECLINE') => {
    const genesis = competitionStatus?.viewerGenesisAction;
    if (!genesis || actingStatusQueue) return;
    const action = decision === 'ACCEPT' ? 'accept' : 'decline';
    const operation = `genesis:${action}:${genesis.challengeId}:v${genesis.version}`;
    const idempotencyKey = statusQueueActionKeys.current.get(operation)
      ?? `status-queue:${operation}`;
    statusQueueActionKeys.current.set(operation, idempotencyKey);
    setActingStatusQueue(true);
    setStatusQueueNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/genesis-challenges/${genesis.challengeId}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(genesis.version),
          },
          body: JSON.stringify({ explicitRulesetAcknowledged: true }),
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await refreshCompetitionStatus();
        throw new Error(message);
      }
      const result = (await response.json()) as GenesisResponseCommandResponse;
      statusQueueActionKeys.current.delete(operation);
      await refreshCompetitionStatus();
      setStatusQueueNotice(
        decision === 'DECLINE'
          ? 'Вы вышли из этой GENESIS-пары без поражения. Соперник сохранил исходное FIFO-место.'
          : result.data.state === 'ACCEPTED_UNSCHEDULED'
            ? 'Взаимное подтверждение получено. Откройте чат и выберите слот.'
            : 'Готовность сохранена. Ждём ответ второго участника.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить ответ GENESIS');
    } finally {
      setActingStatusQueue(false);
    }
  };

  const previewStatusRelease = async () => {
    if (!competitionStatus || actingStatusQueue) return;
    const operation = `release-preview:${competitionStatus.competitionId}:v${competitionStatus.statusVersion}`;
    const idempotencyKey = statusQueueActionKeys.current.get(operation)
      ?? `status-release:${operation}:${Date.now().toString(36)}`;
    statusQueueActionKeys.current.set(operation, idempotencyKey);
    setActingStatusQueue(true);
    setStatusQueueNotice(null);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/status-releases/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': '0',
        },
        body: JSON.stringify({ competitionId: competitionStatus.competitionId }),
      });
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await refreshCompetitionStatus();
        throw new Error(message);
      }
      const result = (await response.json()) as StatusReleaseCommandResponse;
      statusQueueActionKeys.current.delete(operation);
      setStatusReleasePreview(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подготовить освобождение статуса');
    } finally {
      setActingStatusQueue(false);
    }
  };

  const confirmStatusRelease = async () => {
    if (!statusReleasePreview?.confirmationToken || actingStatusQueue) return;
    const operation = `release-confirm:${statusReleasePreview.releaseId}:v${statusReleasePreview.version}`;
    const idempotencyKey = statusQueueActionKeys.current.get(operation)
      ?? `status-release:${operation}`;
    statusQueueActionKeys.current.set(operation, idempotencyKey);
    setActingStatusQueue(true);
    setStatusQueueNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/status-releases/${statusReleasePreview.releaseId}/confirm`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(statusReleasePreview.version),
          },
          body: JSON.stringify({ confirmationToken: statusReleasePreview.confirmationToken }),
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) {
          setStatusReleasePreview(null);
          await refreshCompetitionStatus();
        }
        throw new Error(message);
      }
      const result = (await response.json()) as StatusReleaseCommandResponse;
      statusQueueActionKeys.current.delete(operation);
      setStatusReleasePreview(null);
      await refreshCompetitionStatus();
      setStatusQueueNotice(
        result.data.consequence === 'CHAMPION_SUCCESSION'
          ? 'Статус №1 передан Претенденту. Membership сохранён.'
          : 'Спортивный статус освобождён. Membership сохранён, поражение не создано.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось освободить статус');
    } finally {
      setActingStatusQueue(false);
    }
  };

  const previewMembershipExit = async () => {
    const membership = communityContext?.membership;
    if (!membership || membership.state !== 'ACTIVE' || actingMembershipExit) return;
    const operation = `membership-exit-preview:${membership.membershipId}:v${communityContext.community.version}`;
    const idempotencyKey = statusQueueActionKeys.current.get(operation)
      ?? `membership-exit:${operation}:${Date.now().toString(36)}`;
    statusQueueActionKeys.current.set(operation, idempotencyKey);
    setActingMembershipExit(true);
    setMembershipExitNotice(null);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/membership-exits/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': '0',
        },
        body: JSON.stringify({ membershipId: membership.membershipId }),
      });
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) await loadIdentity();
        throw new Error(message);
      }
      const result = (await response.json()) as MembershipExitCommandResponse;
      statusQueueActionKeys.current.delete(operation);
      setMembershipExitPreview(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подготовить выход из Community');
    } finally {
      setActingMembershipExit(false);
    }
  };

  const confirmMembershipExit = async () => {
    if (!membershipExitPreview?.confirmationToken || actingMembershipExit) return;
    const operation = `membership-exit-confirm:${membershipExitPreview.exitId}:v${membershipExitPreview.version}`;
    const idempotencyKey = statusQueueActionKeys.current.get(operation)
      ?? `membership-exit:${operation}`;
    statusQueueActionKeys.current.set(operation, idempotencyKey);
    setActingMembershipExit(true);
    setMembershipExitNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/membership-exits/${membershipExitPreview.exitId}/confirm`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(membershipExitPreview.version),
          },
          body: JSON.stringify({ confirmationToken: membershipExitPreview.confirmationToken }),
        },
      );
      if (!response.ok) {
        const message = await apiErrorMessage(response);
        if (response.status === 409) {
          setMembershipExitPreview(null);
          await loadIdentity();
        }
        throw new Error(message);
      }
      const result = (await response.json()) as MembershipExitCommandResponse;
      statusQueueActionKeys.current.delete(operation);
      setMembershipExitPreview(null);
      await loadIdentity();
      setMembershipExitNotice(
        result.data.createsForfeit
          ? 'Вы вышли из Community. Поражение по Forfeit подтверждено, право на Appeal закрыто.'
          : result.data.consequence === 'CHAMPION_SUCCESSION'
          ? 'Вы вышли из Community. Статус №1 прозрачно передан Претенденту.'
          : 'Вы вышли из Community без поражения. История сохранена.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выйти из Community');
    } finally {
      setActingMembershipExit(false);
    }
  };

  const requestMembershipRemoval = async (member: VenueMember) => {
    if (actingMembershipRemoval || removalReason.trim().length < 10) return;
    const operation = `membership-removal-request:${member.membershipId}`;
    const idempotencyKey = membershipRemovalActionKeys.current.get(operation)
      ?? `${operation}:${Date.now().toString(36)}`;
    membershipRemovalActionKeys.current.set(operation, idempotencyKey);
    setActingMembershipRemoval(true);
    setMembershipRemovalNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/memberships/${member.membershipId}/removal`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': '0',
          },
          body: JSON.stringify({ reason: removalReason.trim() }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as MembershipRemovalCommandResponse;
      membershipRemovalActionKeys.current.delete(operation);
      setRemovalTargetId(null);
      setRemovalReason('');
      await loadIdentity();
      setMembershipRemovalNotice(
        result.data.subjectStatus === 'ORDINARY'
          ? 'Ordinary удалён без поражения. Appeal доступен спортсмену 48 часов.'
          : 'Запрос передан Central. Статус сохранён, новые статусные действия остановлены.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось оформить удаление');
    } finally {
      setActingMembershipRemoval(false);
    }
  };

  const appealMembershipRemoval = async (removal: MembershipRemoval) => {
    if (actingMembershipRemoval || removalAppealReason.trim().length < 10) return;
    const operation = `membership-removal-appeal:${removal.caseId}:v${removal.version}`;
    const idempotencyKey = membershipRemovalActionKeys.current.get(operation)
      ?? operation;
    membershipRemovalActionKeys.current.set(operation, idempotencyKey);
    setActingMembershipRemoval(true);
    setMembershipRemovalNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/membership-removals/${removal.caseId}/appeal`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(removal.version),
          },
          body: JSON.stringify({ reason: removalAppealReason.trim() }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      membershipRemovalActionKeys.current.delete(operation);
      setRemovalAppealCaseId(null);
      setRemovalAppealReason('');
      await loadIdentity();
      setMembershipRemovalNotice('Appeal отправлен Central. Отменённые процессы не возобновляются автоматически.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить Appeal');
    } finally {
      setActingMembershipRemoval(false);
    }
  };

  const decideMembershipRemoval = async (
    removal: MembershipRemoval,
    decision: 'CONFIRM_REMOVAL' | 'REJECT_REMOVAL',
  ) => {
    if (actingMembershipRemoval || removalDecisionReason.trim().length < 10) return;
    const operation = `membership-removal-decision:${removal.caseId}:${decision}:v${removal.version}`;
    const idempotencyKey = membershipRemovalActionKeys.current.get(operation)
      ?? operation;
    membershipRemovalActionKeys.current.set(operation, idempotencyKey);
    setActingMembershipRemoval(true);
    setMembershipRemovalNotice(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/central/membership-removals/${removal.caseId}/decision`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'If-Match': String(removal.version),
          },
          body: JSON.stringify({
            decision,
            reason: removalDecisionReason.trim(),
            cancelConfirmedSessions: true,
          }),
        },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const result = (await response.json()) as MembershipRemovalCommandResponse;
      membershipRemovalActionKeys.current.delete(operation);
      setRemovalDecisionCaseId(null);
      setRemovalDecisionReason('');
      await loadIdentity();
      setMembershipRemovalNotice(
        result.data.state === 'OVERTURNED' || result.data.state === 'REJECTED'
          ? 'Удаление отклонено. Membership восстановлена или снова активна.'
          : 'Удаление подтверждено Central. Спортивного поражения не создано.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить решение Central');
    } finally {
      setActingMembershipRemoval(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>MOLOKH</Text>
        {__DEV__ ? (
          <View style={styles.testAccountPanel}>
            <View style={styles.testAccountHeader}>
              <View style={styles.testAccountIdentity}>
                <Text style={styles.testAccountLabel}>Тестовый аккаунт</Text>
                <Text style={styles.testAccountName}>
                  {identity?.displayName ?? activeTestAccount.label} · {activeTestAccount.role}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: accountMenuOpen }}
                onPress={() => setAccountMenuOpen((current) => !current)}
                style={({ pressed }) => [styles.testAccountButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.testAccountButtonText}>
                  {accountMenuOpen ? 'Закрыть' : 'Сменить'}
                </Text>
              </Pressable>
            </View>
            {accountMenuOpen ? (
              <>
                <Text style={styles.hint}>
                  Для проверки Match поставьте Like от одного Athlete, переключитесь на второго и ответьте взаимным Like.
                </Text>
                <View style={styles.testAccountList}>
                  {localTestAccounts.map((account) => {
                    const selected = account.token === activeTestToken;
                    return (
                      <Pressable
                        key={account.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => switchLocalAccount(account)}
                        style={({ pressed }) => [
                          styles.testAccountOption,
                          selected && styles.testAccountOptionSelected,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.testAccountOptionName}>{account.label}</Text>
                        <Text style={styles.testAccountOptionRole}>{account.role}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
        {visibleSections.length > 1 ? (
          <View accessibilityRole="tablist" style={styles.mainNavigation}>
            {visibleSections.map((section) => {
              const selected = section.id === activeSection;
              return (
                <Pressable
                  key={section.id}
                  aria-selected={selected}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => openSection(section.id)}
                  style={({ pressed }) => [
                    styles.mainNavigationItem,
                    selected && styles.mainNavigationItemSelected,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.mainNavigationText,
                      selected && styles.mainNavigationTextSelected,
                    ]}
                  >
                    {section.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <Text accessibilityRole="header" style={styles.title}>{activeSectionCopy.title}</Text>
        <Text style={styles.lead}>{activeSectionCopy.lead}</Text>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#8b2f22" />
            <Text style={styles.muted}>Подключаемся к Molokh API…</Text>
          </View>
        ) : identity ? (
          <>
            {activeSection === 'DISCOVERY' ? (
              <DiscoverySection
                actingAction={actingDiscoveryAction}
                actingCandidateId={actingCandidateId}
                actingRelationshipId={actingRelationshipId}
                blockedUsers={blockedUsers}
                cards={discoveryCards}
                matches={matches}
                notice={discoveryNotice}
                onAction={(candidate, action) => void actOnDiscovery(candidate, action)}
                onBlock={(match) => void endMatch(match, 'block')}
                onOpenChat={(match) =>
                  router.push(({
                    pathname: '/chat',
                    params: {
                      chatId: match.chatId,
                      counterpart: match.counterpartDisplayName,
                    },
                  } as unknown) as Href)
                }
                onRefresh={() => void loadIdentity()}
                onUnblock={(blocked) => void unblock(blocked)}
                onUnmatch={(match) => void endMatch(match, 'unmatch')}
              />
            ) : null}

            {activeSection === 'PROFILE' ? (
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
                    accessibilityState={{ disabled: !canSave }}
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
                  <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>Виды спорта</Text>
                  <Text style={styles.hint}>
                    Основной спорт влияет на приоритет анкет в Discovery. Дополнительный помогает находить больше пересечений.
                  </Text>
                  <Text style={styles.label}>Основной спорт</Text>
                  <View accessibilityRole="radiogroup" style={styles.sportOptions}>
                    {sportOptions.map((option) => {
                      const checked = primarySport === option.code;
                      return (
                        <Pressable
                          key={`primary-${option.code}`}
                          aria-checked={checked}
                          accessibilityRole="radio"
                          accessibilityState={{ checked }}
                          onPress={() => {
                            setPrimarySport(option.code);
                            if (secondarySport === option.code) setSecondarySport(null);
                          }}
                          style={({ pressed }) => [
                            styles.sportOption,
                            checked && styles.sportOptionSelected,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={[styles.sportOptionText, checked && styles.sportOptionTextSelected]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.label}>Дополнительный спорт</Text>
                  <View accessibilityRole="radiogroup" style={styles.sportOptions}>
                    <Pressable
                      aria-checked={secondarySport === null}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: secondarySport === null }}
                      onPress={() => setSecondarySport(null)}
                      style={({ pressed }) => [
                        styles.sportOption,
                        secondarySport === null && styles.sportOptionSelected,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sportOptionText,
                          secondarySport === null && styles.sportOptionTextSelected,
                        ]}
                      >
                        Не выбран
                      </Text>
                    </Pressable>
                    {sportOptions
                      .filter((option) => option.code !== primarySport)
                      .map((option) => {
                        const checked = secondarySport === option.code;
                        return (
                          <Pressable
                            key={`secondary-${option.code}`}
                            aria-checked={checked}
                            accessibilityRole="radio"
                            accessibilityState={{ checked }}
                            onPress={() => setSecondarySport(option.code)}
                            style={({ pressed }) => [
                              styles.sportOption,
                              checked && styles.sportOptionSelected,
                              pressed && styles.buttonPressed,
                            ]}
                          >
                            <Text style={[styles.sportOptionText, checked && styles.sportOptionTextSelected]}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSaveSports }}
                    disabled={!canSaveSports}
                    onPress={() => void saveSports()}
                    style={({ pressed }) => [
                      styles.button,
                      !canSaveSports && styles.buttonDisabled,
                      pressed && canSaveSports && styles.buttonPressed,
                    ]}
                  >
                    {savingSports ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>Сохранить виды спорта</Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.card}>
                  <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>Статус аккаунта</Text>
                  <Text style={styles.hint}>
                    Статус аккаунта меняется системой и Central. Спортивные статусы меняются только через подтверждённые результаты в Community.
                  </Text>
                  <View style={styles.row}>
                    <Text style={styles.muted}>Аккаунт</Text>
                    <Text style={styles.value}>{accountStateLabels[identity.accountState]}</Text>
                  </View>
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
                    <Text style={styles.muted}>Завершённые тренировки</Text>
                    <Text style={styles.value}>{completedTrainingCount}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.muted}>Основной спорт</Text>
                    <Text style={styles.value}>{sportLabel(identity.primarySport)}</Text>
                  </View>
                  {identity.secondarySport ? (
                    <View style={styles.row}>
                      <Text style={styles.muted}>Дополнительный спорт</Text>
                      <Text style={styles.value}>{sportLabel(identity.secondarySport)}</Text>
                    </View>
                  ) : null}
                  {identity.accountVerificationState === 'NOT_STARTED' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: startingVerification }}
                      disabled={startingVerification}
                      onPress={() => void startVerification()}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                    >
                      {startingVerification ? (
                        <ActivityIndicator color="#8b2f22" />
                      ) : (
                        <Text style={styles.secondaryButtonText}>Отправить на верификацию</Text>
                      )}
                    </Pressable>
                  ) : identity.accountVerificationState === 'PENDING' ? (
                    <Text style={styles.hint}>
                      Заявка в очереди Central. Документы загружать не требуется.
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void loadIdentity()}
                    style={styles.refreshButton}
                  >
                    <Text style={styles.refreshText}>Проверить обновления</Text>
                  </Pressable>
                </View>

                <View style={styles.card}>
                  <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>Возможности аккаунта</Text>
                  <Text style={styles.hint}>
                    Это информация о доступе, а не кнопки. Возможности обновляются автоматически при изменении состояния аккаунта.
                  </Text>
                  <View style={styles.capabilityList}>
                    {identity.capabilities.map((capability) => (
                      <View key={capability} style={styles.capabilityRow}>
                        <Text style={styles.capabilityText}>{capabilityLabels[capability]}</Text>
                        <Text style={styles.capabilityState}>Доступно</Text>
                      </View>
                    ))}
                  </View>
                  {identity.capabilityDenials.map((denial) => (
                    <Text key={denial.capability} style={styles.denial}>
                      {denial.capability === 'ACCOUNT_VERIFIED'
                        ? 'Для официального Challenge потребуется верификация Central.'
                        : capabilityLabels[denial.capability]}
                    </Text>
                  ))}
                </View>
              </>
            ) : null}

            {activeSection === 'COMMUNITY' ? (
              <>
                {activeTestAccount.role === 'Athlete' && competitionStatus ? (
                  <StatusQueueSection
                    competition={competitionStatus}
                    acting={actingStatusQueue}
                    notice={statusQueueNotice}
                    releasePreview={statusReleasePreview}
                    onJoin={() => void joinStatusQueue()}
                    onReconfirm={(entry) => void reconfirmStatusQueue(entry)}
                    onWithdraw={(entry) => void withdrawStatusQueue(entry)}
                    onGenesisResponse={(decision) => void respondToGenesis(decision)}
                    onPreviewRelease={() => void previewStatusRelease()}
                    onConfirmRelease={() => void confirmStatusRelease()}
                    onCancelRelease={() => setStatusReleasePreview(null)}
                    onOpenActiveChallenge={() => {
                      const active = competitionStatus.activeChallenge;
                      if (!active?.viewerIsParticipant) return;
                      const counterpart = competitionStatus.viewerStatus === 'CONTENDER'
                        ? active.initiatorDisplayName
                        : active.recipientDisplayName;
                      router.push(({
                        pathname: '/chat',
                        params: { chatId: active.serviceChatId, counterpart },
                      } as unknown) as Href);
                    }}
                    onOpenGenesisChat={() => {
                      const genesis = competitionStatus.viewerGenesisAction;
                      if (!genesis) return;
                      router.push(({
                        pathname: '/chat',
                        params: {
                          chatId: genesis.serviceChatId,
                          counterpart: genesis.opponentDisplayName,
                        },
                      } as unknown) as Href);
                    }}
                  />
                ) : null}
                {activeTestAccount.role === 'Athlete'
                  && communityContext?.membership?.state === 'ACTIVE' ? (
                  <MembershipExitSection
                    acting={actingMembershipExit}
                    notice={membershipExitNotice}
                    preview={membershipExitPreview}
                    onPreview={() => void previewMembershipExit()}
                    onConfirm={() => void confirmMembershipExit()}
                    onCancel={() => setMembershipExitPreview(null)}
                  />
                ) : membershipExitNotice ? (
                  <View style={styles.stateCard}>
                    <Text accessibilityLiveRegion="polite" style={styles.successText}>
                      {membershipExitNotice}
                    </Text>
                  </View>
                ) : null}
                {activeTestAccount.role !== 'Gym Admin' && membershipRemovalNotice ? (
                  <View accessibilityLiveRegion="polite" style={styles.successCard}>
                    <Text style={styles.successText}>{membershipRemovalNotice}</Text>
                  </View>
                ) : null}
                {activeTestAccount.role === 'Athlete'
                  && membershipRemovals.some((item) =>
                    item.state === 'REMOVED_APPEALABLE' || item.state === 'APPEALED') ? (
                  <View style={styles.card}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                      Решение по Membership
                    </Text>
                    {membershipRemovals.filter((item) =>
                      item.state === 'REMOVED_APPEALABLE' || item.state === 'APPEALED')
                      .slice(0, 1).map((removal) => (
                        <View key={removal.caseId} style={styles.hostConfirmationCard}>
                          <Text style={styles.sessionState}>
                            {removal.state === 'APPEALED' ? 'Appeal рассматривается' : 'Membership удалена'}
                          </Text>
                          <Text style={styles.hint}>{removal.requestReason}</Text>
                          {removal.appealDeadlineAt ? (
                            <Text style={styles.muted}>
                              Appeal до {formatDateTime(removal.appealDeadlineAt)}
                            </Text>
                          ) : null}
                          {removal.state === 'REMOVED_APPEALABLE' ? (
                            removalAppealCaseId === removal.caseId ? (
                              <>
                                <TextInput
                                  accessibilityLabel="Причина Appeal удаления Membership"
                                  maxLength={1000}
                                  multiline
                                  onChangeText={setRemovalAppealReason}
                                  placeholder="Опишите, почему решение нужно пересмотреть"
                                  style={[styles.input, styles.appealInput]}
                                  value={removalAppealReason}
                                />
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={actingMembershipRemoval || removalAppealReason.trim().length < 10}
                                  onPress={() => void appealMembershipRemoval(removal)}
                                  style={({ pressed }) => [
                                    styles.button,
                                    (actingMembershipRemoval || removalAppealReason.trim().length < 10)
                                      && styles.buttonDisabled,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={styles.buttonText}>Отправить Appeal</Text>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={actingMembershipRemoval}
                                  onPress={() => {
                                    setRemovalAppealCaseId(null);
                                    setRemovalAppealReason('');
                                  }}
                                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                                >
                                  <Text style={styles.secondaryButtonText}>Отмена</Text>
                                </Pressable>
                              </>
                            ) : (
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => setRemovalAppealCaseId(removal.caseId)}
                                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                              >
                                <Text style={styles.secondaryButtonText}>Подать Appeal</Text>
                              </Pressable>
                            )
                          ) : null}
                        </View>
                      ))}
                  </View>
                ) : null}

                {activeTestAccount.role === 'Central' && membershipRemovals.length > 0 ? (
                  <View style={styles.card}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                      Удаление участников · Central
                    </Text>
                    <Text style={styles.hint}>
                      FIFO-очередь: статусные участники и Appeal Ordinary. Решение не создаёт спортивного поражения.
                    </Text>
                    <Text style={styles.hint}>
                      Подтверждение отменит не начатые Official Booking и Session без вины участников. Начатую Session сначала завершает Coach.
                    </Text>
                    {membershipRemovals.map((removal) => (
                      <View key={removal.caseId} style={styles.hostConfirmationCard}>
                        <View style={styles.row}>
                          <Text style={styles.venueName}>{removal.subjectDisplayName}</Text>
                          <Text style={styles.sessionState}>
                            {removal.subjectStatus === 'CHAMPION' ? '№1'
                              : removal.subjectStatus === 'CONTENDER' ? 'Претендент' : 'Ordinary'}
                          </Text>
                        </View>
                        <Text style={styles.hint}>Запрос: {removal.requestReason}</Text>
                        {removal.appealReason ? (
                          <Text style={styles.hint}>Appeal: {removal.appealReason}</Text>
                        ) : null}
                        {removalDecisionCaseId === removal.caseId ? (
                          <>
                            <TextInput
                              accessibilityLabel="Обоснование решения Central"
                              maxLength={1000}
                              multiline
                              onChangeText={setRemovalDecisionReason}
                              placeholder="Зафиксируйте независимое обоснование"
                              style={[styles.input, styles.appealInput]}
                              value={removalDecisionReason}
                            />
                            <Pressable
                              accessibilityRole="button"
                              disabled={actingMembershipRemoval || removalDecisionReason.trim().length < 10}
                              onPress={() => void decideMembershipRemoval(removal, 'CONFIRM_REMOVAL')}
                              style={({ pressed }) => [
                                styles.dangerButton,
                                (actingMembershipRemoval || removalDecisionReason.trim().length < 10)
                                  && styles.buttonDisabled,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.dangerButtonText}>Подтвердить удаление</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={actingMembershipRemoval || removalDecisionReason.trim().length < 10}
                              onPress={() => void decideMembershipRemoval(removal, 'REJECT_REMOVAL')}
                              style={({ pressed }) => [
                                styles.secondaryButton,
                                (actingMembershipRemoval || removalDecisionReason.trim().length < 10)
                                  && styles.buttonDisabled,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.secondaryButtonText}>
                                {removal.subjectStatus === 'ORDINARY'
                                  ? 'Отменить удаление' : 'Отклонить запрос'}
                              </Text>
                            </Pressable>
                          </>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setRemovalDecisionCaseId(removal.caseId);
                              setRemovalDecisionReason('');
                            }}
                            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                          >
                            <Text style={styles.secondaryButtonText}>Рассмотреть</Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </View>
                ) : null}
                {activeTestAccount.role === 'Central' && communityLifecycle ? (
                  <View style={styles.card}>
                    <View style={styles.row}>
                      <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                        Состояние Community
                      </Text>
                      <Text style={styles.sessionState}>
                        {communityLifecycle.state === 'ACTIVE' ? 'Активна'
                          : communityLifecycle.state === 'PAUSED' ? 'Приостановлена'
                            : communityLifecycle.state === 'CLOSING' ? 'Закрывается' : 'Закрыта'}
                      </Text>
                    </View>
                    <Text style={styles.hint}>
                      {communityLifecycle.state === 'ACTIVE'
                        ? 'Пауза временно остановит новые статусные действия и Challenge-дедлайны. Уже подтверждённые Session продолжатся, cooldown не изменится.'
                        : communityLifecycle.state === 'PAUSED'
                          ? `Пауза действует с ${communityLifecycle.pauseStartedAt ? formatDateTime(communityLifecycle.pauseStartedAt) : 'зафиксированного времени'}. После возобновления Challenge получат точное продление на длительность паузы.`
                          : communityLifecycle.state === 'CLOSING'
                            ? 'Новые статусные действия остановлены. Разрешённые Closure Plan Session могут завершиться.'
                            : 'Community окончательно закрыта; Membership архивированы, статусы завершены без поражений и переноса.'}
                    </Text>
                    <Text style={styles.muted}>
                      Контуры: {communityLifecycle.competitions.length} · версия {communityLifecycle.version}
                    </Text>
                    {communityLifecycle.state === 'ACTIVE' || communityLifecycle.state === 'PAUSED' ? (
                      <>
                        <TextInput
                          accessibilityLabel={communityLifecycle.state === 'ACTIVE'
                            ? 'Причина приостановки Community'
                            : 'Причина возобновления Community'}
                          maxLength={500}
                          multiline
                          onChangeText={setCommunityLifecycleReason}
                          placeholder={communityLifecycle.state === 'ACTIVE'
                            ? 'Укажите операционную причину или причину, связанную с безопасностью'
                            : 'Кратко укажите, что причина паузы устранена'}
                          style={[styles.input, styles.appealInput]}
                          value={communityLifecycleReason}
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled: actingCommunityLifecycle || communityLifecycleReason.trim().length === 0,
                          }}
                          disabled={actingCommunityLifecycle || communityLifecycleReason.trim().length === 0}
                          onPress={() => void runCommunityLifecycleAction()}
                          style={({ pressed }) => [
                            communityLifecycle.state === 'ACTIVE' ? styles.dangerButton : styles.button,
                            (actingCommunityLifecycle || communityLifecycleReason.trim().length === 0)
                              && styles.buttonDisabled,
                            pressed && !actingCommunityLifecycle && styles.buttonPressed,
                          ]}
                        >
                          {actingCommunityLifecycle ? <ActivityIndicator color="#ffffff" /> : (
                            <Text style={communityLifecycle.state === 'ACTIVE'
                              ? styles.dangerButtonText : styles.buttonText}>
                              {communityLifecycle.state === 'ACTIVE'
                                ? 'Приостановить Community'
                                : 'Возобновить Community'}
                            </Text>
                          )}
                        </Pressable>
                      </>
                    ) : null}
                    {communityLifecycleNotice ? (
                      <Text style={styles.hint}>{communityLifecycleNotice}</Text>
                    ) : null}
                  </View>
                ) : null}

                {activeTestAccount.role === 'Central' && communityLifecycle ? (
                  <View style={styles.card}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                      Закрытие Community
                    </Text>
                    {communityLifecycle.state === 'ACTIVE' || communityLifecycle.state === 'PAUSED' ? (
                      <>
                        <Text style={styles.hint}>
                          Closure Plan сразу остановит новые статусные действия. Pending Challenge
                          закроются без вины; подтверждённые Official Session требуют явного решения.
                        </Text>
                        <Text style={styles.label}>Причина</Text>
                        <View style={styles.chips}>
                          {[
                            ['VENUE_EXIT', 'Зал прекращает работу'],
                            ['SAFETY', 'Безопасность'],
                            ['OPERATIONS', 'Операционная причина'],
                          ].map(([value, label]) => (
                            <Pressable
                              key={value}
                              accessibilityRole="button"
                              onPress={() => {
                                setCommunityClosureCategory(value!);
                                setCommunityClosureArmed(false);
                              }}
                              style={[
                                styles.choiceChip,
                                communityClosureCategory === value && styles.choiceChipSelected,
                              ]}
                            >
                              <Text style={[
                                styles.choiceChipText,
                                communityClosureCategory === value && styles.choiceChipTextSelected,
                              ]}>{label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={styles.label}>Подтверждённые Official Session</Text>
                        {communityClosureCandidates.length === 0 ? (
                          <Text style={styles.muted}>Нет Session, требующих решения.</Text>
                        ) : communityClosureCandidates.map((candidate) => {
                          const selected = communityClosureDispositions[candidate.sessionId]
                            ?? candidate.recommendedDisposition;
                          return (
                            <View key={candidate.sessionId} style={styles.adminScheduleItem}>
                              <Text style={styles.label}>
                                {candidate.athleteDisplayNames.join(' · ')}
                              </Text>
                              <Text style={styles.muted}>
                                {formatDateTime(candidate.scheduledStartAt)} · {candidate.state}
                              </Text>
                              <View style={styles.chips}>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => {
                                    setCommunityClosureDispositions((current) => ({
                                      ...current, [candidate.sessionId]: 'RETAIN_TO_COMPLETION',
                                    }));
                                    setCommunityClosureArmed(false);
                                  }}
                                  style={[
                                    styles.choiceChip,
                                    selected === 'RETAIN_TO_COMPLETION' && styles.choiceChipSelected,
                                  ]}
                                >
                                  <Text style={[
                                    styles.choiceChipText,
                                    selected === 'RETAIN_TO_COMPLETION' && styles.choiceChipTextSelected,
                                  ]}>Дать завершить</Text>
                                </Pressable>
                                {candidate.cancellationAllowed ? (
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() => {
                                      setCommunityClosureDispositions((current) => ({
                                        ...current, [candidate.sessionId]: 'CANCEL_NO_FAULT',
                                      }));
                                      setCommunityClosureArmed(false);
                                    }}
                                    style={[
                                      styles.choiceChip,
                                      selected === 'CANCEL_NO_FAULT' && styles.choiceChipSelected,
                                    ]}
                                  >
                                    <Text style={[
                                      styles.choiceChipText,
                                      selected === 'CANCEL_NO_FAULT' && styles.choiceChipTextSelected,
                                    ]}>Отменить без вины</Text>
                                  </Pressable>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                        <Text style={styles.label}>Когда закрыть окончательно</Text>
                        <TextInput
                          accessibilityLabel="Дата и время окончательного закрытия Community"
                          onChangeText={(value) => {
                            setCommunityClosureEffectiveAt(value);
                            setCommunityClosureArmed(false);
                          }}
                          placeholder="2026-10-10T18:00"
                          style={styles.input}
                          value={communityClosureEffectiveAt}
                        />
                        <View style={styles.chips}>
                          {[[false, 'Плановое'], [true, 'Экстренное']].map(([value, label]) => (
                            <Pressable
                              key={String(value)}
                              accessibilityRole="button"
                              onPress={() => {
                                setCommunityClosureEmergency(value === true);
                                setCommunityClosureArmed(false);
                              }}
                              style={[
                                styles.choiceChip,
                                communityClosureEmergency === value && styles.choiceChipSelected,
                              ]}
                            >
                              <Text style={[
                                styles.choiceChipText,
                                communityClosureEmergency === value && styles.choiceChipTextSelected,
                              ]}>{label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <TextInput
                          accessibilityLabel="Обоснование Closure Plan"
                          maxLength={500}
                          multiline
                          onChangeText={(value) => {
                            setCommunityClosureReason(value);
                            setCommunityClosureArmed(false);
                          }}
                          placeholder="Кратко объясните решение участникам и аудитору Central"
                          style={[styles.input, styles.appealInput]}
                          value={communityClosureReason}
                        />
                        <Pressable
                          accessibilityRole="button"
                          disabled={actingCommunityClosure || communityClosureReason.trim().length === 0}
                          onPress={() => void scheduleCommunityClosurePlan()}
                          style={({ pressed }) => [
                            styles.dangerButton,
                            (actingCommunityClosure || communityClosureReason.trim().length === 0)
                              && styles.buttonDisabled,
                            pressed && !actingCommunityClosure && styles.buttonPressed,
                          ]}
                        >
                          {actingCommunityClosure ? <ActivityIndicator color="#9a3023" /> : (
                            <Text style={styles.dangerButtonText}>
                              {communityClosureArmed
                                ? 'Подтвердить Closure Plan'
                                : 'Проверить план закрытия'}
                            </Text>
                          )}
                        </Pressable>
                      </>
                    ) : communityClosurePlan ? (
                      <>
                        <Text style={styles.hint}>
                          План №{communityClosurePlan.planVersion} · {communityClosurePlan.category}
                        </Text>
                        <Text style={styles.muted}>
                          Эффективная дата: {formatDateTime(communityClosurePlan.effectiveAt)} ·
                          Session сохранено: {communityClosurePlan.retainedSessionCount} ·
                          отменено без вины: {communityClosurePlan.cancelledSessionCount}
                        </Text>
                        <Text style={styles.hint}>{communityClosurePlan.reason}</Text>
                        {communityLifecycle.state === 'CLOSING' ? (
                          <>
                            <TextInput
                              accessibilityLabel="Причина завершения Closure Plan"
                              maxLength={500}
                              onChangeText={setCommunityClosureReason}
                              placeholder="Подтвердите, что все сохранённые Result и Appeal разрешены"
                              style={styles.input}
                              value={communityClosureReason}
                            />
                            <Pressable
                              accessibilityRole="button"
                              disabled={actingCommunityClosure || communityClosureReason.trim().length === 0}
                              onPress={() => void finalizeCommunityClosurePlan()}
                              style={({ pressed }) => [
                                styles.dangerButton,
                                (actingCommunityClosure || communityClosureReason.trim().length === 0)
                                  && styles.buttonDisabled,
                                pressed && !actingCommunityClosure && styles.buttonPressed,
                              ]}
                            >
                              {actingCommunityClosure ? <ActivityIndicator color="#9a3023" /> : (
                                <Text style={styles.dangerButtonText}>Завершить закрытие Community</Text>
                              )}
                            </Pressable>
                          </>
                        ) : (
                          <Text style={styles.successText}>
                            Закрытие завершено {communityClosurePlan.finalizedAt
                              ? formatDateTime(communityClosurePlan.finalizedAt) : ''}.
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.muted}>Closure Plan загружается.</Text>
                    )}
                    {communityClosureNotice ? (
                      <Text style={styles.hint}>{communityClosureNotice}</Text>
                    ) : null}
                  </View>
                ) : null}

                {activeTestAccount.role === 'Central' ? (
                  <View style={styles.card}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                      Appeals Central
                    </Text>
                    <Text style={styles.hint}>
                      Источник Result остаётся неизменным. Решение создаёт отдельную запись и автоматически пересчитывает спортивные последствия.
                    </Text>
                    {centralAppeals.length === 0 ? (
                      <Text style={styles.muted}>Открытых Appeal сейчас нет.</Text>
                    ) : centralAppeals.map((appeal) => {
                      const acting = actingCentralAppealId === appeal.appealId;
                      const decisive = appeal.recordedWinnerUserId !== null;
                      return (
                        <View key={appeal.appealId} style={styles.hostConfirmationCard}>
                          <View style={styles.row}>
                            <Text style={styles.venueName}>{appeal.appellantDisplayName}</Text>
                            <Text style={styles.sessionState}>
                              {appeal.state === 'SUBMITTED' ? 'Новый Appeal' : 'На рассмотрении'}
                            </Text>
                          </View>
                          <Text style={styles.muted}>{appeal.reasonCode}</Text>
                          <Text style={styles.value}>{appeal.statement}</Text>
                          {appeal.responses.map((item) => (
                            <View key={item.responseId} style={styles.attendanceCard}>
                              <Text style={styles.label}>
                                {item.responderRole === 'COACH' ? 'Coach' : 'Оппонент'} · {item.responderDisplayName}
                              </Text>
                              <Text style={styles.value}>{item.statement}</Text>
                              <Text style={styles.hint}>{formatDateTime(item.submittedAt)}</Text>
                            </View>
                          ))}
                          <Text style={styles.hint}>
                            SLA: {formatDateTime(appeal.slaDueAt)}
                          </Text>
                          {appeal.slaExtension ? (
                            <Text style={styles.hint}>
                              Продлено на {appeal.slaExtension.durationHours} ч: {appeal.slaExtension.reason}
                            </Text>
                          ) : null}
                          {appeal.viewerCanStartReview ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ disabled: actingCentralAppealId !== null }}
                              disabled={actingCentralAppealId !== null}
                              onPress={() => void runCentralAppealAction(appeal, null)}
                              style={({ pressed }) => [
                                styles.button,
                                actingCentralAppealId !== null && styles.buttonDisabled,
                                pressed && actingCentralAppealId === null && styles.buttonPressed,
                              ]}
                            >
                              {acting ? <ActivityIndicator color="#ffffff" />
                                : <Text style={styles.buttonText}>Взять в рассмотрение</Text>}
                            </Pressable>
                          ) : null}
                          {appeal.viewerCanDecide ? (
                            <View style={styles.attendanceList}>
                              <TextInput
                                accessibilityLabel="Обоснование решения Central"
                                maxLength={2000}
                                multiline
                                onChangeText={(value) => {
                                  setCentralDecisionAppealId(appeal.appealId);
                                  setCentralDecisionReason(value);
                                }}
                                placeholder="Нейтрально опишите проверенные факты и основание решения"
                                style={[styles.input, styles.appealInput]}
                                value={centralDecisionAppealId === appeal.appealId ? centralDecisionReason : ''}
                              />
                              {appeal.viewerCanExtendSla ? (
                                <View style={styles.formRow}>
                                  {([24, 48] as const).map((hours) => (
                                    <Pressable
                                      key={hours}
                                      accessibilityRole="button"
                                      disabled={actingCentralAppealId !== null
                                        || centralDecisionAppealId !== appeal.appealId
                                        || centralDecisionReason.trim().length === 0}
                                      onPress={() => void extendCentralAppealSla(appeal, hours)}
                                      style={({ pressed }) => [
                                        styles.secondaryButton,
                                        (actingCentralAppealId !== null
                                          || centralDecisionAppealId !== appeal.appealId
                                          || centralDecisionReason.trim().length === 0) && styles.buttonDisabled,
                                        pressed && styles.buttonPressed,
                                      ]}
                                    >
                                      <Text style={styles.secondaryButtonText}>Продлить SLA +{hours} ч</Text>
                                    </Pressable>
                                  ))}
                                </View>
                              ) : null}
                              {appealDecisionOptions.map((option) => {
                                const invalidReverse = option.decision === 'REVERSE' && !decisive;
                                const disabled = actingCentralAppealId !== null
                                  || centralDecisionAppealId !== appeal.appealId
                                  || centralDecisionReason.trim().length === 0
                                  || invalidReverse;
                                return (
                                  <Pressable
                                    key={option.decision}
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled }}
                                    disabled={disabled}
                                    onPress={() => void runCentralAppealAction(appeal, option.decision)}
                                    style={({ pressed }) => [
                                      option.decision === 'UPHOLD' ? styles.secondaryButton : styles.dangerButton,
                                      disabled && styles.buttonDisabled,
                                      pressed && !disabled && styles.buttonPressed,
                                    ]}
                                  >
                                    <Text style={option.decision === 'UPHOLD'
                                      ? styles.secondaryButtonText : styles.dangerButtonText}>
                                      {option.label}
                                    </Text>
                                    <Text style={styles.hint}>{invalidReverse
                                      ? 'Для ничьей/NO_CONTEST используйте аннулирование или повтор.'
                                      : option.consequence}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <MissingResultReviewSection
                  reviews={missingResultReviews}
                  token={activeTestToken}
                  onUpdated={(updated) => {
                    setMissingResultReviews((current) => current.map((item) =>
                      item.reviewId === updated.reviewId ? updated : item));
                    void loadIdentity();
                  }}
                />

                <IntegrityCaseSection
                  cases={integrityCases}
                  central={activeTestAccount.role === 'Central'}
                  token={activeTestToken}
                  onUpdated={(updated) => {
                    setIntegrityCases((current) => current.some((item) =>
                      item.caseId === updated.caseId)
                      ? current.map((item) => item.caseId === updated.caseId ? updated : item)
                      : [updated, ...current]);
                    void loadIdentity();
                  }}
                />

                {activeTestAccount.role === 'Central' ? (
                  <PlatformIncidentSection token={activeTestToken} />
                ) : null}

                {coachInvites.map((invite) => (
                  <View key={invite.grantId} style={styles.card}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>Вас приглашают стать Coach</Text>
                    <Text style={styles.muted}>
                      Полномочия начнут действовать только после вашего подтверждения.
                    </Text>
                    <Text style={styles.hint}>
                      Приглашение действительно до{' '}
                      {invite.expiresAt
                        ? formatDateTime(invite.expiresAt)
                        : 'указанного срока'}.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: acceptingCoachGrant !== null }}
                      disabled={acceptingCoachGrant !== null}
                      onPress={() => void acceptCoachRole(invite)}
                      style={({ pressed }) => [
                        styles.button,
                        acceptingCoachGrant !== null && styles.buttonDisabled,
                        pressed && acceptingCoachGrant === null && styles.buttonPressed,
                      ]}
                    >
                      {acceptingCoachGrant === invite.grantId ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.buttonText}>Принять роль Coach</Text>
                      )}
                    </Pressable>
                  </View>
                ))}

                {activeTestAccount.role === 'Gym Admin' && venueAdminDashboard ? (
                  <>
                    <View style={styles.card}>
                      <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                        {venueAdminDashboard.venue.displayName}
                      </Text>
                      <Text style={styles.hint}>
                        Часовой пояс: {venueAdminDashboard.venue.timezone}. Публикация доступна
                        на {venueAdminDashboard.venue.slotPublishHorizonDays} дней вперёд.
                      </Text>
                      <View style={styles.adminMetrics}>
                        <View style={styles.adminMetric}>
                          <Text style={styles.adminMetricValue}>
                            {venueAdminDashboard.hostConfirmations.length}
                          </Text>
                          <Text style={styles.adminMetricLabel}>Ждут решения</Text>
                        </View>
                        <View style={styles.adminMetric}>
                          <Text style={styles.adminMetricValue}>
                            {venueAdminDashboard.slots.length}
                          </Text>
                          <Text style={styles.adminMetricLabel}>Свободные слоты</Text>
                        </View>
                        <View style={styles.adminMetric}>
                          <Text style={styles.adminMetricValue}>
                            {venueAdminDashboard.groupInterests.length}
                          </Text>
                          <Text style={styles.adminMetricLabel}>Интерес к группам</Text>
                        </View>
                      </View>
                      <Text style={styles.label}>Авторизованные Coach</Text>
                      <View style={styles.chips}>
                        {venueAdminDashboard.coaches.map((coach) => (
                          <View key={coach.userId} style={styles.chip}>
                            <Text style={styles.chipText}>{coach.displayName}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View style={styles.card}>
                      <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                        Участники Community
                      </Text>
                      <Text style={styles.hint}>
                        Ordinary удаляется сразу без поражения и может подать Appeal в течение 48 часов.
                        Для №1 и Претендента Gym Admin только открывает рассмотрение Central.
                      </Text>
                      {venueMembers.length === 0 ? (
                        <Text style={styles.muted}>Активных участников пока нет.</Text>
                      ) : venueMembers.map((member) => (
                        <View key={member.membershipId} style={styles.hostConfirmationCard}>
                          <View style={styles.row}>
                            <Text style={styles.venueName}>{member.displayName}</Text>
                            <Text style={styles.sessionState}>
                              {member.status === 'CHAMPION' ? '№1'
                                : member.status === 'CONTENDER' ? 'Претендент' : 'Ordinary'}
                            </Text>
                          </View>
                          <Text style={styles.muted}>
                            {member.ageDivision === 'ADULT' ? '18+' : '14–17'} · {
                              member.membershipState === 'UNDER_REVIEW'
                                ? 'На рассмотрении Central' : 'Активен'}
                          </Text>
                          {member.membershipState === 'ACTIVE' ? (
                            removalTargetId === member.membershipId ? (
                              <>
                                <TextInput
                                  accessibilityLabel={`Причина удаления ${member.displayName}`}
                                  maxLength={1000}
                                  multiline
                                  onChangeText={setRemovalReason}
                                  placeholder="Укажите проверяемую причину — минимум 10 символов"
                                  style={[styles.input, styles.appealInput]}
                                  value={removalReason}
                                />
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={actingMembershipRemoval || removalReason.trim().length < 10}
                                  onPress={() => void requestMembershipRemoval(member)}
                                  style={({ pressed }) => [
                                    styles.dangerButton,
                                    (actingMembershipRemoval || removalReason.trim().length < 10)
                                      && styles.buttonDisabled,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={styles.dangerButtonText}>
                                    {member.status === 'ORDINARY'
                                      ? 'Удалить без поражения'
                                      : 'Передать на рассмотрение Central'}
                                  </Text>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={actingMembershipRemoval}
                                  onPress={() => {
                                    setRemovalTargetId(null);
                                    setRemovalReason('');
                                  }}
                                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                                >
                                  <Text style={styles.secondaryButtonText}>Отмена</Text>
                                </Pressable>
                              </>
                            ) : (
                              <Pressable
                                accessibilityRole="button"
                                disabled={actingMembershipRemoval}
                                onPress={() => {
                                  setRemovalTargetId(member.membershipId);
                                  setRemovalReason('');
                                  setMembershipRemovalNotice(null);
                                }}
                                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                              >
                                <Text style={styles.secondaryButtonText}>Управление Membership</Text>
                              </Pressable>
                            )
                          ) : (
                            <Text style={styles.hint}>
                              Статус виден, но новые статусные действия остановлены до решения Central.
                            </Text>
                          )}
                        </View>
                      ))}
                      {membershipRemovalNotice ? (
                        <Text accessibilityLiveRegion="polite" style={styles.successText}>
                          {membershipRemovalNotice}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.card}>
                      <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                        {editingAdminSchedule
                          ? 'Изменить публикацию'
                          : 'Добавить в расписание'}
                      </Text>
                      <Text style={styles.hint}>
                        Дата и время указываются в часовом поясе зала: {venueAdminDashboard.venue.timezone}.
                      </Text>
                      <View style={styles.publicationKindTabs}>
                        {([
                          ['SLOT', 'Персональная'],
                          ['GROUP', 'Групповая'],
                        ] as const).map(([kind, label]) => {
                          const selected = adminPublicationKind === kind;
                          return (
                            <Pressable
                              key={kind}
                              accessibilityRole="button"
                              accessibilityState={{
                                disabled: editingAdminSchedule !== null,
                                selected,
                              }}
                              disabled={editingAdminSchedule !== null}
                              onPress={() => {
                                setAdminPublicationKind(kind);
                                setScheduleNotice(null);
                                setError(null);
                              }}
                              style={({ pressed }) => [
                                styles.publicationKindTab,
                                selected && styles.publicationKindTabSelected,
                                editingAdminSchedule !== null && !selected && styles.buttonDisabled,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={[
                                styles.publicationKindTabText,
                                selected && styles.publicationKindTabTextSelected,
                              ]}>
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <View style={styles.formRow}>
                        <View style={styles.formField}>
                          <Text style={styles.label}>Дата</Text>
                          <TextInput
                            accessibilityLabel="Дата тренировки"
                            keyboardType="numbers-and-punctuation"
                            maxLength={10}
                            onChangeText={setAdminScheduleDate}
                            placeholder="ДД.ММ.ГГГГ"
                            style={styles.input}
                            value={adminScheduleDate}
                          />
                        </View>
                        <View style={styles.formField}>
                          <Text style={styles.label}>Начало</Text>
                          <TextInput
                            accessibilityLabel="Время начала тренировки"
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                            onChangeText={setAdminScheduleTime}
                            placeholder="18:00"
                            style={styles.input}
                            value={adminScheduleTime}
                          />
                        </View>
                      </View>
                      <Text style={styles.label}>Длительность</Text>
                      <View style={styles.chips}>
                        {([60, 90] as const).map((minutes) => {
                          const selected = adminDurationMinutes === minutes;
                          return (
                            <Pressable
                              key={minutes}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => setAdminDurationMinutes(minutes)}
                              style={({ pressed }) => [
                                styles.choiceChip,
                                selected && styles.choiceChipSelected,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={[
                                styles.choiceChipText,
                                selected && styles.choiceChipTextSelected,
                              ]}>
                                {minutes} мин
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {adminPublicationKind === 'SLOT' ? (
                        <>
                          <Text style={styles.label}>Coach</Text>
                          {venueAdminDashboard.coaches.length === 0 ? (
                            <Text style={styles.denial}>
                              Сначала авторизуйте хотя бы одного Coach в Community.
                            </Text>
                          ) : (
                            <View style={styles.chips}>
                              {venueAdminDashboard.coaches.map((coach) => {
                                const selected = adminCoachId === coach.userId;
                                return (
                                  <Pressable
                                    key={coach.userId}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    onPress={() => setAdminCoachId(coach.userId)}
                                    style={({ pressed }) => [
                                      styles.choiceChip,
                                      selected && styles.choiceChipSelected,
                                      pressed && styles.buttonPressed,
                                    ]}
                                  >
                                    <Text style={[
                                      styles.choiceChipText,
                                      selected && styles.choiceChipTextSelected,
                                    ]}>
                                      {coach.displayName}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          )}
                          <Text style={styles.label}>Стоимость, RUB · необязательно</Text>
                          <TextInput
                            accessibilityLabel="Стоимость персональной тренировки"
                            keyboardType="decimal-pad"
                            maxLength={10}
                            onChangeText={setAdminPriceAmount}
                            placeholder="1500"
                            style={styles.input}
                            value={adminPriceAmount}
                          />
                        </>
                      ) : (
                        <>
                          <Text style={styles.label}>Название</Text>
                          <TextInput
                            accessibilityLabel="Название групповой тренировки"
                            maxLength={120}
                            onChangeText={setAdminGroupClassLabel}
                            placeholder="Открытая группа по боксу"
                            style={styles.input}
                            value={adminGroupClassLabel}
                          />
                          <Text style={styles.label}>Вид спорта</Text>
                          <View style={styles.sportOptions}>
                            {sportOptions.map((sport) => {
                              const selected = adminGroupSportCode === sport.code;
                              return (
                                <Pressable
                                  key={sport.code}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected }}
                                  onPress={() => setAdminGroupSportCode(sport.code)}
                                  style={({ pressed }) => [
                                    styles.choiceChip,
                                    selected && styles.choiceChipSelected,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={[
                                    styles.choiceChipText,
                                    selected && styles.choiceChipTextSelected,
                                  ]}>
                                    {sport.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <Text style={styles.label}>Coach · необязательно</Text>
                          <TextInput
                            accessibilityLabel="Coach групповой тренировки"
                            maxLength={120}
                            onChangeText={setAdminGroupCoachName}
                            placeholder="Имя Coach"
                            style={styles.input}
                            value={adminGroupCoachName}
                          />
                          <Text style={styles.label}>Стоимость или условия · необязательно</Text>
                          <TextInput
                            accessibilityLabel="Условия групповой тренировки"
                            maxLength={240}
                            onChangeText={setAdminGroupPriceText}
                            placeholder="Стоимость уточните у зала"
                            style={styles.input}
                            value={adminGroupPriceText}
                          />
                        </>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !canPublishAdminSchedule }}
                        disabled={!canPublishAdminSchedule}
                        onPress={() => void publishAdminSchedule()}
                        style={({ pressed }) => [
                          styles.button,
                          !canPublishAdminSchedule && styles.buttonDisabled,
                          pressed && canPublishAdminSchedule && styles.buttonPressed,
                        ]}
                      >
                        {publishingSchedule ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <Text style={styles.buttonText}>
                            {editingAdminSchedule ? 'Сохранить изменения' : 'Опубликовать'}
                          </Text>
                        )}
                      </Pressable>
                      {editingAdminSchedule ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={publishingSchedule}
                          onPress={cancelEditingAdminSchedule}
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.secondaryButtonText}>Отменить редактирование</Text>
                        </Pressable>
                      ) : null}
                      {scheduleNotice ? (
                        <View accessibilityLiveRegion="polite" style={styles.successCard}>
                          <Text style={styles.successText}>{scheduleNotice}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.card}>
                      <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                        Опубликованное расписание
                      </Text>
                      <Text style={styles.hint}>
                        Будущие предложения зала, которые уже видят спортсмены в Chat.
                      </Text>
                      {venueAdminDashboard.slots.map((slot) => (
                        <View key={slot.slotId} style={styles.adminScheduleItem}>
                          <Text style={styles.sessionState}>Персональная</Text>
                          <Text style={styles.venueName}>{formatDateTime(slot.startAt)}</Text>
                          <Text style={styles.hint}>Coach: {slot.coachDisplayName}</Text>
                          <Text style={styles.hint}>
                            {slot.priceAmount && slot.priceCurrency
                              ? `${slot.priceAmount} ${slot.priceCurrency}`
                              : slot.priceText ?? 'Стоимость не указана'}
                          </Text>
                          <View style={styles.confirmationActions}>
                            <Pressable
                              accessibilityRole="button"
                              disabled={publishingSchedule || withdrawingScheduleId !== null}
                              onPress={() => startEditingSlot(slot)}
                              style={({ pressed }) => [
                                styles.compactSecondaryButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.secondaryButtonText}>Изменить</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={publishingSchedule || withdrawingScheduleId !== null}
                              onPress={() => {
                                setPendingScheduleWithdrawal({
                                  id: slot.slotId,
                                  kind: 'SLOT',
                                  label: `${formatDateTime(slot.startAt)}, ${slot.coachDisplayName}`,
                                  version: slot.version,
                                });
                                setEditingAdminSchedule(null);
                                setScheduleWithdrawalNote('');
                              }}
                              style={({ pressed }) => [
                                styles.compactDangerButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.dangerButtonText}>Снять</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                      {venueAdminDashboard.groupOfferings.map((offering) => (
                        <View key={offering.groupOfferingId} style={styles.adminScheduleItem}>
                          <Text style={styles.groupState}>Групповая</Text>
                          <Text style={styles.venueName}>{offering.classLabel}</Text>
                          <Text style={styles.muted}>{formatDateTime(offering.startAt)}</Text>
                          {offering.coachDisplayName ? (
                            <Text style={styles.hint}>Coach: {offering.coachDisplayName}</Text>
                          ) : null}
                          <View style={styles.confirmationActions}>
                            <Pressable
                              accessibilityRole="button"
                              disabled={publishingSchedule || withdrawingScheduleId !== null}
                              onPress={() => startEditingGroupOffering(offering)}
                              style={({ pressed }) => [
                                styles.compactSecondaryButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.secondaryButtonText}>Изменить</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={publishingSchedule || withdrawingScheduleId !== null}
                              onPress={() => {
                                setPendingScheduleWithdrawal({
                                  id: offering.groupOfferingId,
                                  kind: 'GROUP',
                                  label: offering.classLabel,
                                  version: offering.version,
                                });
                                setEditingAdminSchedule(null);
                                setScheduleWithdrawalNote('');
                              }}
                              style={({ pressed }) => [
                                styles.compactDangerButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.dangerButtonText}>Снять</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                      {venueAdminDashboard.slots.length === 0
                        && venueAdminDashboard.groupOfferings.length === 0 ? (
                          <Text style={styles.muted}>Будущих публикаций пока нет.</Text>
                        ) : null}
                      {pendingScheduleWithdrawal ? (
                        <View style={[styles.sessionConfirmation, styles.sessionConfirmationDanger]}>
                          <Text style={styles.confirmationTitle}>Снять публикацию?</Text>
                          <Text style={styles.confirmationDescription}>
                            {pendingScheduleWithdrawal.label}. Уже начатые заявки нельзя скрыто
                            изменить: система остановит действие и покажет конфликт.
                          </Text>
                          <Text style={styles.label}>Причина</Text>
                          <View style={styles.chips}>
                            {scheduleReasonOptions.map((option) => {
                              const selected = scheduleWithdrawalReasonCode === option.code;
                              return (
                                <Pressable
                                  key={option.code}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected }}
                                  onPress={() => setScheduleWithdrawalReasonCode(option.code)}
                                  style={({ pressed }) => [
                                    styles.choiceChip,
                                    selected && styles.choiceChipSelected,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={[
                                    styles.choiceChipText,
                                    selected && styles.choiceChipTextSelected,
                                  ]}>{option.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <TextInput
                            accessibilityLabel="Комментарий к снятию публикации"
                            maxLength={500}
                            onChangeText={setScheduleWithdrawalNote}
                            placeholder="Комментарий · необязательно"
                            style={styles.input}
                            value={scheduleWithdrawalNote}
                          />
                          <View style={styles.confirmationActions}>
                            <Pressable
                              accessibilityRole="button"
                              disabled={withdrawingScheduleId !== null}
                              onPress={() => setPendingScheduleWithdrawal(null)}
                              style={({ pressed }) => [
                                styles.confirmationCancelButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.secondaryButtonText}>Оставить</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={withdrawingScheduleId !== null}
                              onPress={() => void withdrawAdminSchedule()}
                              style={({ pressed }) => [
                                styles.dangerButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              {withdrawingScheduleId ? (
                                <ActivityIndicator color="#9a3023" />
                              ) : (
                                <Text style={styles.dangerButtonText}>Снять публикацию</Text>
                              )}
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.card}>
                      <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                        Интерес к групповым тренировкам
                      </Text>
                      <Text style={styles.hint}>
                        Это уведомление, а не бронь. Спортсмены сами уточняют свободные места у зала.
                      </Text>
                      {venueAdminDashboard.groupInterests.length === 0 ? (
                        <Text style={styles.muted}>Новых уведомлений нет.</Text>
                      ) : venueAdminDashboard.groupInterests.map((interest) => (
                        <View key={interest.groupPlanId} style={styles.adminScheduleItem}>
                          <Text style={styles.venueName}>{interest.classLabel}</Text>
                          <Text style={styles.muted}>{formatDateTime(interest.startAt)}</Text>
                          <Text style={styles.hint}>
                            {interest.athleteDisplayNames.join(' + ')}
                          </Text>
                          <Text style={styles.hint}>
                            Уведомление получено {formatDateTime(interest.notifiedAt)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                {hostConfirmations.length > 0 ? (
                  <View style={styles.card}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                      Ожидают подтверждения
                    </Text>
                    <Text style={styles.hint}>
                      Одна кнопка подтверждает зал и создаёт Session. До этого слот никому не принадлежит.
                    </Text>
                    {hostConfirmations.map((item) => {
                      const snapshot = item.booking.commercialTermsSnapshot;
                      if (!snapshot) return null;
                      const confirming = confirmingBookingId === item.booking.bookingId;
                      return (
                        <View key={item.booking.bookingId} style={styles.hostConfirmationCard}>
                          <Text style={styles.sessionState}>
                            {item.booking.purpose === 'OFFICIAL_CHALLENGE'
                              ? 'Official Challenge'
                              : 'Персональная тренировка'}
                          </Text>
                          <Text style={styles.venueName}>
                            {item.athleteDisplayNames.join(' + ')}
                          </Text>
                          <Text style={styles.muted}>
                            {formatDateTime(snapshot.startAt)} · {snapshot.venueDisplayName}
                          </Text>
                          <Text style={styles.hint}>Тренер: {snapshot.coachDisplayName}</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ disabled: confirmingBookingId !== null }}
                            disabled={confirmingBookingId !== null}
                            onPress={() => void confirmHostBooking(item)}
                            style={({ pressed }) => [
                              styles.button,
                              confirmingBookingId !== null && styles.buttonDisabled,
                              pressed && confirmingBookingId === null && styles.buttonPressed,
                            ]}
                          >
                            {confirming ? (
                              <ActivityIndicator color="#ffffff" />
                            ) : (
                              <Text style={styles.buttonText}>Подтвердить тренировку</Text>
                            )}
                          </Pressable>
                          {hostRejectionDraftId === item.booking.bookingId ? (
                            <View style={[styles.sessionConfirmation, styles.sessionConfirmationDanger]}>
                              <Text style={styles.confirmationTitle}>Почему зал отказывает?</Text>
                              <Text style={styles.confirmationDescription}>
                                Причину увидят оба спортсмена. Слот останется опубликованным,
                                если вы не снимете его отдельно.
                              </Text>
                              <View style={styles.chips}>
                                {scheduleReasonOptions.map((option) => {
                                  const selected = hostRejectionReasonCode === option.code;
                                  return (
                                    <Pressable
                                      key={option.code}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected }}
                                      onPress={() => setHostRejectionReasonCode(option.code)}
                                      style={({ pressed }) => [
                                        styles.choiceChip,
                                        selected && styles.choiceChipSelected,
                                        pressed && styles.buttonPressed,
                                      ]}
                                    >
                                      <Text style={[
                                        styles.choiceChipText,
                                        selected && styles.choiceChipTextSelected,
                                      ]}>{option.label}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                              <TextInput
                                accessibilityLabel="Комментарий к отказу зала"
                                maxLength={500}
                                onChangeText={setHostRejectionNote}
                                placeholder="Комментарий · необязательно"
                                style={styles.input}
                                value={hostRejectionNote}
                              />
                              <View style={styles.confirmationActions}>
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={confirmingBookingId !== null}
                                  onPress={() => {
                                    setHostRejectionDraftId(null);
                                    setHostRejectionNote('');
                                  }}
                                  style={({ pressed }) => [
                                    styles.confirmationCancelButton,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={styles.secondaryButtonText}>Вернуться</Text>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={confirmingBookingId !== null}
                                  onPress={() => void rejectHostBooking(item)}
                                  style={({ pressed }) => [
                                    styles.dangerButton,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  {confirming ? (
                                    <ActivityIndicator color="#9a3023" />
                                  ) : (
                                    <Text style={styles.dangerButtonText}>Подтвердить отказ</Text>
                                  )}
                                </Pressable>
                              </View>
                            </View>
                          ) : (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ disabled: confirmingBookingId !== null }}
                              disabled={confirmingBookingId !== null}
                              onPress={() => {
                                setHostRejectionDraftId(item.booking.bookingId);
                                setHostRejectionNote('');
                              }}
                              style={({ pressed }) => [
                                styles.dangerButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.dangerButtonText}>Отказать с причиной</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {hostNotice ? (
                  <View accessibilityLiveRegion="polite" style={styles.successCard}>
                    <Text style={styles.successText}>{hostNotice}</Text>
                  </View>
                ) : null}

                {sessionNotice ? (
                  <View accessibilityLiveRegion="polite" style={styles.successCard}>
                    <Text style={styles.successText}>{sessionNotice}</Text>
                  </View>
                ) : null}

                {sessions.length > 0 ? (
                  <View style={styles.card}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                      {activeTestAccount.role === 'Coach'
                        ? 'Сессии Coach'
                        : activeTestAccount.role === 'Gym Admin'
                          ? 'Сессии зала'
                          : 'Мои сессии'}
                    </Text>
                    <Text style={styles.hint}>
                      Время в расписании не считается посещением. Фактическое начало и присутствие фиксирует Coach.
                    </Text>
                    {sessions.slice(0, 10).map((session) => {
                      const actionPending = actingSessionKey?.startsWith(session.sessionId) ?? false;
                      const sessionActionBlocked = actingSessionKey !== null
                        || pendingSessionAction !== null;
                      const noShowAvailableAt = new Date(session.scheduledStartAt).getTime()
                        + session.noShowGraceMinutes * 60 * 1_000;
                      const officialResult = session.resultId
                        ? resultsById[session.resultId] ?? null
                        : null;
                      const appealDetail = session.resultId
                        ? appealsByResultId[session.resultId] ?? null
                        : null;
                      const noShowUserIds = session.attendance
                        .filter((item) => item.status === 'NO_SHOW')
                        .map((item) => item.athleteUserId);
                      const missingResultReview = missingResultReviews.find(
                        (review) => review.sessionId === session.sessionId,
                      ) ?? null;
                      return (
                        <View key={session.sessionId} style={styles.hostConfirmationCard}>
                          <View style={styles.row}>
                            <Text style={styles.venueName}>
                              {session.activeAthleteDisplayNames.join(' + ')}
                            </Text>
                            <Text style={styles.sessionState}>{sessionStateLabels[session.state]}</Text>
                          </View>
                          <Text style={styles.muted}>
                            {formatDateTime(session.scheduledStartAt)} · {session.venueDisplayName}
                          </Text>
                          <Text style={styles.hint}>Coach: {session.coachDisplayName}</Text>
                          {session.purpose === 'OFFICIAL_CHALLENGE' ? (
                            <Text style={styles.sessionState}>Official Challenge</Text>
                          ) : null}
                          {session.viewerCanRequestOfficialConversion ? (
                            <View style={styles.attendanceList}>
                              <Text style={styles.hint}>
                                Можно провести эту уже подтверждённую тренировку как Official Challenge.
                                Время, зал и Coach не изменятся.
                              </Text>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ disabled: sessionActionBlocked }}
                                disabled={sessionActionBlocked}
                                onPress={() => void requestOfficialConversion(session)}
                                style={({ pressed }) => [
                                  styles.secondaryButton,
                                  sessionActionBlocked && styles.buttonDisabled,
                                  pressed && !sessionActionBlocked && styles.buttonPressed,
                                ]}
                              >
                                <Text style={styles.secondaryButtonText}>
                                  Предложить Official Challenge
                                </Text>
                              </Pressable>
                            </View>
                          ) : null}
                          {session.officialConversion?.state === 'WAITING_FIFO' ? (
                            <View style={styles.attendanceCard}>
                              <Text style={styles.label}>Ожидает очередь за статус</Text>
                              <Text style={styles.hint}>
                                Позиция: {session.officialConversion.queuePosition ?? 'уточняется'}.
                                До активации Session остаётся обычной тренировкой.
                              </Text>
                            </View>
                          ) : null}
                          {session.officialConversion?.state === 'PENDING_CONFIRMATION' ? (
                            <View style={styles.attendanceCard}>
                              <Text style={styles.label}>Подтверждение Official Challenge</Text>
                              <Text style={styles.hint}>
                                Подтвердили {session.officialConversion.confirmations.filter(
                                  (item) => item.decision === 'ACCEPT',
                                ).length} из 3
                                {session.officialConversion.confirmationDeadlineAt
                                  ? ` · до ${formatDateTime(session.officialConversion.confirmationDeadlineAt)}`
                                  : ''}.
                              </Text>
                              {session.officialConversion.viewerHasDecided ? (
                                <Text style={styles.hint}>Ваш ответ уже записан.</Text>
                              ) : null}
                              {session.officialConversion.viewerCanConfirm ? (
                                <View style={styles.attendanceActions}>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: sessionActionBlocked }}
                                    disabled={sessionActionBlocked}
                                    onPress={() => void decideOfficialConversion(session, 'ACCEPT')}
                                    style={({ pressed }) => [
                                      styles.button,
                                      sessionActionBlocked && styles.buttonDisabled,
                                      pressed && !sessionActionBlocked && styles.buttonPressed,
                                    ]}
                                  >
                                    <Text style={styles.buttonText}>Подтвердить</Text>
                                  </Pressable>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: sessionActionBlocked }}
                                    disabled={sessionActionBlocked}
                                    onPress={() => void decideOfficialConversion(session, 'DECLINE')}
                                    style={({ pressed }) => [
                                      styles.secondaryButton,
                                      sessionActionBlocked && styles.buttonDisabled,
                                      pressed && !sessionActionBlocked && styles.buttonPressed,
                                    ]}
                                  >
                                    <Text style={styles.secondaryButtonText}>Оставить тренировкой</Text>
                                  </Pressable>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                          {session.viewerCanCancelTraining ? (
                            <View style={styles.attendanceList}>
                              <Text style={styles.hint}>
                                Не сможете прийти? Отмена обычной тренировки не создаёт поражение,
                                cooldown или запись в статистике. Оставшийся спортсмен и Coach
                                получат до одного часа на решение о соло-тренировке.
                              </Text>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ disabled: sessionActionBlocked }}
                                disabled={sessionActionBlocked}
                                onPress={() => setPendingSessionAction({
                                  action: 'cancel-training-participation',
                                  body: {},
                                  confirmLabel: 'Отменить моё участие',
                                  description: 'Ваше участие будет отменено без поражения и штрафа. Слот временно сохранится: оставшийся спортсмен и Coach смогут продолжить как соло-тренировку, только если оба подтвердят вовремя.',
                                  operationSuffix: 'athlete-cancelled-training',
                                  sessionId: session.sessionId,
                                  title: 'Вы точно не сможете прийти?',
                                  tone: 'neutral',
                                })}
                                style={({ pressed }) => [
                                  styles.secondaryButton,
                                  sessionActionBlocked && styles.buttonDisabled,
                                  pressed && !sessionActionBlocked && styles.buttonPressed,
                                ]}
                              >
                                <Text style={styles.secondaryButtonText}>Я не смогу прийти</Text>
                              </Pressable>
                            </View>
                          ) : null}
                          {session.soloContinuation?.state === 'PENDING' ? (
                            <View style={styles.attendanceCard}>
                              <Text style={styles.label}>Решение о соло-тренировке</Text>
                              <Text style={styles.hint}>
                                Один спортсмен отменил участие без штрафа. Для сохранения времени
                                нужны два подтверждения: оставшегося спортсмена и Coach. Уже принято{' '}
                                {session.soloContinuation.confirmations.filter(
                                  (item) => item.decision === 'ACCEPT',
                                ).length} из 2 · до {formatDateTime(session.soloContinuation.deadlineAt)}.
                              </Text>
                              {session.soloContinuation.viewerHasDecided ? (
                                <Text style={styles.hint}>Ваш ответ уже записан.</Text>
                              ) : null}
                              {session.soloContinuation.viewerCanConfirm ? (
                                <View style={styles.attendanceActions}>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: sessionActionBlocked }}
                                    disabled={sessionActionBlocked}
                                    onPress={() => void decideSoloContinuation(session, 'ACCEPT')}
                                    style={({ pressed }) => [
                                      styles.button,
                                      sessionActionBlocked && styles.buttonDisabled,
                                      pressed && !sessionActionBlocked && styles.buttonPressed,
                                    ]}
                                  >
                                    <Text style={styles.buttonText}>Продолжить соло</Text>
                                  </Pressable>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: sessionActionBlocked }}
                                    disabled={sessionActionBlocked}
                                    onPress={() => void decideSoloContinuation(session, 'DECLINE')}
                                    style={({ pressed }) => [
                                      styles.secondaryButton,
                                      sessionActionBlocked && styles.buttonDisabled,
                                      pressed && !sessionActionBlocked && styles.buttonPressed,
                                    ]}
                                  >
                                    <Text style={styles.secondaryButtonText}>Отменить Session</Text>
                                  </Pressable>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                          {session.soloContinuation?.state === 'CONFIRMED' ? (
                            <View style={styles.attendanceCard}>
                              <Text style={styles.label}>Соло-тренировка подтверждена</Text>
                              <Text style={styles.hint}>
                                Оставшийся спортсмен и Coach подтвердили продолжение. Время и слот сохранены.
                              </Text>
                            </View>
                          ) : null}
                          {session.trainingRetention?.state === 'PENDING' ? (
                            <View style={styles.attendanceCard}>
                              <Text style={styles.label}>Сохранить время как обычную тренировку?</Text>
                              <Text style={styles.hint}>
                                Official Challenge закрыт без поражения. Слот пока сохранён.
                                Чтобы продолжить как Training, нужны ответы обоих спортсменов
                                и Coach/зала. Подтверждено{' '}
                                {session.trainingRetention.confirmations.filter(
                                  (item) => item.decision === 'ACCEPT',
                                ).length} из 3 · до {formatDateTime(session.trainingRetention.deadlineAt)}.
                              </Text>
                              {session.trainingRetention.viewerHasDecided ? (
                                <Text style={styles.hint}>Ваш ответ уже записан.</Text>
                              ) : null}
                              {session.trainingRetention.viewerCanConfirm ? (
                                <View style={styles.attendanceActions}>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: sessionActionBlocked }}
                                    disabled={sessionActionBlocked}
                                    onPress={() => void decideTrainingRetention(session, 'ACCEPT')}
                                    style={({ pressed }) => [
                                      styles.button,
                                      sessionActionBlocked && styles.buttonDisabled,
                                      pressed && !sessionActionBlocked && styles.buttonPressed,
                                    ]}
                                  >
                                    <Text style={styles.buttonText}>Сохранить как Training</Text>
                                  </Pressable>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: sessionActionBlocked }}
                                    disabled={sessionActionBlocked}
                                    onPress={() => void decideTrainingRetention(session, 'DECLINE')}
                                    style={({ pressed }) => [
                                      styles.secondaryButton,
                                      sessionActionBlocked && styles.buttonDisabled,
                                      pressed && !sessionActionBlocked && styles.buttonPressed,
                                    ]}
                                  >
                                    <Text style={styles.secondaryButtonText}>Отменить Session</Text>
                                  </Pressable>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                          {session.trainingRetention?.state === 'CONFIRMED' ? (
                            <View style={styles.attendanceCard}>
                              <Text style={styles.label}>Session сохранена как Training</Text>
                              <Text style={styles.hint}>
                                Время, зал и Coach не изменились. Результат не влияет на Competition.
                              </Text>
                            </View>
                          ) : null}
                          {session.latestCoachReplacementAt ? (
                            <Text style={styles.hint}>
                              Coach заменён залом. Время, место и стоимость не изменились.
                            </Text>
                          ) : null}
                          {session.viewerCanAdminister
                            && (session.state === 'SCHEDULED' || session.state === 'READY_FOR_COACH') ? (
                              <View style={styles.attendanceList}>
                                {session.replacementCoachOptions.length > 0 ? (
                                  <>
                                    <Text style={styles.hint}>Доступная равноценная замена:</Text>
                                    {session.replacementCoachOptions.map((candidate) => (
                                      <Pressable
                                        key={candidate.userId}
                                        accessibilityRole="button"
                                        accessibilityState={{ disabled: sessionActionBlocked }}
                                        disabled={sessionActionBlocked}
                                        onPress={() => setPendingSessionAction({
                                          action: 'replace-coach',
                                          body: { replacementCoachUserId: candidate.userId },
                                          confirmLabel: 'Назначить Coach',
                                          description: `Назначить ${candidate.displayName}? Время, зал и условия Session не изменятся. Оба спортсмена получат уведомление.`,
                                          operationSuffix: candidate.userId,
                                          sessionId: session.sessionId,
                                          title: 'Подтвердите замену Coach',
                                          tone: 'neutral',
                                        })}
                                        style={({ pressed }) => [
                                          styles.secondaryButton,
                                          sessionActionBlocked && styles.buttonDisabled,
                                          pressed && !sessionActionBlocked && styles.buttonPressed,
                                        ]}
                                      >
                                        <Text style={styles.secondaryButtonText}>
                                          Назначить: {candidate.displayName}
                                        </Text>
                                      </Pressable>
                                    ))}
                                  </>
                                ) : (
                                  <Text style={styles.hint}>Свободной равноценной замены Coach нет.</Text>
                                )}
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityState={{ disabled: sessionActionBlocked }}
                                  disabled={sessionActionBlocked}
                                  onPress={() => setPendingSessionAction({
                                    action: 'fail-external',
                                    body: { reasonCode: 'OTHER_EXTERNAL' },
                                    confirmLabel: 'Отменить Session',
                                    description: 'Session будет отменена по внешней причине. У спортсменов не будет поражения, штрафа или записи в статистике.',
                                    operationSuffix: 'other-external',
                                    sessionId: session.sessionId,
                                    title: 'Зал точно не может провести Session?',
                                    tone: 'danger',
                                  })}
                                  style={({ pressed }) => [
                                    styles.dangerButton,
                                    sessionActionBlocked && styles.buttonDisabled,
                                    pressed && !sessionActionBlocked && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={styles.dangerButtonText}>
                                    Зал не может провести Session
                                  </Text>
                                </Pressable>
                              </View>
                            ) : null}
                          {session.viewerCanRequestNoFaultReschedule ? (
                            <View style={styles.attendanceList}>
                              <Text style={styles.hint}>
                                Если новый Coach вам не подходит, можно отменить без поражения и штрафа.
                              </Text>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ disabled: sessionActionBlocked }}
                                disabled={sessionActionBlocked}
                                onPress={() => setPendingSessionAction({
                                  action: 'cancel-after-coach-replacement',
                                  body: {},
                                  confirmLabel: 'Отказаться от замены',
                                  description: 'Session будет отменена без поражения и штрафа. Подтверждённое время освободится.',
                                  operationSuffix: 'athlete-rejected-replacement',
                                  sessionId: session.sessionId,
                                  title: 'Новый Coach не подходит?',
                                  tone: 'neutral',
                                })}
                                style={({ pressed }) => [
                                  styles.secondaryButton,
                                  sessionActionBlocked && styles.buttonDisabled,
                                  pressed && !sessionActionBlocked && styles.buttonPressed,
                                ]}
                              >
                                <Text style={styles.secondaryButtonText}>
                                  Новый Coach не подходит
                                </Text>
                              </Pressable>
                            </View>
                          ) : null}
                          {pendingSessionAction?.sessionId === session.sessionId ? (
                            <View accessibilityLiveRegion="polite" style={[
                              styles.sessionConfirmation,
                              pendingSessionAction.tone === 'danger'
                                && styles.sessionConfirmationDanger,
                            ]}>
                              <Text style={styles.confirmationTitle}>
                                {pendingSessionAction.title}
                              </Text>
                              <Text style={styles.confirmationDescription}>
                                {pendingSessionAction.description}
                              </Text>
                              <View style={styles.confirmationActions}>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => setPendingSessionAction(null)}
                                  style={({ pressed }) => [
                                    styles.confirmationCancelButton,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={styles.secondaryButtonText}>Вернуться</Text>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => {
                                    const pending = pendingSessionAction;
                                    setPendingSessionAction(null);
                                    if (pending.action === 'cancel-training-participation') {
                                      void cancelTrainingParticipation(session);
                                    } else {
                                      void runSessionAction(
                                        session,
                                        pending.action,
                                        pending.body,
                                        pending.operationSuffix,
                                      );
                                    }
                                  }}
                                  style={({ pressed }) => [
                                    pendingSessionAction.tone === 'danger'
                                      ? styles.confirmationDangerButton
                                      : styles.confirmationPrimaryButton,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={styles.confirmationButtonText}>
                                    {pendingSessionAction.confirmLabel}
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          ) : null}
                          {session.state === 'SCHEDULED' ? (
                            <Text style={styles.hint}>
                              Окно Coach откроется автоматически в назначенное время.
                            </Text>
                          ) : null}
                          {session.state === 'READY_FOR_COACH' && session.viewerCanManage ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ disabled: sessionActionBlocked }}
                              disabled={sessionActionBlocked}
                              onPress={() => void runSessionAction(session, 'start', {}, 'explicit')}
                              style={({ pressed }) => [
                                styles.button,
                                sessionActionBlocked && styles.buttonDisabled,
                                pressed && !sessionActionBlocked && styles.buttonPressed,
                              ]}
                            >
                              {actionPending ? (
                                <ActivityIndicator color="#ffffff" />
                              ) : (
                                <Text style={styles.buttonText}>Начать Session</Text>
                              )}
                            </Pressable>
                          ) : null}
                          {session.state === 'IN_PROGRESS' || session.state === 'ENDED' ? (
                            <View style={styles.attendanceList}>
                              {session.activeAthleteUserIds.map((athleteUserId, index) => {
                                const recorded = session.attendance.find(
                                  (item) => item.athleteUserId === athleteUserId,
                                );
                                const canMarkNoShow = Date.now() >= noShowAvailableAt;
                                return (
                                  <View key={athleteUserId} style={styles.attendanceCard}>
                                    <View style={styles.row}>
                                      <Text style={styles.value}>
                                        {session.activeAthleteDisplayNames[index]}
                                      </Text>
                                      <Text style={recorded ? styles.capabilityState : styles.muted}>
                                        {recorded ? attendanceLabels[recorded.status] : 'Не отмечен'}
                                      </Text>
                                    </View>
                                    {!recorded && session.state === 'IN_PROGRESS' && session.viewerCanManage ? (
                                      <View style={styles.attendanceActions}>
                                        {(['PRESENT', 'LATE', 'NO_SHOW'] as const).map((status) => {
                                          const disabled =
                                            actingSessionKey !== null ||
                                            (status === 'NO_SHOW' && !canMarkNoShow);
                                          return (
                                            <Pressable
                                              key={status}
                                              accessibilityRole="button"
                                              accessibilityState={{ disabled }}
                                              disabled={disabled}
                                              onPress={() => void recordAttendance(session, athleteUserId, status)}
                                              style={({ pressed }) => [
                                                styles.attendanceButton,
                                                disabled && styles.buttonDisabled,
                                                pressed && !disabled && styles.buttonPressed,
                                              ]}
                                            >
                                              <Text style={styles.attendanceButtonText}>
                                                {status === 'PRESENT'
                                                  ? 'Пришёл'
                                                  : status === 'LATE'
                                                    ? 'Опоздал'
                                                    : 'Не пришёл'}
                                              </Text>
                                            </Pressable>
                                          );
                                        })}
                                      </View>
                                    ) : null}
                                  </View>
                                );
                              })}
                            </View>
                          ) : null}
                          {session.state === 'IN_PROGRESS' && session.viewerCanManage ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{
                                disabled: actingSessionKey !== null
                                  || session.attendance.length !== session.activeAthleteUserIds.length,
                              }}
                              disabled={actingSessionKey !== null
                                || session.attendance.length !== session.activeAthleteUserIds.length}
                              onPress={() => void runSessionAction(session, 'end', {}, 'complete')}
                              style={({ pressed }) => [
                                styles.button,
                                (actingSessionKey !== null
                                  || session.attendance.length !== session.activeAthleteUserIds.length)
                                  && styles.buttonDisabled,
                                pressed && actingSessionKey === null
                                  && session.attendance.length === session.activeAthleteUserIds.length
                                  && styles.buttonPressed,
                              ]}
                            >
                              {actionPending ? (
                                <ActivityIndicator color="#ffffff" />
                              ) : (
                                <Text style={styles.buttonText}>
                                  {session.purpose === 'OFFICIAL_CHALLENGE'
                                    ? 'Завершить Official Session'
                                    : 'Завершить тренировку'}
                                </Text>
                              )}
                            </Pressable>
                          ) : null}
                          {session.state === 'ENDED'
                            && session.purpose === 'OFFICIAL_CHALLENGE'
                            && session.viewerCanRecordResult
                            && session.challengeState === 'RESULT_PENDING'
                            && officialResult === null ? (
                              <View style={styles.attendanceCard}>
                                <Text style={styles.label}>Подтвердить официальный результат</Text>
                                <Text style={styles.hint}>
                                  {missingResultReview?.viewerCanRecordConstrainedResult
                                    ? 'Central назначил вас независимым Coach. Доступен только исход, подтверждённый собранными фактами.'
                                    : 'Результат сразу станет виден обоим спортсменам. Appeal доступен 48 часов.'}
                                </Text>
                                <View style={styles.attendanceActions}>
                                  {missingResultReview?.viewerCanRecordConstrainedResult
                                    && missingResultReview.allowedOutcomeCode ? (
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityState={{ disabled: actingResultKey !== null }}
                                      disabled={actingResultKey !== null}
                                      onPress={() => void recordOfficialResult(
                                        session,
                                        missingResultReview.allowedOutcomeCode!,
                                        missingResultReview.allowedWinnerUserId,
                                      )}
                                      style={({ pressed }) => [
                                        styles.attendanceButton,
                                        actingResultKey !== null && styles.buttonDisabled,
                                        pressed && actingResultKey === null && styles.buttonPressed,
                                      ]}
                                    >
                                      <Text style={styles.attendanceButtonText}>
                                        {missingResultReview.allowedOutcomeCode === 'WIN_A'
                                          ? `Подтвердить победу: ${session.athleteDisplayNames[0]}`
                                          : missingResultReview.allowedOutcomeCode === 'WIN_B'
                                            ? `Подтвердить победу: ${session.athleteDisplayNames[1]}`
                                            : missingResultReview.allowedOutcomeCode === 'DRAW'
                                              ? 'Подтвердить ничью'
                                              : 'Подтвердить NO CONTEST'}
                                      </Text>
                                    </Pressable>
                                  ) : noShowUserIds.length === 2 ? (
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityState={{ disabled: actingResultKey !== null }}
                                      disabled={actingResultKey !== null}
                                      onPress={() => void recordOfficialResult(session, 'NO_CONTEST')}
                                      style={({ pressed }) => [
                                        styles.attendanceButton,
                                        actingResultKey !== null && styles.buttonDisabled,
                                        pressed && actingResultKey === null && styles.buttonPressed,
                                      ]}
                                    >
                                      <Text style={styles.attendanceButtonText}>Оба не явились</Text>
                                    </Pressable>
                                  ) : noShowUserIds.length === 1 ? (
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityState={{ disabled: actingResultKey !== null }}
                                      disabled={actingResultKey !== null}
                                      onPress={() => void recordOfficialResult(
                                        session,
                                        'NO_SHOW',
                                        session.athleteUserIds.find((id) => id !== noShowUserIds[0]) ?? null,
                                      )}
                                      style={({ pressed }) => [
                                        styles.attendanceButton,
                                        actingResultKey !== null && styles.buttonDisabled,
                                        pressed && actingResultKey === null && styles.buttonPressed,
                                      ]}
                                    >
                                      <Text style={styles.attendanceButtonText}>Подтвердить неявку</Text>
                                    </Pressable>
                                  ) : (
                                    <>
                                      {session.athleteDisplayNames.map((name, index) => (
                                        <Pressable
                                          key={session.athleteUserIds[index]}
                                          accessibilityRole="button"
                                          accessibilityState={{ disabled: actingResultKey !== null }}
                                          disabled={actingResultKey !== null}
                                          onPress={() => void recordOfficialResult(
                                            session,
                                            index === 0 ? 'WIN_A' : 'WIN_B',
                                          )}
                                          style={({ pressed }) => [
                                            styles.attendanceButton,
                                            actingResultKey !== null && styles.buttonDisabled,
                                            pressed && actingResultKey === null && styles.buttonPressed,
                                          ]}
                                        >
                                          <Text style={styles.attendanceButtonText}>Победил: {name}</Text>
                                        </Pressable>
                                      ))}
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityState={{ disabled: actingResultKey !== null }}
                                        disabled={actingResultKey !== null}
                                        onPress={() => void recordOfficialResult(session, 'DRAW')}
                                        style={({ pressed }) => [
                                          styles.attendanceButton,
                                          actingResultKey !== null && styles.buttonDisabled,
                                          pressed && actingResultKey === null && styles.buttonPressed,
                                        ]}
                                      >
                                        <Text style={styles.attendanceButtonText}>Ничья</Text>
                                      </Pressable>
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityState={{ disabled: actingResultKey !== null }}
                                        disabled={actingResultKey !== null}
                                        onPress={() => void recordOfficialResult(session, 'NO_CONTEST')}
                                        style={({ pressed }) => [
                                          styles.attendanceButton,
                                          actingResultKey !== null && styles.buttonDisabled,
                                          pressed && actingResultKey === null && styles.buttonPressed,
                                        ]}
                                      >
                                        <Text style={styles.attendanceButtonText}>Без результата</Text>
                                      </Pressable>
                                    </>
                                  )}
                                </View>
                              </View>
                            ) : null}
                          {officialResult ? (
                            <View style={styles.attendanceCard}>
                              <View style={styles.row}>
                                <Text style={styles.label}>Official Result</Text>
                                <Text style={styles.sessionState}>
                                  {resultStateLabels[officialResult.state]}
                                </Text>
                              </View>
                              <Text style={styles.value}>
                                {officialResult.winnerDisplayName
                                  ? `Победитель: ${officialResult.winnerDisplayName}`
                                  : officialResult.outcomeCode === 'DRAW'
                                    ? 'Ничья'
                                    : 'Без засчитываемого результата'}
                              </Text>
                              <Text selectable style={styles.hint}>
                                Result ID: {officialResult.resultId} · версия {officialResult.version}
                              </Text>
                              {officialResult.decision && officialResult.decisionReason ? (
                                <Text style={styles.hint}>
                                  Решение Central: {officialResult.decisionReason}
                                </Text>
                              ) : null}
                              {officialResult.integrityReviewState ? (
                                <View style={styles.attendanceCard}>
                                  <Text style={styles.label}>Независимая проверка Final Result</Text>
                                  <Text style={styles.value}>
                                    {officialResult.integrityReviewState === 'OPEN'
                                      ? 'Проверка открыта Central'
                                      : officialResult.integrityReviewState === 'UNDER_REVIEW'
                                        ? 'Проверка идёт; статусные действия временно ограничены'
                                        : officialResult.integrityReviewState === 'DECIDED_UPHELD'
                                          ? 'Результат подтверждён'
                                          : officialResult.integrityReviewState === 'DECIDED_CORRECTED'
                                            ? 'Исправленный результат применён'
                                            : 'Результат аннулирован'}
                                  </Text>
                                  <Text style={styles.hint}>
                                    Категория: {officialResult.integrityReviewCategory === 'FRAUD'
                                      ? 'проверка достоверности'
                                      : officialResult.integrityReviewCategory === 'IDENTITY_ERROR'
                                        ? 'проверка личности участника'
                                        : 'проверка системной ошибки'}.
                                    Внутренние материалы доступны только Central.
                                  </Text>
                                </View>
                              ) : null}
                              {officialResult.statusTransitionType !== 'NONE' ? (
                                <Text style={styles.hint}>
                                  Статус Community уже обновлён предварительно и защищён от других статусных Challenge.
                                </Text>
                              ) : null}
                              {officialResult.state === 'RECORDED' ? (
                                <Text style={styles.hint}>
                                  Appeal до {formatDateTime(officialResult.appealDeadlineAt)}.
                                </Text>
                              ) : null}
                              {appealDetail ? (
                                <View style={styles.attendanceList}>
                                  <Text style={styles.label}>
                                    Appeal · {appealDetail.state === 'SUBMITTED'
                                      ? 'ожидает Central' : 'на рассмотрении'}
                                  </Text>
                                  <Text style={styles.value}>{appealDetail.statement}</Text>
                                  <Text style={styles.hint}>
                                    Ответ можно добавить до {formatDateTime(appealDetail.responseDeadlineAt)}.
                                    Решение Central — до {formatDateTime(appealDetail.slaDueAt)}.
                                  </Text>
                                  {appealDetail.responses.map((item) => (
                                    <View key={item.responseId} style={styles.attendanceCard}>
                                      <Text style={styles.label}>
                                        {item.responderRole === 'COACH' ? 'Coach' : 'Оппонент'} · {item.responderDisplayName}
                                      </Text>
                                      <Text style={styles.value}>{item.statement}</Text>
                                    </View>
                                  ))}
                                  {appealDetail.slaExtension ? (
                                    <Text style={styles.hint}>
                                      Central продлил срок на {appealDetail.slaExtension.durationHours} ч.
                                      Причина: {appealDetail.slaExtension.reason}
                                    </Text>
                                  ) : null}
                                  {appealDetail.viewerCanRespond ? (
                                    <>
                                      <TextInput
                                        accessibilityLabel="Ответ на Appeal"
                                        maxLength={2000}
                                        multiline
                                        onChangeText={setAppealResponseStatement}
                                        placeholder="Добавьте факты для Central"
                                        style={[styles.input, styles.appealInput]}
                                        value={appealResponseStatement}
                                      />
                                      <Pressable
                                        accessibilityRole="button"
                                        disabled={actingResultKey !== null
                                          || appealResponseStatement.trim().length === 0}
                                        onPress={() => void runAppealParticipantAction(appealDetail, 'response')}
                                        style={({ pressed }) => [
                                          styles.secondaryButton,
                                          (actingResultKey !== null
                                            || appealResponseStatement.trim().length === 0) && styles.buttonDisabled,
                                          pressed && styles.buttonPressed,
                                        ]}
                                      >
                                        <Text style={styles.secondaryButtonText}>Добавить ответ</Text>
                                      </Pressable>
                                    </>
                                  ) : null}
                                  {appealDetail.viewerCanWithdraw ? (
                                    pendingAppealWithdrawalId === appealDetail.appealId ? (
                                      <View style={styles.attendanceCard}>
                                        <Text style={styles.hint}>
                                          После отзыва повторно подать Appeal по этому Result нельзя.
                                        </Text>
                                        <Pressable
                                          accessibilityRole="button"
                                          disabled={actingResultKey !== null}
                                          onPress={() => void runAppealParticipantAction(appealDetail, 'withdraw')}
                                          style={({ pressed }) => [
                                            styles.dangerButton,
                                            actingResultKey !== null && styles.buttonDisabled,
                                            pressed && styles.buttonPressed,
                                          ]}
                                        >
                                          <Text style={styles.dangerButtonText}>Подтвердить отзыв Appeal</Text>
                                        </Pressable>
                                      </View>
                                    ) : (
                                      <Pressable
                                        accessibilityRole="button"
                                        onPress={() => setPendingAppealWithdrawalId(appealDetail.appealId)}
                                        style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}
                                      >
                                        <Text style={styles.dangerButtonText}>Отозвать Appeal</Text>
                                      </Pressable>
                                    )
                                  ) : null}
                                </View>
                              ) : null}
                              {officialResult.viewerCanAppeal ? (
                                <>
                                  {appealDraftResultId === officialResult.resultId ? (
                                    <View style={styles.attendanceList}>
                                      <TextInput
                                        accessibilityLabel="Причина Appeal"
                                        multiline
                                        onChangeText={setAppealStatement}
                                        placeholder="Кратко опишите, с чем вы не согласны"
                                        style={[styles.input, styles.appealInput]}
                                        value={appealStatement}
                                      />
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityState={{
                                          disabled: actingResultKey !== null || appealStatement.trim().length === 0,
                                        }}
                                        disabled={actingResultKey !== null || appealStatement.trim().length === 0}
                                        onPress={() => void runResultAction(officialResult, 'appeal')}
                                        style={({ pressed }) => [
                                          styles.dangerButton,
                                          (actingResultKey !== null || appealStatement.trim().length === 0)
                                            && styles.buttonDisabled,
                                          pressed && actingResultKey === null
                                            && appealStatement.trim().length > 0 && styles.buttonPressed,
                                        ]}
                                      >
                                        <Text style={styles.dangerButtonText}>Отправить Appeal в Central</Text>
                                      </Pressable>
                                    </View>
                                  ) : (
                                    <Pressable
                                      accessibilityRole="button"
                                      onPress={() => {
                                        setAppealDraftResultId(officialResult.resultId);
                                        setAppealStatement('');
                                      }}
                                      style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}
                                    >
                                      <Text style={styles.dangerButtonText}>Не согласен — подать Appeal</Text>
                                    </Pressable>
                                  )}
                                </>
                              ) : null}
                              {officialResult.viewerCanWaiveAppeal ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityState={{ disabled: actingResultKey !== null }}
                                  disabled={actingResultKey !== null}
                                  onPress={() => void runResultAction(officialResult, 'waive-appeal')}
                                  style={({ pressed }) => [
                                    styles.secondaryButton,
                                    actingResultKey !== null && styles.buttonDisabled,
                                    pressed && actingResultKey === null && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={styles.secondaryButtonText}>
                                    Согласен с результатом — разблокироваться
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ) : session.resultId ? (
                            <Text style={styles.hint}>Загружаем официальный Result…</Text>
                          ) : null}
                          {session.state === 'ENDED' ? (
                            <Text style={styles.hint}>
                              {session.purpose === 'OFFICIAL_CHALLENGE'
                                ? 'Session завершена. Теперь Coach должен подтвердить официальный результат.'
                                : 'В статистику вошли только спортсмены со статусом «Присутствовал» или «Опоздал».'}
                            </Text>
                          ) : null}
                          {session.state === 'CANCELLED' ? (
                            <Text style={styles.hint}>
                              Session закрыта без статистики и спортивных последствий.
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {communityContext ? (
                  <View style={styles.card}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.cardTitle}>
                      {activeTestAccount.role === 'Central'
                        ? 'Контекст пилотного Community'
                        : communityContext.community.name}
                    </Text>
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
                    <View style={styles.capabilityList}>
                      {communityContext.activeRoleGrants.some(
                        (grant) =>
                          grant.role === 'COACH' &&
                          grant.scopeType === 'COMMUNITY' &&
                          grant.scopeId === communityContext.community.communityId,
                      ) ? (
                        <View style={styles.capabilityRow}>
                          <Text style={styles.capabilityText}>Роль Coach</Text>
                          <Text style={styles.capabilityState}>Активна</Text>
                        </View>
                      ) : null}
                      {communityContext.activeRoleGrants.some(
                        (grant) =>
                          grant.role === 'GYM_ADMIN' &&
                          grant.scopeType === 'VENUE' &&
                          grant.scopeId === communityContext.venue.venueId,
                      ) ? (
                        <View style={styles.capabilityRow}>
                          <Text style={styles.capabilityText}>Роль Gym Admin</Text>
                          <Text style={styles.capabilityState}>Активна</Text>
                        </View>
                      ) : null}
                      {communityContext.access.capabilities.includes('RECORD_COMMUNITY_RESULT') ? (
                        <View style={styles.capabilityRow}>
                          <Text style={styles.capabilityText}>Подтверждение результатов</Text>
                          <Text style={styles.capabilityState}>Разрешено</Text>
                        </View>
                      ) : null}
                      {communityContext.activeRoleGrants.some(
                        (grant) =>
                          grant.role === 'PRIMARY_ADMIN' &&
                          grant.scopeType === 'VENUE' &&
                          grant.scopeId === communityContext.venue.venueId,
                      ) ? (
                        <View style={styles.capabilityRow}>
                          <Text style={styles.capabilityText}>Primary Admin</Text>
                          <Text style={styles.capabilityState}>Активен</Text>
                        </View>
                      ) : null}
                      {activeTestAccount.role === 'Athlete'
                        && communityContext.access.capabilities.includes('CREATE_OFFICIAL_CHALLENGE') ? (
                        <View style={styles.capabilityRow}>
                          <Text style={styles.capabilityText}>Official Challenge</Text>
                          <Text style={styles.capabilityState}>Доступен</Text>
                        </View>
                      ) : null}
                    </View>
                    {activeTestAccount.role === 'Athlete'
                      && !communityContext.access.capabilities.includes('CREATE_OFFICIAL_CHALLENGE') ? (
                      <Text style={styles.denial}>
                        {officialChallengeDenial
                          ? officialDenialLabels[officialChallengeDenial.code]
                          : 'Official Challenge сейчас недоступен.'}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.stateCard}>
                    <Text style={styles.muted}>Активное Community пока не подключено.</Text>
                  </View>
                )}
              </>
            ) : null}
          </>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadIdentity()} style={styles.retryButton}>
              <Text style={styles.retryText}>Повторить</Text>
            </Pressable>
          </View>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f6f4ef', flex: 1 },
  container: {
    alignSelf: 'center',
    boxSizing: 'border-box',
    gap: 18,
    maxWidth: 680,
    paddingHorizontal: 20,
    paddingVertical: 32,
    width: '100%',
  },
  eyebrow: { color: '#8b2f22', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  testAccountPanel: {
    backgroundColor: '#fff7e6',
    borderColor: '#dfc994',
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  testAccountHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  testAccountIdentity: { flex: 1, gap: 3 },
  testAccountLabel: { color: '#806218', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  testAccountName: { color: '#3f310c', fontSize: 15, fontWeight: '700' },
  testAccountButton: {
    alignItems: 'center',
    borderColor: '#8b2f22',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  testAccountButtonText: { color: '#8b2f22', fontSize: 14, fontWeight: '700' },
  testAccountList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  testAccountOption: {
    backgroundColor: '#ffffff',
    borderColor: '#ded9cf',
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 3,
    minHeight: 54,
    padding: 10,
  },
  testAccountOptionSelected: { borderColor: '#8b2f22', borderWidth: 2 },
  testAccountOptionName: { color: '#171512', fontSize: 13, fontWeight: '700' },
  testAccountOptionRole: { color: '#777168', fontSize: 12 },
  mainNavigation: {
    backgroundColor: '#e9e5dd',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  mainNavigationItem: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 8,
  },
  mainNavigationItemSelected: { backgroundColor: '#8b2f22' },
  mainNavigationText: { color: '#625d55', fontSize: 14, fontWeight: '700' },
  mainNavigationTextSelected: { color: '#ffffff' },
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
  hostConfirmationCard: {
    backgroundColor: '#faf9f6',
    borderColor: '#ded9cf',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  adminMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  adminMetric: {
    backgroundColor: '#faf9f6',
    borderColor: '#ded9cf',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    gap: 3,
    minWidth: 120,
    padding: 12,
  },
  adminMetricValue: { color: '#8b2f22', fontSize: 24, fontWeight: '800' },
  adminMetricLabel: { color: '#625d55', fontSize: 12, lineHeight: 17 },
  publicationKindTabs: {
    backgroundColor: '#e9e5dd',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  publicationKindTab: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  publicationKindTabSelected: { backgroundColor: '#ffffff' },
  publicationKindTabText: { color: '#625d55', fontSize: 13, fontWeight: '700' },
  publicationKindTabTextSelected: { color: '#8b2f22' },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formField: { flexBasis: '46%', flexGrow: 1, gap: 7, minWidth: 150 },
  choiceChip: {
    alignItems: 'center',
    borderColor: '#c9c3b9',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 13,
  },
  choiceChipSelected: { backgroundColor: '#8b2f22', borderColor: '#8b2f22' },
  choiceChipText: { color: '#625d55', fontSize: 13, fontWeight: '700' },
  choiceChipTextSelected: { color: '#ffffff' },
  adminScheduleItem: {
    backgroundColor: '#faf9f6',
    borderColor: '#ded9cf',
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  groupState: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f1e9',
    borderRadius: 999,
    color: '#285d35',
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  successCard: {
    backgroundColor: '#eef7ef',
    borderColor: '#b8d6bc',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  successText: { color: '#285d35', fontSize: 14, lineHeight: 20 },
  sessionState: {
    backgroundColor: '#e8f1e9',
    borderRadius: 999,
    color: '#285d35',
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  attendanceList: { gap: 8 },
  sessionConfirmation: {
    backgroundColor: '#fff7e6',
    borderColor: '#dfc994',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  sessionConfirmationDanger: {
    backgroundColor: '#fff3f1',
    borderColor: '#b84838',
  },
  confirmationTitle: { color: '#171512', fontSize: 15, fontWeight: '800' },
  confirmationDescription: { color: '#625d55', fontSize: 13, lineHeight: 19 },
  confirmationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  confirmationCancelButton: {
    alignItems: 'center',
    borderColor: '#8b2f22',
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  confirmationPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#8b2f22',
    borderRadius: 10,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  confirmationDangerButton: {
    alignItems: 'center',
    backgroundColor: '#9a3023',
    borderRadius: 10,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  confirmationButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  attendanceCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e0d7',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  attendanceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  attendanceButton: {
    alignItems: 'center',
    backgroundColor: '#8b2f22',
    borderRadius: 9,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  attendanceButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
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
  appealInput: { minHeight: 96, textAlignVertical: 'top' },
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
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#8b2f22',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: '#8b2f22', fontSize: 15, fontWeight: '700' },
  compactSecondaryButton: {
    alignItems: 'center',
    borderColor: '#8b2f22',
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#fff3f1',
    borderColor: '#b84838',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  dangerButtonText: { color: '#9a3023', fontSize: 15, fontWeight: '700' },
  compactDangerButton: {
    alignItems: 'center',
    backgroundColor: '#fff3f1',
    borderColor: '#b84838',
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
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
  cardTitle: { color: '#171512', fontSize: 18, fontWeight: '700' },
  venueName: { color: '#4c4943', fontSize: 16, fontWeight: '600' },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  muted: { color: '#777168', flexShrink: 1, fontSize: 14 },
  value: { color: '#171512', flexShrink: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#e8f1e9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: '#285d35', fontSize: 13, fontWeight: '600' },
  capabilityList: { gap: 8 },
  capabilityRow: {
    alignItems: 'center',
    backgroundColor: '#faf9f6',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  capabilityText: { color: '#4c4943', flex: 1, fontSize: 14 },
  capabilityState: { color: '#285d35', fontSize: 13, fontWeight: '700' },
  sportOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sportOption: {
    alignItems: 'center',
    borderColor: '#c9c3b9',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  sportOptionSelected: { backgroundColor: '#8b2f22', borderColor: '#8b2f22' },
  sportOptionText: { color: '#625d55', fontSize: 13, fontWeight: '600' },
  sportOptionTextSelected: { color: '#ffffff' },
  discoveryCard: {
    backgroundColor: '#faf9f6',
    borderColor: '#ded9cf',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  discoveryCardInterested: { borderColor: '#8b2f22', borderWidth: 2 },
  discoveryHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  discoveryIdentity: { flex: 1, gap: 3 },
  avatarPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#e9ddd7',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarText: { color: '#8b2f22', fontSize: 22, fontWeight: '800' },
  discoveryName: { color: '#171512', fontSize: 17, fontWeight: '700' },
  discoveryExperience: { color: '#4c4943', fontSize: 14, lineHeight: 20 },
  interestBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f4dfda',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  interestText: { color: '#7a261b', fontSize: 13, fontWeight: '700' },
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
});
