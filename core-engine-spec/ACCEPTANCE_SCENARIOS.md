# MOLOKH Acceptance Scenarios

## 1. Test conventions

- `P0` — release blocker; MUST be automated at domain/API level.
- `P1` — required before public pilot; MAY use integration/E2E test.
- Clock, UUID generator, outbox and policy configuration are controllable fakes.
- Every successful scenario also asserts aggregate version, audit record and outbox event.
- Every rejected command asserts no domain mutation/event except security/audit metric explicitly allowed.

## 2. Identity, age и Social

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-001 | P0 | User birth date makes age 13; activation requested | reject `MINIMUM_AGE_NOT_MET`; no active account |
| AC-002 | P0 | Youth User turns 18 at server date boundary | one `AgeDivisionChanged`; Adult Ordinary; Youth status vacated by `AGE_TRANSITION`; history preserved |
| AC-003 | P0 | Unverified but phone-confirmed User opens Discovery | profile/Like/Match/Chat allowed; Official Challenge denied `ACCOUNT_NOT_VERIFIED` |
| AC-004 | P0 | Youth tries Like to Adult | reject `AGE_CONTOUR_MISMATCH`; no Like |
| AC-005 | P0 | A Likes B from Discovery, no reverse Like | one ACTIVE Like, expires in 30d; B card prioritized/highlighted |
| AC-006 | P0 | A and B have opposing active Likes | atomically both Likes MATCHED and exactly one active Match/chat created |
| AC-007 | P0 | B SKIPs inbound Like from A | Like `REMOVED_BY_SKIP`; pair suppressed 15d; no Match |
| AC-008 | P1 | Active Like reaches 30d | `LikeExpired`; signal removed; later Like allowed if no suppression |
| AC-009 | P0 | Match has no activity 30d | Match ARCHIVED; sending a message returns ACTIVE |
| AC-010 | P0 | A Unmatches B while an accepted Challenge exists | personal Match UNMATCHED/chat closed; Challenge unchanged; pair Discovery hidden 15d |
| AC-011 | P0 | A Blocks B while booked Challenge exists | personal contact closes; Booking/Challenge remain; service actions still available |
| AC-012 | P1 | Discovery pool within radius exhausted | cards expand progressively within same city; no hard weight/sport filter and no hidden reliability score |

## 3. Community, Membership и roles

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-013 | P0 | valid Venue QR used and User has no active competitive Membership | Membership ACTIVE immediately |
| AC-014 | P0 | self-join request submitted | Membership PENDING; Admin notified; reminder 12h; Central escalation 24h |
| AC-015 | P0 | Admin approves PENDING membership | ACTIVE; Competition eligibility enabled |
| AC-016 | P0 | User already has another active competitive Membership in MVP | activation rejected `MVP_ACTIVE_COMMUNITY_LIMIT`; schema still permits non-active/history rows |
| AC-017 | P0 | User changes Home Venue | Membership/status/queue/challenges unchanged; Discovery/Slot priorities update only |
| AC-018 | P0 | Admin invites verified Coach and invitee accepts | active Community Coach grant with `authorized_by/at` |
| AC-019 | P0 | Guest Coach authorized for Session X | may act only on X; grant expires after X Result/cancellation |
| AC-020 | P0 | same User is Athlete and assigned Coach in Session | Result/attendance command denied `COACH_CONFLICT`; another Coach required |
| AC-021 | P1 | Admin proposes successor Admin | no role change until Central approves; after approval new grant ACTIVE |
| AC-022 | P0 | status-holder Membership removal requested by Admin | Membership UNDER_REVIEW, status visible, new status actions held; no immediate succession |

## 4. Group Plan, Slot и ordinary Training

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-023 | P0 | A proposes group offering in Match, B confirms | GroupPlan NOTIFIED; Venue notification and contacts in Chat; no Booking/Session/stats |
| AC-024 | P0 | only A confirms Group Plan | Venue not notified as mutual interest; plan stays PROPOSED |
| AC-025 | P0 | both Athlete and Coach confirm official conversion before group start | Challenge/official Session context created; GroupPlan CONVERTED |
| AC-026 | P0 | Coach declines conversion | plan returns NOTIFIED; no Challenge; social group plan remains |
| AC-027 | P0 | Coach publishes non-overlapping Slot ≤30d | Slot PUBLISHED and visible to eligible pairs |
| AC-028 | P0 | Coach tries overlapping Slot | reject `COACH_CONFLICT`; no Slot |
| AC-029 | P0 | A selects Slot | Booking SELECTING; B sees highlighted choice; Slot remains PUBLISHED/unreserved |
| AC-030 | P0 | B selects same Slot within 1h | Booking HOST_CONFIRMATION_PENDING; no reservation yet |
| AC-031 | P0 | B does not select within 1h | Booking EXPIRED; Challenge/Match may choose again; Slot still PUBLISHED |
| AC-032 | P0 | Host confirms pending Booking and all checks pass | transaction sets Slot BOOKED, Booking CONFIRMED_PAIR and Session SCHEDULED |
| AC-033 | P0 | Host rejects before confirmation | Booking REJECTED; Challenge returns scheduling; no reschedule/fault |
| AC-034 | P0 | two pairs await same Slot; hosts confirm concurrently | one commit succeeds; other gets `BookingConflictDetected`; no alternative auto-booked |
| AC-035 | P0 | Athlete cancels confirmed ordinary Training | no Result/Forfeit/Cooldown/status effect |
| AC-036 | P0 | one Training participant cancels; remaining Athlete and Coach confirm solo | Booking CONFIRMED_SOLO, same Slot retained, Session has one Athlete |
| AC-037 | P1 | remaining Athlete confirms solo but Coach does not before TTL/start | Booking/Session CANCELLED, Slot released, no Competition effect |
| AC-038 | P0 | Coach records ordinary NO_SHOW | attendance stored; no loss/Cooldown/reliability signal |
| AC-039 | P0 | ordinary Session ends with A PRESENT and B NO_SHOW | only A gets completed Training profile entry; no official Result |
| AC-040 | P1 | Slot start violates Venue's 8–48h minimum notice at final confirm | Booking confirmation rejected; selections do not reserve Slot |

## 5. Challenge eligibility и response

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-041 | P0 | matched Ordinary A challenges Ordinary B | AWAITING_RESPONSE, optional policy; B may decline no-loss |
| AC-042 | P0 | Ordinary A tries official challenge to Champion | reject by pair matrix; ordinary Training remains possible after Match |
| AC-043 | P0 | Champion challenges matched Ordinary | OPEN Challenge; refusal/expiry no loss; Champion status never at stake |
| AC-044 | P0 | active verified Ordinary challenges Contender from Community without Match | QueueEntry WAITING/activated by FIFO; no Match required |
| AC-045 | P0 | Ordinary without active Membership challenges Contender | reject `MEMBERSHIP_NOT_ACTIVE` |
| AC-046 | P0 | Contender challenges Champion when status slot available | TITLE Challenge mandatory for Champion; deadline 72h, reminder 48h |
| AC-047 | P0 | Champion offers TITLE to Contender | entry follows FIFO; when active, Contender may decline with no Forfeit |
| AC-048 | P0 | Champion tries to bypass earlier Ordinary queue entry | denied/queued behind earlier entry; FIFO order unchanged |
| AC-049 | P0 | Contender tries Official Challenge to Ordinary | reject pair matrix in MVP |
| AC-050 | P0 | initiator withdraws before acceptance | Challenge WITHDRAWN, no Result/loss/Cooldown |
| AC-051 | P0 | recipient declines optional Challenge | DECLINED, no penalty |
| AC-052 | P0 | Contender declines activated mandatory Ordinary challenge | administrative FORFEIT Result RECORDED; provisional Contender transfer; Appeal 48h |
| AC-053 | P0 | Champion ignores Contender TITLE challenge 72h | reminder at 48h; at 72h Champion FORFEIT; roles provisionally swap |
| AC-054 | P0 | optional OPEN response expires | EXPIRED_NO_FAULT, pair/status slot released |
| AC-055 | P0 | Youth Challenge lacks per-challenge guardian consent | acceptance/Booking confirm denied `YOUTH_CONSENT_REQUIRED` |
| AC-056 | P0 | same pair already has live Challenge | second creation rejected `PAIR_CHALLENGE_EXISTS` |
| AC-057 | P0 | pair has active 15d Cooldown | official challenge denied until ends_at; either may challenge others |

## 6. Scheduling, reschedule и cancellation

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-058 | P0 | Challenge accepted | `accepted_at` and pausable deadline +14d; slot suggestions appear |
| AC-059 | P0 | no Slot by day 14 after expanded Venue/Coach and group option | one `ChallengeSchedulingExtended`, deadline +7d |
| AC-060 | P0 | no Slot after extension due capacity | `CANCELLED_NO_FAULT`; no loss/Cooldown |
| AC-061 | P0 | first unilateral pre-booking reschedule | counter 1, initiator/reason stored, Challenge returns unscheduled |
| AC-062 | P0 | mutual reschedule | global counter +1, fault actor null/MUTUAL |
| AC-063 | P0 | Coach/Venue cancels | external reschedule, user counter unchanged |
| AC-064 | P0 | culpable Athlete attempts another reschedule after two used | consequence confirmation then FORFEIT Result; no third reschedule row as allowed change |
| AC-065 | P0 | Athlete explicitly cancels confirmed official Booking | Booking cancelled, Coach notified, FORFEIT RECORDED immediately, Appeal 48h |
| AC-066 | P0 | one Athlete withdraws only Slot request before host confirm | Booking request cancelled no penalty; accepted Challenge remains |
| AC-067 | P0 | Community pauses during scheduling for 10h | Challenge deadline moves +10h after reactivation; Cooldown endpoints unchanged |
| AC-068 | P0 | Community pauses with confirmed Session | Session remains scheduled/startable; other non-confirmed processes held |
| AC-069 | P1 | host Venue closes before Session | alternative Venue/Coach offered; if none, no-fault reschedule |

## 7. Session, Result и status

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-070 | P0 | official booked Session reaches start with valid roles | immutable competitive snapshot created exactly once; Challenge IN_SESSION |
| AC-071 | P0 | Ordinary Challenge created before A became Contender, then Session starts | snapshot stake CONTENDER; A risks status; parties notified before start |
| AC-072 | P0 | planned TITLE loses Contender participant before start | competitive Session cancelled; users choose cancel physical Booking or keep Training |
| AC-073 | P0 | Champion vs Ordinary OPEN begins | snapshot stake NONE; Ordinary win cannot transfer Champion |
| AC-074 | P0 | Coach tries NO_SHOW before configured 15m grace | reject; after grace attendance/Result allowed |
| AC-075 | P0 | official Session ends | Challenge RESULT_PENDING; reminders Coach 2h, Admin 12h, Central 24h; no automatic merits result |
| AC-076 | P0 | authorized Coach records WIN_A with all fields | Result RECORDED; relevant status applied provisional; Appeal deadline 48h |
| AC-077 | P0 | Coach attempts second different Result | reject `RESULT_ALREADY_RECORDED`; correction workflow offered |
| AC-078 | P0 | Coach edits score within 24h | metadata revision appended; winner/status unchanged |
| AC-079 | P0 | Coach tries change winner directly | denied; Technical Correction required |
| AC-080 | P0 | Ordinary beats current Contender | winner provisionally Contender; former Contender Ordinary; affected status starts locked |
| AC-081 | P0 | Contender beats Ordinary | statuses unchanged; confirmed loss Cooldown pair 15d |
| AC-082 | P0 | Contender beats Champion in TITLE | provisionally swap Champion/Contender |
| AC-083 | P0 | Champion beats Contender in TITLE | statuses unchanged; pair Cooldown from Contender loss |
| AC-084 | P0 | Champion loses to Ordinary in OPEN | Champion remains Champion; Result/stats record loss only |
| AC-085 | P0 | any status Session ends DRAW | Result/stats draw; no status/loss/Cooldown |
| AC-086 | P0 | any status Session ends NO_CONTEST | no win/loss/status/Cooldown; repeat may be ordered |
| AC-087 | P0 | both athletes NO_SHOW | effective NO_CONTEST, no status transfer; reason recorded |
| AC-088 | P0 | Result finalizes after 48h with no Appeal | provisional tenure becomes final; locks clear; FIFO recomputed |
| AC-089 | P0 | eligible loser waives Appeal immediately | Result finalizes early if no other eligible appellant; status unlocks |

## 8. FIFO, GENESIS и Succession

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-090 | P0 | A and B submit Contender requests at same timestamp | deterministic order by UUIDv7 entry_id; owner never chooses |
| AC-091 | P0 | A withdraws head and resubmits | old entry WITHDRAWN; new timestamp places A at tail |
| AC-092 | P0 | Contender busy; three valid entries arrive | all WAITING; no response clocks begin |
| AC-093 | P0 | status slot becomes free | oldest valid entry activates; mandatory timer starts then, not at submission |
| AC-094 | P0 | head becomes ineligible before activation | explicit INVALIDATED event, then next valid entry activates |
| AC-095 | P0 | Contender changes after final Result | waiting migratable entries require reconfirmation 24h and preserve timestamps |
| AC-096 | P0 | waiting initiator reconfirms to new Contender | entry returns WAITING in original position |
| AC-097 | P0 | waiting initiator does not reconfirm in 24h | entry EXPIRED and removed |
| AC-098 | P0 | former Contender has queued TITLE intent after losing status | intent INVALIDATED, not migrated |
| AC-099 | P0 | new Community receives two willing ACTIVE candidates | first two FIFO paired into full founding GENESIS |
| AC-100 | P0 | founding GENESIS normal winner/loser final | winner Champion, loser Contender |
| AC-101 | P0 | founding loser loses by FORFEIT/NO_SHOW | winner Champion, Contender vacant; public vacancy opens |
| AC-102 | P0 | exactly one founding candidate remains for full 3d | `GENESIS_WITHOUT_OPPONENT`; candidate Champion; Contender vacant; no win/loss |
| AC-103 | P0 | vacant Contender gets two candidates | first two FIFO conduct contender GENESIS; winner becomes Contender after Result lifecycle |
| AC-104 | P0 | vacant Contender has one candidate for 3d | `SUCCESSION_WITHOUT_OPPONENT`; candidate immediately available as Contender |
| AC-105 | P0 | GENESIS ends DRAW/NO_CONTEST | no position assignment; same pair returns repeat scheduling |
| AC-106 | P0 | Champion resigns without active TITLE | current Contender succeeds Champion; Contender becomes vacant; no loss |
| AC-107 | P0 | Champion resigns with active TITLE obligation | opponent gets FORFEIT and Champion under TITLE rules; departing former Champion is then removed from temporary Contender position, which becomes vacant; explicit waiver stored |
| AC-108 | P0 | Contender resigns without active obligation | position vacant; waiting queue becomes GENESIS candidates preserving FIFO |
| AC-109 | P0 | Ordinary leaves before accepting request | request closes no-loss |
| AC-110 | P0 | Ordinary leaves after Challenge acceptance | administrative FORFEIT, then Membership LEFT |

## 9. Appeal и rollback

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-111 | P0 | winner tries Appeal on decisive Result | denied; only loser eligible |
| AC-112 | P0 | either Athlete appeals DRAW within 48h | Appeal SUBMITTED; Result UNDER_APPEAL |
| AC-113 | P0 | Coach disputes outcome | Athlete Appeal unavailable to Coach; Technical Correction created |
| AC-114 | P0 | opponent/Coach do not respond within 24h | Central review continues; no auto decision |
| AC-115 | P0 | Central exceeds 72h and extends with reason | Appeal remains UNDER_REVIEW/locked; new due date visible; no auto uphold |
| AC-116 | P0 | appellant withdraws | Appeal WITHDRAWN; cannot resubmit; Result finalizes if no other eligible path |
| AC-117 | P0 | Appeal upheld | original provisional transition finalized; locks clear; no penalty for appellant |
| AC-118 | P0 | Title winner reversed | old swap compensated, corrected status applied from same snapshot, cooldown/stats rebuilt, history retained |
| AC-119 | P0 | Contender transfer annulled | exact pre-result Champion/Contender restored; Cooldown removed; queue recomputed |
| AC-120 | P0 | Repeat ordered | pre-result status restored; old Result REPEAT_ORDERED; Challenge cycle+1 to scheduling; no old Cooldown |
| AC-121 | P0 | queue entries arrived during provisional status | they remain frozen; after decision order/eligibility recomputed without changing submitted timestamps |
| AC-122 | P0 | waived loser later submits Appeal | denied `APPEAL_WINDOW_CLOSED/WAIVED`; immutable waiver remains |

## 10. Safety, removal и pause

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-123 | P0 | ordinary REPORT submitted without safety cancel | case created; unrelated account functions/challenges continue; reporter hidden |
| AC-124 | P0 | `REPORT_SAFETY_AND_CANCEL` on booked Challenge | Booking removed no-fault, Challenge hold ACTIVE, deadline paused, Central initial/final due 24/48h |
| AC-125 | P0 | Coach refuses unsafe Session | external no-fault pending case; no automatic Athlete loss |
| AC-126 | P0 | Safety review chooses new Venue/Coach | hold released, Challenge returns scheduling, deadline extended by hold duration |
| AC-127 | P0 | Safety review proves targeted abuse caused failure | Central may create `FORFEIT_BY_ENFORCEMENT` with reason and Appeal rights |
| AC-128 | P0 | serious verified violence/fraud/identity/illegal use | account restriction applies immediately; status UNDER_REVIEW, not transferred automatically |
| AC-129 | P0 | restricted User appeals within 7d | different Central reviewer assigned; restriction remains pending decision |
| AC-130 | P0 | accused Gym Admin is case subject | cannot review/decide own case |
| AC-131 | P0 | Admin removes Ordinary with reason | Membership REMOVED; all incomplete competition/Booking cancelled no-loss; history preserved; removal appeal 48h |
| AC-132 | P0 | Ordinary removal overturned | new/restored active Membership; previously cancelled Challenges do not resurrect |
| AC-133 | P0 | Central confirms Champion removal | current Contender succeeds; Contender vacant; event reason is administrative, not loss |
| AC-134 | P0 | Central confirms Contender removal | Champion unchanged; Contender vacant; genesis candidate flow opens |

## 11. Concurrency, idempotency и audit

| ID | Pri | Given / When | Then |
|---|---:|---|---|
| AC-135 | P0 | identical command/idempotency key sent twice | same response/event IDs returned; one mutation/event/outbox effect |
| AC-136 | P0 | same idempotency key reused with different payload | reject `IDEMPOTENCY_KEY_REUSED` |
| AC-137 | P0 | two commands use same expected aggregate version | at most one succeeds; other `STALE_VERSION` |
| AC-138 | P0 | manual accept commits just before expiry worker | late worker compare-and-set no-op; no Forfeit |
| AC-139 | P0 | duplicate mandatory-expiry jobs run | exactly one FORFEIT Result/status transition |
| AC-140 | P0 | two status Results attempt simultaneous apply | Competition row lock serializes; second cannot start/apply against stale snapshot/lock |
| AC-141 | P0 | outbox delivery repeats | consumer Inbox deduplicates by event_id; user gets one effective notification/projection update |
| AC-142 | P0 | push notification fails | business state/deadline remain committed; retry notification only |
| AC-143 | P0 | Competition projection deleted and replayed | final hash/status/tenures/cooldowns equal pre-delete canonical projection |
| AC-144 | P0 | Central/Coach/Admin critical action succeeds | audit includes actor/scope/reason/before-after/causation/server time |
| AC-145 | P1 | Central verifies a pending Venue | Venue ACTIVE; Community creation/Slot publication become eligible; exactly one `VenueVerified` |
| AC-146 | P0 | A unblocks B after Block ended their Match | Block REVOKED, but old Match/chat do not reopen automatically; pair must re-enter allowed Social flow |
| AC-147 | P0 | Central approves Technical Correction changing winner | request APPROVED; original Result immutable; compensating/corrected status and Cooldown applied as in Appeal rollback |
| AC-148 | P0 | Central rejects Technical Correction | request REJECTED; Result/status unchanged; reason audited |
| AC-149 | P0 | valid Youth consent is revoked before official Session start | consent REVOKED; official context held/cancelled no-fault; physical Booking may be explicitly retained as Training |
| AC-150 | P0 | provisional status Result is annulled | provisional StatusTenure CLOSED with compensation lineage; restored tenure/history remains replayable |
| AC-151 | P1 | Community closure is requested without a closure plan | reject; with approved plan Community/Competitions close, new actions stop and history remains |
| AC-152 | P0 | enforcement appeal revokes an account restriction | appeal DECIDED_REVOKED; Enforcement REVOKED; account ACTIVE and scoped holds released after eligibility recompute |
| AC-153 | P0 | Athlete A already has overlapping confirmed Session and a second host confirm races | second atomic claim is rejected `ATHLETE_SCHEDULE_CONFLICT`; no Slot reservation/alternative auto-booking |
| AC-154 | P1 | two otherwise similar Discovery candidates differ by inbound Like/radius | inbound Like is visibly prioritized; radius tier is exhausted before city expansion; ranking config version makes order reproducible |
| AC-155 | P0 | A requests conversion of confirmed pair Training; B and assigned Coach confirm before start | Booking purpose/Session become Official atomically; Challenge is BOOKED; stakes freeze only at Session start |
| AC-156 | P0 | B or Coach declines confirmed Training conversion | conversion closes; original Training Booking/Session remains confirmed; no loss/Challenge |
| AC-157 | P0 | conversion remains pending at Session start | request expires; Session starts as ordinary Training; no Competition effect |
| AC-158 | P0 | confirmed Training pair includes Contender while older valid queue entry exists | conversion request becomes `PREBOOKED_CONVERSION` behind older entry; Booking remains Training and cannot bypass FIFO |
| AC-159 | P0 | prebooked status conversion reaches FIFO head before Session start | confirmation flow activates; only after both Athlete+Coach confirm does source become Official |
| AC-160 | P0 | prebooked conversion is still waiting when Training/group starts | queue entry INVALIDATED; physical/social source proceeds non-official; no loss/status effect |
| AC-161 | P0 | activated status conversion lacks required confirmation for 72h before source start | conversion closes, status slot releases to next FIFO entry, source remains non-official |
| AC-162 | P0 | Coach authorization or Youth consent becomes invalid during conversion confirmation | conversion closes immediately, FIFO slot releases, source remains ordinary and parties see the failed guard |
| AC-163 | P0 | Athlete cancels ordinary Training while its Official conversion is pending but not committed | no Forfeit; conversion closes/releases status slot; ordinary solo/cancellation flow applies |
| AC-164 | P0 | User has not enabled event SMS and receives mandatory Challenge | in-app + critical push created; no SMS; deadline remains server-based |
| AC-165 | P1 | another user views Athlete profile | sees current/status history, W/L/D, last five effective results and completed Training count; no win rate, Safety reason or Training partner identity |
| AC-166 | P0 | Gym Admin changes cooldown from 15d to 20d within range | new public config version created; existing Challenge/Session snapshots stay on previous version; value outside 7–30d rejected |
| AC-167 | P0 | Coach/client attempts Result photo/video upload in MVP | endpoint/capability absent or returns `FEATURE_NOT_AVAILABLE`; Result can be recorded without media |
| AC-168 | P0 | Central approves account after profile/phone/duplicate moderation | `ACCOUNT_VERIFIED` set with checklist/version and no document/evidence blob; Official eligibility enabled |
| AC-169 | P0 | both participants are Youth and only one guardian consent is granted | Challenge cannot be accepted/booked until two independent per-Athlete consents exist; no guardian account/document requested |
| AC-170 | P0 | verified guardian revokes consent before Youth Official Session start | Official context closes no-fault; status/record unaffected; Booking becomes Training only if both Athlete and Coach/host confirm before `min(1h,start)`, otherwise it cancels no-fault |
| AC-171 | P0 | Athlete with an accepted unfinished Official Challenge tries to accept another | reject `OFFICIAL_OBLIGATION_LIMIT`; pending invitation may remain until its own deadline, ordinary non-overlapping Training remains allowed |
| AC-172 | P0 | recipient does not answer optional OPEN | reminders at +12h and +24h; at +48h Challenge becomes EXPIRED_NO_FAULT; later eligible re-invitation allowed |
| AC-173 | P1 | Gym Admin manually publishes GroupOffering | card shows schedule, contacts, `last_updated_at` and capacity disclaimer; Venue is notified only after mutual GroupPlan confirmation; offering hides at start |
| AC-174 | P0 | both Athletes mutually select Slot with external price/terms and Venue later edits Slot | Booking keeps immutable original commercial snapshot; Molokh handles no payment/refund; cancellation cause separately drives sporting workflow |
| AC-175 | P0 | initiator creates Challenge under ruleset v3 and recipient accepts after Community publishes v4 | both acknowledgments reference immutable v3; explicit mode without checkbox proof is rejected `RULESET_ACK_REQUIRED`; status algebra is unchanged |
| AC-176 | P1 | self-request was rejected 3d ago and Athlete applies again without invite/override | reject `MEMBERSHIP_REAPPLY_WAIT` with retry_at day 7; valid invite/QR or audited Admin/Central authorization permits earlier entry; rejection stays private |
| AC-177 | P0 | Central schedules permanent Community closure with two pending processes and one safe confirmed Session | new actions stop; pending processes close no-fault; listed Session may finish Result/Appeal; final closure archives Membership and status tenures `COMMUNITY_CLOSED` without W/L/Succession/migration |
| AC-178 | P1 | active member and outsider request the same FIFO projection | member sees ordered display identities, positions, submitted times, public states and active pair; outsider sees only count/active Challenge; neither sees private eligibility/Safety reason |
| AC-179 | P0 | original Coach has not recorded Result after 24h; both separate Athlete statements match and Venue confirms attendance | one MissingResultReview opens; Central assigns non-conflicted reviewer-Coach who records the evidence-matching Result; Central is not Result author |
| AC-180 | P0 | missing-Result statements conflict | if repeat possible, CH-28 returns Challenge to scheduling no-fault with no Result/status/cooldown; if objectively impossible, assigned reviewer-Coach may record only NO_CONTEST |
| AC-181 | P0 | Appeal participant uploads five allowlisted media files totaling 90MB | attachments enter scan; AVAILABLE originals are visible only to submitter/Central; opponent sees nothing until Central grants safe/redacted expiring disclosure |
| AC-182 | P0 | Appeal/Safety upload is a PDF, sixth file, over 100MB aggregate or fails malware/content scan | invalid type/limit is rejected before canonical attachment; failed scan becomes QUARANTINED with no participant access and Central moderation |
| AC-183 | P2 | future feature enables second Community and discipline for Athlete | distinct Competition scopes hold independent status/FIFO/Cooldown/stats and one primary Home/Discovery Community; global second accepted Official is still rejected; no global rank |
| AC-184 | P0 | Youth Athlete turns 18 while confirmed Youth Official has not started | one AgeDivisionChanged; Youth Challenge closes no-fault, guardian consent/queue/status end; Booking enters B-26 retention option; Adult Membership is Ordinary |
| AC-185 | P0 | Youth Official Session starts before Athlete's 18th-birthday boundary and ends after it | Session/Result completes under frozen Youth snapshot; age transition does not rewrite stakes/history; future actions use Adult contour |
| AC-186 | P0 | Champion/Contender with no accepted obligation confirms status-only release | ST-09/ST-10 or ST-14 applies; Membership remains ACTIVE and Athlete Ordinary; no Result/loss/Cooldown/document; same command with accepted obligation is denied |
| AC-187 | P1 | Athlete already has three unanswered OPTIONAL Challenges or retries a declined pair at +24h | fourth invite rejected `OPTIONAL_INVITE_LIMIT`; pair retry rejected `OPTIONAL_PAIR_QUIET` until +48h; expired 48h invitation may be recreated immediately; FIFO unaffected |
| AC-188 | P0 | A Blocks/Unmatches B before their Match-based optional Challenge, GroupPlan and Slot request are accepted/confirmed | all three intents close no-fault; no quiet/loss; Slot remains free; personal Chat closes |
| AC-189 | P0 | A Blocks/Unmatches B while accepted Challenge or status FIFO/mandatory path survives | accepted obligation and status entry remain; no FIFO movement/evasion; pair receives structured service-only actions and may use Report/Safety |
| AC-190 | P0 | eligible Athlete explicitly presses «Бороться за статус» and waits without a second candidate | GENESIS_CANDIDATE remains WAITING without hidden TTL while eligible; own withdrawal is no-fault; re-entry later gets a new FIFO timestamp |
| AC-191 | P0 | first two GENESIS candidates are paired; A accepts, B declines or misses 48h | no obligation/loss; B entry closes; A returns to queue head with exact original FIFO key; Competition returns to open GENESIS phase |
| AC-192 | P0 | verified Athlete changes display name to any self-chosen value | public name changes immediately; verification/badge/stats/status history remain bound to same User ID; previous value is Central-audit-only; abuse requires Report/Safety |
| AC-193 | P1 | sender edits PERSONAL_TEXT at +10m, then attempts at +16m and attempts to edit service card | first edit appends revision and shows edited marker; later edit fails `MESSAGE_EDIT_WINDOW_CLOSED`; service edit fails `SERVICE_MESSAGE_IMMUTABLE` |
| AC-194 | P0 | one participant deletes a message for self, while the other Reports it and Central later hides it | delete affects only first user's view; Report freezes original/all revisions; Central Case decision hides it for all without deleting Case/audit evidence |
| AC-195 | P0 | Central confirms a 37-minute platform incident overlapping 20 minutes of a pausable Challenge deadline | deadline extends exactly 20 minutes once; individual complaint alone would not extend it; Session/Cooldown/retention clocks stay continuous |
| AC-196 | P0 | mandatory timeout/Forfeit committed during a later-confirmed incident window | source events/history remain; one idempotent IncidentImpact creates compensating no-fault recovery; replay never produces duplicate compensation |
| AC-197 | P0 | Athlete with accepted Challenge loses SIM and requests recovery | Challenge/obligation remains; no document is uploaded; verified route or Central review restores access; deadline changes only if exact access incident is confirmed |
| AC-198 | P0 | verified phone is changed while trusted old session exists | 24h `SENSITIVE_ACTION_HOLD` blocks resignation/account closure and other sensitive actions; old session may answer the existing Challenge only; expiry restores capabilities once |
| AC-199 | P0 | Central confirms two Users are duplicate while one holds status and the other has an accepted Challenge | processes enter scoped hold; one canonical User/private alias is recorded; history is not merged/deleted and status/obligation receive explicit governed dispositions |
| AC-200 | P0 | Admin replaces confirmed Session Coach before start with authorized non-conflicted Coach and all material hashes unchanged | Booking and Session update atomically; all Athlete are notified; no mutual re-confirm is required; old/new assignment remains audited |
| AC-201 | P0 | Athlete rejects an equivalent Coach replacement before start, or replacement changes time/price/ruleset | first path reschedules external no-fault with no user count; material change is rejected until normal mutual reconfirmation |
| AC-202 | P0 | Athlete arrives late but Coach conducts the Official Session | Attendance is LATE; Coach records normal outcome; LATE alone never creates NO_SHOW/Forfeit |
| AC-203 | P0 | after configured grace one Athlete's absence objectively prevents Session; in another Session both are absent | first produces Coach-confirmed NO_SHOW and standard Appeal; second normalizes to NO_CONTEST with no winner/status/loss |
| AC-204 | P1 | Venue has one Primary and three Admins; ordinary Admin edits Slot, then attempts Primary transfer and Venue closure | Slot action succeeds and is audited; Primary transfer/closure are denied until Central command; atomic transfer leaves exactly one Primary |
| AC-205 | P0 | scheduled start arrives but Coach performs no Start/Attendance action | Session becomes READY_FOR_COACH and immutable competitive snapshot is frozen; actual_start_at remains null; Challenge/Training stats do not claim attendance |
| AC-206 | P0 | assigned Coach records first Attendance while Session is READY_FOR_COACH | SessionStarted and AttendanceRecorded commit atomically; actual_start_at is Coach action time; Challenge enters IN_SESSION; Athlete performs no Check-in |
| AC-207 | P0 | original Coach is absent but Admin assigns equivalent authorized Coach within operational grace | Booking/Session assignment changes atomically, participants are notified and replacement Coach may start; material snapshots remain unchanged |
| AC-208 | P0 | Coach/Venue cannot conduct Session and no replacement exists by grace | Session/Booking close external no-fault; Official Challenge returns scheduling without user reschedule count/Forfeit; Training creates no attended stat; repeat failure opens operational review |
| AC-209 | P0 | Athlete is injured or voluntarily stops after actual Official start and frozen ruleset defines a decisive outcome | Coach records winner and injury/withdrawal method; normal Result/Appeal/status rules apply; no medical document is requested |
| AC-210 | P0 | external equipment/Safety failure makes an in-progress Official impossible | Coach/Central path records NO_CONTEST or no-fault disposition under rules; no Athlete is assigned a loss merely for the external cause |
| AC-211 | P0 | User attempts ordinary Appeal after Result is FINAL, then Central detects concrete system error | ordinary Appeal is rejected; independent IntegrityCase opens, public review marker appears and affected status/queue is held |
| AC-212 | P0 | IntegrityCase corrects or annuls a Final status-changing Result | source Result/events remain; one append-only decision compensates status/Cooldown, deterministically replays Competition and exposes only neutral review reason |
| AC-213 | P1 | provisional Result becomes final, while another provisional Result is later reversed | first displays review marker then removes it; second switches profile/last-five to effective outcome and retains neutral reviewed-history entry without private evidence |

## 12. Minimum release suite

MVP нельзя выпускать без автоматизации всех P0, особенно:

- AC-032/034 (atomic Booking);
- AC-052/053/065 (Forfeit obligations);
- AC-080/082/084 (status algebra);
- AC-090–098 (strict FIFO/migration);
- AC-100–108 (GENESIS/Succession);
- AC-118–121 (Appeal compensation);
- AC-135–143 (idempotency/concurrency/replay);
- AC-169–174 (Youth consent, single Official obligation, optional TTL, GroupOffering and commercial snapshot).
- AC-175–180 (ruleset acknowledgment, Membership reapply, Community closure, public FIFO and missing Result review).
- AC-181–187 (EvidenceAttachment, future competition scopes, age transition, status-only release and optional anti-spam).
- AC-188–196 (Block/Unmatch cleanup without status evasion, explicit GENESIS consent/FIFO return, free display identity, Chat revisions/moderation and PlatformIncident compensation).
- AC-197–204 (account recovery/duplicates, equivalent Coach replacement, LATE/NO_SHOW and multi-Admin ownership).
- AC-205–213 (Coach-confirmed actual start, Venue operational failure, injury/withdrawal, Final integrity review and provisional public projection).
