# MOLOKH Domain Model

Этот документ задаёт логическую модель, aggregate boundaries и ограничения хранения. Он не является готовой физической SQL-схемой, но каждое поле с пометкой `required` должно иметь эквивалент в реализации.

## 1. Общие соглашения

- ID: UUIDv7.
- Время: UTC `timestamptz`; локальное отображение через `Venue.timezone`.
- Все mutable aggregate roots: `version integer`, `created_at`, `updated_at`.
- Критичные записи не удаляются физически; используются terminal state и audit event.
- `actor_id = null` допустим только для `SYSTEM` с обязательным `actor_type`.
- `reason_code` — versioned enum; `reason_text` дополняет, а не заменяет код.
- Пара Athlete нормализуется как `pair_low_id = min(a,b)`, `pair_high_id = max(a,b)`.
- Денормализованные projection fields всегда имеют `source_event_id`/`projection_version`.

## 2. Aggregate map

```text
User ── AthleteProfile ── AccountVerification
  │
  ├── Like ── Match ── Chat
  ├── CommunityMembership ── Community ── Venue
  │                               │
  │                               ├── RoleGrant / CoachMembership
  │                               └── Competition(YOUTH|ADULT)
  │                                      ├── StatusTenure
  │                                      ├── ChallengeQueueEntry
  │                                      └── Challenge
  │                                            ├── Booking ── Slot
  │                                            ├── Session ── Attendance
  │                                            └── Result ── Appeal
  └── Block / ModerationCase / Enforcement
```

Ссылки не означают одну транзакционную границу. Нельзя загружать весь граф как aggregate.

## 3. Identity и Social

### 3.1. `User` — aggregate root

| Поле | Тип | Правило |
|---|---|---|
| `id` | UUIDv7 | PK |
| `phone_e164` | string | required, unique после подтверждения |
| `phone_verified_at` | timestamp? | обычный Booking требует value |
| `birth_date` | date | required, sensitive, не публикуется |
| `age_division` | `YOUTH/ADULT` | projection от birth_date и server date |
| `display_name` | string | required; arbitrary Athlete-chosen public name, not legal identity |
| `avatar_asset_id` | UUID? | профиль; scan/moderation state required before publication |
| `account_state` | enum | `ACTIVE/RESTRICTED/CLOSED` |
| `discovery_paused` | bool | не влияет на обязательства |
| `locale` | string | UI/notifications |

Инварианты: возраст не менее 14; один подтверждённый телефон на один User; переход YOUTH→ADULT выполняется единственным idempotent job и создаёт `AgeDivisionChanged`. Started Youth Session продолжает frozen snapshot; не started Youth Official закрывается no-fault, guardian consent/queue завершаются, status tenure закрывается `AGE_TRANSITION`, Adult Membership остаётся/становится Ordinary без переноса status/FIFO.

`display_name` меняется владельцем немедленно без Central pre-approval и не меняет verification/badge. Публичная идентичность, Result и status history связываются со стабильным `user_id`; `DisplayNameAudit` append-only хранит старое/новое значение только для Central need-to-know. Опасный/незаконный контент обрабатывается через Report/Safety, не через обязательное предварительное согласование имени.

### 3.2. `AthleteProfile`

| Поле | Тип | Правило |
|---|---|---|
| `user_id` | UUID | PK/FK User |
| `primary_sport` | code | required |
| `secondary_sport` | code? | optional |
| `weight_kg` | decimal? | private/preference input |
| `experience_text` | string? | описательное |
| `home_venue_id` | UUID? | Discovery/Slot priority only |
| `primary_community_id` | UUID? | future multi-Community Home/Discovery selector; active Membership required |
| `discovery_radius_km` | integer | soft first-pass radius |
| `preference_json` | jsonb | versioned, не eligibility gate |
| `stats_schema_version` | integer | расширяемая статистика |

### 3.3. `AccountVerification`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `user_id` | UUID | один current verification на User |
| `state` | enum | см. state machine |
| `method` | code | `CENTRAL_MODERATION` in MVP; external no-storage provider reserved for future |
| `moderation_checklist_version` | string | Central profile/phone/duplicate review; no document evidence |
| `evidence_ref` | opaque? | NULL in MVP; reserved for a future no-storage provider integration |
| `verified_at`, `expires_at` | timestamp? | `expires_at=NULL` in MVP; future policy only |
| `decided_by` | UUID? | Central moderator in MVP |
| `decision_reason` | code? | audit |

`ACCOUNT_VERIFIED` — derived capability, не роль. В MVP `method=CENTRAL_MODERATION`; document upload/storage отсутствует, `expires_at=null`, пока fraud/duplicate/material-data review не создаст revoke/reverification workflow.

### 3.4. Account access and duplicate identity

Before Social records, Identity also owns two governed support records:

- `AccountAccessCase`: User, request/trusted-session/phone-change signals, `state=PENDING/SECURITY_HOLD/COMPLETED/REJECTED`, Central actor, confirmed-access-incident flag, 24h `sensitive_hold_until` and affected deadline references. No identity document/blob is accepted. Obligations remain linked to the same User; a trusted old session during hold may execute only service responses required by existing obligations.
- `DuplicateAccountCase`: suspected User IDs, signal references, `state=UNDER_REVIEW/CLEARED/RESOLVED`, canonical User ID, duplicate User IDs, private alias relation, per-obligation/status disposition and reviewer. It never rewrites/deletes immutable history or transfers status merely by choosing canonical account.

### 3.5. `Like`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `from_user_id`, `to_user_id` | UUID | directed |
| `state` | enum | `ACTIVE/MATCHED/EXPIRED/WITHDRAWN/REMOVED_BY_SKIP` |
| `expires_at` | timestamp | created + 30d |
| `source` | enum | только `DISCOVERY` в MVP |

Partial unique: одна `ACTIVE` Like на directed pair. При встречной Like обе записи и Match создаются атомарно.

### 3.6. `Match`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `pair_low_id`, `pair_high_id` | UUID | unique pair while ACTIVE/ARCHIVED |
| `state` | enum | `ACTIVE/ARCHIVED/UNMATCHED/BLOCKED` |
| `chat_id` | UUID | one service container |
| `last_activity_at` | timestamp | archive timer |
| `unmatched_by`, `unmatched_at` | UUID/timestamp? | audit |
| `rediscovery_after` | timestamp? | 15d after unmatch |

Match не владеет Booking/Challenge через FK cascade. Domain handler Unmatch/Block закрывает только незавершённые Match-based optional Challenge, GroupPlan и Slot request no-fault; accepted obligation сохраняется, как и статусный FIFO/mandatory path.

### 3.7. `Chat` и `ChatMessage`

`Chat` имеет `scope = PERSONAL_MATCH | CHALLENGE_SERVICE`, участников и projection state `OPEN/ARCHIVED/READ_ONLY/CLOSED`. Personal chat может быть закрыт Block; service chat запрещает свободный текст при Block, но принимает action cards.

`ChatMessage` хранит sender, `payload_type=PERSONAL_TEXT|SERVICE|ACTION`, `current_revision_id`, created_at, reported_at и moderation state. Только `PERSONAL_TEXT` можно редактировать в течение 15 минут; каждая версия — append-only `ChatMessageRevision`, а UI показывает признак изменения. `ChatMessageUserVisibility(message_id,user_id,hidden_at)` реализует «удалить у себя» без изменения чужой копии. Report атомарно фиксирует message/revisions в Case evidence и запрещает дальнейшее редактирование. Глобальное скрытие выполняет только Central по решению Case; originals остаются в audit/Case retention.

### 3.8. `Block`

Directed record `(blocker, blocked)` со state `ACTIVE/REVOKED`, reason optional. Эффективный pair block существует, если активна хотя бы одна сторона. Он запрещает новые Like/Match/Training/Match-based optional Challenge pair actions. До acceptance закрываются Match-based social intents no-fault; уже принятое обязательство и статусный FIFO/mandatory path сохраняются через structured service UI. Если social source имел WAITING status-bearing conversion entry, source detaches while the FIFO key is preserved.

### 3.9. `DiscoveryPairSuppression`

Хранит pair, reason `SKIP/UNMATCH`, `state=ACTIVE/EXPIRED`, `until_at`. Не является punishment или reliability data.

### 3.10. `DiscoveryCandidateProjection`

Rebuildable read model, не source of truth. Для `(viewer_user_id, candidate_user_id)` хранит hard-gate reasons, inbound-like flag, within-radius tier, city, sport/preference overlap features, distance, bounded recent-activity/response features, `ranking_config_version` и deterministic tie-break. Reliability/disciplinary score отсутствует. После исчерпания `within_radius=true` query переключается на тот же city с `within_radius=false`.

## 4. Venue, Community и роли

### 4.1. `Venue`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `legal_name`, `display_name` | UUID/string | required |
| `address`, `city_id`, `geo_point` | value | география |
| `timezone` | IANA string | required |
| `state` | enum | `PENDING_VERIFICATION/ACTIVE/PAUSED/CLOSED` |
| `minimum_booking_notice_hours` | int | current projection from active Venue configuration, 8..48 |
| `slot_publish_horizon_days` | int | max 30 MVP |
| `contact_payload` | jsonb | current projection from active Venue configuration for Group Plan UI |
| `configuration_version_id` | UUID | active immutable Venue configuration |

### 4.2. `Community`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `venue_id` | UUID | MVP unique active Community per physical Venue |
| `name` | string | required |
| `state` | enum | `ACTIVE/PAUSED/CLOSING/CLOSED` |
| `pause_started_at` | timestamp? | deadline compensation |
| `configuration_id` | UUID | versioned policy |
| `created_by_central_id` | UUID | required |

Community владеет двумя Competition: YOUTH и ADULT. Future discipline добавляется новым dimension, не меняя исторические IDs.

### 4.3. `CommunityMembership`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `community_id`, `user_id` | UUID | unique current relationship |
| `age_division` | enum | snapshot/current contour |
| `state` | enum | см. Membership state machine |
| `competition_enabled` | bool | только один TRUE+ACTIVE на User в MVP |
| `join_path` | `QR/INVITE/SELF_REQUEST` | activation policy |
| `requested_at`, `decided_at` | timestamp? | SLA |
| `decided_by`, `reason_code` | UUID/code? | audit |
| `public_rejection_reason_code` | neutral code? | visible only to applicant; never public profile |
| `internal_case_ref`, `reapply_not_before_at` | opaque?/timestamp? | Safety context need-to-know; self-request wait +7d |
| `left_at`, `removed_at` | timestamp? | terminal history |

Membership не равна Home Venue. Partial unique index: один `(user_id)` where `state='ACTIVE' and competition_enabled=true` under MVP feature policy.

### 4.4. `RoleGrant`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `user_id` | UUID | grantee |
| `role` | `PRIMARY_ADMIN/GYM_ADMIN/COACH/CENTRAL_*` | additive; one active PRIMARY_ADMIN per Venue |
| `scope_type`, `scope_id` | enum/UUID | Venue, Community, Session или GLOBAL |
| `state` | `PENDING/ACTIVE/DECLINED/REVOKED/EXPIRED` | current capability |
| `authorized_by`, `authorized_at` | UUID/timestamp | required on ACTIVE |
| `expires_at` | timestamp? | Guest Coach mandatory |

`CoachMembership` — специализированное представление active Coach grant в Community. Guest Coach scope — ровно `SESSION`. `PRIMARY_ADMIN` имеет те же everyday operational permissions, что `GYM_ADMIN`; это accountable ownership marker, а не скрытая возможность менять status. Назначает/передаёт Primary только Central, атомарно оставляя ровно одного владельца.

### 4.5. `CommunityConfiguration` and `VenueConfiguration`

- `CommunityConfiguration` — immutable version соревновательной политики: Pair Cooldown 7–30d (default 15), no-show grace 5–30m (default 15), ruleset, `ruleset_ack_mode=IMPLICIT_ON_ACCEPT|EXPLICIT_ACK_REQUIRED` и future competition overrides. Explicit mode требует Central approval.
- `VenueConfiguration` — immutable version операционных данных зала: minimum booking notice 8–48h, Slot presentation/publication data и контакты для Group Plan.
- Gym Admin создаёт новую version только внутри Central ranges. Обе effective versions публичны до принятия обязательства и не меняют уже созданные Challenge/Booking/Session snapshots. Appeal/response/reschedule/scheduling/GENESIS/FIFO timers не делегируются в MVP.

`CommunityClosurePlan` — versioned Central record: Community, reason/category, emergency flag, `effective_at`, notification timestamp, immutable list/disposition of confirmed Sessions, new-action cutoff, completion audit and reviewer. It never migrates Competition/status to another Venue. Same-gym relocation updates Venue address/geo instead of invoking closure.

## 5. Competition и статус

### 5.1. `Competition` — aggregate root

| Поле | Тип | Правило |
|---|---|---|
| `id`, `community_id` | UUID | unique с dimensions |
| `age_division` | `YOUTH/ADULT` | required |
| `discipline_key` | string? | NULL в MVP, reserved |
| `phase` | enum | state machine |
| `availability` | `ACTIVE/PAUSED/CLOSED` | отдельная ось от phase |
| `champion_user_id` | UUID? | projection, max one |
| `contender_user_id` | UUID? | projection, max one, != champion |
| `status_version` | integer | monotonic |
| `status_lock_result_id` | UUID? | provisional transition lock |

`champion_user_id` и `contender_user_id` должны совпадать с replay `CompetitionEvent` на `status_version`.

Future scope key is `(community_id, age_division, discipline_key)`. StatusTenure, QueueEntry, PairCooldown and scoped stats never cross this key. Multiple Membership and non-null discipline are feature-flagged off in MVP; the global active `ChallengeParticipantObligation` uniqueness remains cross-scope.

### 5.2. `CompetitionEvent`

Append-only event journal с `sequence_no` unique per Competition, event name, schema version, actor, causation/correlation IDs, payload, recorded_at. Запись и projection update происходят в одной транзакции.

### 5.3. `StatusTenure`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `competition_id`, `user_id` | UUID | tenure identity |
| `status` | `CHAMPION/CONTENDER` | no Ordinary row required |
| `started_at`, `ended_at` | timestamp/? | interval |
| `started_by_event_id`, `ended_by_event_id` | UUID/? | immutable lineage |
| `end_reason_code` | code? | includes `COMMUNITY_CLOSED`; no implied Result/W/L |
| `provisional` | bool | true until Result final |
| `compensates_tenure_id` | UUID? | rollback lineage |

Exclusion constraint запрещает пересекающиеся effective tenures одного status в Competition.

`VoluntaryStatusRelease` stores status holder, Competition/status version, two-step preview/confirmation, no-active-obligation proof and resulting ST-09/ST-10 event. It leaves Membership ACTIVE and Athlete Ordinary, creates no Result/loss/Cooldown and accepts no medical documents. Membership exit remains a separate resignation mode.

### 5.4. `ChallengeQueueEntry`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `competition_id` | UUID | queue scope |
| `kind` | enum | `DEFENSE_REQUEST/CHAMPION_TITLE_OFFER/CONTENDER_TITLE_INTENT/PREBOOKED_CONVERSION/GENESIS_CANDIDATE` |
| `initiator_user_id` | UUID | one live entry per Athlete/scope |
| `target_status` | enum | normally CONTENDER slot |
| `submitted_at` | server timestamp | primary FIFO key |
| `state` | enum | state machine |
| `bound_holder_user_id` | UUID? | current holder shown/confirmed |
| `reconfirm_deadline_at` | timestamp? | 24h on holder change |
| `activated_at`, `response_deadline_at` | timestamp? | timer begins only at activation |
| `challenge_id` | UUID? | after activation |
| `source_booking_id`, `source_group_plan_id` | UUID? | prebooked conversion; source remains non-official while waiting |
| `genesis_pair_id`, `genesis_accepted_at` | UUID?/timestamp? | explicit GENESIS pair and this candidate's response |

`GENESIS_CANDIDATE` создаётся только явным действием «Бороться за статус» и не имеет скрытого expiry, пока entry eligible. Первые два FIFO переходят в `PAIRED_PENDING_ACCEPTANCE` на 48 часов. Если один decline/expire, его entry закрывается, а второй возвращается в `WAITING` с прежними `submitted_at/id`; собственный withdraw no-fault, повторная подача получает новый FIFO key.

### 5.5. `Challenge` — aggregate root

| Поле | Тип | Правило |
|---|---|---|
| `id`, `competition_id` | UUID | official context |
| `athlete_a_id`, `athlete_b_id`, `pair_key` | UUID/value | distinct pair |
| `initiator_user_id` | UUID | audit |
| `planned_type` | `OPEN/CONTENDER/TITLE/GENESIS` | intent, not final stakes |
| `response_policy` | `OPTIONAL/MANDATORY/MUTUAL_GENESIS` | frozen at activation |
| `ruleset_snapshot_id`, `ruleset_ack_mode` | UUID/enum | frozen before acceptance; no status-algebra effect |
| `state` | enum | state machine |
| `accepted_at` | timestamp? | obligation boundary |
| `response_deadline_at` | timestamp? | optional/mandatory policy |
| `response_reminder_at` | timestamp[] | OPTIONAL/GENESIS: +12h/+24h; MANDATORY: +48h |
| `scheduling_deadline_at` | timestamp? | accepted +14d + pauses/extensions |
| `extension_count` | int | 0..1 normal path |
| `user_reschedule_count` | int | 0..2 |
| `cycle_no` | int | +1 after repeat |
| `active_booking_id`, `current_session_id` | UUID? | one current path |
| `queue_entry_id`, `source_group_plan_id`, `source_match_id` | UUID? | lineage |
| `terminal_reason` | code? | required terminal |

Partial unique on `pair_key` for live states. `ChallengeParticipantObligation(challenge_id,user_id,state)` materializes each accepted/uncompleted participant obligation; partial unique on `user_id` where state is active enforces one Official obligation per Athlete. AWAITING_RESPONSE optional invitations and WAITING queue entries do not create this row. `ChallengeReschedule` child records initiator, fault attribution `A/B/MUTUAL/EXTERNAL`, reason, time and linked Booking.

`RulesetAcknowledgment(challenge_id,user_id,ruleset_snapshot_id,mode,acknowledged_at,source_event_id)` хранится для обоих Athlete. У инициатора он создаётся с user-driven Challenge creation, у получателя — с acceptance; для system-created GENESIS каждый подтверждает самостоятельно. `EXPLICIT_ACK_REQUIRED` требует checkbox proof. Ruleset change never mutates existing records.

`OptionalInvitationThrottle` is a rebuildable projection keyed by initiator and pair: unanswered outgoing count max 3, one live optional invitation per pair, and `decline_quiet_until=declined_at+48h`. Expiry creates no additional quiet time; withdraw/accept/terminal state decrements unanswered count. It is private operational state, never profile/reliability data, and excludes FIFO/mandatory/status paths.

### 5.6. `PairCooldown`

Projection keyed by `(competition_id, pair_key)` with `starts_at`, `ends_at`, `source_result_id`, state `ACTIVE/REMOVED/EXPIRED`. It does not prevent either Athlete competing with others.

### 5.7. `ProcessHold`

Reusable overlay, не замена lifecycle state:

| Поле | Тип | Правило |
|---|---|---|
| `id`, `aggregate_type`, `aggregate_id` | value | Challenge/Membership/Competition |
| `reason` | `COMMUNITY_PAUSE/SAFETY/STATUS_REVIEW/SYSTEM_OUTAGE/ACCOUNT_ACCESS/DUPLICATE_ACCOUNT/CENTRAL` | scoped |
| `state` | `ACTIVE/RELEASED` | max one active per reason |
| `started_at`, `released_at` | timestamp/? | duration |
| `deadline_policy` | `PAUSE/CONTINUE` | explicit |
| `created_by`, `released_by` | actor | audit |

Команды, не разрешённые hold policy, получают `PROCESS_ON_HOLD`; base state не меняется.

## 6. Scheduling и Session

### 6.1. `Slot` — aggregate root

| Поле | Тип | Правило |
|---|---|---|
| `id`, `venue_id`, `coach_user_id` | UUID | required |
| `start_at`, `end_at` | timestamp | valid interval, horizon ≤30d |
| `slot_type` | `PERSONAL/GROUP_REFERENCE` | personal is bookable MVP |
| `state` | enum | state machine |
| `price_amount`, `price_currency` | decimal?/ISO code? | optional structured display; payment external |
| `price_text`, `cancellation_terms_text` | string? | short Venue-provided display before mutual confirmation |
| `commercial_version` | integer | increments when price/terms change; active selection is invalidated |
| `booking_id` | UUID? | set only at final confirm |

DB exclusion constraints: no overlap for active/published/booked Slot per Coach; Venue capacity constraint is future unless `resource_key` configured. Confirmed Booking/Session также не может пересекаться по времени для одного Athlete (`ASSUMPTION` A-15).

### 6.2. `Booking` — aggregate root

| Поле | Тип | Правило |
|---|---|---|
| `id`, `slot_id` | UUID | one confirmed Booking per Slot |
| `purpose` | `TRAINING/OFFICIAL_CHALLENGE` | required |
| `athlete_a_id`, `athlete_b_id` | UUID | B nullable only confirmed solo |
| `selected_by_a_at`, `selected_by_b_at` | timestamp? | parallel selection |
| `selection_expires_at` | timestamp | earliest single selection +1h |
| `state` | enum | включает `OFFICIAL_CONVERSION_PENDING`; см. Booking state machine |
| `host_confirmed_by`, `host_confirmed_at` | UUID/timestamp? | Coach or Venue Admin |
| `commercial_terms_snapshot` | jsonb | immutable Slot price/currency/terms captured at mutual selection |
| `coach_replaced_at`, `coach_replaced_by` | timestamp?/UUID? | latest equivalent replacement audit; original kept in history |
| `challenge_id`, `match_id` | UUID? | context |
| `cancel_reason`, `cancel_actor` | code/UUID? | terminal audit |

До `CONFIRMED` Booking не владеет Slot. Финальный host confirm выполняет resource claims и создаёт/обновляет Session атомарно.

`BookingConversionConfirmation` хранит required actor (`ATHLETE_A/ATHLETE_B/COACH`), actor user ID, decision, timestamp и policy version. Training→Official меняет `purpose` только до Session start и создаёт Challenge/competitive link атомарно; отказ оставляет исходный Training Booking.

`BookingTrainingRetentionConfirmation` используется после no-fault снятия Official context: оба Athlete и Coach/host отвечают до `min(1h,start)`. Только полный набор confirmations атомарно меняет `purpose`/Session type на `TRAINING`; decline/expiry отменяет Booking. Challenge lineage сохраняется для audit, но не имеет Competition effect.

`BookingCoachReplacement` is append-only: old/new Coach, Admin actor, authorization/conflict checks, invariant Venue/time/commercial/ruleset hashes and notification IDs. Equivalent replacement does not reopen confirmation. Either Athlete may request an external no-fault reschedule before start; changed material hash must use the normal mutual reconfirmation flow.

### 6.3. `GroupOffering`

Manual Venue-owned record: `id`, `venue_id`, sport/class label, `start_at/end_at`, optional Coach display/reference, optional price text, external info URL, contact projection, `state=PUBLISHED/WITHDRAWN/EXPIRED`, `updated_at`, author and version. Gym Admin owns accuracy; Molokh shows freshness and «уточните наличие мест у зала», does not reserve capacity, and expires the record at `start_at`. CRM/feed source is reserved but disabled in MVP.

### 6.4. `GroupPlan`

Содержит pair, proposer, `group_offering_ref`, immutable offering/Venue/contact snapshot, start_at, обоих confirmations, state, notification event и optional converted Challenge/Session IDs. Никогда не создаёт attendance или profile stats самостоятельно.

### 6.5. `Session` — aggregate root

| Поле | Тип | Правило |
|---|---|---|
| `id`, `booking_id` | UUID | booking optional only for group conversion/admin case |
| `session_type` | `TRAINING/OFFICIAL_CHALLENGE` | mutable only before start through conversion |
| `challenge_id` | UUID? | required if official |
| `athlete_a_id`, `athlete_b_id` | UUID | B optional for solo training only |
| `coach_user_id`, `venue_id` | UUID | always required |
| `scheduled_start_at`, `scheduled_end_at` | timestamp | required |
| `actual_start_at`, `actual_end_at` | timestamp? | fact |
| `state` | enum | `SCHEDULED/READY_FOR_COACH/IN_PROGRESS/ENDED/CANCELLED` |
| `window_opened_at` | timestamp? | logical scheduled boundary; not proof of attendance |
| `competitive_snapshot_id` | UUID? | created exactly once when official window opens |

Pre-start Coach replacement updates Booking and Session atomically and appends `SessionCoachAssignmentRevision`; after Session start the frozen arbiter identity is not replaced by this operational command.

### 6.6. `SessionCompetitiveSnapshot`

Immutable fields: Competition/version, participant IDs, each participant role at scheduled window boundary, stake `NONE/CONTENDER/TITLE/GENESIS_CHAMPION/GENESIS_CONTENDER`, champion/contender before state, Community config version, ruleset reference and window-open event ID. It freezes competitive context but does not assert actual attendance/start. Status Engine никогда не пересчитывает stakes из текущих ролей после открытия window.

### 6.7. `Attendance`

Unique `(session_id, athlete_id)`: `PRESENT/LATE/NO_SHOW`, arrival timestamp, recorded_by Coach, recorded_at, reason/comment. Athlete не является actor этой команды. `LATE` не определяет спортивный outcome: если Session состоялась, Result обычный. `NO_SHOW` допустим только после configured grace и только если отсутствие объективно сорвало Session; отсутствие обоих нормализуется в NO_CONTEST. Для обычной Training NO_SHOW — только attendance fact.

## 7. Result и Appeal

### 7.1. `Result` — aggregate root

| Поле | Тип | Правило |
|---|---|---|
| `id`, `challenge_id` | UUID | Challenge required; one effective Result per cycle/context |
| `session_id` | UUID? | required for `origin=SESSION`, null for pre-Session administrative Forfeit |
| `origin` | `SESSION/ADMINISTRATIVE_FORFEIT` | distinguishes physical and obligation-breach outcomes |
| `competitive_context_snapshot_id` | UUID | Session snapshot or administrative obligation snapshot |
| `state` | enum | state machine |
| `recorded_outcome_code` | enum | immutable original |
| `winner_user_id`, `loser_user_id` | UUID? | required for decisive outcome |
| `reason_code`, `comment` | value | required FORFEIT/NO_SHOW/NO_CONTEST |
| `method_code`, `method_text` | code/text? | ruleset-defined; may describe injury/withdrawal without medical document |
| `score_payload`, `method_payload` | jsonb? | descriptive only |
| `actual_time`, `venue_id`, `coach_user_id` | value | required snapshot |
| `recorded_by`, `recorded_at` | actor/time | authorized Coach/System for synthetic forfeit |
| `effective_outcome_projection` | value | derived from decisions, not source truth |
| `appeal_deadline_at` | timestamp | recorded +48h |
| `pre_status_snapshot` | jsonb | exact projection before provisional apply |
| `status_transition_event_id` | UUID? | lineage |

Metadata revisions are append-only `ResultMetadataRevision`; winner/outcome correction is `ResultDecision`, never an overwrite.

### 7.1.1. `CompetitiveContextSnapshot`

Общий immutable contract для Status Engine. При `origin=SESSION` он ссылается на `SessionCompetitiveSnapshot`. При pre-Session Forfeit он фиксирует Competition/version, участников, holder roles, stake, response/accepted obligation, Community config и точное событие нарушения. Administrative snapshot не создаёт ложную attendance или завершённую физическую Session.

### 7.2. `Appeal`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `result_id`, `appellant_user_id` | UUID | max one submitted history per eligible Athlete/result |
| `state` | enum | state machine |
| `reason_code`, `statement`, `evidence_refs` | value | required reason |
| `submitted_at`, `response_deadline_at` | timestamp | response +24h |
| `assigned_reviewer_id` | UUID? | Central |
| `decision` | `UPHOLD/REVERSE/ANNUL/REPEAT` | terminal decision |
| `decision_reason`, `decided_at` | value/time | required |
| `sla_due_at`, `extended_due_at` | timestamp? | 72h, transparent extension |

Responses from opponent/Coach are append-only `AppealResponse`; отсутствие response не блокирует решение.

### 7.3. `AppealWaiver`

Unique `(result_id, user_id)`, actor must equal user, timestamp, reason context. Result finalizes early только когда все currently eligible appellants либо waived/withdrawn, либо окно истекло.

### 7.4. `TechnicalCorrectionRequest`

Coach/Central workflow для winner/outcome change или исправления после 24h. Содержит `state=SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED/WITHDRAWN`, old/new proposal, evidence, decision и creates compensating ResultDecision on approval.

### 7.5. `MissingResultReview`

Case opened automatically when an Official Challenge remains `RESULT_PENDING` for 24h. Stores Session/Challenge, original Coach, separate Athlete statements, Venue attendance confirmation, evidence references, Central reviewer, assigned session-scoped reviewer-Coach, resolution `RESULT_CONFIRMED/REPEAT_ORDERED/NO_CONTEST`, and operational follow-up reference for Coach nonresponse. Central coordinates evidence but cannot author winner/outcome. Consistent statements + Venue confirmation permit reviewer-Coach Result; dispute/insufficient evidence orders no-fault repeat; objectively impossible repeat permits reviewer-Coach `NO_CONTEST`.

### 7.6. `IntegrityCase`

Central-only exceptional review of an already Final Result. Stores category `FRAUD/SYSTEM_ERROR/IDENTITY_ERROR`, immutable source Result/Competition versions, private evidence refs, independent reviewer, status/queue hold, public neutral reason category and disposition `UPHOLD/CORRECT/ANNUL/REPEAT`. It never reopens the ordinary Appeal or overwrites the source. Any effective change creates ResultDecision/Competition compensations and deterministic replay.

## 8. Governance

### 8.1. `ModerationCase`

| Поле | Тип | Правило |
|---|---|---|
| `id`, `case_type` | UUID/enum | `REPORT/SAFETY/MEMBERSHIP_REMOVAL/IDENTITY/ACCOUNT_ACCESS/DUPLICATE_ACCOUNT/INTEGRITY/OPERATIONAL/ROLE` |
| `reporter_user_id`, `subject_user_id` | UUID | reporter hidden from subject |
| `challenge_id`, `session_id`, `community_id` | UUID? | case scope |
| `state` | enum | state machine |
| `severity`, `reason_code`, `statement` | value | required |
| `initial_due_at`, `final_due_at` | timestamp? | Safety 24/48h |
| `assigned_reviewer_id` | UUID? | accused cannot decide |
| `decision`, `decision_reason` | value? | terminal |

### 8.2. `Enforcement`

Scoped restriction with type `PAIR_CONTACT/SESSION_HOLD/ROLE_SUSPENSION/ACCOUNT_RESTRICTION`, state `ACTIVE/MODIFIED/REVOKED/EXPIRED`, effective interval, source_case_id, actor, reason. Serious account restriction starts immediately; linked status is marked UNDER_REVIEW by hold, not transferred automatically.

### 8.3. `MembershipRemovalDecision`

Ordinary removal may be executed by Gym Admin with reason, subject to 48h appeal. Champion/Contender removal first creates UNDER_REVIEW and requires Central final decision. Successful restoration never resurrects cancelled Challenge automatically.

### 8.4. `YouthChallengeConsent`

Per Challenge and per Youth Athlete: guardian display name, declared relationship, normalized e-mail or optional SMS contact reference, OTP/link verification method, state `PENDING/GRANTED/DECLINED/REVOKED/EXPIRED`, consented_at, policy version and audit hash. Required before acceptance/Booking confirmation. No guardian account or identity document is requested/stored. Revocation before Session start closes Official no-fault; an already physical Booking may be explicitly retained as Training.

### 8.5. `EvidenceAttachment` and `EvidenceDisclosure`

`EvidenceAttachment` exists only for Appeal/Safety Case, never Result. It stores submitter/scope, object reference, detected MIME, size/duration, checksum, encryption key reference, scan/moderation state, retention deadline and deletion marker. Per scope: max 5 files, aggregate ≤100MB; allowlisted image and short audio/video only (`ASSUMPTION A-17`: 60s/file). PDF, archive and office formats are rejected. Originals are visible only to submitter and Central need-to-know.

`EvidenceDisclosure` is an append-only grant to an opponent or assigned reviewer-Coach for a Central-approved safe/redacted derivative, with exact attachment/version, purpose, recipient, expiry and audit actor. Access uses short-lived signed URLs. Malware/content failure quarantines the object; retention expiry deletes payload while preserving minimal audit/checksum metadata.

## 9. Platform records

### 9.1. `AuditEvent`

Append-only: event ID, actor, roles snapshot, action, aggregate, before/after state identifiers, reason, request metadata, causation/correlation, created_at. Sensitive payload is separately encrypted/access-controlled.

### 9.2. `OutboxMessage` / `InboxReceipt`

Outbox is committed with domain state. `InboxReceipt(consumer, event_id)` гарантирует exactly-once effect поверх at-least-once delivery.

### 9.3. `Notification`

Projection of user-facing service message: recipient, category, action target, render key, payload, deadline, read/delivery state. Для обязательств и критических изменений создаётся mandatory in-app; Booking/Challenge/Session/Result/Appeal/Safety также получают critical push; event-SMS только opt-in. Social/promotional message obeys preferences. Notification не является источником дедлайна; failure связывается с platform incident, но не меняет business state автоматически.

### 9.3.1. `NotificationPreference`

User-scoped settings: social/promotional push, quiet presentation и `event_sms_opt_in=false` by default. Пользователь не может удалить in-app record обязательства, но может управлять внешними каналами.

### 9.3.2. Retention and account closure

`RetentionPolicy` — versioned global configuration по record class. `AccountClosureRequest` хранит `REQUESTED/CANCELLED/EXECUTED`, `recover_until=+30d`, export request и pseudonymization event. Result media entity/foreign key отсутствует в MVP schema.

### 9.4. `PlatformIncident` and `IncidentImpact`

`PlatformIncident` хранит `state=DETECTED|CONFIRMED_ACTIVE|RESOLVED|COMPENSATED|REJECTED`, affected services/surfaces, severity, objective `started_at/ended_at`, monitoring evidence и Central confirmer. Только `CONFIRMED_ACTIVE/RESOLVED` incident даёт бизнес-компенсацию; отдельная жалоба пользователя сама по себе Incident не создаёт.

`IncidentImpact` unique на `(incident_id, aggregate_type, aggregate_id, deadline_kind)`: exact interval overlap, old/new deadline, fired timeout event reference и compensating event reference. Pausable deadline продлевается ровно на overlap. Уже записанный timeout/Forfeit остаётся immutable и компенсируется no-fault event. Physical Session facts, Cooldown и retention clocks не меняются.

### 9.5. `SystemConfiguration`

Versioned effective-dated configuration с scope `GLOBAL/COMMUNITY/VENUE`. Значения валидируются разрешёнными ranges; Session snapshot хранит использованную version.

## 10. Ключевые индексы и constraints

1. `unique(phone_e164) where phone_verified_at is not null`.
2. `unique(pair_low_id,pair_high_id) where Match.state in ('ACTIVE','ARCHIVED')`.
3. `unique(community_id,user_id) where Membership.state in ('PENDING','ACTIVE','UNDER_REVIEW')`.
4. MVP partial unique active competitive Membership per User.
5. `unique(community_id,age_division,coalesce(discipline_key,''))` for Competition.
6. `champion_user_id != contender_user_id`.
7. One open StatusTenure per `(competition,status)`; one status per user/competition.
8. One live queue entry per `(competition,initiator,target_status)`.
9. One live Challenge per `(competition,pair_key)`; one active `ChallengeParticipantObligation` per Athlete after acceptance. Pending optional invitations and waiting FIFO entries are excluded.
10. Exclusion on Coach time ranges for published/booked Slot.
11. One confirmed Booking per Slot; one active Booking request per pair.
12. No overlapping confirmed Session intervals for the same Athlete.
13. One competitive snapshot per Session or administrative obligation breach; one effective Result per `(challenge_id, cycle_no, context_id)`.
14. One Appeal history per `(result,appellant)`; withdrawal does not free uniqueness.
15. One active ProcessHold per `(aggregate,reason)`.
16. `sequence_no` strictly monotonic per CompetitionEvent stream.
17. One `ChatMessageRevision` sequence per message; one user visibility row per `(message,user)`.
18. One `IncidentImpact` per incident/aggregate/deadline kind; compensation is idempotent.
19. One active `PRIMARY_ADMIN` RoleGrant per Venue scope.
20. One unresolved DuplicateAccountCase per normalized suspected User set; alias relation cannot point a canonical User to itself.

## 11. Projection ownership

| Projection | Source | Rebuild rule |
|---|---|---|
| current Champion/Contender | CompetitionEvent | replay ordered sequence |
| status history | StatusTenure events | replay/compensations |
| queue position | live QueueEntry sorted FIFO | active Community member sees ordered display identity/position/submitted time/public state and active pair; outsider sees count/active Challenge; private invalidation reason excluded |
| pair Cooldown | Result/Appeal events | replay effective losses |
| public stats | completed Session + effective Result + StatusTenure | current status/history, W/L/D, last five effective Official Results and attended Training total; exclude annulled/no-attendance, partner identities, win rate, Safety reasons |
| Result/status review marker | Result/Appeal/IntegrityCase | show provisional/review label immediately; final removes it; compensation switches to effective outcome while retaining neutral review-history entry |
| next user action | process states + permissions | deterministic query projection |
| notifications | domain outbox events | may rebuild; never controls truth |

Любая projection может быть удалена и восстановлена из canonical records/events без потери бизнес-истории.
