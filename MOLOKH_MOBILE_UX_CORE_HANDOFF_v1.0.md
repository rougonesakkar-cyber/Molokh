# MOLOKH — Mobile UX/UI & Core Engine Handoff v1.0

**Status:** synchronized with Core Engine v1.0  
**Date:** 3 September 2026  
**Supersedes:** `MOLOKH_MOBILE_UX_CORE_HANDOFF_v0.2.md` for product behavior  
**Audience:** Product Design, Mobile, API, QA, Gym Operations and Molokh Central

## 1. Product in one sentence

Molokh helps a person find someone to train with, agree on a real session with a Coach and, only when both enter a formal competitive path, transparently compete for status inside a gym Community.

## 2. Experience hierarchy

```text
People first
  → conversation
    → real training plan
      → confirmed Session
        → optional Official competition
          → Result / status / Appeal
```

The application must feel social and human before it feels like a tournament system. Status is the engine of recurring competition, not the label applied to every interaction.

## 3. Non-negotiable UX principles

1. One primary next action per screen or action card.
2. Show exact consequence before every irreversible command.
3. Training and Official Challenge have visibly different treatment.
4. Show who acts next and the server deadline.
5. Never expose internal state/event/error names as primary copy.
6. Athlete never performs Check-in or confirms Result.
7. Block/Unmatch cannot silently erase an accepted/status obligation.
8. Public Safety/administrative stigma is prohibited.
9. Training and Competition statistics remain separate.
10. Pending is not a dead end: always show wait reason, deadline and available alternative.

## 4. Main navigation

Recommended five destinations:

| Tab | User promise | Primary objects |
|---|---|---|
| Home | What needs my attention now? | Inbox, next Session, active Challenge/status |
| Discovery | Who might I train with? | candidate cards, inbound Like highlight |
| Chats | Turn interest into a plan | Match/service Chat, action cards |
| Community | Who holds status and how do I compete? | №1, Contender, FIFO, members |
| Profile | How am I represented? | arbitrary name, sports, stats, settings |

Coach/Admin actions appear as role-specific work queues from Home/Profile, not as permanent extra tabs for every user.

## 5. Global action-card contract

Every operational card renders:

- human title and short context;
- current actor: “Ваш ход”, “Ждём партнёра”, “Ждём зал”, “Нужен Coach”;
- exact deadline in Venue local time;
- one primary action;
- optional secondary safe action;
- consequence sheet for irreversible action;
- status label: waiting, confirmed, preliminary, under review, closed;
- retry/refresh behavior without duplicate action.

The server supplies `allowed_actions` and render keys. Mobile does not infer permissions from status text.

## 6. Identity and onboarding

Minimal onboarding:

1. phone authentication;
2. age/birth date and Youth/Adult contour;
3. arbitrary public display name and avatar;
4. primary/secondary sport and optional preferences;
5. city/radius/Home Venue;
6. join one Community through QR/invite/request;
7. Central account verification before Official Challenge.

Display name is self-expression, not legal identity. Verified badge belongs to the stable account. Old names, birth date and phone are never public.

Youth screens explain per-Challenge guardian consent only when an Official action requires it. There is no general guardian dashboard in MVP.

## 7. Discovery

Candidate card priority:

1. photo/avatar;
2. display name and age contour-safe public context;
3. primary/secondary sport;
4. distance/Home Venue context;
5. short experience/about text;
6. visible incoming-interest accent when that person already liked the viewer.

Actions: Like and Skip. There is no Community-list Like, direct name search or separate inbound-Likes list.

The feed begins within selected radius and expands gradually within the city. Preferences change order, never the right of eligible people to train together. No reliability score is shown or secretly computed.

## 8. Match and Chat workspace

Mutual Like opens one Match and personal Chat. The empty state immediately offers:

- several personal Coach Slots;
- relevant GroupOfferings;
- free text conversation.

Slot selected by one Athlete is visibly highlighted for the other for one hour. Nothing is reserved until both select the same Slot and host confirms.

Group Plan flow:

`A proposes → B confirms → Venue notified → contacts/plan shown`

Copy must say that capacity is not reserved and users should contact the Venue. Group Plan alone creates no Booking, Session or statistics.

Personal messages may be edited for 15 minutes with “edited” marker. Delete-for-self removes only the local copy. Report freezes the full revision history. Service/action messages are immutable.

## 9. Block and Unmatch

Before acceptance, Block/Unmatch closes Match-based optional Challenge, GroupPlan and Slot request no-fault. After an accepted or status obligation:

- personal conversation closes;
- structured service actions survive;
- status FIFO position does not disappear;
- Safety concern uses Report/Case.

The user sees only necessary service cards, not unrestricted text. Unblock never restores the old Match automatically.

## 10. Personal Training Booking

Flow:

```text
Choose Slot
  → partner chooses same Slot
    → Venue/Coach confirms
      → Booking confirmed
        → Session plan
```

Before mutual selection show Venue, Coach, start/end, price/currency and short external cancellation terms. Molokh does not accept payment or decide refunds in MVP.

If one participant leaves an ordinary confirmed pair Training, remaining Athlete and Coach may explicitly keep it as solo. No automatic conversion.

Equivalent Coach replacement preserves Booking when Venue/time/price/ruleset are unchanged. Notify participants prominently and provide one-tap no-fault reschedule before actual start.

## 11. Session screen

Athlete view separates:

- Scheduled — plan exists;
- Ready for Coach — scheduled window opened, but physical start is not confirmed;
- In progress — Coach started or recorded first Attendance;
- Ended/Result pending;
- Cancelled/rescheduled.

Athlete never taps Check-in. A READY Session cannot appear in completed Training statistics.

Coach view provides:

- Start Session;
- record PRESENT/LATE/NO_SHOW;
- End Session;
- record Official Result when applicable;
- report Venue/operational failure.

LATE is informational when Session occurs. NO_SHOW is available only after configured grace and when the absence prevented Session. If both are absent, outcome is NO_CONTEST.

Coach/Venue failure is external no-fault. Within grace Admin may assign an equivalent Coach; otherwise Challenge returns to scheduling without consuming a user reschedule.

## 12. Official Challenge

The creation/accept screen always shows:

- opponent and Community;
- response policy: optional, mandatory or mutual GENESIS;
- frozen ruleset/version;
- planned stakes in human language;
- response deadline;
- consequence of decline/expiry/cancellation;
- guardian consent status for Youth.

Ordinary invitations are optional. Status paths follow the canonical role matrix and FIFO. One Athlete can hold only one accepted unfinished Official obligation.

Accepted Challenge scheduling prioritizes more Venue/Coach options, then Group options, then one +7-day extension after the initial 14 days. Lack of capacity is no-fault.

## 13. Community, status and FIFO

Community header gives №1 and Contender equal visual clarity but keeps №1 primary. Show provisional/review marker without sensational language.

Active members see full FIFO:

- display identity;
- position;
- submitted server time in local presentation;
- public state;
- highlighted active pair.

Private Block/Safety/eligibility reasons are never shown. Outsiders see only queue size and active Challenge.

Status card actions depend on role:

- eligible Ordinary: challenge Contender through FIFO;
- Contender: challenge №1 when ready;
- №1: may offer TITLE to Contender through FIFO without privilege over older entries;
- eligible vacant-status member: “Бороться за статус”.

## 14. GENESIS and vacancy

GENESIS candidacy is explicit and has no hidden waiting expiry. The first two FIFO candidates receive 48 hours to accept each other.

If one declines/expires, that entry closes and the other returns to the queue with the original timestamp. No loss. A single eligible candidate may receive status after the public three-day window under succession rules.

GENESIS Result, Appeal and status history use the same Coach-confirmed flow as every Official.

## 15. Result and provisional status

Coach records Result. Athlete only receives the result and available Appeal/waiver actions.

Immediately after recording:

- effective Result/status appears;
- neutral “Preliminary” marker appears;
- 48-hour Appeal deadline is visible;
- affected status participants cannot begin a new status-bearing Session.

After final/waiver the marker disappears. Reversal updates public stats and current status but retains a neutral reviewed-history item.

Injury/voluntary withdrawal after actual start follows the frozen sport rules and may be a normal decisive Result. No medical document upload exists. External Safety/Venue/equipment impossibility may produce NO_CONTEST/no-fault.

## 16. Appeal and Integrity

Appeal screen includes:

- original Result and deadline;
- eligible appellant;
- text/reason and allowed evidence;
- response status;
- Central decision and neutral explanation.

Only Appeal/Safety accepts up to five image/short audio/video files, total 100MB. No Result, PDF, archive or office attachment. Opponent/Coach sees only a Central-approved safe/redacted disclosure.

Final Result does not reopen normal Appeal. Fraud/system/identity errors use Central IntegrityCase. Public UI shows only “Result under review” and neutral final reason; private evidence remains closed.

## 17. Safety and reporting

Report is scoped to User/message/Session/Challenge/Venue. Reporter identity remains hidden from subject. Serious restriction may apply immediately, but status changes only after governed decision.

Safety cancellation removes Booking no-fault and pauses the related process. It does not fabricate a Forfeit. A rejected Report/Appeal never creates public punishment or reliability score.

## 18. Profile and statistics

Public profile:

- current status and provisional marker;
- Champion/Contender tenure history;
- Official W/L/D;
- five latest effective Official Results;
- neutral FORFEIT/NO_SHOW wording;
- total completed attended Training;
- primary/secondary sport.

Exclude win rate, reliability score, Safety reason, Coach comments and names/dates of ordinary Training partners.

## 19. Role workspaces

### Coach

- upcoming assigned Sessions;
- READY_FOR_COACH action queue;
- attendance/result due;
- result reminders/escalation;
- guest/session scope.

### Gym Admin

- Slots and GroupOfferings;
- host confirmation;
- Coach replacement;
- Membership requests;
- Venue operational failures;
- config within Central ranges.

One PRIMARY_ADMIN is accountable, but normal operational abilities are equal for active Admins.

### Molokh Central

Central Console is MVP-critical and needs queues for:

- verification/recovery/duplicates;
- Membership/status-holder removal;
- Appeal/MissingResult/Integrity;
- Safety/enforcement/evidence;
- Venue/role/Primary Admin lifecycle;
- Community closure;
- PlatformIncident and compensation;
- stuck timers/status locks/projection replay.

Every decision screen shows scope, conflict check, evidence access, immutable source state, proposed consequence and required reason.

## 20. Human copy mapping examples

| Engine meaning | User copy |
|---|---|
| AWAITING_RESPONSE | Waiting for response |
| ACCEPTED_UNSCHEDULED | Choose a training time |
| HOST_CONFIRMATION_PENDING | Waiting for the Venue |
| READY_FOR_COACH | Coach will start the Session |
| RESULT_PENDING | Coach is recording the result |
| RESULT_RECORDED | Preliminary result |
| UNDER_APPEAL | Result under review |
| PROCESS_ON_HOLD | Action temporarily unavailable; reason and next update shown |
| RECONFIRMATION_REQUIRED | The status holder changed — confirm readiness |
| CANCELLED_NO_FAULT | Closed without defeat |

Russian production copy should remain concise, empathetic and consequence-specific; the English labels above are semantic placeholders.

## 21. MVP boundary

Included: 14+, one active competitive Community, Discovery/Match/Chat, personal Booking, informational Group Plan, Coach Session/Attendance, Challenge/FIFO/GENESIS/status, Appeal/Safety, Central operations and audit.

Excluded: in-app payments/refunds, reserved group capacity/attendance, multiple active Communities in UI, discipline competitions, medical freeze/documents, Result media, social feed/posts/comments, name search, hidden reliability/Elo/MMR and global №1.

## 22. Required design artifacts before UI implementation

Low-fidelity flows:

1. onboarding + verification/Community join;
2. Discovery → Match → empty Chat;
3. Slot mutual selection → host confirm;
4. Group Plan;
5. optional and mandatory Challenge acceptance;
6. Community status/FIFO/GENESIS;
7. Session Athlete/Coach states including READY;
8. Result/provisional/Appeal;
9. Block service-only mode;
10. Central verification, Safety, Appeal and Integrity queues.

Component inventory:

- candidate/status/member cards;
- action/deadline/consequence cards;
- Slot and GroupOffering cards;
- ruleset/stakes sheet;
- queue row and vacancy state;
- provisional/review badge;
- evidence upload/disclosure;
- role work-queue row;
- empty/error/offline/expired states.

## 23. Engineering handoff

Design references API `allowed_actions` rather than duplicating logic. Each screen state links to AC and transition IDs. Analytics may measure funnel/latency but must never become a hidden reliability score.

Implementation order and contracts are defined in [implementation/README.md](implementation/README.md). Core behavior remains governed by [core-engine-spec/CORE_ENGINE_SPEC.md](core-engine-spec/CORE_ENGINE_SPEC.md).
