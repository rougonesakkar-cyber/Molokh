# MOLOKH MVP API Contracts

## 1. Contract style

- base path: `/api/v1`;
- JSON UTF-8, timestamps RFC 3339 UTC, IDs UUIDv7;
- mutations are explicit commands, not generic PATCH of state/status;
- every critical command requires `Idempotency-Key` and `If-Match: <aggregate_version>`;
- every response includes `request_id` and current aggregate/read-model version;
- every HTTP response also carries `X-Request-Id` and `X-Correlation-Id`; a valid incoming ID is propagated and an invalid one is replaced;
- list pagination uses opaque cursor;
- public/profile payloads never expose private reason/evidence fields.

## 2. Standard command response

```json
{
  "data": {
    "aggregate_id": "uuid",
    "state": "BOOKED",
    "version": 7,
    "allowed_actions": [
      {"code": "VIEW_SESSION", "render_key": "booking.view_session"}
    ]
  },
  "meta": {
    "request_id": "uuid",
    "event_id": "uuid",
    "replayed": false
  }
}
```

Same idempotency key + same payload returns the original semantic response with `replayed=true`. Same key + different payload returns `IDEMPOTENCY_KEY_REUSED`.

## 3. Standard rejection

```json
{
  "error": {
    "code": "STALE_VERSION",
    "message_key": "errors.stale_version",
    "retryable": true,
    "retry_at": null,
    "details": {},
    "request_id": "uuid"
  }
}
```

HTTP mapping:

- `400` invalid payload/transition request;
- `401` unauthenticated;
- `403` permission/eligibility deny;
- `404` absent or deliberately undisclosed resource;
- `409` stale version, uniqueness or resource conflict;
- `410` terminal/expired action token;
- `422` command semantically invalid for current state;
- `429` rate limit;
- `503` temporary adapter/platform failure, never a fabricated business outcome.

## 4. Authentication and current actor

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | request authentication transport; SMS policy is separate from event-SMS preference |
| POST | `/auth/otp/verify` | create access/refresh session |
| POST | `/auth/refresh` | rotate session |
| POST | `/auth/logout` | revoke current session |
| GET | `/me` | User/profile/capabilities/active processes |
| PATCH | `/me/profile` | display name; never accepts state/status |
| PATCH | `/me/sports` | primary and optional secondary sport; versioned critical command |
| POST | `/me/avatar-uploads` | request an idempotent private upload ticket; disabled until a scan/storage adapter is configured |
| POST | `/me/recovery-cases` | account recovery/phone change request |
| GET | `/me/account-access` | latest recovery state, incident scope and 24h hold deadline |
| GET | `/me/account-lifecycle` | latest closure/export state and retention deadlines |
| POST | `/me/account-exports` | request one asynchronous private export |
| GET | `/me/account-exports/{export_id}/download` | owner-only download while READY and before 48h expiry |
| POST | `/me/account-closure` | self-request closure and optional immediate/reused export; starts 30d recovery |
| POST | `/me/account-closures/{closure_id}/cancel` | owner cancellation strictly before recovery deadline |

Sensitive-action hold is represented in the account-access projection and enforced again by every
sensitive command. A trusted old session receives only service-response capabilities.

Authentication uses a 10-minute, five-attempt OTP challenge, a 15-minute opaque access token and a
rotating 30-day opaque refresh token. PostgreSQL stores only the HMAC OTP verifier and SHA-256 token
hashes. Reuse of a rotated refresh token revokes its entire session family. `LOCAL_DEVELOPMENT` may
return a six-digit development code only outside production; `SMS_OPT_IN` requires explicit opt-in
and an available provider adapter. Web sends `clientKind=WEB` and receives refresh only through a
`HttpOnly; SameSite=Lax` cookie; native sends `clientKind=NATIVE` and stores the returned refresh
token in Expo SecureStore. During a phone-change security hold, a pre-change trusted session
may read and accept/decline its existing Challenge but cannot create or mutate unrelated resources.

Avatar upload accepts only JPEG/PNG/WebP metadata up to 10 MiB and a SHA-256 checksum. The default
adapter returns `FEATURE_NOT_AVAILABLE` and stores nothing. A future provider adapter must keep the
object private, verify checksum/detected type, run malware/content scan and expose a separate
`AVAILABLE` decision before any profile attachment; an upload ticket alone never publishes media.

## 5. Discovery, Match and Chat

| Method | Path | Command/query |
|---|---|---|
| GET | `/discovery/cards` | radius-first city projection with visible inbound-interest/ranking reasons and config version |
| POST | `/discovery/{user_id}/like` | Like from Discovery only |
| POST | `/discovery/{user_id}/skip` | remove inbound Like/suppress pair |
| GET | `/matches` | active/archived list |
| DELETE | `/matches/{match_id}` | Unmatch orchestration |
| POST | `/users/{user_id}/block` | directed Block |
| DELETE | `/users/{user_id}/block` | revoke Block, never restore old Match automatically |
| GET | `/me/blocks` | active directed Blocks owned by the authenticated User |
| GET | `/chats/{chat_id}/messages` | cursor history with local visibility |
| POST | `/chats/{chat_id}/messages` | participant personal text; structured actions are internal/system-owned |
| PATCH | `/messages/{message_id}` | sender personal edit ≤15m, append revision |
| DELETE | `/messages/{message_id}/visibility` | delete for self |
| POST | `/messages/{message_id}/reports` | snapshot all revisions, freeze edits and enqueue Central moderation |

Chat history identifies the authenticated viewer in response metadata so ownership controls never
depend on client route parameters. Chat API returns versioned structured action objects; clients
never parse human message text to infer an action, and Users cannot forge system action cards.

Unmatch and Block responses explicitly confirm preservation of accepted Official obligations and
status FIFO/mandatory paths. Unmatch adds a 15-day pair suppression; Block remains effective until
the blocker revokes it. Neither endpoint cascades from Match to Challenge or Booking records.

## 6. Community and roles

| Method | Path | Command/query |
|---|---|---|
| GET | `/communities/{id}` | public/member projection |
| GET | `/communities/{id}/members` | privacy-filtered members/status |
| GET | `/communities/{id}/competition` | Champion, Contender, active Challenge, public FIFO |
| POST | `/communities/{id}/memberships` | self-request |
| POST | `/community-invites/{token}/accept` | QR/invite activation |
| POST | `/communities/{community_id}/coach-invites` | scoped Admin/Central invites verified Coach |
| GET | `/me/coach-invites` | invitee reads own pending invitations |
| POST | `/me/coach-invites/{grant_id}/accept` | invitee activates Coach grant |
| POST | `/memberships/{id}/approve` | Gym Admin |
| POST | `/memberships/{id}/reject` | neutral + internal reason |
| POST | `/memberships/{id}/leave-preview` | exact status/obligation consequence token |
| POST | `/memberships/{id}/leave-confirm` | consume preview token |
| GET | `/venues/{venue_id}/members` | scoped Gym Admin participant/status projection |
| POST | `/memberships/{id}/removal` | remove Ordinary no-fault or open status-holder Central review |
| GET | `/me/membership-removals` | subject reads removal history and 48h Appeal deadline |
| POST | `/membership-removals/{case_id}/appeal` | Ordinary subject appeals within 48h |
| GET | `/central/membership-removals` | FIFO status-holder/Ordinary-Appeal review queue |
| POST | `/central/membership-removals/{case_id}/decision` | independent confirm/reject; explicit confirmed-Session cancellation policy |
| POST | `/central/venues/{venue_id}/admins` | Central appoints a verified Venue-scoped Gym Admin |
| GET | `/central/venues/{venue_id}/roles` | Central reads active Gym/Primary grants and Primary version |
| PUT | `/central/venues/{venue_id}/primary-admin` | Central-only atomic first appointment or transfer |
| POST | `/communities/{id}/configuration-versions` | Admin within ranges |

## 7. Scheduling and Training

| Method | Path | Command/query |
|---|---|---|
| GET | `/chats/{chat_id}/training-options` | active-Match participant sees eligible connected-Venue Slots and GroupOfferings |
| GET | `/venues/{venue_id}/admin-dashboard` | scoped Venue Admin reads Venue settings, authorized Coaches, future schedule, pending host confirmations and informational GroupPlan interest |
| POST | `/venues/{venue_id}/slots` | own authorized Coach or Venue Admin publishes; timer expires at start |
| POST | `/venues/{venue_id}/group-offerings` | Venue Admin publishes manual schedule/contact snapshot; timer expires at start |
| PATCH | `/slots/{id}` | Venue Admin edits a future published Slot only before pair intent begins |
| POST | `/slots/{id}/withdraw` | Venue Admin withdraws an unused future Slot with a reason |
| PATCH | `/group-offerings/{id}` | Venue Admin edits a future published GroupOffering before pair interest begins |
| POST | `/group-offerings/{id}/withdraw` | Venue Admin withdraws an unused future GroupOffering with a reason |
| POST | `/bookings` | first Athlete selects Slot |
| POST | `/bookings/{id}/select-same` | other Athlete mutual selection |
| GET | `/me/host-confirmations` | assigned Coach or Venue Admin confirmation queue |
| POST | `/bookings/{id}/change-selection` | selecting Athlete |
| POST | `/bookings/{id}/withdraw` | pre-host-confirm no-fault |
| POST | `/bookings/{id}/host-confirm` | atomic resource claim |
| POST | `/bookings/{id}/host-reject` | reason required |
| POST | `/group-plans` | propose from Match |
| POST | `/group-plans/{id}/confirm` | mutual confirmation/notification |

The Chat options query returns
`reservation_policy=NO_RESERVATION_BEFORE_HOST_CONFIRMATION`, the active pair intent and the
published alternatives. `POST /bookings` records the first Athlete selection; only the peer may
call `select-same`, which freezes the immutable commercial snapshot and asks the host without
claiming the Slot. Group cards always include freshness, Venue contact and a capacity disclaimer;
mutual GroupPlan confirmation notifies the Venue but creates no Booking, Session or statistics.
The Venue Admin dashboard keeps that distinction explicit: pending personal requests are actionable,
while group interest is informational and never implies a reservation or available capacity.
Host confirmation locks the Slot, changes the Booking to `CONFIRMED_PAIR` and creates exactly
one `SCHEDULED` Session in the same transaction. A versioned server timer changes it to
`READY_FOR_COACH` at `scheduled_start_at` without asserting attendance. If another pair won the Slot race, the
losing Booking receives an explicit resource-conflict rejection and no Session is created.
An explicit host rejection stores its reason, notifies both Athletes and leaves an ordinary Slot
available. For an Official Challenge it atomically returns the Challenge from `BOOKING_PENDING`
to `ACCEPTED_UNSCHEDULED` without resetting its scheduling deadline or obligations. Schedule
edit/withdraw commands are optimistic-versioned and fail once a Booking or GroupPlan intent is
active, so already-seen terms cannot be changed silently.
When `POST /bookings` carries an accepted `challengeId`, the Booking purpose is
`OFFICIAL_CHALLENGE`; Challenge transition `CH-08` commits with the Booking. Final host
confirmation rechecks Challenge eligibility and obligations, creates a Session carrying the same
`challengeId`, and commits `CH-10` to `BOOKED`. Expiry or resource rejection commits `CH-09`
and preserves the original scheduling deadline and participant obligations.

For the linked Official Session, the scheduled timer creates the immutable competitive snapshot
before returning `READY_FOR_COACH`. `POST /sessions/{id}/start` or the first valid Attendance then
commits Session actual start and Challenge `CH-13 → IN_SESSION` in one transaction. End commits
the Session/Booking/Slot completion facts together with `CH-14 → RESULT_PENDING`; its outbox
contains deterministic 2h/12h/24h Result reminder deadlines. These transitions do not apply to
ordinary Training Sessions.

## 8. Official Challenge and FIFO

| Method | Path | Command/query |
|---|---|---|
| GET | `/chats/{chatId}/challenge` | current/latest pair Challenge plus create availability |
| POST | `/challenges` | implemented direct optional OPEN/NONE Challenge from active Match |
| POST | `/challenges/{id}/accept` | implemented optional or mandatory recipient acceptance and atomic participant obligations |
| POST | `/challenges/{id}/decline` | optional: no-loss decline/48-hour pair quiet; mandatory: appealable administrative Forfeit |
| POST | `/challenges/{id}/withdraw` | implemented pre-accept initiator withdrawal, including no-fault direct-status withdrawal |
| POST | `/challenges/{id}/reschedules` | actor/reason; server assigns fault/count |
| POST | `/challenges/{id}/capacity-extension` | system/Central path only |
| GET | `/me/competition` | implemented member/outsider-filtered status and FIFO projection |
| POST | `/competitions/{id}/queue-entries` | implemented explicit status/GENESIS intent |
| POST | `/queue-entries/{id}/withdraw` | implemented versioned no-loss withdrawal; re-entry gets new FIFO key |
| POST | `/genesis-challenges/{id}/accept` | implemented per-participant GENESIS acceptance; second acceptance creates both obligations |
| POST | `/genesis-challenges/{id}/decline` | implemented no-loss decline; counterpart returns at the unchanged FIFO key |
| POST | `/queue-entries/{id}/reconfirm` | implemented holder-change 24h action preserving the original FIFO key |
| GET | `/competitions/{id}/queue` | future administrative/public-by-id alias of the filtered projection |
| POST | `/status-releases/preview` | implemented status-only consequence snapshot; returns a 15-minute confirmation token |
| POST | `/status-releases/{id}/confirm` | implemented token/version-bound confirmation; Membership stays active and no Result/loss/Cooldown is created |
| GET | `/challenges/{id}/youth-consents` | participant view of independent consent readiness; the other Athlete's contact stays hidden |
| POST | `/challenges/{id}/youth-consents` | Youth Athlete request through e-mail or explicit SMS opt-in |
| GET | `/youth-consents/by-token/{token}` | public token-scoped guardian projection; no account required |
| POST | `/youth-consents/by-token/{token}/grant` | declared name/relationship plus explicit consent text acceptance |
| POST | `/youth-consents/by-token/{token}/decline` | token-scoped refusal and no-fault Challenge closure |
| POST | `/youth-consents/by-token/{token}/revoke` | pre-start revocation; closes Challenge no-fault and may open explicit Training retention for a booked Session |

The implemented direct slice returns the frozen ruleset reference/mode, response policy, stake,
deadlines, state/version and viewer role. Its accepted state is linked through Booking to one
confirmed `OFFICIAL_CHALLENGE` Session without a second UI mode. Acknowledgment proofs remain
server-side append-only records. The first status slice now exposes the canonical holder cards,
active status Challenge summary, FIFO rows and the viewer's mutual GENESIS action. GENESIS pairing,
response expiry and accepted service-Chat scheduling are implemented. The strict direct-status
head now activates only against the still-current Contender when the status slot is free. It creates
a 72-hour `MANDATORY` Challenge; acceptance reuses the Official scheduling flow, while refusal or
timeout creates an appealable administrative Forfeit without a fictitious Session. After a final
holder change, waiting direct entries are rebound through a 24-hour reconfirmation command/timer;
the original FIFO key is preserved and silence or explicit exit closes without loss.
Each visible queue row now includes `singleCandidateDeadlineAt`. It is non-null only while that
entry is the sole valid GENESIS candidate in an open vacancy. The Worker pairs a later second
candidate atomically or promotes the unchanged single candidate at the exact three-day boundary;
the timer is ignored when state/version changed.
Champion/Contender release now uses a separate two-step resource rather than overloading Result.
Preview freezes the holder/status version and exact succession or vacancy consequence; confirm
fails if that snapshot changed, the token expired or a blocking unaccepted status process is live.
For an accepted Challenge that has not started, the preview includes the opponent and exact
Forfeit/waiver consequences; confirmation finalizes the administrative Result and cancellation in
the same transaction. Once Session actual start is recorded, only the Coach/frozen-ruleset path may
finish it. Waiting direct entries are converted to GENESIS candidates without changing their FIFO
ID or timestamp.

Youth consent routes are present but the `YOUTH_OFFICIAL` feature flag defaults to false. Two
Youth participants produce two independent records; acceptance and every implemented Booking
boundary require both unexpired grants. Guardian commands use the constrained `EXTERNAL` actor,
the consent aggregate UUID as actor identity and only the exact Challenge/Athlete scope IDs. Raw
contact and action token are omitted from projections and audit metadata.

## 9. Session, Attendance and Result

| Method | Path | Command/query |
|---|---|---|
| GET | `/sessions/{id}` | plan, READY/actual state, assignment, actions |
| GET | `/me/sessions` | Athlete/Coach/Gym Admin list plus derived completed Training count |
| POST | `/sessions/{id}/official-conversion` | either Athlete proposes conversion of confirmed Training; requester acceptance is recorded |
| POST | `/booking-official-conversions/{id}/decision` | required peer Athlete or assigned Coach accepts/declines with aggregate `If-Match` |
| POST | `/booking-training-retentions/{id}/decision` | either Athlete or Coach/Venue host accepts or declines booked Official-to-Training retention |
| POST | `/sessions/{id}/start` | Coach confirms actual start |
| POST | `/sessions/{id}/attendance` | Coach; first record may atomically start READY Session |
| POST | `/sessions/{id}/end` | Coach/fallback policy after actual start |
| POST | `/sessions/{id}/replace-coach` | Gym Admin assigns an equivalent authorized Coach before actual start |
| POST | `/sessions/{id}/cancel-after-coach-replacement` | either Athlete rejects the replacement; external no-fault cancellation |
| POST | `/sessions/{id}/fail-external` | Gym Admin/Central closes a pre-start operational failure no-fault |
| GET | `/results/{id}` | Athlete/Coach/scoped Admin Result projection and currently allowed Appeal action |
| POST | `/challenges/{id}/result` | assigned non-participant Coach, one effective Result after ended Official Session |
| POST | `/results/{id}/metadata-revisions` | recording Coach ≤24h |
| POST | `/results/{id}/technical-corrections` | governed correction request |

`scheduled_start_at`, `window_opened_at` and `actual_start_at` are separate fields. A READY Session never contributes Training stats. For the closed-pilot MVP, Coach records both Athlete facts before manual End; only `PRESENT/LATE` on an `ENDED` Training Session contributes to the count. Equivalent replacement changes Session and booked Slot assignment atomically while preserving the original commercial snapshot. It is append-only audited and exposes a pre-start Athlete opt-out; both that opt-out and a Venue/Coach operational failure close Booking, Session and Slot with `EXTERNAL` fault and no Athlete penalty.

The Training conversion projection exposes its public state, exact deadline, required viewer role,
recorded decisions and FIFO position where applicable. A direct conversion temporarily marks the
Booking `OFFICIAL_CONVERSION_PENDING`; a Contender-bearing pair stays ordinary while its
`PREBOOKED_CONVERSION` waits in the same transparent FIFO. Only the final third acceptance commits
the linked BOOKED Challenge and changes Booking/Session purpose. Decline, deadline, failed guard or
source start restores/preserves Training without a Result, loss or Cooldown.

## 10. Appeal, Safety and evidence

| Method | Path | Command/query |
|---|---|---|
| POST | `/results/{id}/appeal` | implemented eligible Athlete action ≤48h |
| POST | `/results/{id}/waive-appeal` | implemented irreversible eligible actor action |
| GET | `/results/{id}/appeal` | implemented participant/Coach/Central projection with allowed next action |
| GET | `/central/appeals` | implemented permission-protected FIFO Central work queue |
| POST | `/central/appeals/{id}/start-review` | implemented independent Central reviewer assignment |
| POST | `/central/appeals/{id}/decision` | implemented reasoned `UPHOLD`, `REVERSE`, `ANNUL` or `REPEAT` |
| POST | `/appeals/{id}/withdraw` | implemented appellant-only withdrawal; no refiling |
| POST | `/appeals/{id}/responses` | implemented one non-blocking response per opponent/Coach |
| POST | `/central/appeals/{id}/extend-sla` | implemented one reasoned 24h/48h extension by assigned reviewer |
| POST | `/reports` | scoped REPORT or Safety cancellation |
| POST | `/cases/{id}/evidence-upload-intents` | obtain private upload target after limits |
| POST | `/cases/{id}/evidence-attachments/{id}/complete` | submit for scan |
| GET | `/me/integrity-cases` | participant/original-Coach neutral history; private evidence omitted |
| GET | `/central/integrity-cases` | permission-protected open Central queue with private evidence |
| GET | `/integrity-cases/{id}` | role-filtered case projection |
| POST | `/central/integrity-cases` | implemented Central-only Final Result exceptional case; source Result `If-Match` |
| POST | `/central/integrity-cases/{id}/start-review` | implemented independent reviewer assignment and Competition hold |
| POST | `/central/integrity-cases/{id}/decision` | implemented uphold/correct/annul/repeat plus deterministic replay |

Evidence API accepts only Appeal/Safety allowlisted media. There is no Result attachment endpoint.

The implemented Result command commits Result, `CH-15`, provisional status, status lock,
Cooldown, domain events, audit and outbox atomically. `WIN_A/WIN_B` refer to the immutable ordered
Session pair; `NO_SHOW` must agree with Coach-recorded Attendance, while `FORFEIT`, `NO_SHOW` and
`NO_CONTEST` require a reason and comment. The 48-hour finalizer uses expected state/version, so a
submitted Appeal or later waiver makes the older timer stale instead of overwriting new state.
Central decision commands use the Appeal version and one database transaction. They append an
immutable decision, finalize or compensate the provisional status journal, invalidate Cooldown
for annul/repeat, release obligations for terminal outcomes, or increment `cycle_no` and open a
new 14-day scheduling window for repeat. The original Result outcome columns are never updated;
the read projection returns the effective winner plus the neutral Central reason.

The implemented Missing Result surface is deliberately role-owned:

- `GET /me/missing-result-reviews` returns only Athlete, original/assigned Coach or Venue-owned work;
- `POST /missing-result-reviews/{id}/statements` appends one private Athlete statement;
- `POST /missing-result-reviews/{id}/venue-confirmation` appends the Venue attendance fact;
- `GET /central/missing-result-reviews` is the operational Central queue;
- Central may start review, assign a non-conflicted Coach with a constrained outcome, or order a
  no-fault repeat; Central cannot call the Result command as an outcome author;
- the assigned Coach uses the ordinary `POST /challenges/{id}/result` command, which verifies the
  constraint and resolves the review atomically.

The Final Result integrity contour is separate from ordinary Appeal. Only `FRAUD`,
`SYSTEM_ERROR` and `IDENTITY_ERROR` may open a case, with a private evidence reference and a
72-hour review SLA. Starting review sets one Competition integrity hold. Decision appends an
immutable record and SHA-256 replay hash; it never updates the recorded outcome/winner columns.
Correction, annulment and repeat replay the status journal from the source transition, append an
exact compensation and release the hold atomically. Participants and the original Coach receive
only the neutral category, state and effective outcome; Central-only reason/evidence remain private.

## 11. Central operations

Central endpoints are capability-scoped and require reason:

- verification queue and decision;
- account recovery/duplicate review;
- Safety/removal/enforcement cases;
- MissingResult reviewer assignment;
- Appeal/Integrity decision;
- role/Primary Admin/Venue lifecycle;
- PlatformIncident confirmation/compensation;
- account-closure queue and reasoned final pseudonymization;
- deterministic Competition replay with expected hash.

PlatformIncident exposes a deliberately small Central surface:

- `GET /api/v1/central/platform-incidents` returns the authorized operational queue;
- `POST /api/v1/central/platform-incidents/{incidentId}/confirm` requires `Idempotency-Key`,
  `If-Match` and a reason;
- `POST /api/v1/central/platform-incidents/{incidentId}/reject` has the same concurrency and
  audit requirements and never changes business deadlines;
- `POST /api/v1/central/platform-incidents/{incidentId}/resolve` additionally requires the
  objective `endedAt`; its outbox event starts Worker reconciliation.

Detection and PI-05 completion are internal SYSTEM commands. Central cannot directly edit an
impact, deadline, Forfeit, Result, status or Cooldown. The Worker derives candidates from the
resolved incident window, uses stable per-impact idempotency keys, rescans, and completes PI-05
only when no candidate remains.

Account lifecycle exposes a deliberately separate Central surface:

- `GET /api/v1/central/account-recovery-cases` returns pending recovery and active security holds;
- `POST /api/v1/central/account-recovery-cases/{caseId}/approve-phone|complete-verified|reject|confirm-incident`
  requires `Idempotency-Key`, `If-Match` and an explicit evidence-based decision;
- `GET|POST /api/v1/central/duplicate-account-cases` exposes the duplicate review queue and opener;
- `POST /api/v1/central/duplicate-account-cases/{caseId}/clear|resolve` requires one explicit
  disposition per affected status/obligation and never merges sporting history;

- `GET /api/v1/central/account-closures` returns live requests with recovery deadline, public
  display name, User version, exact blocker counts and derived `executable` flag;
- `POST /api/v1/central/account-closures/{closureId}/execute` requires `Idempotency-Key`,
  `If-Match` for the User version and a reason. The command atomically changes User to `CLOSED`,
  pseudonymizes public identity, invalidates current verification and marks the request executed;
- Central cannot request/cancel an owner's closure or download the private export payload.

Generic endpoints such as `PATCH /users/{id}` or `PATCH /competitions/{id}/status` are prohibited for Central too.

## 12. Realtime and notifications

Realtime topics are recipient-scoped projections:

- `inbox.changed`;
- `chat.{id}.changed`;
- `booking.{id}.changed`;
- `challenge.{id}.changed`;
- `session.{id}.changed`;
- `competition.{id}.changed`;
- `case.{id}.changed`.

Payload contains IDs/version/render hint only. Client refetches authorized projection. Push deep-links to the same action target; delivery/read never changes deadline.

## 13. Contract generation gate

Before controllers are implemented, generate machine-readable schemas for:

- command headers/envelope;
- all stable error codes;
- `allowed_action` union;
- common actor/deadline projection;
- each module's public/private read model;
- event envelope and canonical payloads.

OpenAPI and universal client types must derive from TypeBox schemas in CI; handwritten duplicate Web/native DTO types are not allowed.
