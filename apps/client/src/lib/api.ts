import type { ApiError } from '@molokh/contracts';
import { Platform } from 'react-native';

const defaultApiUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl).replace(/\/$/, '');
const defaultLocalToken =
  process.env.EXPO_PUBLIC_LOCAL_AUTH_TOKEN ?? 'molokh-local-athlete-token';

export interface LocalTestAccount {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly token: string;
  readonly startSection: 'DISCOVERY' | 'PROFILE' | 'COMMUNITY';
}

export const localTestAccounts: readonly LocalTestAccount[] = [
  { id: 'pilot-athlete', label: 'Пилотный Athlete', role: 'Athlete', token: defaultLocalToken, startSection: 'DISCOVERY' },
  { id: 'marina', label: 'Марина Ринг', role: 'Athlete', token: 'molokh-local-discovery-token', startSection: 'DISCOVERY' },
  { id: 'alexey', label: 'Алексей Темп', role: 'Athlete', token: 'molokh-local-discovery-two-token', startSection: 'DISCOVERY' },
  { id: 'irina', label: 'Ирина Сокол', role: 'Athlete', token: 'molokh-local-irina-token', startSection: 'DISCOVERY' },
  { id: 'dmitry', label: 'Дмитрий Раунд', role: 'Athlete', token: 'molokh-local-dmitry-token', startSection: 'DISCOVERY' },
  { id: 'olga', label: 'Ольга Вектор', role: 'Athlete', token: 'molokh-local-olga-token', startSection: 'DISCOVERY' },
  { id: 'timur', label: 'Тимур Стойка', role: 'Athlete', token: 'molokh-local-timur-token', startSection: 'DISCOVERY' },
  { id: 'anna', label: 'Анна Пульс', role: 'Athlete', token: 'molokh-local-anna-token', startSection: 'DISCOVERY' },
  { id: 'membership-applicant', label: 'Кирилл Старт', role: 'Athlete', token: 'molokh-local-applicant-token', startSection: 'COMMUNITY' },
  { id: 'coach', label: 'Пилотный тренер', role: 'Coach', token: 'molokh-local-coach-token', startSection: 'COMMUNITY' },
  { id: 'replacement-coach', label: 'Резервный тренер', role: 'Coach', token: 'molokh-local-replacement-coach-token', startSection: 'COMMUNITY' },
  { id: 'gym-admin', label: 'Пилотный администратор', role: 'Gym Admin', token: 'molokh-local-admin-token', startSection: 'COMMUNITY' },
  { id: 'central', label: 'Central Operator', role: 'Central', token: 'molokh-local-central-token', startSection: 'COMMUNITY' },
];

interface LocalTokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const localTokenStorageKey = 'molokh.local-test-token';

function tokenStorage(): LocalTokenStorage | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as { localStorage?: LocalTokenStorage }).localStorage ?? null;
}

export let localToken = tokenStorage()?.getItem(localTokenStorageKey) ?? defaultLocalToken;

export function setLocalToken(token: string, persist = true): void {
  localToken = token;
  if (persist) tokenStorage()?.setItem(localTokenStorageKey, token);
}

const localizedApiErrors: Readonly<Record<string, string>> = {
  VERSION_CONFLICT: 'Данные уже изменились. Обновите экран и попробуйте снова.',
  IDEMPOTENCY_KEY_REUSED: 'Операция уже была отправлена с другими данными.',
  MINIMUM_AGE_NOT_MET: 'Для аккаунта Molokh должно быть не меньше 14 лет.',
  IDENTITY_VALIDATION_ERROR: 'Проверьте данные профиля.',
  INVALID_STATE_TRANSITION: 'Это действие больше недоступно в текущем состоянии.',
  PERMISSION_DENIED: 'Это действие сейчас недоступно для вашего аккаунта.',
  ROLE_GRANT_PERMISSION_DENIED: 'У вас нет полномочий для этого действия.',
  ROLE_GRANT_VALIDATION_FAILED: 'Проверьте данные приглашения.',
  SCHEDULING_VALIDATION_ERROR: 'Проверьте выбранную тренировку.',
  ATHLETE_SCHEDULE_CONFLICT: 'У одного из спортсменов уже есть подтверждённая тренировка в это время. Выберите другой слот.',
  SESSION_NOT_READY: 'Session ещё не готова к этому действию.',
  ACCOUNT_NOT_VERIFIED: 'Для Official Challenge нужна верификация аккаунта.',
  MEMBERSHIP_NOT_ACTIVE: 'Для Official Challenge нужно активное участие в Community.',
  MATCH_REQUIRED: 'Официальный вызов можно отправить только из активного Match.',
  PAIR_MATRIX_DENIED: 'Эта пара не может создать такой Official Challenge.',
  PAIR_CHALLENGE_EXISTS: 'У этой пары уже есть активный Official Challenge.',
  PAIR_BLOCKED: 'Официальный вызов недоступен для заблокированной пары.',
  PAIR_COOLDOWN_ACTIVE: 'Между этой парой ещё действует спортивный cooldown.',
  COMPETITION_NOT_ACTIVE: 'Статусные действия временно приостановлены.',
  COMPETITION_PHASE_UNAVAILABLE: 'Сейчас идёт статусный Challenge. Дождитесь освобождения очереди.',
  ALREADY_STATUS_HOLDER: 'У вас уже есть спортивный статус в этом Community.',
  LIVE_QUEUE_ENTRY_EXISTS: 'Ваша заявка уже находится в статусной очереди.',
  QUEUE_ENTRY_NOT_FOUND: 'Заявка очереди не найдена.',
  QUEUE_ENTRY_INITIATOR_REQUIRED: 'Отозвать заявку может только её автор.',
  QUEUE_RECONFIRMATION_NOT_REQUIRED: 'Эта заявка больше не требует подтверждения.',
  QUEUE_RECONFIRMATION_EXPIRED: '24-часовой срок подтверждения уже истёк.',
  QUEUE_RECONFIRMATION_NOT_DUE: 'Срок подтверждения ещё не истёк.',
  QUEUE_ENTRY_NOT_WAITING: 'Эта заявка уже активирована или закрыта.',
  OPTIONAL_INVITATION_LIMIT: 'У вас уже три приглашения без ответа.',
  OPTIONAL_PAIR_QUIET: 'После отказа действует пауза 48 часов.',
  OFFICIAL_OBLIGATION_LIMIT: 'Один из участников уже связан другим принятым Challenge.',
  RULESET_ACK_REQUIRED: 'Подтвердите правила перед принятием Challenge.',
  CHALLENGE_RESPONSE_EXPIRED: 'Срок ответа на Challenge уже истёк.',
  CHALLENGE_NOT_ACCEPTED: 'Сначала оба участника должны принять Challenge.',
  CHALLENGE_BOOKING_NOT_PENDING: 'Выбор слота для этого Challenge уже изменился.',
  CHALLENGE_NOT_BOOKED: 'Official Challenge ещё не подтверждён залом.',
  CHALLENGE_NOT_IN_SESSION: 'Official Challenge ещё не начался или уже завершён.',
  CHALLENGE_SESSION_MISMATCH: 'Session не соответствует этому Official Challenge.',
  CHALLENGE_COMPETITIVE_SNAPSHOT_MISSING: 'Не удалось зафиксировать спортивные условия Session.',
  CHALLENGE_SCHEDULING_DEADLINE_REACHED: 'Срок выбора слота для Challenge истёк.',
  CHALLENGE_SCHEDULING_NOT_DUE: 'Срок выбора слота для Challenge ещё не истёк.',
  CHALLENGE_PARTICIPANT_REQUIRED: 'Выбирать слот могут только участники Challenge.',
  CHALLENGE_OBLIGATION_MISSING: 'Challenge временно недоступен: обязательство участника изменилось.',
  YOUTH_OFFICIAL_DISABLED: 'Youth Challenge пока выключен до утверждения пилотного процесса согласия.',
  YOUTH_CONSENT_REQUIRED: 'До принятия нужны независимые согласия представителей обоих Youth-спортсменов.',
  YOUTH_CONSENT_SUBJECT_REQUIRED: 'Запросить согласие может только Youth-участник этого Challenge.',
  YOUTH_CONSENT_INVALID_STATE: 'Это решение по согласию больше недоступно.',
  YOUTH_CONSENT_TOKEN_INVALID: 'Защищённая ссылка недействительна или устарела.',
  YOUTH_CONSENT_EXPIRED: 'Срок действия защищённой ссылки истёк.',
  YOUTH_CONSENT_SMS_OPT_IN_REQUIRED: 'Для SMS нужно отдельное добровольное согласие.',
  YOUTH_CONSENT_VALIDATION_FAILED: 'Проверьте данные представителя и подтверждение текста.',
  SESSION_NOT_IN_PROGRESS: 'Session сейчас не проводится.',
  SESSION_OPERATION_WINDOW_CLOSED: 'Операционное окно Session уже закрыто.',
  SAFETY_CASE_NOT_SUBMITTED: 'SafetyCase уже взят в работу или закрыт.',
  SAFETY_CASE_NOT_UNDER_REVIEW: 'Сначала возьмите SafetyCase в независимую проверку.',
  SAFETY_CASE_REVIEWER_CONFLICT: 'Выберите независимого Central reviewer без связи с Session или залом.',
  SAFETY_CASE_REVIEWER_MISMATCH: 'Решение может применить только назначенный reviewer.',
  SAFETY_CASE_REPLACEMENT_UNAVAILABLE: 'Выбранные Coach или зал больше недоступны. Обновите очередь.',
  COMPETITION_STATUS_REVIEW_HOLD: 'Session временно нельзя начать: Central рассматривает Membership статусного участника.',
  ATTENDANCE_ALREADY_RECORDED: 'Посещение этого спортсмена уже зафиксировано.',
  ATTENDANCE_INCOMPLETE: 'Сначала отметьте посещение обоих спортсменов.',
  APPEAL_NOT_SUBMITTED: 'Этот Appeal уже взят в работу или закрыт.',
  APPEAL_NOT_UNDER_REVIEW: 'Сначала возьмите Appeal в рассмотрение.',
  APPEAL_REVIEWER_CONFLICT: 'Reviewer не может быть участником или Coach этой Session.',
  APPEAL_REVIEWER_MISMATCH: 'Решение может принять только назначенный reviewer.',
  APPEAL_DECISION_INVALID: 'Выбранное решение неприменимо к этому исходу.',
  APPEAL_RESPONSE_WINDOW_CLOSED: '24-часовое окно ответа на Appeal уже закрыто.',
  APPEAL_RESPONSE_ACTOR_NOT_ELIGIBLE: 'Ответить может только оппонент или Coach этой Session.',
  APPEAL_RESPONSE_ALREADY_SUBMITTED: 'Ваша позиция уже добавлена к Appeal.',
  APPEAL_WITHDRAWAL_NOT_ALLOWED: 'Этот Appeal уже нельзя отозвать.',
  APPEAL_SLA_EXTENSION_NOT_ALLOWED: 'Продлить SLA может только назначенный reviewer.',
  APPEAL_SLA_ALREADY_EXTENDED: 'SLA этого Appeal уже продлён.',
  MISSING_RESULT_REVIEW_NOT_OPEN: 'Это разбирательство уже начато или закрыто.',
  MISSING_RESULT_REVIEW_NOT_UNDER_REVIEW: 'Сначала возьмите разбирательство в работу.',
  MISSING_RESULT_REVIEWER_CONFLICT: 'Central reviewer не может быть участником или Coach этой Session.',
  MISSING_RESULT_EVIDENCE_INCOMPLETE: 'Фактов пока недостаточно для этого действия.',
  MISSING_RESULT_REVIEWER_COACH_CONFLICT: 'Выберите другого авторизованного Coach без конфликта интересов.',
  MISSING_RESULT_OUTCOME_MISMATCH: 'Назначенный Coach может подтвердить только исход, установленный проверкой.',
  MISSING_RESULT_REPEAT_NOT_ALLOWED: 'Повтор нельзя назначить при согласованных и подтверждённых фактах.',
  INTEGRITY_RESULT_NOT_FINAL: 'Проверку можно открыть только для финального Result.',
  INTEGRITY_CASE_ALREADY_OPEN: 'По этому Result уже идёт проверка.',
  INTEGRITY_CASE_NOT_OPEN: 'Эта проверка уже взята в работу или закрыта.',
  INTEGRITY_CASE_NOT_UNDER_REVIEW: 'Сначала возьмите проверку в рассмотрение.',
  INTEGRITY_REVIEWER_CONFLICT: 'Reviewer не может быть участником или Coach исходной Session.',
  INTEGRITY_REVIEWER_MISMATCH: 'Решение может принять только назначенный reviewer.',
  INTEGRITY_DECISION_INVALID: 'Выбранное решение или исправленный исход неприменимы.',
  INTEGRITY_REPEAT_NOT_ALLOWED: 'Повторная Session сейчас невозможна; выберите аннулирование.',
  TECHNICAL_CORRECTION_RESULT_NOT_PROVISIONAL: 'Для финального Result нужна независимая Integrity-проверка Central.',
  TECHNICAL_CORRECTION_ALREADY_OPEN: 'По этому Result уже отправлен запрос на исправление.',
  TECHNICAL_CORRECTION_NO_CHANGE: 'Предложенный исход должен отличаться от записанного Result.',
  TECHNICAL_CORRECTION_CENTRAL_UNAVAILABLE: 'Central сейчас недоступен для приёма запроса.',
  TECHNICAL_CORRECTION_NOT_SUBMITTED: 'Запрос уже взят в работу или завершён.',
  TECHNICAL_CORRECTION_REVIEWER_CONFLICT: 'Reviewer не может быть участником, Coach или автором запроса.',
  TECHNICAL_CORRECTION_NOT_UNDER_REVIEW: 'Сначала возьмите запрос в рассмотрение.',
  TECHNICAL_CORRECTION_REVIEWER_MISMATCH: 'Отклонить запрос может только назначенный reviewer.',
  RESULT_METADATA_REVISION_WINDOW_CLOSED: '24-часовой срок исправления описания Result уже закончился.',
  RESULT_METADATA_REVISION_NO_CHANGE: 'Измените счёт или описание метода перед сохранением.',
  COMPETITION_INTEGRITY_HOLD: 'Статусные действия временно остановлены на время независимой проверки.',
  STATUS_RELEASE_SECURITY_HOLD: 'Отказ от статуса временно недоступен после смены номера.',
  PLATFORM_INCIDENT_CENTRAL_REQUIRED: 'Управлять Platform Incident может только Central.',
  PLATFORM_INCIDENT_INVALID_STATE: 'Состояние инцидента уже изменилось. Обновите список.',
  PLATFORM_INCIDENT_INVALID_WINDOW: 'Проверьте время начала и окончания инцидента.',
  PLATFORM_INCIDENT_REASON_REQUIRED: 'Укажите объективное основание решения.',
  PLATFORM_INCIDENT_DUPLICATE_ACTIVE_WINDOW: 'Такой инцидент уже подтверждён.',
  ACCOUNT_LIFECYCLE_USER_REQUIRED: 'Это действие доступно только владельцу аккаунта.',
  ACCOUNT_LIFECYCLE_CENTRAL_REQUIRED: 'Завершить закрытие аккаунта может только Central.',
  ACCOUNT_CLOSURE_INVALID_STATE: 'Запрос закрытия уже изменился. Обновите экран.',
  ACCOUNT_CLOSURE_RECOVERY_ACTIVE: '30-дневный срок восстановления ещё не закончился.',
  ACCOUNT_CLOSURE_RECOVERY_ENDED: 'Срок самостоятельной отмены закрытия уже закончился.',
  ACCOUNT_CLOSURE_ACTIVE_OBLIGATION: 'Сначала завершите активный Challenge.',
  ACCOUNT_CLOSURE_STATUS_HELD: 'Сначала освободите спортивный статус в Community.',
  ACCOUNT_CLOSURE_ACTIVE_SESSION: 'Сначала завершите подтверждённые Session.',
  ACCOUNT_CLOSURE_ACTIVE_MEMBERSHIP: 'Сначала выйдите из активной Community.',
  ACCOUNT_CLOSURE_ACTIVE_ROLE: 'Сначала передайте или завершите активные роли.',
  ACCOUNT_CLOSURE_ACTIVE_QUEUE_ENTRY: 'Сначала отзовите заявку из статусной очереди.',
  ACCOUNT_EXPORT_INVALID_STATE: 'Активный экспорт уже существует или больше недоступен.',
  ACCOUNT_EXPORT_NOT_DUE: 'Срок хранения экспорта ещё не закончился.',
  ACCOUNT_NOT_CLOSABLE: 'Этот аккаунт сейчас нельзя закрыть.',
  ACCOUNT_CLOSURE_SECURITY_HOLD: 'Закрытие временно недоступно после смены номера.',
  ACCOUNT_ACCESS_USER_OR_CENTRAL_REQUIRED: 'Запрос восстановления доступен только владельцу или Central.',
  ACCOUNT_ACCESS_CENTRAL_REQUIRED: 'Это решение может принять только Central.',
  ACCOUNT_ACCESS_ACCOUNT_NOT_ACTIVE: 'Закрытый аккаунт нельзя восстановить этим способом.',
  ACCOUNT_ACCESS_INVALID_STATE: 'Запрос восстановления уже изменился. Обновите экран.',
  ACCOUNT_ACCESS_LIVE_CASE_EXISTS: 'У вас уже есть активный запрос восстановления.',
  ACCOUNT_ACCESS_SIGNAL_REQUIRED: 'Нужен доступ к проверенному номеру или доверенной сессии.',
  ACCOUNT_ACCESS_PHONE_CHANGE_REQUIRED: 'Укажите новый номер телефона.',
  ACCOUNT_ACCESS_PHONE_UNCHANGED: 'Новый номер совпадает с текущим.',
  ACCOUNT_ACCESS_PHONE_IN_USE: 'Этот номер уже используется другим аккаунтом.',
  ACCOUNT_ACCESS_DUPLICATE_UNRESOLVED: 'Сначала Central должен завершить проверку дубликатов.',
  ACCOUNT_ACCESS_RISK_UNRESOLVED: 'Сначала Central должен завершить проверку безопасности.',
  ACCOUNT_ACCESS_HOLD_NOT_DUE: '24-часовая защита ещё действует.',
  ACCOUNT_ACCESS_REASON_REQUIRED: 'Укажите понятное основание длиной от 10 символов.',
  ACCOUNT_ACCESS_INCIDENT_INVALID: 'Проверьте точный интервал потери доступа.',
  ACCOUNT_ACCESS_AFFECTED_PROCESS_REQUIRED: 'Укажите затронутый Challenge или Session.',
  DUPLICATE_ACCOUNT_INVALID_STATE: 'Проверка дубликатов уже изменилась.',
  DUPLICATE_ACCOUNT_USERS_REQUIRED: 'Для проверки нужны минимум два разных аккаунта.',
  DUPLICATE_ACCOUNT_SIGNAL_REQUIRED: 'Добавьте ссылку на объективный сигнал.',
  DUPLICATE_ACCOUNT_CANONICAL_REQUIRED: 'Выберите действующий canonical User.',
  DUPLICATE_ACCOUNT_DISPOSITIONS_REQUIRED: 'Зафиксируйте решение по каждому статусу и обязательству.',
  DUPLICATE_ACCOUNT_DISPOSITION_INVALID: 'Состав затронутых процессов изменился. Обновите очередь.',
  COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED: 'Изменить состояние Community может только Central.',
  COMMUNITY_LIFECYCLE_INVALID_STATE: 'Состояние Community уже изменилось. Обновите экран.',
  COMMUNITY_LIFECYCLE_REASON_REQUIRED: 'Укажите краткую причину изменения состояния Community.',
  COMMUNITY_CLOSURE_EFFECTIVE_AT_INVALID: 'Для планового закрытия укажите будущие дату и время.',
  COMMUNITY_CLOSURE_SESSION_DISPOSITIONS_INVALID: 'Проверьте решение по каждой подтверждённой Official Session.',
  COMMUNITY_CLOSURE_NOT_DUE: 'Эффективная дата Closure Plan ещё не наступила.',
  COMMUNITY_CLOSURE_RETAINED_SESSION_UNRESOLVED: 'Сначала завершите сохранённые Session и связанные Result/Appeal.',
  MEMBERSHIP_ACCOUNT_NOT_ACTIVE: 'Вступление недоступно, пока аккаунт не активен.',
  MEMBERSHIP_COMMUNITY_NOT_ACTIVE: 'Community сейчас не принимает новые заявки.',
  MEMBERSHIP_RELATIONSHIP_EXISTS: 'У вас уже есть заявка или Membership в этой Community.',
  MEMBERSHIP_REAPPLY_NOT_DUE: 'Повторную заявку можно отправить после указанного срока.',
  MEMBERSHIP_INVITE_INVALID: 'QR или приглашение недействительно либо уже использовано.',
  MEMBERSHIP_AGE_CONTOUR_MISMATCH: 'Приглашение предназначено для другого возрастного контура.',
  MEMBERSHIP_NOT_PENDING: 'Эта заявка уже рассмотрена. Обновите список.',
  MEMBERSHIP_ADMIN_REQUIRED: 'Подтвердить Membership может только администратор этого зала.',
  MEMBERSHIP_REQUESTER_REQUIRED: 'Отозвать заявку может только подавший её спортсмен.',
  MEMBERSHIP_REJECTION_REASON_INVALID: 'Выберите корректную нейтральную причину отказа.',
  MEMBERSHIP_NOT_FOUND: 'Membership или заявка не найдены.',
  MEMBERSHIP_EXIT_ACCOUNT_NOT_ACTIVE: 'Выход недоступен, пока аккаунт не активен.',
  MEMBERSHIP_EXIT_MEMBERSHIP_NOT_ACTIVE: 'Активное Membership уже изменилось. Обновите экран.',
  MEMBERSHIP_EXIT_COMMUNITY_NOT_ACTIVE: 'Выход сейчас обрабатывается через lifecycle Community.',
  MEMBERSHIP_EXIT_COMPETITION_NOT_ACTIVE: 'Competition сейчас не принимает это действие.',
  MEMBERSHIP_EXIT_INTEGRITY_HOLD: 'Сначала должна завершиться независимая проверка спортивного статуса.',
  MEMBERSHIP_EXIT_ACTIVE_OBLIGATION: 'Этот активный Challenge нельзя закрыть через выход из Community.',
  MEMBERSHIP_EXIT_SESSION_ALREADY_STARTED: 'Session уже началась. Результат должен подтвердить Coach по зафиксированным правилам.',
  MEMBERSHIP_EXIT_LIVE_STATUS_PROCESS: 'Сначала ответьте на активный статусный Challenge или GENESIS-пару.',
  MEMBERSHIP_EXIT_NOT_PREVIEWED: 'Предпросмотр выхода уже использован или недоступен.',
  MEMBERSHIP_EXIT_PREVIEW_EXPIRED: '15-минутное подтверждение истекло. Запросите новый предпросмотр.',
  MEMBERSHIP_EXIT_TOKEN_INVALID: 'Подтверждение выхода устарело. Запросите новый предпросмотр.',
  MEMBERSHIP_EXIT_CONTEXT_CHANGED: 'Membership или спортивный статус изменились. Проверьте последствия ещё раз.',
  MEMBERSHIP_EXIT_SECURITY_HOLD: 'Выход временно недоступен после смены номера.',
  MEMBERSHIP_REMOVAL_NOT_FOUND: 'Запрос на удаление уже изменился или недоступен.',
  MEMBERSHIP_REMOVAL_MEMBERSHIP_NOT_ACTIVE: 'Активное Membership участника уже изменилось. Обновите экран.',
  MEMBERSHIP_REMOVAL_COMMUNITY_NOT_ACTIVE: 'Удаление сейчас обрабатывается через lifecycle Community.',
  MEMBERSHIP_REMOVAL_ADMIN_REQUIRED: 'Удалить участника может только администратор этого зала.',
  MEMBERSHIP_REMOVAL_CENTRAL_REQUIRED: 'Это решение может принять только Central.',
  MEMBERSHIP_REMOVAL_SELF_CONFLICT: 'Администратор не может удалить собственное Membership.',
  MEMBERSHIP_REMOVAL_REASON_REQUIRED: 'Укажите понятную причину длиной от 10 до 1000 символов.',
  MEMBERSHIP_REMOVAL_INVALID_STATE: 'Этот запрос уже рассмотрен или находится в другом состоянии.',
  MEMBERSHIP_REMOVAL_SUBJECT_REQUIRED: 'Подать Appeal может только удалённый участник.',
  MEMBERSHIP_REMOVAL_APPEAL_WINDOW_CLOSED: '48-часовое окно для Appeal уже закрыто.',
  MEMBERSHIP_REMOVAL_ALREADY_APPEALED: 'Appeal по этому удалению уже отправлен.',
  MEMBERSHIP_REMOVAL_CONTEXT_CHANGED: 'Membership или спортивный статус изменились. Обновите очередь и проверьте решение.',
  MEMBERSHIP_REMOVAL_STARTED_SESSION: 'Official Session уже началась или ожидает Result. Сначала Coach должен завершить её и подтвердить результат.',
  NO_SHOW_TOO_EARLY: 'Отметить неявку можно только после установленного залом времени ожидания.',
  CHAT_CLOSED: 'Этот чат уже закрыт.',
  CHAT_READ_ONLY: 'Этот чат доступен только для чтения.',
  MESSAGE_EDIT_WINDOW_CLOSED: 'Время для редактирования сообщения истекло.',
  MESSAGE_REPORTED: 'Сообщение уже передано команде Central.',
  REPORT_SELF_NOT_ALLOWED: 'Нельзя пожаловаться на собственное сообщение.',
  MESSAGE_ALREADY_REPORTED: 'Жалоба на это сообщение уже отправлена.',
  MESSAGE_ALREADY_HIDDEN: 'Сообщение уже удалено из вашей истории.',
  DISCOVERY_UNAVAILABLE: 'Discovery пока недоступен для текущего профиля.',
  MATCH_NOT_ACTIVE: 'Этот Match уже завершён.',
  INVALID_REQUEST: 'Не удалось обработать запрос. Проверьте данные и повторите попытку.',
  INTERNAL_ERROR: 'Сервис временно недоступен. Попробуйте ещё раз.',
};

export async function apiErrorMessage(response: Response): Promise<string> {
  try {
    const error = (await response.json()) as ApiError;
    const localized = localizedApiErrors[error.code];
    if (localized) return localized;
    if (response.status === 401) return 'Сессия истекла. Войдите снова.';
    if (response.status === 403) return 'Это действие сейчас недоступно.';
    if (response.status === 404) return 'Нужные данные не найдены.';
    if (response.status === 409) return 'Данные изменились. Обновите экран и попробуйте снова.';
    if (response.status === 422) return 'Проверьте введённые данные.';
    if (response.status >= 500) return 'Сервис временно недоступен. Попробуйте ещё раз.';
    return error.message;
  } catch {
    return response.status >= 500
      ? 'Сервис временно недоступен. Попробуйте ещё раз.'
      : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
  }
}
