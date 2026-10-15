# MOLOKH MVP Implementation Backlog

## 1. Delivery rule

Работа идёт вертикальными slices. Каждый slice включает database migration, domain command, API contract, permissions, audit/outbox, client state, operator path и automated tests. «Backend готов, UI потом» не считается завершённым пользовательским сценарием.

## 2. Milestones

### M0 — Repository and quality foundation

Deliverables:

- Git repository and protected main policy when remote exists;
- pnpm monorepo skeleton;
- `apps/client`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/core`, `packages/db` and `packages/testkit`;
- formatting, lint, typecheck, unit/integration test commands;
- PostgreSQL local environment;
- migration runner;
- CI pipeline template;
- environment/secret conventions.

Exit: clean clone can boot API, database, worker and universal Expo shell; the same client route renders on Web, iOS and Android with one documented workflow.

### M1 — Platform transaction foundation

Deliverables:

- command envelope, actor context, expected version and idempotency;
- aggregate repository pattern;
- domain event/audit/outbox tables and transaction helper;
- worker/timer claim and stale-timer behavior;
- notification inbox projection;
- structured logs/traces.

Exit: sample aggregate command proves commit, replay, conflict, outbox and idempotent consumer behavior.

### M2 — Identity, Community and roles

Deliverables:

- phone authentication adapter boundary;
- User/Athlete profile, arbitrary display name and avatar scan port;
- Central verification without document upload;
- Venue/Community/Membership/config versions;
- Coach/Admin/Primary Admin grants;
- AccountAccessCase and DuplicateAccountCase;
- Central queues for verification, recovery and duplicates.

Exit: verified Adult User joins one Community, sees capabilities and cannot bypass scope/role guards.

### M3 — Discovery, Match and Chat

Deliverables:

- discovery hard gates/tier ordering projection;
- Like/Skip/Match/archive/Unmatch/Block;
- personal/service Chat and structured action cards;
- message edit revisions, delete-for-self and Report freeze;
- 15-day suppression and 30-day Like/archive timers.

Exit: two Users discover, match, chat, block/unmatch with optional cleanup and no accepted/status obligation loss.

### M4 — Scheduling and ordinary Training vertical slice

Deliverables:

- Slot/GroupOffering/GroupPlan;
- mutual selection and immutable commercial snapshot;
- atomic host confirmation/resource conflict handling;
- Coach replacement and external no-fault option;
- Session READY_FOR_COACH, Coach actual Start, Attendance and Training stats;
- solo continuation and Venue operational failure path.

Exit: first complete non-competitive journey works in the universal client, including responsive Web and Coach path, and passes Booking race tests.

### M5 — Challenge, FIFO and Status Engine

Deliverables:

- Challenge matrix/response policies/acknowledgments;
- one accepted Official obligation constraint;
- scheduling/reschedule/Forfeit lifecycle;
- public FIFO, reconfirmation and prebooked conversion;
- GENESIS/Succession/vacancy;
- immutable Session competitive snapshot;
- Competition journal, StatusTenure and Cooldown projections.

Exit: deterministic scenarios cover Ordinary→Contender, TITLE, founding/vacant GENESIS and status transfer under concurrent results.

### M6 — Result, Appeal and governance

Deliverables:

- Coach Result and metadata revisions;
- provisional public status/review marker;
- Appeal/waiver/withdraw/response/SLA;
- compensation and repeat;
- MissingResultReview and reviewer-Coach scope;
- IntegrityCase for Final Result;
- Safety, enforcement, evidence scan/disclosure/retention;
- Central case work queues.

Exit: result can finalize, reverse, annul and repeat without deleting history; replay hash remains deterministic.

### M7 — Youth, lifecycle and incident hardening

Deliverables:

- Youth/Adult hard separation;
- per-Challenge guardian consent without documents;
- 18th-birthday transition;
- Community pause/closure;
- status-only release/Membership exit/removal;
- PlatformIncident exact-overlap compensation;
- account closure/export/retention jobs.

Exit: all lifecycle P0 scenarios pass with no cross-age/status leakage.

### M8 — Release hardening and pilot

Deliverables:

- all P0 acceptance scenarios automated or explicitly mapped to reviewed manual operational tests where automation is impossible;
- load/concurrency/failure testing;
- security/privacy review;
- accessibility/localization review;
- monitoring dashboards/runbooks;
- backup/restore and projection rebuild rehearsal;
- pilot Venue/Coach/Central training.

Exit: Definition of Done in Core Engine v1.0 is satisfied.

## 3. Priority within each milestone

1. P0 integrity and irreversible consequences.
2. Happy path necessary for an end-to-end slice.
3. Recovery/timeout/concurrency path.
4. Admin/observability path.
5. P1 polish.
6. P2 schema seam only; feature stays disabled.

## 4. First sprint-sized backlog

No estimates are assigned before team capacity is known. Recommended order:

| Order | Story | Acceptance |
|---:|---|---|
| 1 | workspace boots API/worker/Postgres and shared contracts | documented local command |
| 2 | critical command envelope with version/idempotency | duplicate returns same event; stale version 409 |
| 3 | event/audit/outbox transaction helper | rollback leaves none; commit leaves all |
| 4 | User/profile/phone capability | no raw OTP/document in logs/data |
| 5 | Venue/Community/Member/Coach/Admin seeds | role/scope guards server-side |
| 6 | Slot publish/query | overlap constraint tested |
| 7 | pair mutual Slot selection | no reservation before host confirm |
| 8 | atomic host confirm | one of two racing pairs wins |
| 9 | READY_FOR_COACH and Coach Start | scheduled time alone creates no attendance |
| 10 | Attendance/end/Training stat | only PRESENT/LATE ended Session counts |
| 11 | Equivalent Coach replacement and external no-fault close | immutable terms; assignment audit; Athlete opt-out; no loss/stat |

This sprint produces a demonstrable Training slice while establishing the same foundations Competition will use.

### Current implementation progress (2026-09-09)

- Story 1: complete for the local environment; API, Worker, PostgreSQL and universal Expo shell boot successfully.
- Story 2: complete at the Core/platform layer; command envelope, actor snapshot, expected version, stable request hash and actor-command idempotency scope are implemented.
- Story 3: complete at the PostgreSQL primitive layer; aggregate mutation, domain event, audit, outbox and saved idempotent response commit atomically. Concurrent replay, changed-payload rejection, stale version, rollback and consumer Inbox deduplication pass real PostgreSQL integration tests.
- Outbox delivery increment: complete; leased `SKIP LOCKED` claim, bounded retry, crash-safe lease recovery, Graphile job deduplication and Inbox receipt handling are implemented.
- Timer foundation increment: complete; canonical payload, exact deadline boundary, state/version stale guard, early reschedule and diagnostic-only stale path are implemented. Product handlers register with their owning modules.
- Notification/observability increment: complete; event-to-inbox projection is atomic and duplicate-safe, notification reads enforce recipient ownership, and API request/correlation/causation IDs propagate through response headers and structured logs.
- M1 critical-delivery-intent increment: complete. A mandatory in-app projection atomically creates
  one provider-independent critical-push intent, while SMS requires an explicit database-backed
  event opt-in and an absent preference means opt-out. Migration `0062` stores no private contact
  destination, inbox replay and channel uniqueness prevent duplicates, and pending/failing external
  delivery plus notification reads cannot change the server-owned Challenge deadline. AC-164 passes
  Worker and real PostgreSQL coverage on the actual mandatory Challenge path without enabling a
  provider or promising delivery in the client.
- M1 exit: complete at the platform layer.
- Story 4 Sprint 1 increment: complete. The 14+ User/AthleteProfile activation, arbitrary display name, private name audit, local replaceable auth adapter, public capability projection, typed API and minimal universal client run end to end. Phone-confirmed but Central-unverified Athletes can use Discovery and ordinary Training but receive an explicit Official Challenge denial.
- Story 4 verification increment: complete. V-01 start, permission-protected Central FIFO queue and V-02 approval use checklist/version only, store no document/evidence, and immediately recompute Identity/Community capabilities.
- Story 4 Home Venue increment: complete. The Athlete can choose any active connected Venue from
  the universal profile. The versioned/idempotent command changes only Discovery/Slot geography,
  records event/audit/outbox proof and preserves Membership, status, FIFO and Challenge state.
- Story 4 authentication/account-access hardening: complete in code. A replaceable OTP transport
  boundary, five-attempt/10-minute challenge, opaque 15-minute access token, rotating 30-day refresh
  family, hash-only persistence, reuse-triggered family revocation, logout, trusted-session linkage
  and the 24-hour pre-change service-response mode now run through Core, PostgreSQL and typed API.
  Local development exposes its deterministic OTP only outside production; an external SMS provider
  remains optional and unconfigured. Account recovery and duplicate-account Central cases are also
  complete. Web refresh is kept in an HttpOnly/SameSite cookie, native refresh in Expo SecureStore,
  and the universal client restores/rotates the managed session without persisting a Web refresh or
  access token. Production bootstrap is now fail-closed: it disables all local fixtures/static
  tokens, requires explicit secrets/pilot IDs/HTTPS origins and rechecks the active Central role
  from PostgreSQL for every privileged request. The avatar upload/scan provider boundary is also
  complete and disabled by default: it accepts only allowlisted image metadata, returns no ticket
  without an adapter and never attaches unscanned media. Remaining Story 4 external work is an
  actual private object/scan provider and an opt-in OTP delivery provider.
- Story 5 foundation: complete. One deterministic pilot Venue/Community and active Membership render in the universal client. Database constraints enforce one current Community per Venue, one active competitive Membership per Athlete, immutable configuration ownership and at most one active Primary Admin. Pure Core guards enforce exact Venue/Community/Global role scope.
- Story 5 Coach increment: complete. RG-01/RG-02 provide an audited/idempotent 72-hour invitation, database-backed Venue scope checks, verified-target guard, invitee-only acceptance, canonical in-app notification outbox and deterministic local Coach walkthrough.
- Story 5 Guest Coach increment: complete. AC-019/RG-06/RG-07 authorize only an active verified
  non-participant Coach already assigned to one concrete Session. The SESSION RoleGrant never
  crosses into another Session; cancellation or
  terminal Result removes DB-authoritative capabilities immediately and the bounded Worker sweep
  appends the EXPIRED grant/event/audit/outbox history idempotently. The Admin/Coach client explains
  the exact scope and terminal expiry without inventing a new permission model or persistence table.
- Story 5 Admin increment: complete. Central appoints only active verified Gym Admins, the first Primary appointment and every transfer serialize on one Venue aggregate, the former Primary keeps the ordinary Gym Admin grant, and database uniqueness guarantees one active Primary. RG-08/RG-09/RG-10 are audited, notified, race-tested and available through a repeatable local operator script.
- Story 5 Community configuration increment: complete. AC-166/CO-06 lets a database-authorized scoped Gym Admin, Primary Admin or Central publish Pair Cooldown only inside 7–30 days. Each change appends an immutable public version and atomically advances the Community pointer/version with event, audit and outbox; existing Challenge/Session snapshots and already-created Cooldowns retain the preceding version while new Challenge snapshots use the current one.
- Story 5 Membership onboarding increment: complete. Hashed QR/invite activation, self-request,
  12h Admin reminder, 24h Central escalation, scoped FIFO approval, neutral rejection with a
  seven-day reapply guard and requester withdrawal now run through Core, API, universal client,
  Worker and real PostgreSQL. Internal rejection reasons never enter Athlete-facing event or
  notification payloads.
- Story 5 remaining: no local pilot blocker. External private object/scan and opt-in OTP providers
  remain M2 deployment inputs; their fail-closed ports, production role-aware session wiring,
  recovery and duplicate-account governance are complete.
- M3 Discovery read increment: complete. A versioned, lexicographic ranking policy exhausts the selected radius before city expansion, highlights inbound interest inside each geography tier, treats sport as a soft signal and uses a stable ID tie-break. PostgreSQL source tables and hard gates exclude self, inactive/paused accounts, cross-age candidates, Block, active suppression and active/archived Match without computing a reliability score. The API and universal client render the second deterministic Athlete.
- M3 social mutation increment: complete in code. Idempotent Like/Skip commands use a normalized pair lock; mutual Like creates both terminal Like states, exactly one Match and one personal Chat in one transaction. State/version-guarded worker timers expire one-sided Likes after 30 days and Skip suppression after 15 days. The universal client shows only Like/Skip and adds Match after mutual intent.
- M3 Block/Unmatch increment: complete. Unmatch atomically closes the personal Chat and starts the 15-day pair suppression; directed Block closes any personal Match/contact and withdraws a pending pair Like. Both commands expose and audit the invariant that accepted obligations and status paths are preserved. Unblock never restores the old Match. Core, API, universal client and real PostgreSQL scenarios pass.
- M3 Chat increment: complete. Match opens a separately versioned Chat event stream; participants can read/send personal text, edit through append-only revisions for 15 minutes, hide only their own view and Report with an immutable evidence snapshot. Service/action payloads are system-owned structured objects, never inferred from message text. The universal client has a dedicated Match-to-Chat route, and Core/API/PostgreSQL tests cover ownership, edit expiry, Report freeze and action-card immutability.
- M3 exit: complete for the local pilot.
- M4 publication increment: complete. Authorized Coach/Gym Admin commands publish personal Slots; only scoped Gym Admin publishes manual GroupOffering records. PostgreSQL enforces non-overlapping active Coach intervals, Core enforces future valid intervals within the Venue horizon, both resources expire through versioned worker timers, and an active Match Chat reads them across connected active Venues. Group cards include the Venue contact snapshot, freshness and explicit capacity disclaimer. A repeatable local script and universal Chat cards prove the live HTTP path.
- M4 mutual-intent increment: complete. The first Athlete creates a one-hour Slot selection or proposes a GroupPlan; only the peer can confirm. B-02 freezes the exact commercial snapshot while leaving Slot ownership untouched, GP-02 notifies the responsible Venue Admin without promising capacity, and state/version timers close stale paths.
- M4 GroupPlan Official conversion increment: complete. GP-05…GP-08 let either Athlete request an Official conversion only for a mutually confirmed social plan with a frozen authorized Coach. The requester, peer and Coach answer independently; before the third acceptance no Challenge, Session or obligation exists. The final transaction rechecks competitive eligibility and creates one NONE-stake Challenge, GROUP_REFERENCE Slot, confirmed Booking and frozen Official Session while keeping group capacity unreserved. Any required-party decline restores `NOTIFIED` without sporting effects. AC-025/AC-026 pass in Core/API/client/Worker and real PostgreSQL.
- M4 pre-confirmation withdrawal increment: complete. Either Athlete can cancel a `SELECTING` or `HOST_CONFIRMATION_PENDING` Booking through B-04 after a clear client confirmation. The Booking closes while the Slot stays published; an Official Challenge returns to scheduling without changing its accepted obligations/deadline or creating a Result, loss, Forfeit, Cooldown or reschedule count. Booking-row serialization gives withdrawal and host confirmation exactly one outcome, with idempotent replay, stale-version rejection, audit/event/outbox and peer/host notifications.
- M4 host-confirmation increment: complete. Assigned Coach or Venue Admin sees a minimal queue; confirmation atomically claims the Slot, creates one `SCHEDULED` Session and notifies both Athletes. A two-pair Slot race produces exactly one confirmed Booking and one explicit resource-conflict rejection. AC-153 additionally serializes confirmations for different overlapping Slots around Athlete row locks: one Session wins, the other returns `ATHLETE_SCHEDULE_CONFLICT`, and no losing Slot is reserved or replaced automatically.
- M4 Session lifecycle increment: complete. A versioned timer opens the Session window at the scheduled boundary without creating attendance; the assigned non-participant Coach can explicitly Start or atomically Start with first Attendance, record `PRESENT/LATE/NO_SHOW` under configured grace, and End after both facts. Only `ENDED` ordinary Sessions with `PRESENT/LATE` contribute to the derived Training count. Athlete Check-in remains absent.
- M4 replacement/no-fault increment: complete. A scoped Gym Admin can atomically replace the assigned Coach before actual start only with a free authorized Coach, while immutable time/Venue/commercial terms remain unchanged and both assignment histories are appended. Replacement reissues the versioned window timer so the prior Session version cannot strand the Session. Either Athlete may then close the Session no-fault; Admin/Central may also close a confirmed external operational failure. Booking, Session and Slot close together, participants are notified, and no attendance, Training stat, Forfeit or user reschedule count is created.
- M4 Gym Admin dashboard read increment: complete. One Venue-scoped query returns Venue publication limits, authorized Coaches, future personal Slots and GroupOfferings, actionable host-confirmation requests and informational GroupPlan interest. The universal client renders these categories separately so group interest cannot be mistaken for capacity or a booking. Typed contract, authorization, API and real PostgreSQL assertions pass.
- M4 Gym Admin publication UI increment: complete in code. The universal client publishes either a personal Slot with an authorized Coach and optional RUB price or a GroupOffering with sport, label and optional Coach/terms. Venue-local date/time is converted through the Venue timezone, duration stays a simple 60/90-minute choice, server horizon/conflict guards remain authoritative, and successful cards appear immediately without a full reload.
- M4 Gym Admin mutation increment: complete in code. Venue Admin can edit or reason-withdraw a future Slot/GroupOffering only while it has no active pair intent. Coach/Admin can reason-reject a host request; both Athletes are notified and an Official Challenge returns to scheduling without deadline or obligation reset. Core, typed API, universal UI and PostgreSQL integration scenarios are in place.
- M4 pilot walkthrough remains a manual release check; the automated Training slice is complete.
- M5 direct optional Challenge increment: complete. From an active Match, a verified competitive Member may create only an allowed OPEN/NONE invitation. The server freezes Community rules, enforces one live pair Challenge and at most three unanswered outgoing invitations, supports recipient accept/decline and initiator withdrawal, creates both accepted obligations atomically, starts a 14-day scheduling deadline, and expires unanswered invitations after 48 hours no-fault. The universal Chat renders the next action without mixing the invitation with ordinary Training.
- M5 Official Booking increment: complete. Selecting a personal Slot for an accepted Challenge creates an explicitly linked `OFFICIAL_CHALLENGE` Booking and moves Challenge to `BOOKING_PENDING`. Peer selection preserves the frozen commercial snapshot; Venue/Coach confirmation atomically claims the Slot, creates the linked `OFFICIAL_CHALLENGE` Session and moves Challenge to `BOOKED`. Expiry/resource rejection returns it to scheduling without resetting the 14-day deadline or obligations.
- M5 first Athlete-reschedule increment: complete. CH-22 lets either participant explicitly spend the first of two user reschedules before a confirmed Session. The Challenge returns to `ACCEPTED_UNSCHEDULED`, a pending Booking closes while its Slot remains published, and the original obligations/deadline survive. Counter, initiator, A/B fault, reason and optional Booking lineage commit as one append-only fact with Challenge/Booking events, private audit detail, outbox/timer replacement and peer/host notifications. Exact replay is idempotent, stale versions fail and the shared Booking lock serializes Athlete reschedule, B-04 withdrawal and host confirmation without sporting sanctions.
- M5 mutual Challenge-reschedule increment: complete. CH-21 keeps a versioned proposal separate
  from the completed reschedule: the initiator cannot self-confirm, and Challenge/resources/counter
  remain unchanged until the peer confirms. Confirmation atomically consumes one shared transfer,
  appends `MUTUAL` with no fault user, closes pending or confirmed pre-start scheduling resources
  through B-15/SL-06, preserves obligations/deadline and emits audit/event/outbox plus Athlete/Coach
  notifications without exposing the private reason note. The two-transfer limit, exact replay,
  stale versions and resource races remain DB-authoritative. AC-062 passes end to end under migration
  `0061`.
- M5 external Challenge-reschedule increment: complete. The assigned authorized Coach, scoped Venue
  Admin or Central may confirm an objective pre-start Coach/Venue failure. The existing Session,
  B-15 Booking and SL-06 Slot close atomically; Official Challenge returns to
  `ACCEPTED_UNSCHEDULED` with unchanged obligations, canonical deadline and user counter even when
  both user reschedules are already spent. One append-only EXTERNAL/no-fault record, CH-21 event,
  replacement timer, audit and Athlete notifications retain Booking/Session lineage without a
  Result, loss, Forfeit or Cooldown. AC-063 passes Core/API/client and real PostgreSQL gates.
- M5 confirmed Official cancellation increment: complete. Before actual start, either Athlete may
  explicitly accept the sporting consequence and cancel the confirmed Booking/Session. B-14 and
  CH-12 close Booking, Session and Slot atomically, keep the frozen competitive snapshot and
  create one administrative `FORFEIT` through the existing Result engine: the cancelling Athlete
  loses, the peer wins and the normal 48-hour Appeal, provisional status and Cooldown rules apply.
  The user-reschedule counter and history remain untouched. Exact replay, stale versions,
  DB-authoritative Athlete permission and races with Start/Result/reschedule are covered through
  the shared resource locks. AC-065 passes Core/API/client and real PostgreSQL gates.
- M5 exhausted-reschedule consequence increment: complete. CH-23 keeps the shared counter capped
  at two and requires a separate explicit client/server confirmation before another culpable
  Athlete attempt becomes an administrative `FORFEIT`. The peer wins, the normal 48-hour Appeal,
  provisional status and Cooldown lifecycle starts through the existing Result engine, and a
  pending Booking closes while its Slot remains published. No third `ChallengeReschedule` fact is
  written. Booking-first locking serializes host confirmation and other reschedule paths; exact
  replay, stale version, private reason handling and Coach notification pass AC-064 end to end.
- M5 Official Session lifecycle increment: complete in code. The scheduled boundary freezes one immutable competitive snapshot but no attendance; Coach Start or first Attendance atomically commits `CH-13` to `IN_SESSION`, and Coach End commits `CH-14` to `RESULT_PENDING`. The outbox carries 2h/12h/24h Result reminder deadlines while ordinary Training remains outside Competition.
- M5 Result/status increment: complete in code. Authorized Coach Result commits `CH-15`, stores immutable source facts, derives status only from the Session snapshot, applies an immediate provisional transition and status lock, creates a configurable pair Cooldown after decisive loss, and schedules the 48-hour finalizer. AC-078 permits only a 24-hour server-time append-only score/method metadata revision by the recording or assigned DB-authorized Coach; the source Result, winner/outcome, snapshot, Challenge, status, Cooldown and Appeal deadline stay unchanged, while private before/after values remain outside public payloads. AC-079 proves the correction boundary: exact replay returns the recorded Result, payload reuse is rejected, a new second Result gets `RESULT_ALREADY_RECORDED`, no direct update API/client action exists, and only the separate TC-01 request is offered without mutating Result/snapshot/status/Cooldown/deadline or leaving failed-command effects. AC-202 is explicit: `LATE` remains attendance metadata and cannot synthesize `NO_SHOW`, Forfeit, loss, administrative Result or Cooldown; the assigned Coach can record the ordinary Result against the frozen Session snapshot. AC-203 enforces configured grace, separates Attendance from Coach Result, binds one absence to the present winner plus normal Appeal, and normalizes two absences to `NO_CONTEST` without winner/status/loss/Cooldown. AC-209 keeps post-start Athlete injury/voluntary withdrawal decisive under the frozen Session snapshot: the assigned Coach records the peer winner plus a normalized method, ordinary Appeal/status/Cooldown rules remain in the existing Result engine, personal stoppage cannot become `NO_CONTEST`, and no medical document is requested or stored. AC-210 reserves post-start external no-fault `NO_CONTEST` for normalized equipment, Safety or Venue failure, retains the frozen snapshot and ordinary symmetric Appeal, and creates no winner/loss/status lock/transition/Cooldown or reschedule change. AC-167 closes the MVP media boundary: Result remains fully recordable through a closed media-free contract, while no upload capability, endpoint, persistence, object-storage write or media-bearing event is exposed. Duplicate Result and stale status snapshots fail atomically. AC-140 proves that competing status-bearing Results serialize on the Competition row lock: exactly one Result/status lock/transition/Cooldown/Appeal commits and the loser leaves no partial audit, event, outbox or notification state. AC-143 adds a Central-only, row-locked and version-rechecked rebuild of disposable Competition/Cooldown state plus deterministic StatusTenure derivation; pre-delete and post-replay hashes match without mutating canonical sporting facts. AC-144 verifies complete append-only audit facts for DB-authorized Coach, scoped Gym Admin and assigned Central actions; failed permission and exact replay add no success audit, while private Central explanation remains only in protected state/audit metadata.
- M6 Technical Correction lifecycle increment: complete for TC-01/TC-02/TC-04/TC-05. An actively authorized
  recording/assigned Coach or internal Central actor may submit one immutable `SUBMITTED` request
  with original/proposed outcome and winner. Athlete access, stale versions and concurrent
  duplicates are rejected; private reason/evidence stays in protected state and audit metadata.
  Result, status, Cooldown and Appeal do not change, while Central receives a neutral FIFO item.
  An independent DB-authorized Central reviewer alone may take the versioned request and approve
  or reject it with a mandatory protected reason. TC-04 preserves the recorded Result and frozen
  Session facts, appends a separate effective decision, and compensates/reapplies provisional
  status and Cooldown through the existing deterministic replay rules. An open Athlete Appeal is
  never closed implicitly. Neutral notifications plus decision/audit/event/outbox effects commit
  atomically, and either terminal request leaves the active queue. AC-147 passes Core/API/client
  and real PostgreSQL gates.
- M6 Appeal lifecycle increment: complete. Only an eligible Athlete can submit Appeal or irreversibly waive it. AC-112 proves that DRAW is fully symmetric: neither Athlete is a winner/loser, both receive the same 48-hour server-window action, and the first concurrent submission alone creates one Appeal plus atomic Result/Challenge `UNDER_APPEAL` transitions without status or Cooldown. AC-122 proves the decisive contour: the sole eligible loser can append one immutable waiver inside the server window, immediately finalize through R-04, release obligations and clear the status lock without rewriting Result/Session facts or invalidating the ordinary Cooldown. AC-121 proves that a QueueEntry submitted during provisional status keeps its server FIFO key, cannot activate through the status lock, and is deterministically reconsidered after finalization or compensation without rewriting `submitted_at`. Exact replay is stable; winner, Coach, outsider, expired, stale and later Appeal attempts leave no partial records. The client derives both Appeal actions from server capabilities and hides both after waiver. Otherwise a state/version-guarded Worker timer commits `CH-17` at the deadline.
- M6 Central decision increment: complete. An independent active global Central reviewer takes a FIFO item and records one reasoned `UPHOLD`, `REVERSE`, `ANNUL` or `REPEAT` decision. Original Result facts remain immutable; status finalization/compensation, Cooldown invalidation, obligation release or the new 14-day repeat cycle commit atomically with event/audit/outbox history. AC-150 proves that `ANNUL` closes the provisional StatusTenure with compensation lineage, restores the exact pre-Result holder, preserves FIFO submission time and rebuilds the same holder/version/tenure/Cooldown hash from canonical events. Typed Central API and the universal Community screen expose only server-authorized actions.
- M6 participation/SLA increment: complete. The opponent and assigned Coach may each append one response during 24 hours without blocking Central; the appellant may withdraw before a decision without reopening uniqueness; the assigned reviewer may transparently extend SLA once by 24 or 48 hours with a visible reason. Typed API/UI and PostgreSQL integration cover response, extension, decision and decisive-result withdrawal/finalization.
- M6 MissingResultReview increment: complete. State/version timers remind Coach at 2 hours,
  escalate to the Venue at 12 hours and open exactly one review at 24 hours. Private Athlete
  statements, Venue attendance confirmation and Central coordination lead either to a constrained
  independent-Coach Result, a late original-Coach Result, a no-fault repeat or constrained
  `NO_CONTEST`. Core, API, universal UI, Worker and PostgreSQL integration pass.
- M6 Final Result IntegrityCase increment: complete. A Final Result can enter an evidence-scoped
  Central-only exceptional review for fraud, system error or identity error. Independent review
  holds incompatible Competition actions; uphold/correct/annul/repeat appends an immutable
  decision and deterministic replay hash, compensates status without rewriting source facts and
  exposes only a neutral category to participants. Core, typed API, universal UI and PostgreSQL
  integration pass.
- M5 Status Queue foundation: complete. An eligible verified Ordinary explicitly enters the
  current GENESIS/status contour; PostgreSQL assigns the immutable server time, enforces one live
  intent per Athlete/target and orders public rows by `(submitted_at, queue_entry_id)`. Active
  members see identity, position, time and public state; outsiders receive only the aggregate.
  Athlete withdrawal is versioned/idempotent, creates no loss and any later entry receives a new
  key. Core, typed API, universal UI, live HTTP/browser smoke and PostgreSQL migration gates pass.
- M5 GENESIS mutual-response increment: complete in code. The first two valid candidates are
  paired atomically into one `MUTUAL_GENESIS` Challenge and service Chat. Each has 48 hours to
  accept; obligations and the 14-day scheduling window start only after both accept. Decline and
  timeout are no-fault, while an already-accepting survivor returns with the original FIFO key.
  The accepted GENESIS service Chat can use the existing personal Slot → mutual selection →
  Venue/Coach confirmation → `OFFICIAL_CHALLENGE` Session path without inventing a social Match.
- M5 founding GENESIS Result increment: complete. AC-100 carries that accepted pair through the
  assigned Coach Session and a normal decisive Result. The immutable empty-holder snapshot drives
  one provisional ST-01 assignment, status lock, two replayable provisional tenures, ordinary
  Cooldown and the 48-hour Appeal window. R-04 finalization releases both obligations, makes the
  tenures final, appends C-04, moves the Competition from `FOUNDING_CHALLENGE` to `RUNNING` and
  preserves the original FIFO timestamps, Result and Session snapshot. Current and deterministic
  replay projections match after exact-idempotent finalization. AC-101 reuses the same lifecycle
  for founding `FORFEIT`/`NO_SHOW`: ST-02 assigns only the Champion, C-04 finalizes into
  `CONTENDER_VACANT_OPEN`, the Contender stays null and the public vacancy opens without assigning
  a candidate or rewriting FIFO history. AC-105 completes C-05/C-10: an effective DRAW,
  NO_CONTEST or independent repeat decision advances the existing GENESIS Challenge cycle and
  returns the same frozen pair to scheduling. Competition phase/status, consumed FIFO identities,
  obligations and priority remain stable; no new QueueEntry, loss, status transition or Cooldown
  is created.
- M5 direct-status FIFO activation increment: complete. The Worker reacts to queue/head-release,
  Result finalization and review-decision events, revalidates the strict oldest eligible entry
  under the Competition lock and atomically creates one `MANDATORY` Contender Challenge plus its
  service Chat and immutable ruleset proof. The current Contender has 72 hours to accept; one
  mandatory reminder is published after 48 hours. Acceptance creates the same two obligations and
  14-day scheduling window used by the established Official flow. Explicit refusal or timeout
  records an appealable administrative Forfeit, moves Contender provisionally, starts the normal
  48-hour Result/Appeal window and never fabricates a Session, Venue or Coach. The queue entry is
  consumed only with Challenge creation; stale holder entries are invalidated without loss and a
  busy status slot is deferred. AC-092 proves that three valid submissions remain independently
  versioned `WAITING` entries in strict server FIFO while that slot is occupied: no Challenge,
  response clock, Chat, ruleset snapshot, obligation or failed-command side effect is created.
  Core, typed API/client, Worker and PostgreSQL integration pass.
- M5 holder-change reconfirmation increment: complete. After a final Result/Appeal/Integrity
  decision, the Worker compares every waiting direct-status entry with the current Contender under
  versioned commands. Migratable entries keep their immutable FIFO key, bind the new holder and
  receive a 24-hour `RECONFIRMATION_REQUIRED` window. The Athlete can reconfirm or leave without
  loss; a stale-safe timer expires silence. AC-098 keeps reconciliation frozen behind the
  provisional status lock and invalidates the former Contender's own `CHAMPION` intent through
  Q-08 after finalization, preserving its history while creating no reconfirmation, loss, Challenge
  or Cooldown. A reconfirming head blocks later entries until it closes,
  and successful reconfirmation resumes normal activation. The universal Community screen shows
  the new Contender, exact deadline and two plain actions. Core/API/client/Worker and PostgreSQL
  scenarios AC-095–AC-097 pass.
- M5 voluntary status-release increment: complete. Champion or Contender receives an explicit
  consequence preview and a 15-minute token-bound confirmation step. Confirmation changes only
  the status projection: Membership remains ACTIVE and no Result, loss or Cooldown is created.
  Champion succession and Champion/Contender vacancy use the canonical ST-09/ST-10/ST-14
  transitions. Waiting direct entries keep their immutable FIFO identity/time and become GENESIS
  candidates. Core, typed API/client and PostgreSQL scenarios AC-106/AC-108/AC-186 pass.
- M5 deterministic vacancy-succession increment: complete. Every open founding/Contender vacancy
  revalidates the immutable FIFO head. The first two valid candidates are paired by the Worker
  into one mutual GENESIS Challenge; a single candidate receives a visible three-day deadline and
  a state/version-guarded promotion timer. A later second candidate makes that timer stale, while
  decline/timeout restarts a fresh solo window for the surviving original FIFO entry. Single
  promotion applies C-03/C-08 without Result, loss or Cooldown. Core/client/Worker and PostgreSQL
  scenarios AC-093/AC-094 pass; AC-102 additionally proves exact-deadline SYSTEM promotion of the
  sole eligible founder into final Champion with a vacant Contender, immutable FIFO identity and
  deterministic replay. AC-103 proves the two-candidate C-07/C-09 path: strict FIFO pairing,
  mutual acceptance, existing Booking/Official Session scheduling and the frozen
  `GENESIS_CONTENDER` snapshot end in one final Contender while the Champion remains unchanged.
  Result, Appeal, Cooldown and replay use the ordinary engine. AC-104 proves the parallel C-08 path:
  after the exact server deadline the
  only eligible candidate becomes final Contender, the Champion stays unchanged and no sporting
  Result or Cooldown is created. Canonical replay now orders numeric aggregate versions before the
  deterministic event-id tie-breaker, including transitions from version 9 to 10 and beyond.
- M5 confirmed-Training conversion increment: complete. Either Athlete may propose an
  Official conversion before the Session window; both Athletes and the assigned Coach are required,
  the deadline is capped at 72 hours and the existing Training remains the fallback on decline,
  timeout, failed eligibility or source start. Ordinary pairs commit Booking + Session + BOOKED
  Challenge + ruleset acknowledgments + obligations atomically. A Contender pair creates a public
  `PREBOOKED_CONVERSION`, cannot bypass an older FIFO entry and converts only after strict-head
  activation. Every cross-aggregate mutation now has its own versioned domain event. Core/API/
  Worker/type/build gates and real PostgreSQL scenarios AC-155–AC-162 pass under migration `0039`.
- M4 Training cancellation/solo increment: complete. Before actual start either Athlete may leave
  ordinary Training without loss, Forfeit, Cooldown or statistics. The remaining Athlete and Coach
  get one hour to accept; both accepts preserve the Session as `CONFIRMED_SOLO`, while decline or
  timeout cancels Booking/Session and releases the Slot atomically. A pending Official conversion
  closes first. Core/API/client/Worker and PostgreSQL scenarios AC-035–AC-037/AC-163 pass under
  migration `0040`.
- M5 active-conversion reconciliation increment: complete. The Worker revalidates a pending
  Training conversion whenever the Competition path advances, closes a stale holder or lost
  eligibility without loss, restores the source Booking as ordinary Training and resumes strict
  FIFO activation from the emitted close event. The command rechecks the canonical context under
  lock and emits versioned Booking/conversion events, audit, notifications and outbox atomically.
- The live multi-account walkthrough now covers a confirmed pair Training becoming a BOOKED
  `OFFICIAL_CHALLENGE` after both Athletes and Coach accept, plus Athlete withdrawal followed by
  remaining-Athlete and Coach acceptance of the same Session as `CONFIRMED_SOLO`.
- M7 Community lifecycle increment: complete. Central pause/reactivation and governed permanent
  closure now preserve confirmed Sessions only by an explicit Closure Plan, archive Memberships
  without losses and close status without hidden succession or migration.
- M7 voluntary Membership exit increment: complete. Athlete receives a
  token-bound 15-minute consequence preview; confirmation atomically closes optional unanswered
  Challenges no-fault, invalidates the departing Athlete's FIFO intents, applies ST-09/ST-10/ST-14
  when the Athlete holds status and moves Membership to `LEFT`. For an accepted, not-started
  Challenge, the same preview discloses and confirmation atomically creates a FINAL administrative
  Forfeit, immutable voluntary-resignation Appeal waiver and Cooldown, cancels Booking/Session/Slot,
  releases obligations, and removes any status temporarily assigned to the departing Athlete.
  Started Sessions stay on the Coach/frozen-ruleset path. Core/API/client and PostgreSQL scenarios
  AC-106/AC-107/AC-108/AC-109/AC-110 pass.
- M7 Membership removal governance increment: complete. Scoped Gym Admin removal closes an
  Ordinary's incomplete Official work no-fault and opens a 48-hour Appeal. An overturned decision
  creates a new active Membership without resurrecting cancelled work. Champion/Contender removal
  creates `UNDER_REVIEW` plus `STATUS_REVIEW` ProcessHold; Central confirmation applies audited
  succession/vacancy without Result or loss. The hold retains Challenge deadlines and prevents a
  booked Official Session from starting; in-progress/Result-pending Sessions finish before review
  can open. AC-022/AC-131/AC-132/AC-133/AC-134 pass.
- M7 Youth consent foundation: complete and disabled by default. Per-Challenge/per-Athlete records,
  token-scoped external guardian actions, independent two-Youth readiness, privacy-minimized
  contact storage, API/client flows and acceptance/Booking guards pass. Revocation closes the
  Official context no-fault; a booked physical Session is held for three explicit Athlete/Athlete/
  Coach-host decisions and either becomes Training or cancels without Competition effects under
  migration `0047`. AC-055/AC-149/AC-169/AC-170 are mapped.
  The server-date 18th-birthday timer now commits exactly one immutable `AgeDivisionChanged`,
  moves Membership to Adult Ordinary, expires Youth consent/FIFO, releases Youth status without
  a loss and closes not-started Youth Official work no-fault. A confirmed future Booking reuses
  B-26; a started Session keeps the field-identical competitive snapshot, Challenge state and
  obligations. Migration `0048` and PostgreSQL scenarios AC-002/AC-184/AC-185 pass.
- M7 PlatformIncident increment: complete. PI-01…PI-05 persist objective detection, Central
  confirmation/rejection, exact resolution window and automatic idempotent reconciliation.
  Active incidents suppress only registered affected timers. Resolution extends Challenge
  response/scheduling, Booking selection, queue reconfirmation, conversion confirmation and
  GENESIS public-window deadlines by exact overlap. An already-fired mandatory timeout retains
  its immutable Forfeit and receives append-only no-fault Result/status/Cooldown compensation.
  Central API/client operations and Worker exhaustion-before-`COMPENSATED` are executable.
  Migrations `0049`–`0052` and PostgreSQL scenarios AC-195/AC-196 pass; CH-24 gives scheduling
  one 7-day extension before CH-25 no-capacity cancellation.
  Acceptance traceability is 191/214 (`185/196 P0`).
- M5 optional Challenge response-clock increment: complete. CH-06 now publishes independent
  +12h/+24h state/version-guarded timer messages, projects idempotent recipient-only mandatory
  reminders and expires exactly at +48h as `EXPIRED_NO_FAULT`. Terminal expiry creates no Result,
  loss, Cooldown, obligation or pair quiet and releases the pair to the ordinary eligibility path
  for a later invitation. AC-172 passes Core/API/Worker/PostgreSQL and client-flow checks.
- M5 Champion-to-Ordinary OPEN increment: complete. AC-073 requires the existing Match and optional
  response path, then freezes `stake=NONE` when the Session window opens. A decisive Ordinary win
  remains an immutable official Result with the normal Appeal and pair-rematch Cooldown, while the
  Champion/Contender projection, status lock and status-tenure history remain unchanged. The Chat
  explicitly says that the title is not at stake. Core/API/client and real PostgreSQL proofs pass.
- M5 Champion-to-Contender optional TITLE increment: complete. AC-047 stores an immutable
  `OPTIONAL_TITLE` queue intent, preserves the shared `(submitted_at, entry_id)` order without a
  Champion privilege, and creates the TITLE Challenge, service Chat, ruleset snapshot and
  +12h/+24h/+48h stale-safe response timers only when that entry becomes the strict head. The
  Contender may decline without Result, Forfeit, status movement or Cooldown; role drift cannot
  silently reinterpret the saved offer as an Ordinary mandatory Challenge. Migration `0068` adds
  only the direct-intent mode needed to preserve that meaning.
- M5 stale TITLE Session invalidation increment: complete. AC-072 makes holder-changing
  Competition events recheck every not-started booked TITLE Session under the existing row and
  aggregate locks. SYSTEM closes the Challenge and obligations no-fault, advances the Session so
  its old start timer becomes stale, and opens exactly one B-26 decision. The physical Booking is
  held temporarily, remains explicitly non-Training until both Athletes and Coach/host accept,
  and B-29 cancels Booking/Session/Slot on decline or expiry. No Result, loss, status transition,
  Cooldown or reschedule count is created. Migration `0069` adds the normalized retention cause.
- M5 mandatory TITLE response-clock increment: complete. CH-07 publishes a separate +48h
  state/version-guarded reminder to the current Champion and expires only at the immutable +72h
  server deadline. The existing administrative Result engine records exactly one `FORFEIT`, swaps
  Champion/Contender provisionally under the `TITLE` stake, starts Pair Cooldown and the normal
  48-hour Appeal, while critical PUSH and opt-in-only SMS delivery remain provider-independent.
  Concurrent duplicate expiry jobs use the same deterministic idempotency scope and aggregate
  lock, so exactly one Result/status/Cooldown/Appeal lifecycle commits without duplicate audit,
  events or outbox messages. A manual accept committed before expiry advances the Challenge and
  turns both a normally late timer and the preflight/command TOCTOU race into a diagnostic stale
  no-op without a Result or retry loop. AC-053, AC-138 and AC-139 pass Core/Worker/PostgreSQL and
  client-flow checks.
- M7 account lifecycle increment: complete. ACR-01…ACR-03 implement self-requested closure,
  exact 30-day recovery, owner cancellation and reasoned Central execution only after all
  obligation/status/Session/Membership/role/FIFO blockers reach zero. ADE-01…ADE-03 prepare one
  private JSON export asynchronously, keep it for exactly 48 hours and then delete only the
  payload while preserving SHA-256/audit lineage. Closure reuses an existing live export, final
  public identity is pseudonymized, and immutable sporting history remains. Core/API/client/
  Worker and PostgreSQL migration `0053` pass.
- Next increment: complete real-browser 200% zoom plus real-device screen-reader/dynamic-text
  checks. The release canary and rollback compatibility gates are implemented and fail-closed.
  External object/scan and OTP delivery are intentionally
  deferred until provider accounts are selected. Chat payload cleanup is complete; evidence cleanup
  remains gated on the currently disabled attachment/storage capability.
- M8 role/pilot walkthrough increment: complete. Athlete, Coach, Gym Admin and Central workspaces
  expose their scoped actions with destructive controls guarded by explicit reason/confirmation.
  The walkthrough found a stale Session-window timer gap after Training→Official and pair→solo;
  the fix also covers Official→Training, adds current-version outbox assertions and migration
  `0057`, and recovered the existing pilot Sessions to `READY_FOR_COACH` without rewriting history.
- M8 database-recovery increment: complete locally. A custom-format PostgreSQL backup is validated
  by archive listing and SHA-256, restore is allowed only into a new `molokh_restore_*` database,
  critical canonical table counts are compared and the verified rehearsal database is then
  removed. The runbook separates disaster recovery from code/business rollback.
- M8 operational-monitor increment: complete locally. One read-only command checks API live/ready,
  outbox and Graphile delay, overdue Session windows, delayed Coach action, Result/Appeal/Missing
  Result queues, terminal status locks and verified-backup freshness. Critical findings fail the
  process; operational warnings can be promoted to failures for scheduled pilot alerts.
- M8 projection-rebuild increment: complete for the current generated notification projection.
  The isolated restore rebuilds notification fields in shadow form from canonical outbox events,
  compares deterministic count/hash plus Inbox receipts and explicitly excludes user-owned
  `read_at`. No live or canonical history table is truncated.
- M8 static-accessibility increment: complete. CI parses every client TSX control for explicit
  role/label/heading and selected/checked/disabled state, shared compact touch targets are at least
  44 points, and the Web document declares Russian language/title/description. Real VoiceOver,
  TalkBack, 200% zoom and largest-text device passes remain operational pilot gates.
- M8 rollback increment: complete. The operator gate compares the target Git revision with every
  live `platform.schema_migrations` SHA-256, accepts a schema-compatible prior release and rejects
  a target that predates migration `0057`. Database and sporting history stay forward-only.
- M8 release-canary increment: complete. Production requires the exact Git SHA; a read-only probe
  verifies live/ready, runtime identity, security headers, CORS and the protected auth boundary.
  The local rehearsal accepts the correct artifact SHA and rejects a deliberate mismatch.
- M8 Chat-retention increment: complete. Migration `0058` plus a daily bounded Worker erase only
  expired uncaptured payloads, preserve per-revision checksum/time/policy lineage and append one
  batch audit. Report/Case evidence and service Chat under its three-year term remain untouched;
  AC-214 passes against PostgreSQL.

## 5. Work that needs product/external input later

- final brand/design system assets;
- OTP/push provider accounts;
- hosting region/vendor and production budget;
- legal terms/privacy/Youth consent wording;
- initial Venue onboarding data and Coach agreements;
- sport-specific recommended ruleset wording;
- App Store/Google Play accounts;
- pilot support staffing and SLAs.

None of these should block local domain/API/database/test implementation.

## 6. Definition of a completed story

- linked canonical transition/invariant/AC IDs;
- migration and rollback-safe forward plan;
- positive, denied, stale-version and duplicate-idempotency tests;
- permission/conflict checks;
- domain event + audit + outbox;
- user-facing next action/error copy key;
- Central handling when applicable;
- observability signal;
- no new unregistered state/event/error code.
