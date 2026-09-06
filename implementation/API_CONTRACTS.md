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
| PATCH | `/me/profile` | display name/avatar/sports/preferences; never accepts state/status |
| POST | `/me/recovery-cases` | account recovery/phone change request |
| POST | `/me/export-requests` | privacy export |
| POST | `/me/account-closure` | two-step closure preview/confirm token flow |

Sensitive-action hold is represented in `/me.capability_denials[]`; trusted old session receives only service-response capabilities.

## 5. Discovery, Match and Chat

| Method | Path | Command/query |
|---|---|---|
| GET | `/discovery/cards` | tiered city/radius projection |
| POST | `/discovery/{user_id}/like` | Like from Discovery only |
| POST | `/discovery/{user_id}/skip` | remove inbound Like/suppress pair |
| GET | `/matches` | active/archived list |
| DELETE | `/matches/{match_id}` | Unmatch orchestration |
| POST | `/users/{user_id}/block` | directed Block |
| DELETE | `/users/{user_id}/block` | revoke Block, never restore old Match automatically |
| GET | `/chats/{chat_id}/messages` | cursor history with local visibility |
| POST | `/chats/{chat_id}/messages` | personal text or permitted action payload |
| PATCH | `/messages/{message_id}` | sender personal edit ≤15m, append revision |
| DELETE | `/messages/{message_id}/visibility` | delete for self |
| POST | `/messages/{message_id}/reports` | freeze revisions and open Case |

Chat API returns structured `action_card` objects. Clients never parse human message text to infer an action.

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
| POST | `/venues/{id}/admins` | Central appointment |
| POST | `/venues/{id}/primary-admin-transfer` | Central-only atomic transfer |
| POST | `/communities/{id}/configuration-versions` | Admin within ranges |

## 7. Scheduling and Training

| Method | Path | Command/query |
|---|---|---|
| GET | `/slots` | eligible Slots for Match/Challenge context |
| POST | `/slots` | Coach/Admin publish |
| PATCH | `/slots/{id}` | editable only under Slot guards |
| POST | `/bookings` | first Athlete selects Slot |
| POST | `/bookings/{id}/select-same` | other Athlete mutual selection |
| POST | `/bookings/{id}/change-selection` | selecting Athlete |
| POST | `/bookings/{id}/withdraw` | pre-host-confirm no-fault |
| POST | `/bookings/{id}/host-confirm` | atomic resource claim |
| POST | `/bookings/{id}/host-reject` | reason required |
| POST | `/bookings/{id}/replace-coach` | equivalent pre-actual-start replacement |
| POST | `/bookings/{id}/coach-replacement-reschedule` | Athlete external no-fault choice |
| GET | `/group-offerings` | manual Venue schedule cards |
| POST | `/group-plans` | propose from Match |
| POST | `/group-plans/{id}/confirm` | mutual confirmation/notification |

Booking projection includes immutable commercial snapshot, selected Slot, who must act, exact deadline and alternatives. It never claims Molokh payment/capacity responsibility.

## 8. Official Challenge and FIFO

| Method | Path | Command/query |
|---|---|---|
| POST | `/challenges` | allowed direct optional Challenge |
| POST | `/challenges/{id}/accept` | recipient or final required GENESIS party |
| POST | `/challenges/{id}/decline` | policy-specific consequence |
| POST | `/challenges/{id}/withdraw` | pre-accept initiator |
| POST | `/challenges/{id}/reschedules` | actor/reason; server assigns fault/count |
| POST | `/challenges/{id}/capacity-extension` | system/Central path only |
| POST | `/competitions/{id}/queue-entries` | explicit status/GENESIS intent |
| DELETE | `/queue-entries/{id}` | withdraw; re-entry gets new FIFO key |
| POST | `/queue-entries/{id}/reconfirm` | holder-change 24h action |
| GET | `/competitions/{id}/queue` | member/outsider filtered projection |
| POST | `/status-releases/preview` | status-only release consequence |
| POST | `/status-releases/confirm` | consume token, no active obligation |

Challenge create/accept responses include frozen ruleset/version, acknowledgment proof, response policy, stakes preview and consequence copy key.

## 9. Session, Attendance and Result

| Method | Path | Command/query |
|---|---|---|
| GET | `/sessions/{id}` | plan, READY/actual state, assignment, actions |
| POST | `/sessions/{id}/start` | Coach confirms actual start |
| POST | `/sessions/{id}/attendance` | Coach; first record may atomically start READY Session |
| POST | `/sessions/{id}/end` | Coach/fallback policy after actual start |
| POST | `/sessions/{id}/operational-failure` | Coach/Admin/Central evidence path |
| POST | `/sessions/{id}/results` | assigned Coach, one effective Result |
| POST | `/results/{id}/metadata-revisions` | recording Coach ≤24h |
| POST | `/results/{id}/technical-corrections` | governed correction request |

`scheduled_start_at`, `window_opened_at` and `actual_start_at` are separate fields. A READY Session never contributes Training stats.

## 10. Appeal, Safety and evidence

| Method | Path | Command/query |
|---|---|---|
| POST | `/results/{id}/appeals` | eligible Athlete ≤48h |
| POST | `/results/{id}/appeal-waivers` | irreversible eligible actor action |
| POST | `/appeals/{id}/withdraw` | no refiling |
| POST | `/appeals/{id}/responses` | non-blocking opponent/Coach response |
| POST | `/reports` | scoped REPORT or Safety cancellation |
| POST | `/cases/{id}/evidence-upload-intents` | obtain private upload target after limits |
| POST | `/cases/{id}/evidence-attachments/{id}/complete` | submit for scan |
| POST | `/integrity-cases` | Central-only Final Result exceptional case |
| POST | `/integrity-cases/{id}/decision` | uphold/correct/annul/repeat |

Evidence API accepts only Appeal/Safety allowlisted media. There is no Result attachment endpoint.

## 11. Central operations

Central endpoints are capability-scoped and require reason:

- verification queue and decision;
- account recovery/duplicate review;
- Safety/removal/enforcement cases;
- MissingResult reviewer assignment;
- Appeal/Integrity decision;
- role/Primary Admin/Venue lifecycle;
- PlatformIncident confirmation/compensation;
- deterministic Competition replay with expected hash.

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
