# MOLOKH Events and Invariants

## 1. Event model

Domain events — факты в прошедшем времени. Command может быть отклонён; event после commit не отменяется и не переписывается. Исправление — новый compensating event.

### 1.1. Envelope

```json
{
  "event_id": "uuidv7",
  "event_name": "ResultRecorded",
  "schema_version": 1,
  "aggregate_type": "Result",
  "aggregate_id": "uuidv7",
  "aggregate_version": 3,
  "competition_sequence_no": 184,
  "occurred_at": "2026-09-02T18:00:00Z",
  "recorded_at": "2026-09-02T18:00:01Z",
  "actor": {
    "type": "USER|SYSTEM|PROVIDER",
    "id": "uuidv7|null",
    "roles": ["COACH"],
    "scope_ids": ["uuidv7"]
  },
  "correlation_id": "uuidv7",
  "causation_id": "uuidv7|null",
  "idempotency_key_hash": "string",
  "payload": {},
  "metadata": {
    "request_id": "string",
    "source": "api|scheduler|admin",
    "policy_version": "string"
  }
}
```

`competition_sequence_no` обязателен только для событий, входящих в Competition journal. Payload backward-compatible в пределах version; несовместимое изменение повышает `schema_version`.

PII, тексты Report и media не копируются в широкий event bus. Event несёт opaque reference и минимальный разрешённый контекст. Identity documents отсутствуют в MVP и не могут попадать даже как raw audit/outbox/log payload.

### 1.2. Transaction rule

В одной транзакции фиксируются:

1. mutation aggregate/projected row;
2. domain event;
3. `AuditEvent` для критичного command;
4. `OutboxMessage`.

Если любой шаг не удался, ни один не считается совершённым.

## 2. Канонические payloads

### 2.1. `ResultRecorded.v1`

```json
{
  "result_id": "uuidv7",
  "challenge_id": "uuidv7",
  "session_id": "uuidv7|null",
  "origin": "SESSION|ADMINISTRATIVE_FORFEIT",
  "competitive_context_snapshot_id": "uuidv7",
  "outcome_code": "WIN_A|WIN_B|DRAW|NO_CONTEST|FORFEIT|NO_SHOW",
  "winner_user_id": "uuidv7|null",
  "loser_user_id": "uuidv7|null",
  "reason_code": "string|null",
  "actual_time": "timestamp",
  "venue_id": "uuidv7|null",
  "coach_user_id": "uuidv7|null",
  "appeal_deadline_at": "timestamp",
  "pre_status": {"champion_user_id": "uuid|null", "contender_user_id": "uuid|null", "status_version": 17},
  "stake": "NONE|CONTENDER|TITLE|GENESIS_CHAMPION|GENESIS_CONTENDER"
}
```

Для `SESSION` обязательны Venue и Coach. Для административного Forfeit до физической Session они могут быть null; required `reason_code`, responsible actor и obligation snapshot.

### 2.2. `StatusTransitionApplied.v1`

```json
{
  "transition_id": "uuidv7",
  "source_result_id": "uuidv7|null",
  "source_event_id": "uuidv7",
  "competition_id": "uuidv7",
  "before": {"champion": "uuid|null", "contender": "uuid|null", "version": 17},
  "after": {"champion": "uuid|null", "contender": "uuid|null", "version": 18},
  "transition_type": "CONTENDER_TRANSFER|TITLE_TRANSFER|GENESIS|SUCCESSION|VACANCY|AGE_TRANSITION|ENFORCEMENT",
  "provisional": true,
  "participant_ids": ["uuidv7"],
  "snapshot_id": "uuidv7|null"
}
```

### 2.3. `StatusTransitionCompensated.v1`

Обязательные поля: `compensates_transition_id`, `decision_id`, `reason`, exact `restore_to` or `corrected_to`, old/new versions, closed/opened tenure IDs. Компенсация ссылается на исходное событие; она не удаляет его.

### 2.4. `ChallengeQueued.v1`

Содержит QueueEntry ID, kind, initiator, Competition, target status, server `submitted_at`, tie-break `entry_id`, eligibility version. Текущий holder — display context, но не владелец очереди.

### 2.5. `ChallengeAccepted.v1`

Содержит participants, `accepted_at`, response policy, planned type, Competition, scheduling deadline, Community config/ruleset snapshot, per-Athlete acknowledgment mode/proof, consents and eligibility check IDs. С этого события начинается obligation.

### 2.6. `SessionWindowOpened.v1` and `SessionStarted.v1`

`SessionWindowOpened` содержит immutable competitive snapshot: roles at scheduled boundary, Champion/Contender before, stake, ruleset reference, Community/config version, venue/assigned Coach/participants и logical scheduled time. Это единственный источник stakes, но не доказательство физического старта.

`SessionStarted` ссылается на этот snapshot и содержит actual_start_at, recording Coach assignment/version и causation `EXPLICIT_START|FIRST_ATTENDANCE`. Оно доказывает начало физической Session, но не пересчитывает roles/stakes.

### 2.7. `AppealDecided*.v1`

Содержит appeal/result/decision IDs, reviewer, `UPHOLD|REVERSE|ANNUL|REPEAT`, reason, original/effective outcome, evidence references, `decided_at`, and intended compensation mode. Projection mutation совершается той же транзакцией или идемпотентной saga с decision ID.

### 2.8. `AgeDivisionChanged.v1`

Owner — Identity; producer — единственный SYSTEM timer агрегата `AgeDivisionTransition` с
версией `0→1`. Payload содержит transition/User IDs, `YOUTH→ADULT`, server
`transitioned_at`, итоговую Identity version, ID закрытых Challenge/B-26 retention/queue/consent
и минимальные before/after status projections. Дата рождения, guardian contact и иные raw PII в
event/outbox не копируются; PII class — `INTERNAL_IDENTIFIER`, retention — бессрочная
аудит-линия Identity. Consumers: Membership, Competition vacancy/FIFO, Scheduling retention,
Discovery и notification projection.

### 2.9. Account closure and export events

`AccountClosureRequested.v1` содержит closure/User IDs, `recovery_until`, `export_requested` и
policy version, но не копирует телефон или иные raw PII. `AccountClosureExecuted.v1` ссылается на
атомарный `UserAccountClosed.v1`/pseudonymization event. Исполнение доступно Central только после
30 дней и при нулевых active blockers.

`AccountDataExportRequested.v1` запускает подготовку Worker. `AccountDataExportPrepared.v1`
содержит export/User IDs, `expires_at=ready_at+48h` и SHA-256, но не сам private payload.
`AccountDataExportExpired.v1` подтверждает физическое удаление payload; checksum, policy version
и минимальная audit-lineage остаются. Retention clock не останавливается PlatformIncident.

Транзакция выпускает ровно один канонический `AgeDivisionChanged`. Технические связанные
события `UserAgeDivisionChanged` и `MembershipAgeDivisionChanged` двигают версии своих
агрегатов; `ChallengeCancelledNoFault`, `BookingTrainingRetentionRequested` и status events
сохраняют независимую replay lineage. Started Session и её
`session_competitive_snapshot` не изменяются: consent истекает, но физически начатая Session,
Challenge и obligations завершаются по frozen Youth snapshot.

## 3. Каталог событий

### 3.1. Identity и Social

| Events | Producer | Primary consumers |
|---|---|---|
| `VerificationStarted/AccountVerified/VerificationRejected/Expired/Revoked` | Identity | permissions, UI, Governance |
| `AgeDivisionChanged/UserAgeDivisionChanged/MembershipAgeDivisionChanged` | Identity timer | Membership, Competition succession, Scheduling retention, Discovery |
| `DisplayNameChanged/SportPreferencesChanged/HomeVenueChanged/AvatarChanged` | Identity | profile, Discovery/Slot priorities, audit, moderation; never verification or Competition reset |
| `AccountRecoveryRequested/Approved/Completed/Rejected`, `AccountAccessIncidentConfirmed` | Identity | permissions, obligations, deadline review |
| `DuplicateAccountReviewStarted/Cleared/Resolved` | Identity governance | holds, account projection, status disposition |
| `LikeCreated/Withdrawn/Expired/RemovedBySkip` | Social | Discovery, notifications |
| `MutualLikeDetected/MatchCreated/MatchArchived/Reactivated/Ended/Blocked` | Social | Chat, Discovery, Activity |
| `PairSuppressionStarted/Expired` | Social | Discovery |
| `BlockCreated/Revoked` | Social | Chat, eligibility, optional pre-accept cleanup; never accepted/status obligation cancellation |
| `ChatMessageSent/Edited/HiddenForUser/Reported/HiddenByModeration` | Chat | Chat projection, Case evidence, audit |

### 3.2. Community и роли

| Events | Producer | Primary consumers |
|---|---|---|
| `CommunityCreated/Paused/Reactivated/ConfigurationChanged/ClosureScheduled/Closed` | Central / scoped Gym Admin | Competition holds, Scheduling, Result, UI |
| `MembershipRequested/Approved/Rejected/Activated/Left/Removed/ArchivedByCommunityClosure` | Community | Competition eligibility, queue, Governance |
| `StatusHolderRemovalReviewStarted/MembershipRemovalConfirmed/Rejected` | Governance | ProcessHold, Status Engine |
| `CoachInvited/Authorized/RoleRevoked/GuestCoachAuthorized/Expired` | Roles | Slot, Booking, Result permissions |
| `GymAdminAppointed` | Central | permissions |
| `PrimaryAdminAppointed/Transferred` | Central | Venue ownership projection, permissions |

### 3.3. Scheduling и Session

| Events | Producer | Primary consumers |
|---|---|---|
| `GroupOfferingPublished/Updated/Withdrawn/Expired` | Scheduling | Group discovery, Chat cards |
| `GroupPlanProposed/MutuallyConfirmed/Cancelled/Expired/ClosedByPairSocialEnd/ConvertedToChallenge` | Scheduling | Chat, Venue notification, Competition |
| `SlotPublished/Edited/Withdrawn/Expired/Booked/Completed` | Scheduling | Booking, availability projection |
| `SlotSelectedByAthlete/Changed/Expired/MutuallySelected` | Booking | Chat action cards |
| `BookingConfirmed/Rejected/ConflictDetected/ConfirmationExpired/CancelledNoFault/ClosedByPairSocialEnd` | Booking | Slot, Session, Challenge |
| `BookingCoachReplaced/SessionCoachReplaced` | Booking/Session | assignment audit, notifications, Result permission |
| `BookingTrainingRetentionRequested/Confirmed/Closed`, `BookingConvertedToTraining` | Booking | Session, notifications, Competition audit |
| `TrainingParticipantCancelled/SoloContinuationConfirmed/BookingConvertedToSolo` | Booking | Session, notifications |
| `SessionScheduled/WindowOpened/Started/Ended/Cancelled/FailedExternal/ConvertedToSolo/ConvertedToTraining` | Session | Challenge, Result, stats, operational review |
| `AttendanceRecorded` | Session | stats, Result validation |

### 3.4. Competition

| Events | Producer | Primary consumers |
|---|---|---|
| `CompetitionCreated/Closed` | Competition | UI/audit |
| `ChallengeQueued/QueueEntryActivated/Reconfirmed/Withdrawn/Invalidated/Consumed` | FIFO | Challenge, notifications |
| `GenesisCandidatePaired/Consumed/ReturnedToQueue/Closed` | FIFO | GENESIS Challenge, public queue |
| `QueueEntrySourceDetached` | FIFO | preserve status right when optional social source ends |
| `QueueReconfirmationRequested/Closed` | FIFO | Athlete UI |
| `ChallengeCreated/Accepted/Declined/Withdrawn/ResponseExpired` | Challenge | Scheduling, status slot |
| `ChallengeClosedByPairSocialEnd` | Challenge | Social/Competition cleanup; optional only |
| `GenesisChallengePartyAccepted/Declined/ResponseExpired` | Challenge | GENESIS queue/Competition phase |
| `MandatoryChallengeRefused/Expired` | Challenge | Result |
| `ChallengeBookingStarted/Booked/SessionStarted/AwaitingResult` | Challenge | Activity/read model |
| `ChallengeRescheduleProposed/Rescheduled/RescheduledByAthlete/SchedulingExtended/CancelledNoCapacity` | Challenge | Booking, deadlines |
| `FoundingGenesisPaired/GenesisWithoutOpponent/ContenderGenesisPaired/SuccessionWithoutOpponent/GenesisPairingReleased` | Competition | Challenge, Status, FIFO |
| `GenesisStatusApplied/ContenderAssigned/Transferred/Defended/TitleTransferred/Defended` | Status Engine | tenure, profile, queue |
| `ChampionSuccessionApplied/ChampionVacated/ContenderVacated` | Status Engine | Competition phase, queue |
| `StatusTransitionApplied/Finalized/Compensated/RolledBack` | Status Engine | all status projections |
| `PairCooldownStarted/Expired/Removed` | Status Engine | eligibility |
| `ProcessHeld/ProcessHoldReleased` | Governance/Competition | deadlines, permissions |

### 3.5. Result и Governance

| Events | Producer | Primary consumers |
|---|---|---|
| `ResultRecorded/MetadataRevised/Finalized/Upheld/Reversed/Annulled` | Result | Status, stats, Activity |
| `AppealSubmitted/ReviewStarted/ResponseAdded/Withdrawn/SlaExtended` | Appeal | Central inbox, notifications |
| `AppealDecidedUpheld/Reversed/Annulled/Repeat` | Appeal | Result, Status, Challenge |
| `RepeatSessionOrdered` | Result/Appeal | Challenge, Scheduling |
| `TechnicalCorrectionRequested/Approved/Rejected` | Result governance | Result decision |
| `MissingResultReviewOpened/Started/ReviewerCoachAssigned/Resolved`, `MissingResultRepeatOrdered` | Result governance | Challenge, reviewer permissions, Scheduling |
| `IntegrityCaseOpened/ReviewStarted/Upheld/Corrected/Annulled` | Result governance | holds, ResultDecision, Competition replay, public review marker |
| `ModerationCaseSubmitted/SafetyCaseSubmitted/Triaged/ReviewStarted/Decided/Closed` | Governance | holds, enforcement |
| `AccountRestrictionApplied/Modified/Revoked` | Governance | permissions, Status hold |
| `EnforcementAppealSubmitted/Decided` | Governance | restriction |
| `VoluntaryResignationConfirmed` | Competition | Result/Status/Membership |
| `StatusReleasePreviewed/VoluntaryStatusReleased` | Competition | StatusTenure, queue, profile |
| `EvidenceAttachmentSubmitted/Accepted/Quarantined/Rejected/Deleted` | Governance evidence | secure storage, Central moderation |
| `EvidenceDisclosureGranted/Revoked/Expired` | Governance evidence | signed access, audit |
| `PlatformIncidentDetected/Confirmed/Rejected/Resolved/Compensated` | Operations | deadline reconciliation, compensating events, audit |

## 4. Global invariants

### Identity и privacy

- `INV-ID-01`: User младше 14 лет не может активировать аккаунт.
- `INV-ID-02`: один verified phone и одна verified identity не могут принадлежать двум active User.
- `INV-ID-03`: birth date не публикуется; Youth UI показывает возрастную категорию.
- `INV-ID-04`: YOUTH и ADULT не имеют Like, Match или personal training invite между контурами.
- `INV-ID-05`: Official Challenge требует `ACCOUNT_VERIFIED`; обычная тренировка — phone verified.
- `INV-ID-06`: verification loss не стирает принятые обязательства; они получают review/hold согласно причине.
- `INV-ID-07`: MVP verification is Central moderation without document upload/storage; no raw identity document may enter Core DB/event/outbox/log.
- `INV-ID-08`: at the 18th-birthday server boundary one AgeDivisionChanged occurs. Started Youth Session keeps its snapshot; no unstarted Youth Official/status/queue/guardian consent crosses into Adult.
- `INV-ID-09`: display name is arbitrary self-expression, changes immediately and never changes verification/badge or historical ownership by stable User ID; old names are Central-audit-only.
- `INV-ID-10`: avatar is scanned before publication; name/avatar abuse uses Report/Safety rather than mandatory name pre-approval.
- `INV-ID-11`: account/device/SIM loss and phone change never delete or silently cancel an accepted obligation. A 24h phone-change hold denies sensitive actions but permits minimum existing-obligation service responses from a trusted old session.
- `INV-ID-12`: account recovery stores no identity documents. No-fault deadline effect requires a Central-confirmed access incident with exact affected interval/process.
- `INV-ID-13`: duplicate accounts are never automatically merged. Canonical selection creates private alias lineage; immutable Results remain attributable and status changes only through a separately governed disposition.
- `INV-ID-14`: account closure is self-requested and reversible for exactly 30 days. Central executes it only after all accepted obligations, status, active Sessions, Memberships, roles and FIFO entries are resolved; immutable sporting/audit lineage is pseudonymized, never deleted.
- `INV-ID-15`: at most one `REQUESTED/READY` account export exists per User. Its private payload is downloadable only by that User, expires exactly 48h after preparation and is then deleted while checksum/audit lineage remains.

### Social

- `INV-SOC-01`: Like создаётся только из Discovery.
- `INV-SOC-02`: одна directed ACTIVE Like на пару; взаимность создаёт ровно один Match.
- `INV-SOC-03`: Match не создаёт Membership, Booking, Session или Challenge автоматически.
- `INV-SOC-04`: SKIP/Unmatch suppress pair 15d; Like TTL 30d; Match archive не является Unmatch.
- `INV-SOC-05`: ни Unmatch, ни Block не отменяют accepted Challenge/confirmed Booking or status FIFO/mandatory path. They close only Match-based optional pre-accept Challenge/GroupPlan/Slot request no-fault and restrict surviving service UI.
- `INV-SOC-06`: no hidden reliability score; activity/response speed допустимы только как недавние rank signals.
- `INV-SOC-07`: only sender's PERSONAL_TEXT may be edited within 15m; every edit appends a revision and reported/service/action messages are immutable.
- `INV-SOC-08`: delete-for-self is local visibility only. Report freezes all revisions as Case evidence; only Central decided Case may hide for everyone without deleting originals.

### Community и Competition

- `INV-COM-01`: MVP — одна active Community на один physical Venue.
- `INV-COM-02`: MVP — максимум одна active competitive Membership на Athlete, хотя схема допускает несколько.
- `INV-COM-03`: Home Venue не меняет Membership, очередь, status или history.
- `INV-COM-04`: в Competition максимум один Champion и один Contender; они не один User.
- `INV-COM-05`: статус локален к `(Community, age division[, future discipline])`.
- `INV-COM-06`: Ordinary — отсутствие Champion/Contender tenure, а не отдельный глобальный rank.
- `INV-COM-07`: confirmed Community pause Session сохраняется; новые/неподтверждённые processes held.
- `INV-COM-08`: Cooldown идёт во время Community pause; pausable Challenge deadlines — нет.
- `INV-COM-09`: Membership self-rejection sets a 7d self-reapply gate; invite/QR or audited Admin/Central authorization may bypass it. Rejection is not public, punitive or a reliability signal.
- `INV-COM-10`: Community closure requires a Central Closure Plan. New actions stop at scheduling; pending/unconfirmed processes close no-fault; only plan-listed safe confirmed Sessions finish their Result/Appeal path.
- `INV-COM-11`: final closure archives Membership and closes status tenures as `COMMUNITY_CLOSED` without W/L/Succession. Competition/status never migrates; relocation of the same gym is a Venue update.
- `INV-COM-12`: future Competition scope is Community+age division+discipline. Status/FIFO/Cooldown/stats never cross scope; one primary Community only affects Home/Discovery and global accepted-Official limit remains one.
- `INV-COM-13`: each active Venue has exactly one active PRIMARY_ADMIN and may have multiple ordinary ADMIN grants. Primary transfer is Central-only and atomic; no Admin role can mutate sporting status directly.

### Scheduling

- `INV-SCH-01`: персональная Session всегда имеет ровно один Venue и один non-conflicted authorized Coach.
- `INV-SCH-02`: Slot не резервируется до host confirmation.
- `INV-SCH-03`: одна пара имеет один live Booking request; оба Athlete явно выбирают один Slot.
- `INV-SCH-04`: final host confirm атомарно rechecks Slot, Coach, Venue, Athlete, Membership, verification, consent и Challenge state.
- `INV-SCH-05`: Coach time ranges не пересекаются.
- `INV-SCH-06`: Athlete не может иметь пересекающиеся confirmed Session intervals.
- `INV-SCH-07`: альтернативы никогда не бронируются автоматически.
- `INV-SCH-08`: обычная Training cancel/NO_SHOW не создаёт Result, loss, Cooldown или status event.
- `INV-SCH-09`: solo conversion требует remaining Athlete + Coach/Host; не автоматическая.
- `INV-SCH-10`: Group Plan не является Booking/Session/statistics и не обещает место.
- `INV-SCH-11`: Training→Official conversion до старта требует обоих Athlete и assigned non-conflicted Coach; decline/expiry preserves Training unchanged.
- `INV-SCH-12`: Training/Group conversion that would carry CONTENDER or TITLE stakes uses the same strict FIFO; waiting never changes the source into Official and expires when the source starts.
- `INV-SCH-13`: until conversion final commit, its source remains ordinary; eligibility loss or source cancellation closes conversion, releases any status slot and cannot create Forfeit.
- `INV-SCH-14`: GroupOffering is manual Venue information, not capacity/reservation truth; UI exposes freshness/contact disclaimer and expires it at start.
- `INV-SCH-15`: price/currency/cancellation terms visible on the selected Slot are frozen into Booking at mutual selection; later Venue edits never mutate the accepted snapshot.
- `INV-SCH-16`: Molokh does not take payment/refund in MVP; commercial dispute never directly changes Competition state, while cancellation cause is evaluated independently.
- `INV-SCH-17`: after a pre-start no-fault Official close, physical Booking becomes Training only after both Athlete and Coach/host confirmations before `min(1h,start)`; otherwise it cancels and releases the Slot.
- `INV-SCH-18`: a confirmed pre-start Coach replacement without re-consent is valid only if Venue/time/price/ruleset hashes are unchanged and the new Coach is authorized/non-conflicted. Booking and Session assignment update atomically with notification.
- `INV-SCH-19`: after equivalent Coach replacement either Athlete may choose external no-fault reschedule before start; any material-term change requires normal mutual reconfirmation.
- `INV-SCH-20`: scheduled start opens READY_FOR_COACH and freezes competitive context but is never proof of physical start, attendance or completed Training. Only authorized Coach Start/first Attendance creates actual_start_at and IN_PROGRESS.
- `INV-SCH-21`: confirmed Coach/Venue failure before actual start is EXTERNAL: equivalent replacement may proceed within grace; otherwise Booking/Session close no-fault and Official returns scheduling without a user reschedule count.
- `INV-SCH-22`: any mutation that keeps a Session in `SCHEDULED` while advancing its version reissues `OPEN_SESSION_WINDOW` for the new exact version and the original `scheduled_start_at`; an older timer may become stale, but it cannot strand the Session before `READY_FOR_COACH`.

### Challenge

- `INV-CH-01`: pair имеет максимум один live competitive relationship в одной Competition.
- `INV-CH-02`: planned type не является authoritative stake; stake frozen once at scheduled Session window opening or obligation-breach snapshot; Coach actual start never recomputes it.
- `INV-CH-03`: Ordinary↔Ordinary и Champion→Ordinary требуют active Match; status path к Contender не требует Match.
- `INV-CH-04`: Ordinary не может инициировать Official Challenge к Champion; Contender не инициирует Official к Ordinary в MVP.
- `INV-CH-05`: любой физически начавшийся Official Champion↔Contender — TITLE.
- `INV-CH-06`: Champion offer to Contender optional; Contender challenge to Champion mandatory for Champion, with a stale-safe +48h reminder and a +72h SYSTEM expiry that creates one appealable TITLE Forfeit through the Result engine.
- `INV-CH-07`: Ordinary challenge to Contender mandatory for Contender.
- `INV-CH-08`: pre-accept withdrawal no loss; accepted unilateral Athlete abandonment is Forfeit unless external/mutual/Central no-fault.
- `INV-CH-09`: scheduling 14d, one capacity extension +7d; unavailable capacity never Athlete fault.
- `INV-CH-10`: at most two user reschedules per Challenge; mutual uses one count without culprit; external uses none.
- `INV-CH-11`: next culpable reschedule after exhausted allowance produces Forfeit.
- `INV-CH-12`: confirmed athlete cancellation produces Forfeit immediately, Coach notification and Appeal 48h.
- `INV-CH-13`: status-changing Result must finalize/waive before affected participant starts another status-bearing Session.
- `INV-CH-14`: previously confirmed Challenge of a newly promoted Contender remains valid and risks Contender at start.
- `INV-CH-15`: planned TITLE becomes invalid if participants are no longer Champion+Contender at start; physical Booking may be explicitly retained as Training.
- `INV-CH-16`: active prebooked conversion occupies the same single Contender obligation slot from queue activation until Challenge creation or conversion close; no later entry may pass it.
- `INV-CH-17`: each Athlete has at most one accepted uncompleted Official obligation; pending optional invitations and WAITING FIFO entries do not count. A busy Athlete's entry cannot occupy the activated status slot and is invalidated no-fault.
- `INV-CH-18`: OPTIONAL response clock is 48h with notifications at +12h/+24h; expiry/decline/pre-accept withdrawal is no-fault and does not prevent a later eligible invitation.
- `INV-CH-19`: Challenge creation freezes ruleset/version; initiator creation and recipient acceptance (each participant action in GENESIS) store acknowledgments. Central-approved explicit mode requires checkbox proof. Ruleset never changes status algebra.
- `INV-CH-20`: Athlete may have at most three outgoing unanswered OPTIONAL Challenges and one per pair. Decline starts 48h pair quiet; expiry adds no extra quiet. Throttle never affects FIFO/mandatory/status or reliability/profile.
- `INV-CH-21`: GENESIS candidacy is explicit and has no hidden waiting TTL while eligible. The first two FIFO candidates receive 48h mutual acceptance; accepted obligation starts only after both accept.
- `INV-CH-22`: on one GENESIS candidate's decline/expiry/withdrawal their entry closes no-fault, while the non-failing counterpart returns to WAITING with the exact original FIFO key; re-entry after own close gets a new key.

### Result и status

- `INV-RES-01`: Athlete никогда не является author attendance/result command.
- `INV-RES-02`: Coach cannot arbitrate a Session in which the same User is an Athlete.
- `INV-RES-03`: one effective Result per official Session or administrative obligation breach.
- `INV-RES-04`: FORFEIT, NO_SHOW, NO_CONTEST require reason/comment.
- `INV-RES-05`: sport-specific score/method/ruleset never directly alters status.
- `INV-RES-06`: Result `RECORDED` immediately applies provisional status projection.
- `INV-RES-07`: status position changes only through Competition event journal.
- `INV-RES-08`: DRAW and NO_CONTEST do not change status, loss or Cooldown; DRAW counts in competition stats, NO_CONTEST does not count win/loss.
- `INV-RES-09`: Champion transfers only in TITLE, founding GENESIS, Succession, age/admin/voluntary status event — never Champion vs Ordinary OPEN.
- `INV-RES-10`: Contender loses status when an Ordinary beats them in any valid Official snapshot.
- `INV-RES-11`: TITLE Contender win swaps roles; Champion win leaves both unchanged.
- `INV-RES-12`: Founding normal loser becomes Contender; loser by FORFEIT/NO_SHOW does not.
- `INV-RES-13`: original Result/outcome is immutable; effective correction is a decision/projection.
- `INV-RES-14`: metadata may change within 24h only through revision history; winner/outcome requires governed decision.
- `INV-RES-15`: after 24h without Result, MissingResultReview opens exactly once. Central cannot author winner/outcome; only an authorized non-participant reviewer-Coach can record the evidence-constrained Result.
- `INV-RES-16`: consistent separate Athlete statements plus Venue attendance allow reviewer confirmation; conflict/insufficient evidence orders repeat no-fault, or reviewer-Coach NO_CONTEST only when repeat is objectively impossible.
- `INV-RES-17`: original Coach nonresponse is an operational review and never itself produces Athlete loss, status transfer or reliability signal.
- `INV-RES-18`: voluntary status-only release requires no accepted obligation, keeps Membership ACTIVE, creates no Result/loss/Cooldown and has no medical-document/status-freeze path.
- `INV-RES-19`: LATE is attendance metadata, not an automatic loss. If Session occurs, Coach records its normal Result; NO_SHOW requires expiry of configured grace plus objective failure caused by the absent Athlete, and double absence is NO_CONTEST.
- `INV-RES-20`: after actual start, injury/voluntary withdrawal follows the frozen ruleset and may be a decisive Result without medical documents. NO_CONTEST/no-fault requires an external Safety/Venue/equipment impossibility, not merely an Athlete's wish to stop.
- `INV-RES-21`: FINAL ordinary Appeal never reopens. Only a Central independent IntegrityCase for FRAUD/SYSTEM_ERROR/IDENTITY_ERROR may alter effective outcome through append-only decisions, compensations and deterministic replay.
- `INV-RES-22`: provisional Result/status is public immediately with a neutral review marker. Final removes it; reversal changes public stats/last-five to the effective outcome while retaining only a neutral review-history fact.

### Appeal

- `INV-APP-01`: Appeal window = 48h from Result recorded server time.
- `INV-APP-02`: decisive result — only loser appeals; DRAW/NO_CONTEST — either Athlete; Coach uses correction request.
- `INV-APP-03`: waiver is explicit, immutable and prevents later filing by that actor.
- `INV-APP-04`: withdrawn Appeal cannot be refiled for same Result/appellant.
- `INV-APP-05`: opponent/Coach response target 24h is non-blocking.
- `INV-APP-06`: missed Central SLA cannot auto-uphold/reverse; extension requires reason and visibility.
- `INV-APP-07`: rejected Appeal creates no penalty/reliability signal.
- `INV-APP-08`: reverse/annul/repeat never deletes source Result/event/status history.
- `INV-APP-09`: Repeat restores exact pre-result projection and returns Challenge to scheduling with new cycle.

### Safety и governance

- `INV-SAFE-01`: Report creates scoped Case, not automatic global review/restriction.
- `INV-SAFE-02`: reporter identity is hidden from subject.
- `INV-SAFE-03`: Safety cancellation removes Booking no-fault and pauses Challenge deadline pending decision.
- `INV-SAFE-04`: Coach/Venue safety refusal is external cause absent proven abuse.
- `INV-SAFE-05`: accused Coach/Admin cannot decide own Case.
- `INV-SAFE-06`: full access restriction requires confirmed violence, fraud, forged identity or illegal use.
- `INV-SAFE-07`: restriction acts immediately; status remains under review, no automatic transfer.
- `INV-SAFE-08`: enforcement appeal reviewer differs from original reviewer.
- `INV-SAFE-09`: Ordinary admin removal cancels incomplete processes no-loss; restoration does not resurrect them.
- `INV-SAFE-10`: status holder removal requires Central review before succession/vacancy.

### Audit and operations

- `INV-OPS-01`: server time controls every deadline/FIFO key.
- `INV-OPS-02`: every critical command carries idempotency key and expected aggregate version.
- `INV-OPS-03`: audit records actor, reason, previous/new state and causation.
- `INV-OPS-04`: external notification failure cannot undo business commit.
- `INV-OPS-05`: scheduler timeout is compare-and-set and can run repeatedly without duplicate effect.
- `INV-OPS-06`: every projection can be rebuilt from canonical records/events.
- `INV-OPS-07`: notification delivery/read state never starts, pauses or extends a business deadline; only a separately confirmed platform incident may support no-fault/Central decision.
- `INV-OPS-08`: Result photo/video media is not an MVP entity, endpoint or event payload.
- `INV-OPS-09`: Community FIFO order is public to active members, but Block/Safety/eligibility reasons remain private; every visible removal/move derives from an audited event.
- `INV-OPS-10`: evidence uploads exist only in Appeal/Safety, max 5 and ≤100MB aggregate, allowlisted image/audio/video. Result/PDF/archive/office upload is rejected before canonical attachment creation.
- `INV-OPS-11`: evidence original access is submitter+Central; opponent/assigned Coach access requires a safe/redacted, expiring EvidenceDisclosure. Scan failure quarantines; retention deletes payload, not audit lineage.
- `INV-OPS-12`: only an objectively evidenced, Central-confirmed PlatformIncident can alter deadline/outcome handling; an individual delivery complaint alone cannot.
- `INV-OPS-13`: confirmed Incident extends each pausable deadline by exact incident overlap. Session facts, Cooldown and retention remain continuous.
- `INV-OPS-14`: a timeout/Forfeit already committed during an Incident is immutable; recovery uses one idempotent compensating no-fault event and preserves the full source history.
- `INV-OPS-15`: Chat payload retention uses the effective immutable policy and whole-Chat last activity. Bounded concurrent cleanup nulls only expired, uncaptured revision payloads, preserves a SHA-256/deletion time/policy version plus append-only audit, and never deletes a Case snapshot, domain event or sporting record. PlatformIncident does not pause this clock.

## 5. Status transition function

Inputs:

```text
f(pre_status, competitive_snapshot, effective_outcome, source_event)
  -> (post_status, transition_type, affected_users, cooldown_effect)
```

Decision order is normative:

1. Validate snapshot belongs to Competition and participants.
2. If outcome `DRAW/NO_CONTEST`, return unchanged/no cooldown.
3. Determine winner/loser, including FORFEIT/NO_SHOW.
4. Branch by snapshot stake, never by current profile status.
5. Check post-status invariants (one Champion, one Contender, distinct).
6. Append event, update projection and tenures atomically.

| Stake | Winner relation | Post-status |
|---|---|---|
| `NONE` | any | unchanged |
| `CONTENDER` | challenger/Ordinary wins | `contender = winner` |
| `CONTENDER` | snapshot Contender wins | unchanged |
| `TITLE` | snapshot Contender wins | swap Champion/Contender |
| `TITLE` | snapshot Champion wins | unchanged |
| `GENESIS_CHAMPION` | normal decisive | Champion=winner, Contender=loser |
| `GENESIS_CHAMPION` | FORFEIT/NO_SHOW decisive | Champion=winner, Contender vacant |
| `GENESIS_CONTENDER` | decisive | existing Champion unchanged, Contender=winner |

`NO_SHOW` обоих = `NO_CONTEST` (`ASSUMPTION A-04`) и требует repeat/no assignment for GENESIS.

## 6. FIFO algorithm

### 6.1. Enqueue

```text
transaction:
  assert no live entry for (competition, initiator, target_status)
  assert eligibility excluding "status slot currently free"
  submitted_at := database_clock_timestamp()
  entry_id := uuidv7(submitted_at)
  insert WAITING
```

For `GENESIS_CANDIDATE`, enqueue requires explicit Athlete intent «Бороться за статус». WAITING has no time-based expiry while eligibility remains true; withdrawal is no-fault and any later re-entry receives a new key.

### 6.2. Activation

```text
lock competition row
if status slot busy or status_transition_lock exists: stop
select first WAITING entry
  order by submitted_at asc, entry_id asc
  for update skip locked
recheck all eligibility
if invalid: append QueueEntryInvalidated; repeat within bounded batch
if holder changed and entry is PREBOOKED_CONVERSION: invalidate; source stays non-official
if holder changed and reconfirm missing: set RECONFIRMATION_REQUIRED; stop/continue next only after entry closes
if GENESIS phase needs two candidates:
  lock first two valid GENESIS_CANDIDATE entries
  set both PAIRED_PENDING_ACCEPTANCE with one pair/Challenge and 48h deadline
  if both accept: consume both and create accepted obligation
  if one fails: close failing entry; restore counterpart WAITING with unchanged FIFO key
else if kind PREBOOKED_CONVERSION:
  activate source confirmation flow; consume entry; hold status slot until conversion closes/creates Challenge
else:
  activate entry; create Challenge atomically; consume entry
```

Strict FIFO means later entries do not pass a valid earlier entry. An earlier invalid/expired/declined entry must first receive an explicit terminal event.

### 6.3. Holder change

1. Freeze activation while source Result provisional/under appeal.
2. On final transition lock Competition.
3. Invalidate former Contender's own TITLE intents and holder-bound PREBOOKED_CONVERSION entries; their Training/Group source remains non-official.
4. Mark migratable waiting entries `RECONFIRMATION_REQUIRED` and bind new holder; preserve FIFO keys.
5. Give initiators 24h; no response closes entry.
6. Order already confirmed Sessions of new Contender by start time; prevent overlapping status starts.
7. Resume head activation only after confirmed obligations and transition lock permit.

## 7. Appeal rollback algorithm

### 7.1. Recorded

In one transaction:

1. lock Challenge, Result slot and Competition;
2. write immutable `ResultRecorded` and exact `pre_status` snapshot;
3. compute transition with §5;
4. append provisional `StatusTransitionApplied` and update projection/version;
5. create provisional tenures/close prior tenures provisionally;
6. set `status_lock_result_id` if transition affects status;
7. create PairCooldown for decisive loss;
8. set Result/Challenge `RECORDED`, deadline +48h;
9. outbox notifications.

### 7.2. Finalize/uphold

Lock Result/Competition, verify lock lineage, append `ResultFinalized` and `StatusTransitionFinalized`, flip tenures non-provisional, clear transition locks, then recompute/activate queue.

### 7.3. Reverse winner

1. lock Result, Challenge, Competition and live queue head;
2. verify Appeal decision idempotency and original transition lineage;
3. append `StatusTransitionCompensated` restoring `pre_status`;
4. close provisional tenures with compensation references;
5. remove/recalculate original Cooldown and stats projection;
6. compute corrected transition from the same immutable competitive snapshot and corrected outcome;
7. append corrected `StatusTransitionApplied` as final;
8. rebuild queue eligibility/order; do not change original FIFO timestamps;
9. set Result `REVERSED`, clear locks, publish notifications.

### 7.4. Annul/repeat

Restore `pre_status` exactly, append compensation, remove loss/Cooldown and provisional stats. Annul terminates Challenge. Repeat additionally increments `cycle_no`, creates no new pair position, and moves Challenge to accepted scheduling with a fresh Session/Result identity.

### 7.5. Post-final Integrity decision

Lock IntegrityCase, source Result, Competition and affected queue/tenures. Verify independent reviewer and category. Append immutable Integrity decision. UPHOLD only removes the review hold. CORRECT/ANNUL/REPEAT reuses the compensation rules above against the original snapshot, but also replays any downstream Competition journal under a deterministic hash. A repeat creates a new cycle only if current eligibility and one-obligation guards pass; otherwise the effective disposition is ANNUL. Publish only a neutral reason category.

### 7.6. Defensive rebuild

Participant transition locks should prevent downstream conflicting status events. Если invariant всё же нарушен из-за дефекта/ручной миграции, Central command does not guess. It pauses Competition, replays its entire ordered journal excluding superseded projection effects, verifies a deterministic hash, writes `CompetitionProjectionRebuilt`, then releases hold.

## 8. Concurrency protocols

### 8.1. Booking race

Two pairs may select one PUBLISHED Slot because selection is not reservation. On host confirm:

```text
begin
lock Slot row
lock Coach calendar resource
lock both Athlete calendar resources in sorted user_id order
lock Venue resource if capacity configured
assert Slot=PUBLISHED and no Coach/Athlete overlap
assert Booking=HOST_CONFIRMATION_PENDING and eligibility current
update Slot=BOOKED, Booking=CONFIRMED, create Session, outbox
commit
```

First commit wins. Loser gets `BookingConflictDetected`, never auto-books alternative.

### 8.2. Duplicate Result

Unique effective Result per Session/context plus idempotency key. Same request returns existing Result; different outcome for same context returns `RESULT_ALREADY_RECORDED` and requires correction workflow.

### 8.3. Simultaneous status results

Competition row lock + `status_version` serialize applications. A Session may start only if affected users have no status transition lock. Already booked future Sessions wait at start, not silently recalculate after the fact.

### 8.4. Timer vs manual action

Timer payload includes `expected_state`, `expected_version`, `deadline_at`. Manual response increments version. Late timeout becomes a no-op with `STALE_TIMER_IGNORED` audit metric, not a domain event.

### 8.5. Reschedule count

Challenge row is locked; count and new reschedule record commit together. Two simultaneous third attempts can create at most one Forfeit.

## 9. Eligibility gates and stable error codes

| Code | Meaning | Retry behavior |
|---|---|---|
| `ACCOUNT_NOT_VERIFIED` | Official capability missing | retry after verification |
| `PHONE_NOT_VERIFIED` | ordinary Booking unavailable | retry after phone |
| `AGE_CONTOUR_MISMATCH` | Youth/Adult crossing | non-retry for pair |
| `MEMBERSHIP_NOT_ACTIVE` | no active Competition Membership | retry after activation |
| `MEMBERSHIP_REAPPLY_WAIT` | prior self-request rejected less than 7d ago without override | retry at `reapply_not_before_at` or with invite/authorization |
| `MVP_ACTIVE_COMMUNITY_LIMIT` | another competitive Membership active | user choice required |
| `COMMUNITY_PAUSED` | Competition availability hold | retry after reactivation |
| `PAIR_BLOCKED` | effective Block on Social/Match-based optional action | not retry until unblock/new eligibility; never returned for status FIFO/mandatory service action |
| `PAIR_COOLDOWN_ACTIVE` | effective pair cooldown | retry at `ends_at` |
| `PAIR_CHALLENGE_EXISTS` | live competitive relationship | retry after terminal |
| `OPTIONAL_INVITE_LIMIT` | initiator already has three unanswered optional invitations | retry after one accepts/declines/expires/withdraws |
| `OPTIONAL_PAIR_QUIET` | same pair declined optional Challenge less than 48h ago | retry at quiet_until |
| `OFFICIAL_OBLIGATION_LIMIT` | Athlete already has accepted uncompleted Official Challenge | retry after current obligation terminal |
| `STATUS_SLOT_BUSY` | FIFO/transition obligation active | queue/wait |
| `STATUS_TRANSITION_PENDING` | Result provisional/appeal | wait/finalize |
| `YOUTH_CONSENT_REQUIRED` | per-challenge consent missing | collect consent |
| `RULESET_ACK_REQUIRED` | explicit ruleset acknowledgment proof missing | show exact snapshot and retry accept |
| `SLOT_UNAVAILABLE` | atomic claim lost | select another |
| `COACH_CONFLICT` | overlap/self-arbitration/authorization | replace Coach |
| `ATHLETE_SCHEDULE_CONFLICT` | Athlete already has overlapping confirmed Session | choose another Slot/reschedule |
| `PROCESS_ON_HOLD` | scoped Safety/Admin/Pause hold | wait/review |
| `SENSITIVE_ACTION_HOLD` | verified phone changed less than 24h ago | retry at hold_until; existing obligation service responses remain allowed |
| `DUPLICATE_ACCOUNT_REVIEW` | account is in unresolved duplicate case | wait for scoped Central disposition; no merge retry |
| `COACH_REPLACEMENT_RECONFIRM_REQUIRED` | replacement changes Venue/time/price/ruleset or occurs after start | use normal reschedule/reconfirmation; pre-start equivalent replacement only |
| `SESSION_AWAITING_COACH_START` | Session window open but no Coach Start/Attendance exists | Coach acts or operational failure review resolves; never count attendance |
| `INTEGRITY_CASE_ACTIVE` | final Result has active exceptional review | wait for independent decision/replay; ordinary Appeal remains closed |
| `RESCHEDULE_LIMIT_REACHED` | next culpable action means Forfeit | require explicit irreversible confirmation |
| `APPEAL_WINDOW_CLOSED` | server deadline passed/waived | terminal |
| `FEATURE_NOT_AVAILABLE` | capability intentionally absent in active product version | do not retry until feature/version changes |
| `EVIDENCE_LIMIT_EXCEEDED` | file count or 100MB case aggregate limit exceeded | remove/replace attachment |
| `EVIDENCE_TYPE_NOT_ALLOWED` | Result/PDF/archive/office or non-allowlisted media | use allowed Appeal/Safety image/audio/video |
| `MESSAGE_EDIT_WINDOW_CLOSED` | personal message is older than 15m or was reported | immutable; send a new message if allowed |
| `SERVICE_MESSAGE_IMMUTABLE` | edit attempted for service/action message | never editable |
| `STALE_VERSION` | optimistic concurrency conflict | refetch/retry command |

## 10. Statistics invariants

- Training profile count includes only `Session.ENDED` and only Athlete with `PRESENT` or `LATE`.
- Group Plan contributes nothing.
- Official stats derive from effective Result state; `ANNULLED/REPEAT_ORDERED` original result excluded from win/loss.
- DRAW contributes Session/draw, no loss/win/cooldown.
- NO_CONTEST contributes event history but no win/loss.
- Administrative Forfeit contributes official win/loss and status effect, but not attended Session count.
- Status history shows provisional label until final; compensation remains visible as corrected/annulled history, not disappearance.
- Public profile exposes current status, status tenure history, Official W/L/D, the five latest effective Official Results and attended Training total. FORFEIT/NO_SHOW appear with neutral public wording while their effective win/loss accounting remains unchanged. Win rate, reliability score, Safety/administrative reasons and ordinary Training partner identities are excluded.

## 11. Event audit completeness

Every state transition in `STATE_MACHINES.md` maps to at least one event named there. CI should maintain a registry test:

1. every allowed transition references a registered event schema;
2. every critical schema declares PII classification and consumer list;
3. every stateful consumer is idempotent by `event_id`;
4. replaying Competition events twice produces identical projection hash;
5. no event handler performs an un-audited direct status mutation.

## 12. Exact state-transition event registry

Этот registry нормативен: каждое имя из `STATE_MACHINES.md` зарегистрировано буквально, без зависимости от сокращённой группировки §3. Для каждого имени реализация заводит versioned schema, PII classification и owner.

```text
AcceptedChallengeAbandoned
AccountVerified
AgeDivisionChanged
AppealDecidedAnnulled
AppealDecidedRepeat
AppealDecidedReversed
AppealDecidedUpheld
AppealResponseAdded
AppealReviewStarted
AppealSlaExtended
AppealSubmitted
AppealUpheld
AppealWithdrawn
AttendanceRecorded
BookedChallengeCancelledByAthlete
BookingCancelledNoFault
BookingCompleted
BookingConfirmationExpired
BookingConfirmed
BookingConflictDetected
BookingOfficialReleasePending
BookingConvertedToTraining
BookingConvertedToSolo
BookingRejected
BookingRequestWithdrawn
BookingTrainingRetentionClosed
BookingTrainingRetentionConfirmed
BookingTrainingRetentionRequested
SessionConvertedToSolo
SessionConvertedToTraining
BookingConvertedToOfficial
CaseClosed
CaseDecided
CaseReviewStarted
CaseTriaged
ChallengeAccepted
ChallengeAwaitingResult
ChallengeBooked
ChallengeBookingStarted
ChallengeCancelledNoCapacity
ChallengeCancelledNoFault
ChallengeCompleted
ChallengeCreated
ChallengeCreatedFromConfirmedTraining
ChallengeDeclined
ChallengeQueued
ChallengeRescheduleProposed
ChallengeRescheduled
ChallengeRescheduledByAthlete
ChallengeResponseExpired
ChallengeReturnedToScheduling
ChallengeSchedulingExtended
ChallengeSessionStarted
ChallengeWithdrawn
ChampionSuccessionApplied
ChampionVacated
CoachAuthorized
CoachInviteClosed
CoachInvited
CompetitiveSessionInvalidated
CompetitionAvailabilityClosed
CompetitionClosed
CompetitionCreated
CompetitionPaused
CompetitionReactivated
ContenderAssigned
ContenderDefended
ContenderGenesisFinalized
ContenderGenesisPaired
ContenderTransferred
ContenderVacated
FoundingGenesisFinalized
FoundingGenesisPaired
GenesisRepeatRequired
GenesisStatusApplied
GenesisStatusAppliedWithVacancy
GenesisWithoutOpponent
GroupPlanCancelled
GroupPlanChallengeConversionRequested
GroupPlanConversionDeclined
GroupPlanConversionClosed
GroupPlanConversionPartyConfirmed
GroupPlanConvertedToChallenge
GroupPlanOfficialConversionQueued
GroupPlanDeclined
GroupPlanExpired
GroupPlanMutuallyConfirmed
GroupPlanProposed
GroupOfferingExpired
GroupOfferingPublished
GroupOfferingUpdated
GroupOfferingWithdrawn
GuestCoachAuthorizationExpired
GuestCoachAuthorized
GymAdminAppointed
LikeCreated
LikeExpired
LikeRemovedBySkip
LikeWithdrawn
MandatoryChallengeExpired
MandatoryChallengeRefused
MatchArchived
MatchBlocked
MatchCreated
MatchEnded
MatchReactivated
MembershipActivated
MembershipApproved
MembershipArchivedByCommunityClosure
MembershipAgeDivisionChanged
MembershipLeft
MembershipRejected
MembershipRemovalConfirmed
MembershipRemovalAppealed
MembershipRemovalRejected
MembershipRemoved
MembershipRequested
MembershipRequestWithdrawn
MissingResultRepeatOrdered
MissingResultReviewOpened
MissingResultReviewerCoachAssigned
MissingResultReviewResolved
MissingResultReviewStarted
ModerationCaseSubmitted
MutualLikeDetected
OfficialBookingCancelledByAthlete
PairCooldownExpired
PairCooldownRemoved
PairCooldownStarted
ProcessHeld
ProcessHoldReleased
QueueEntryActivated
QueueEntryConsumed
QueueEntryInvalidated
QueueEntryReconfirmationClosed
QueueEntryReconfirmed
QueueEntryWithdrawn
QueueReconfirmationRequested
RepeatSessionOrdered
RescheduleLimitForfeit
ResultAnnulled
ResultFinalized
ResultMetadataRevised
ResultPutUnderAppeal
ResultRecorded
ResultReversed
ResultUpheld
RoleRevoked
SafetyCaseSubmitted
SessionCancelled
SessionConvertedToOfficial
SessionEnded
SessionScheduled
SessionStarted
SlotBooked
SlotBookingCancelled
SlotCompleted
SlotEdited
SlotExpired
SlotMutuallySelected
SlotPublished
SlotSelectedByAthlete
SlotSelectionChanged
SlotSelectionExpired
SlotWithdrawn
SoloContinuationClosed
SoloContinuationConfirmed
StatusHolderRemovalReviewStarted
StatusTransitionCompensated
StatusTransitionFinalized
StatusTransitionRolledBack
SuccessionWithoutOpponent
TitleDefended
TitleTransferred
TrainingParticipantCancelled
TrainingOfficialConversionClosed
TrainingOfficialConversionPartyConfirmed
TrainingOfficialConversionQueued
TrainingOfficialConversionRequested
VerificationCancelled
VerificationExpired
VerificationRejected
VerificationRevoked
VerificationStarted
```

Registry continuation for auxiliary lifecycle machines:

```text
AccountRestrictionApplied
AccountRestrictionRevoked
AccountClosureCancelled
AccountClosureExecuted
AccountClosureRequested
AccountDataExportExpired
AccountDataExportPrepared
AccountDataExportRequested
AccountAccessIncidentConfirmed
AccountRecoveryApproved
AccountRecoveryCompleted
AccountRecoveryRejected
AccountRecoveryRequested
AuthOtpClosed
AuthOtpRequested
AuthOtpVerificationFailed
AuthOtpVerified
AuthSessionEstablished
AuthSessionRevoked
AuthSessionRotated
VerifiedPhoneChanged
BlockCreated
BlockRevoked
BookingCoachReplaced
ChatArchived
ChatClosed
ChatOpened
ChatReopened
ChatRestrictedToServiceActions
ChatServiceRestrictionReleased
CommunityClosed
CommunityClosureScheduled
CommunityConfigurationChanged
CommunityCreated
CommunityPaused
CommunityReactivated
EnforcementAppealModified
EnforcementAppealReviewStarted
EnforcementAppealRevoked
EnforcementAppealSubmitted
EnforcementAppealUpheld
EnforcementApplied
EnforcementExpired
EnforcementModified
EnforcementRevoked
EvidenceAttachmentAccepted
EvidenceAttachmentDeleted
EvidenceAttachmentQuarantined
EvidenceAttachmentRejected
EvidenceAttachmentSubmitted
EvidenceDisclosureExpired
EvidenceDisclosureGranted
EvidenceDisclosureRevoked
AvatarChanged
BookingClosedByPairSocialEnd
ChallengeClosedByPairSocialEnd
ChatMessageEdited
ChatMessageHiddenByModeration
ChatMessageHiddenForUser
ChatMessageReported
ChatMessageSent
DisplayNameChanged
DuplicateAccountCleared
DuplicateAccountResolved
DuplicateAccountRestricted
DuplicateAccountReviewStarted
IntegrityCaseAnnulled
IntegrityCaseCorrected
IntegrityCaseOpened
IntegrityCaseReviewStarted
IntegrityCaseUpheld
GenesisCandidateClosed
GenesisCandidateConsumed
GenesisCandidatePaired
GenesisCandidateReturnedToQueue
GenesisChallengeDeclined
GenesisChallengePartyAccepted
GenesisChallengeResponseExpired
GenesisPairingReleased
GroupPlanClosedByPairSocialEnd
IncidentResultCompensatedNoFault
IncidentTimeoutCompensatedNoFault
PairSuppressionExpired
PairSuppressionStarted
PairCooldownCompensatedNoFault
PausableDeadlineExtendedByPlatformIncident
PlatformIncidentCompensated
PlatformIncidentConfirmed
PlatformIncidentDetected
PlatformIncidentRejected
PlatformIncidentResolved
CompetitionStatusReplayedAfterPlatformIncident
PrimaryAdminAppointed
PrimaryAdminTransferred
QueueEntrySourceDetached
SessionCoachReplaced
SessionFailedExternal
SessionWindowOpened
ResignationPreviewed
StatusReleasePreviewed
StatusTenureClosed
StatusTenureCompensated
StatusTenureFinalized
StatusTenureOpenedFinal
StatusTenureOpenedProvisional
TechnicalCorrectionApproved
TechnicalCorrectionRejected
TechnicalCorrectionRequested
TechnicalCorrectionReviewStarted
TechnicalCorrectionWithdrawn
UserAccountActivated
UserAccountClosed
UserAgeDivisionChanged
VoluntaryResignationConfirmed
VoluntaryStatusReleased
VenueClosed
VenuePaused
VenueReactivated
VenueRegistrationStarted
VenueVerificationRejected
VenueVerified
YouthChallengeConsentDeclined
YouthChallengeConsentExpired
YouthChallengeConsentGranted
YouthChallengeConsentRequested
YouthChallengeConsentRevoked
```
