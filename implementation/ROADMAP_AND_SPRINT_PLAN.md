# MOLOKH — Roadmap and Sprint Plan

**Baseline date:** 2026-09-06  
**Delivery model:** one developer with Codex, one-week iterations  
**Pilot target:** one closed pilot Venue, functional Web/iOS/Android client  
**Planning horizon:** 12 weeks, with scope protected by P0-first gates

## 1. Product outcome

The pilot must prove three equal product values in one coherent journey:

1. an Athlete finds a suitable training partner and reaches a Match;
2. both Athletes agree on a real training option at the pilot Venue;
3. an authorized Coach confirms what happened, while optional Official Challenges produce a transparent and auditable status movement.

The shortest honest path is Training first, Competition second. Both reuse the same Identity, Community, Chat, Slot, Booking, Session, notification and transaction foundations.

## 2. Milestone roadmap

| Milestone | Outcome | State | Exit gate |
|---|---|---|---|
| M0 — Workspace | Reproducible monorepo, CI template, local PostgreSQL, universal Expo shell | DONE | API, Worker, DB and Web/Android shell boot locally |
| M1 — Platform integrity | Atomic commands, event/audit/outbox, timers, notification inbox, request context | DONE | Commit/replay/conflict/rollback and duplicate delivery pass real PostgreSQL tests |
| M2 — Identity & Community | Athlete profile, verification, pilot Venue, membership and scoped roles | COMPLETE | Verified Adult joins one Community and cannot bypass role/scope guards |
| M3 — Discovery, Match & Chat | Transparent card ordering, Like/Match, personal chat and structured actions | DONE | Two Users can discover, match and coordinate without hidden reliability scoring |
| M4 — Training slice | Slot choice, mutual agreement, host confirmation, Session, Coach attendance and no-fault operations | COMPLETE | One end-to-end ordinary training works on the universal client |
| M5 — Challenge & Status | Challenge eligibility, FIFO, booking, Forfeit, Champion/Contender transfer and cooldown | COMPLETE | Concurrent status scenarios remain deterministic and auditable |
| M6 — Appeal & Governance | Provisional result, 48-hour Appeal, waiver, reversal/annul/repeat and Central queues | COMPLETE | A disputed result changes outcome without deleting history |
| M7 — Lifecycle P0 | Youth boundary, account/community lifecycle and platform-incident compensation | COMPLETE | Lifecycle P0 scenarios have no age/status/obligation leakage |
| M8 — Pilot hardening | Security, accessibility, failure recovery, backups, runbooks and Venue onboarding | IN PROGRESS | Closed pilot can run with documented support and rollback paths |

## 3. Weekly sprint plan

| Sprint | Dates | Primary deliverable | Demonstrable exit |
|---:|---|---|---|
| 0 | Through 06 Sep | M0 + M1 platform foundation | All current infrastructure gates pass; baseline committed |
| 1 | 07–13 Sep | User, AthleteProfile, local auth adapter and capability projection | DONE EARLY 06 Sep: seeded User signs in locally, edits profile and sees explicit capability denials |
| 2 | 14–20 Sep | Venue, Community, Membership, Coach/Admin grants and Central verification | DONE EARLY 06 Sep for the local pilot: scoped Coach/Gym Admin and atomic Primary lifecycle run end to end |
| 3 | 21–27 Sep | Discovery hard gates/order, Like, Skip, Match, Block and suppression timers | DONE EARLY 07 Sep: read/mutations, both expiry timers, atomic Match/Chat, Block/Unmatch preservation and Unblock semantics pass through the universal client and PostgreSQL |
| 4 | 28 Sep–04 Oct | Personal Chat, structured action cards, edit/archive/report seams | DONE EARLY 07 Sep: participant-only Chat, revisions, local deletion, Report freeze and typed action cards pass through API/client/PostgreSQL |
| 5 | 05–11 Oct | Slot, GroupOffering, mutual selection and Booking snapshot | DONE EARLY 08 Sep: both Athlete intents, immutable snapshot, Venue/Coach notifications and guarded expiry pass end to end |
| 6 | 12–18 Oct | Atomic host confirmation, Coach replacement, Session, attendance and Training stats | Racing bookings have one winner; Coach completes an ordinary Session end to end |
| 7 | 19–25 Oct | Challenge eligibility, response policies, FIFO and scheduling/reschedule rules | Allowed Challenge reaches confirmed Session; forbidden title paths are denied |
| 8 | 26 Oct–01 Nov | Result, provisional status, Champion/Contender transfer, Forfeit and cooldown | DONE EARLY 09 Sep in code: atomic Result/status/Cooldown and temporary lock pass static gates |
| 9 | 02–08 Nov | Appeal, waiver, reversal/annul/repeat and Central review queue | IN PROGRESS EARLY 09 Sep: submission, waiver and 48h finalization complete; Central compensation remains |
| 10 | 09–15 Nov | Youth/lifecycle P0, Community pause/closure and incident compensation | All lifecycle P0 scenarios pass with explicit Central handling |
| 11 | 16–22 Nov | Pilot hardening, accessibility, recovery, monitoring and projection rebuild | Production-like rehearsal passes; pilot runbook and rollback are usable |
| Buffer | 23–29 Nov | Defect reserve and pilot Venue onboarding | No unresolved P0 defect; Coach/Admin/Central walkthrough completed |

## 4. Sprint operating rule

Every sprint delivers one thin vertical slice. A story is done only when it contains:

- a canonical transition/invariant/acceptance reference;
- forward migration and an explicit aggregate version;
- permission, duplicate, stale-version and concurrency tests appropriate to its risk;
- event, audit, outbox and notification behavior where applicable;
- API schema plus minimal usable Web/iOS/Android and operator path;
- a safe error/next-action projection and an observability signal.

Visual polish does not block functional slices. The design-system pass happens during pilot hardening, while each earlier UI remains simple, accessible and usable.

## 5. Critical path and scope controls

```text
Identity/Community
  -> Discovery/Match
    -> Chat
      -> Slot/Booking
        -> Session/Coach Result
          -> Challenge/FIFO/Status
            -> Appeal/Central
              -> Pilot hardening
```

Rules protecting the 12-week target:

- one pilot Venue and one competitive Community in MVP;
- one active competitive Community per User in MVP, while the model preserves future multi-Community support;
- provider boundaries are implemented, but optional SMS, payments and Result media stay disabled;
- group training remains a mutual plan plus Venue notification/contact instruction, not a capacity or payment guarantee;
- Central may absorb operational complexity; Athlete and Coach paths stay short;
- P1 polish moves to the buffer before any P0 invariant is reduced.

## 6. External dependencies and mitigations

| Dependency | When needed | Mitigation before it exists |
|---|---|---|
| Pilot Venue data and Coach/Admin participants | Sprint 2; mandatory by Sprint 11 | Deterministic local seeds and scripted role walkthrough |
| OTP provider/account | Before real pilot accounts | Local adapter; no raw OTP in logs or persistent data |
| Push provider | Before field notification testing | In-app inbox is canonical; delivery never changes a deadline |
| Apple credentials/EAS login | Before iOS device release | Shared Expo code plus Web/Android gates continue; external iOS gate remains explicit |
| Hosting region and small production budget | Sprint 11 | Single-server deployment shape and local production-like rehearsal |
| Legal/Youth wording | Before inviting Youth users | Keep Youth feature behind a disabled policy flag if wording is unresolved |

## 7. Current evidence

- Core Engine v1.0: 309 transitions, 310 registered events, 214 acceptance scenarios and zero open blocking questions.
- Workspace: TypeScript checks and Web production build pass across all packages.
- Tests: 296 non-PostgreSQL tests and 66 real PostgreSQL scenarios pass, including stale pre-start TITLE Session invalidation through one explicit B-26…B-29 physical Booking decision, exact one-Session Guest Coach authorization/expiry, versioned Home Venue selection without Competition drift, immutable Pair Cooldown configuration publication with frozen old/new snapshots, Membership request/approve/reject/withdraw/QR activation, authentication/session policy, social concurrency, Chat revision/report/retention invariants, optional Challenge +12h/+24h reminders and exact no-fault +48h expiry, Champion-to-Ordinary OPEN with frozen `NONE` stake and no status movement, Champion-to-Contender optional TITLE through the same strict FIFO without priority or decline Forfeit, founding GENESIS through normal and FORFEIT decisive Results with deterministic full or vacant final status projections, strict-FIFO contender GENESIS through mutual acceptance, frozen Session snapshot and C-09 finalization, exact three-day no-opponent founder and Contender succession without Result/loss/Cooldown, same-pair C-05/C-10 repeat scheduling after GENESIS DRAW/NO_CONTEST or independent repeat, mandatory TITLE +48h reminder plus accept-before-expiry and concurrent duplicate-safe +72h appealable Forfeit/status swap, symmetric DRAW Appeal eligibility with one-winner Athlete race serialization, irreversible decisive Appeal waiver with R-04 early finalization, append-only 24-hour Result score/method metadata correction, immutable winner/outcome correction boundary with Technical Correction-only UX, post-start Athlete injury/voluntary stoppage as a decisive method without medical evidence, post-start external equipment/Safety/Venue no-fault NO_CONTEST, competing status-Result serialization, AC-150 annulled provisional-tenure compensation and deterministic Competition projection rebuild under the row lock, mandatory in-app plus critical-push intent projection without implicit SMS, single-winner Slot, Athlete-overlap and Athlete-withdrawal/unilateral/mutual/external-reschedule/reschedule-limit/host-confirmation/confirmed-cancellation Booking races, atomic Challenge→Booking→Session lineage, LATE and single/double NO_SHOW Result semantics, complete Technical Correction request/review/approve/reject serialization with immutable recorded and separate effective Result facts, privacy and replay proof, status FIFO, Training conversion, Youth boundaries, PlatformIncident reconciliation and account closure/export retention.
- Database: PostgreSQL 18 is healthy and checksum-verified migrations `0001`–`0069` pass. The recovered Docker runtime reused the existing database volume; no project file or database data was reset. Migration `0057` repaired current-version Session window timers without rewriting Session history; `0058` adds audited Chat payload minimization; `0059` adds hashed, expiring and usage-limited Community QR/invite resources; `0060` adds the bounded Challenge reschedule counter and immutable reschedule facts; `0061` adds the separate versioned mutual-reschedule proposal/confirmation record; `0062` adds provider-independent critical delivery intents without storing private contact destinations; `0063` adds immutable TC-01 requests and their Central FIFO index without mutating Result state; `0064` adds protected independent-review and rejection fields; `0065` adds immutable TC-04 effective decisions and status-compensation facts; `0066` adds immutable Result score/method metadata revisions; `0067` adds the versioned GroupPlan Official conversion and immutable three-party confirmations; `0068` preserves the immutable mandatory/optional meaning of each direct status queue intent; `0069` extends the existing Booking retention record with the normalized competitive-context invalidation cause.
- Product slice: the live universal Web route reads the seeded Athlete and changes an arbitrary display name through a versioned/idempotent API command; replay returns the same event.
- Community increment: the same route shows the pilot Venue, active Membership, public configuration version and Pair Cooldown; scoped Gym Admin/Central can publish 7–30 days while old Challenge/Session/Cooldown snapshots remain frozen. Role scope tests cover Coach/Admin/Primary/Central boundaries.
- Verification increment: Athlete V-01, Central queue and V-02 execute through live HTTP; approval unlocks Official capability and idempotent replay returns the same event.
- Coach increment: Central RG-01 and invitee RG-02 execute through live HTTP; duplicate creation returns the same resource/event and authority appears only after acceptance.
- Guest Coach increment: RG-06 creates an audited exact-Session grant only for the verified assigned
  non-participant without a Community Coach grant. Session/Result guards stop authority immediately
  after cancellation/final Result; the idempotent RG-07 Worker sweep persists EXPIRED history and
  never changes the completed sporting record.
- Admin increment: Central RG-08/RG-09/RG-10 execute through live HTTP; transfer is versioned and atomic, replay returns the same event, and exactly one active Primary remains while both ordinary Gym Admin grants survive.
- Discovery increment: one versioned rank policy enforces radius-first city expansion, visible inbound-interest priority, soft sport overlap and stable tie-breaks; the live client receives a second seeded Athlete without a hidden reliability score.
- Social increment: Like/Skip are versioned and idempotent; pair locking makes mutual Like create exactly one Match and personal Chat; 30-day Like and 15-day suppression timers are state/version guarded; the universal client exposes only the two simple Discovery actions.
- Social safety increment: Unmatch closes the personal Chat and suppresses rediscovery for 15 days; Block is directed, closes the personal contact and withdraws a pending Like; accepted obligations/status paths are never removed, and Unblock does not reactivate an old Match.
- Chat increment: Match emits `ChatOpened`; only participants can read/send, personal edits append revisions for 15 minutes, delete-for-self is local visibility, Report snapshots all revisions and freezes further edits, and typed action cards remain system-owned. The Expo client exposes this on a dedicated `/chat` route.
- Scheduling publication increment: Admin/Coach Slot and Admin GroupOffering commands are idempotent and audited; active Coach ranges cannot overlap, worker timers expire cards at start, and an active Match Chat shows connected-Venue options without claiming reservation, payment or group capacity. The live pilot returned one Slot and one GroupOffering over real HTTP.
- Scheduling mutual-intent increment: either Athlete proposes a Slot or GroupOffering from Chat; the peer alone completes mutual selection, the personal price/terms snapshot freezes at B-02, the Slot remains `PUBLISHED`, and GroupPlan only notifies the responsible Venue Admin. Versioned timers close stale selection/host/group states, and in-app notifications target the peer, Coach or Venue without controlling deadlines.
- GroupPlan Official conversion increment: a `NOTIFIED` social plan can enter a separate three-party GP-05…GP-08 confirmation. The final DB-authoritative eligibility check creates one NONE-stake Challenge plus a frozen GROUP_REFERENCE Booking/Session only after both Athletes and the assigned Coach accept; decline or timer expiry preserves the social plan without Result, loss, Cooldown or group-capacity claim.
- Scheduling host-confirmation increment: Coach/Admin sees pending requests in Community; one transaction claims the Slot, creates a `SCHEDULED` Session and notifies both Athletes. Database race tests prove that one Slot cannot create two Sessions and that one Athlete cannot receive overlapping confirmed Sessions across different Slots.
- Gym Admin mutation increment: future Slot/GroupOffering records can be edited or reason-withdrawn only before pair intent; reasoned host rejection notifies both Athletes and returns an Official Challenge to scheduling without resetting its obligation.
- Session lifecycle increment: the server opens `READY_FOR_COACH` at scheduled time; Coach owns actual Start, Attendance and End; completed Training count is derived only from ended `PRESENT/LATE` facts.
- Session timer continuity increment: Training→Official, pair→solo and Official→Training preserve the original scheduled boundary while advancing Session version, atomically publish a new versioned window timer and make the older job safely stale. The live repair advanced both previously stranded pilot Sessions to `READY_FOR_COACH`, and Athlete/Coach projections show the canonical state.
- Coach replacement/no-fault increment: Admin may assign only a free authorized replacement before actual start; Slot and Session change atomically, immutable terms remain frozen, assignment revisions are append-only, and Athlete rejection or external failure closes all resources with no penalty/statistics.
- Direct optional Challenge increment: active Match, verification, competitive Membership, pair matrix, Block/cooldown/quiet and unanswered limits are server-enforced; a ruleset snapshot and service Chat are created atomically. Separate +12h/+24h state/version-guarded timers create recipient-only mandatory in-app reminders, and the +48h Worker timer expires an unanswered invitation as `EXPIRED_NO_FAULT`. Acceptance creates two globally unique active obligations, decline creates a 48-hour pair quiet period, withdrawal is no-fault, and expiry creates no Result, loss, Cooldown, obligation or additional pair quiet; the pair may invite again only after the ordinary eligibility checks pass again. AC-073 proves that Champion→Ordinary after Match freezes `stake=NONE`: an Ordinary win keeps its Result/Appeal and ordinary pair-rematch Cooldown but cannot move Champion/Contender or create status history.
- Official Booking increment: accepted Challenge, Booking and Session now have explicit database lineage. Slot selection commits `CH-08`, Venue/Coach confirmation atomically commits `CH-10` and creates one `OFFICIAL_CHALLENGE` Session, while expiry/conflict or Athlete B-04 withdrawal commits `CH-09` and keeps the original obligation/deadline. Withdrawal leaves the Slot published and is serialized against host confirmation. CH-22 is separately explicit: an Athlete reschedule consumes the bounded counter, writes immutable initiator/reason/fault/Booking lineage and returns to the same original scheduling deadline without a Result or penalty. CH-21 mutual reschedule is a two-party proposal/confirmation: only peer confirmation increments the same counter, writes `MUTUAL` without a fault actor, closes pre-start resources and preserves the canonical deadline/obligations. CH-21 external reschedule reuses B-15/SL-06 after an authorized Coach/Venue failure, writes `EXTERNAL` without a fault user and preserves the counter even at its limit. CH-23 keeps the counter capped at two: only an explicit consequence confirmation turns another culpable Athlete attempt into an administrative `FORFEIT`, closes a pending Booking and creates no third reschedule fact. CH-12/B-14 confirmed cancellation is an explicit Athlete decision before actual start: resources close atomically and the existing Result engine creates the immediate administrative `FORFEIT` with the peer as winner and a normal 48-hour Appeal, without consuming a reschedule.
- Official Session lifecycle increment: the scheduled boundary creates the immutable roles/stake/config snapshot without claiming attendance. Actual Coach Start/first Attendance commits `CH-13`; End commits `CH-14` and publishes the 2h/12h/24h Result-reminder schedule.
- Result/status increment: Coach records one immutable Official Result; PostgreSQL applies provisional status and Cooldown in the same transaction, exposes a 48-hour Appeal deadline, and finalizes through either complete waiver or a versioned Worker timer. AC-078 appends versioned score/method metadata only during the first 24 server hours; active recording/assigned Coach scope is checked in PostgreSQL, original metadata and all sporting facts remain immutable, and public payloads contain lineage only. AC-079 proves that direct winner/outcome correction is impossible: exact replay returns the source Result, changed replay and a new second record command fail without effects, API has no direct update route and Coach UI offers only TC-01. AC-112 proves the non-decisive DRAW contour across Core/API/client/PostgreSQL: both Athletes receive equal Appeal capability, while one aggregate lock/version race permits exactly one Appeal and no status transition, status lock or Cooldown. AC-122 proves the decisive waiver contour: only the eligible loser can append one immutable waiver inside the server window, immediately finalize through R-04, release obligations and clear the status lock without rewriting Result/Session facts or invalidating the ordinary Cooldown. AC-121 proves that provisional status freezes activation rather than FIFO identity: server `submitted_at` and entry id survive finalization or compensation, then holder eligibility is recomputed under the Competition lock. Competing status-bearing Results serialize under that same lock. AC-143 rebuilds disposable status/Cooldown projection deterministically; AC-150 proves append-only ANNUL compensation; AC-144 proves complete role/scope/reason/state/causation audit lineage. The same engine records the constrained administrative `FORFEIT` after explicit confirmed-Official Athlete cancellation. `LATE` is attendance-only; one post-grace absence requires `NO_SHOW`, while two require no-winner `NO_CONTEST`. AC-209 maps post-start injury/voluntary stop to the peer's decisive win plus a normalized method. AC-210 reserves post-start external no-fault `NO_CONTEST` for normalized equipment, Safety or Venue failure, preserves the frozen snapshot and symmetric Appeal, and creates no winner/loss/status lock/transition/Cooldown or reschedule-count change. AC-167 keeps Result media-free across the closed API, client, persistence and canonical payloads. Web/iOS/Android Expo exports and the full static quality gate pass.
- Founding GENESIS Result increment: AC-100/101 freeze the empty-holder `GENESIS_CHAMPION`
  snapshot and record a decisive Coach Result with the ordinary 48-hour Appeal window. A normal
  win applies ST-01 and finalizes C-04 into `RUNNING`; `FORFEIT`/`NO_SHOW` applies ST-02 and
  finalizes into `CONTENDER_VACANT_OPEN` with no provisional or final Contender. Both paths keep
  immutable Result/FIFO history and match deterministic holder/version/tenure/Cooldown replay.
  AC-105 adds the non-decisive counterpart for both founding and Contender GENESIS: DRAW,
  NO_CONTEST or an independent repeat decision retains the same pair and FIFO facts, advances one
  scheduling cycle under C-05/C-10 and cannot change status or create a Cooldown.
- Technical Correction request increment: TC-01 creates one versioned `SUBMITTED` request for an
  authorized assigned Coach or internal Central actor. The queue is independent from Athlete
  Appeal; Result, status, Cooldown and the Appeal clock remain untouched. Row serialization,
  idempotency and a partial unique index prevent duplicate open requests, while private reason
  and evidence reference remain outside event/outbox/notification payloads.
- Technical Correction rejection increment: TC-02 assigns only an independent active Central
  reviewer; TC-05 lets only that reviewer reject with a protected mandatory reason. Versioned
  start/reject events, audit and neutral requester notification commit atomically without changing
  Result, status, Cooldown or Appeal, and `REJECTED` leaves the active FIFO queue.
- Technical Correction approval increment: TC-04 lets only the assigned independent Central
  reviewer approve with a protected reason. The source Result and frozen Session facts remain
  immutable; a separate append-only decision becomes effective, status/Cooldown are compensated
  or reapplied under the Competition row lock, and the existing Appeal clock/version remains
  usable. The Result card separates recorded and effective outcome, while neutral notifications
  disclose no private reason, score/comment or evidence reference.
- Central Appeal increment: an independent reviewer takes a FIFO Appeal and atomically upholds, reverses, annuls or orders a repeat. Append-only decision/compensation records preserve source Result history; status, Cooldown, obligations and repeat scheduling update in the same command. The AC-150 PostgreSQL proof covers A-08/R-07/ST-12/TN-03/CD-03, exact idempotency, stale/permission rejection, protected reason privacy, immutable FIFO timestamp and hash-stable replay/rebuild.
- Missing Result increment: 2h/12h/24h stale-safe timers, private Athlete statements, Venue confirmation, Central coordination and constrained independent-Coach Result now pass Core/API/client/Worker/PostgreSQL gates.
- Final Result IntegrityCase increment: evidence-scoped independent Central review, neutral public marker, Competition hold, immutable decision and deterministic status replay pass Core/API/client/PostgreSQL gates.
- Status Queue foundation, GENESIS response, direct activation, holder reconfirmation, voluntary status release and vacancy succession: explicit intent, immutable server-time FIFO, atomic first-two pairing, three-day single-candidate promotion, strict direct-head activation, optional Champion TITLE offers, 72-hour mandatory response, appealable refusal/timeout Forfeit, 24-hour holder-change reconfirmation and two-step no-loss status release pass code and PostgreSQL gates. AC-047 proves that Champion has no FIFO priority, its response clock starts only on activation and the Contender may decline without a sporting sanction. Confirmed-Training conversion now passes strict prebooked FIFO activation, three-party confirmation and no-fault fallback. Training withdrawal additionally opens a one-hour remaining-Athlete/Coach solo decision and never creates a loss, Forfeit or Cooldown. AC-092 proves that three valid entries submitted while the status slot is occupied stay `WAITING` in strict server FIFO without starting a response clock or creating Challenge-side resources. AC-098 freezes holder reconciliation during provisional status and invalidates the former Contender's own TITLE intent after finalization instead of migrating it. AC-102 proves that only SYSTEM can promote the sole eligible founder at the exact C-03 deadline, producing a final Champion tenure and public Contender vacancy without any sporting Result. AC-103 proves C-07/C-09: only the first two valid FIFO entries form `GENESIS_CONTENDER`, obligations wait for both acceptances, the Session freezes the existing Champion and decisive Result finalization assigns only the Contender before returning to `RUNNING`. AC-104 proves the C-08/ST-04 counterpart: the Champion remains unchanged, the sole candidate becomes final Contender at the exact deadline and Competition returns to `RUNNING`; deterministic replay preserves this state across double-digit aggregate versions.
- M7 lifecycle now includes self-request/QR/Admin-decision Membership entry, neutral rejection with a seven-day reapply wait, no-fault requester withdrawal, 12h Admin reminders and 24h Central escalation, Community pause/reactivation and governed permanent closure, both voluntary Membership-exit contours, governed Membership removal, the deterministic 18th-birthday transition, PI-01…PI-05 PlatformIncident reconciliation and ACR/ADE account closure/self-export. The privacy-minimized Youth consent foundation remains behind a disabled policy flag and enforces two independent grants. Booked pre-start Youth Official work reuses B-26; started Sessions preserve their frozen Youth snapshot. AC-072 now uses the same B-26 bridge when a pre-start TITLE pair no longer matches current holders, while old Session timers become stale and no sporting consequence is created. Exact incident overlap extends only pausable deadlines; already-fired mandatory timeout effects are compensated append-only. Account export payloads expire after 48h while checksum/audit lineage remains. Optional OPEN, optional FIFO TITLE and accept-race/duplicate-safe mandatory TITLE response-clock coverage are executable. Acceptance traceability is 191/214 (`185/196 P0`).
- Source control: the foundation is preserved in local Git history; remote protection remains external.

## 8. Immediate next actions

1. Complete real-browser 200% zoom and real-device screen-reader/dynamic-text checks;
   release-canary and schema-ledger rollback gates are complete.
2. Extend projection rebuild coverage whenever another disposable stored projection is introduced.
3. Keep attachment/evidence cleanup disabled with its storage feature until a provider is selected;
   keep payment, group capacity and automatic alternatives outside Molokh MVP.
