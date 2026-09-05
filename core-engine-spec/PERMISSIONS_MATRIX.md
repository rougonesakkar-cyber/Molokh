# MOLOKH Permissions Matrix

## 1. Модель авторизации

Права проверяются сервером на каждой команде. Скрытая кнопка в UI не является контролем доступа.

### Обозначения

- `OWN` — только собственный объект/аккаунт.
- `PAIR` — actor является одним из двух Athlete процесса.
- `SCOPE` — активная роль в нужном Venue/Community/Session.
- `CENTRAL` — разрешённая Central capability и назначенный case/reviewer.
- `SYSTEM` — только аутентифицированный внутренний worker/domain handler.
- `—` — запрещено.
- `G` — разрешено только после перечисленных guards.

Роли additive, но deny/conflict rules имеют приоритет. Например, Coach+Athlete не может подтвердить Result собственной Session, даже если Coach grant активен.

### Порядок проверки

1. account state / enforcement;
2. explicit deny: self-conflict, Block, age contour, hold;
3. role и scope;
4. aggregate state/version;
5. product eligibility;
6. idempotency/concurrency;
7. запись audit reason для привилегированного действия.

## 2. Identity и Social

| Команда | Athlete/User | Coach | Gym Admin | Central | System/Provider | Guards |
|---|---:|---:|---:|---:|---:|---|
| edit own profile/preferences/Home Venue | OWN | OWN | OWN | support-only correction | — | arbitrary display name changes immediately and never reverifies account; avatar scan; Home Venue no competition side effect |
| start/cancel own verification | OWN | OWN | OWN | — | — | phone verified |
| approve/reject verification | — | — | — | CENTRAL only in MVP | — | profile/phone/duplicate moderation; no document upload/storage |
| request account recovery/phone change | OWN | OWN | OWN | support-assisted | verifies route/hold expiry | obligations persist; no identity files; phone change sensitive hold 24h |
| perform service response during phone-change hold | OWN trusted old session | as Athlete | as Athlete | support view only | — | existing obligation only; no resignation/closure/security/profile-sensitive action |
| confirm account-access incident | provide facts | provide facts | provide Venue facts | CENTRAL only | may attach monitoring | exact inability window/affected obligation; scoped no-fault review, not blanket cancellation |
| open/resolve duplicate review | provide response | provide response | provide scoped facts | CENTRAL only | may flag signals | canonical+per-process disposition; no auto merge/status transfer; no document upload |
| view public profile | G | G | G | CENTRAL | — | privacy, Block; Community list or Match context |
| view birth date/verification audit | OWN | — | — | CENTRAL need-to-know | future provider: opaque outcome only | no document evidence in MVP; sensitive scope/audit |
| Like | OWN | OWN as Athlete | OWN as Athlete | — | — | Discovery only, same age, no Block/suppression/Match |
| Skip | OWN | OWN as Athlete | OWN as Athlete | — | — | Discovery pair |
| Match creation | — | — | — | — | SYSTEM | mutual active Like atomically |
| message personal Chat | PAIR | PAIR | PAIR | moderation read only by case | — | active/archived Match, no Block |
| edit own personal message ≤15m | OWN sender | OWN sender | OWN sender | — | — | PERSONAL_TEXT only; not reported; append revision/edited marker |
| delete message for self | OWN Chat participant | OWN | OWN | — | — | local visibility only; no deletion from peer/audit |
| hide message for all | — | — | — | CENTRAL decided Case | — | reason/conflict check; original retained |
| Unmatch | PAIR | PAIR | PAIR | — | closes optional pre-accept intents | accepted obligation and status FIFO/mandatory path preserved |
| Block/unblock | OWN | OWN | OWN | — | closes optional pre-accept intents | directed pair; accepted obligation/status path service-only |
| Report | OWN | OWN | OWN | staff may create internal case | — | reason/scope; reporter != subject |
| pause Discovery | OWN | OWN | OWN | support-only | — | no obligation/status effect |

`Coach` и `Gym Admin` columns означают человека в этой роли; Social command всё равно выполняется его Athlete persona, если профиль активен.

## 3. Community и роли

| Команда | Athlete | Coach | Gym Admin | Central | System | Guards |
|---|---:|---:|---:|---:|---:|---|
| view Community/status/participants | G | G | G | CENTRAL | — | public/member privacy rules |
| join by valid QR/invite | OWN | OWN | OWN | — | — | token, age, MVP active-Community limit |
| submit/withdraw self-request | OWN | OWN | OWN | — | — | no duplicate; 7d after rejection unless early authorization |
| approve/reject self-request | — | optional delegated only if also Admin | SCOPE | CENTRAL exception/escalation | — | neutral applicant reason + private internal reason; reject sets +7d |
| authorize early reapplication | — | — | SCOPE | CENTRAL | — | explicit audit; not public/punishment |
| leave Community | OWN | OWN as Athlete | OWN as Athlete | — | — | resignation/Forfeit orchestration first |
| remove Ordinary | — | — | SCOPE | CENTRAL | — | reason; subject Ordinary; removal appeal 48h |
| request Champion/Contender removal | — | — | SCOPE | CENTRAL | — | creates UNDER_REVIEW, not direct removal |
| decide status-holder removal | — | — | — | CENTRAL | — | independent reviewer; session plan |
| create/verify Community/Venue | — | — | propose data | CENTRAL | — | venue verification |
| pause/reactivate/schedule closure | — | — | request | CENTRAL only decides Closure Plan | SYSTEM applies/finalizes | new-action cutoff, confirmed Session disposition, history/no-migration rules |
| invite Coach | — | — | SCOPE | CENTRAL exception | — | verified target, Community scope |
| accept Coach invite | OWN invitee | OWN invitee | OWN invitee | — | — | valid pending grant |
| revoke Coach | — | — | SCOPE | CENTRAL | — | reason; future-session handling |
| authorize Guest Coach | — | — | origin/host SCOPE | CENTRAL | — | exact Session, verified target |
| appoint/revoke ordinary Gym Admin | — | — | Primary may propose | CENTRAL | — | multiple active Admin allowed; reason/audit |
| appoint/transfer PRIMARY_ADMIN | — | — | Primary may propose successor | CENTRAL only | enforces uniqueness | target active verified Admin; exactly one Primary per active Venue |
| change Community competition config | — | — | SCOPE: cooldown 7–30d, grace 5–30m, ruleset | approves explicit-ack flag/ranges | — | new public version; only new snapshots; explicit checkbox requires Central approval; core timers not delegated |
| change Venue operational config | — | own Slot only | SCOPE: booking notice 8–48h, Slot presentation/publication, contacts | sets ranges/exception | — | new public Venue config version; only new snapshots |
| view full ordered FIFO | active member | active member | SCOPE | CENTRAL | projection | display identity/order/time/public state only; private reason hidden |

## 4. Slot, Group Plan и Booking

| Команда | Athlete | Coach | Gym Admin | Central | System | Guards |
|---|---:|---:|---:|---:|---:|---|
| publish/edit/withdraw own Coach Slot | — | SCOPE own slot | SCOPE any Venue slot | emergency correction | expire | no overlaps, horizon ≤30d |
| publish/edit another Coach Slot | — | — | SCOPE | CENTRAL exception | — | authorized Coach; audit |
| publish/edit/withdraw GroupOffering | — | — | SCOPE Venue | emergency correction | expire | manual MVP source; future interval; freshness/contact/capacity disclaimer |
| view eligible Slots | PAIR | assigned/scope | SCOPE | CENTRAL support | projection | active Match or accepted Challenge |
| select/change/withdraw Slot request | PAIR | — | — | — | timeout | participant, state, one pending request |
| confirm/reject Booking as host | — | SCOPE Coach/host | SCOPE Venue | CENTRAL exception | atomic claim | one confirmation sufficient; all resources rechecked |
| replace Coach after confirmed Booking | request no-fault reschedule | replacement may accept assignment | SCOPE Venue | exception | updates Session atomically | before actual start; READY only within grace; authorized/non-conflicted; same Venue/time/price/ruleset; notify all |
| request no-fault reschedule after Coach replacement | either participant | — | — | support | applies external cause | before start; no user reschedule count/Forfeit |
| cancel ordinary confirmed Booking | PAIR | assigned COACH | host SCOPE | CENTRAL | — | never Competition Forfeit |
| cancel official Booking as Athlete | PAIR | — | — | — | records effects | irreversible warning; creates Forfeit |
| cancel official due Coach/Venue/external | — | assigned COACH | host SCOPE | CENTRAL | — | reason; no-fault/reschedule |
| propose Group Plan | PAIR | — | — | — | — | active Match/group offering |
| confirm/decline Group Plan | PAIR other user | — | — | — | notify Venue | mutual required |
| request Group→Official conversion | PAIR | — | — | — | — | before start |
| confirm Group→Official conversion | each PAIR | assigned COACH required | Venue confirmation if required | CENTRAL exception | create context | both Athlete + Coach + eligibility/consent |
| preserve cancelled pair Booking as solo | remaining PAIR | assigned COACH | host may act as Coach/host confirmation | — | timeout | remaining Athlete + Coach/host |
| request confirmed Training→Official conversion | either PAIR | — | — | — | queue handler if status-bearing | paired Training SCHEDULED; before start; Contender stakes follow FIFO |
| confirm/decline Training→Official conversion | each PAIR | assigned non-participant COACH | — | CENTRAL exception only | expiry preserves Training | both Athlete + Coach + full Official eligibility/Youth consent; status queue must be head |
| confirm/decline Official→Training retention | each PAIR | assigned COACH | host may confirm operational retention | CENTRAL exception only | expiry cancels Booking | linked Challenge closed no-fault; both Athlete + Coach/host; before start |

Gym Admin может подтвердить availability собственного Venue даже если он Athlete этой Session. Это не даёт ему права подтвердить Result.

## 5. Official Challenge creation/response

| Pair/action | Initiator allowed | Recipient action | Match | Extra guards |
|---|---|---|---:|---|
| Ordinary → Ordinary | Ordinary | optional accept/decline | required | both ACTIVE/verified/same Competition; no cooldown/block |
| Champion → Ordinary | Champion | optional accept/decline | required | OPEN only; Champion not at stake |
| Ordinary → Champion | none for Official | — | — | only ordinary Training may be proposed after Match |
| Ordinary → Contender | Ordinary via Community | Contender mandatory response | not required | FIFO; response timer starts on activation |
| Champion → Contender | Champion via FIFO | Contender optional | not required | no queue privilege; any started Official is TITLE |
| Contender → Champion | Contender via FIFO | Champion mandatory | not required | older valid defense entry first |
| Contender → Ordinary | none in MVP | — | — | early source rule retained in canonical eligibility |
| Founding/Contender GENESIS | first two candidates by SYSTEM | both mutual accept | not required | exact FIFO pair; full eligibility |

### Command-level matrix

| Команда | Athlete participant | Coach | Gym Admin | Central | System | Guards |
|---|---:|---:|---:|---:|---:|---|
| submit/withdraw Contender queue entry | OWN | OWN as Athlete | OWN as Athlete | — | invalidates/times out | matrix + one live entry |
| opt in/withdraw GENESIS candidacy | OWN | OWN as Athlete | OWN as Athlete | — | pairs/expires response | explicit «Бороться за статус»; waiting entry has no hidden TTL; re-entry gets new timestamp |
| accept/decline GENESIS pairing | OWN paired candidate | as Athlete | as Athlete | exception resolution only | 48h expiry | both must accept; failing entry closes, counterpart retains FIFO key |
| reconfirm after holder change | OWN initiator | OWN as Athlete | OWN as Athlete | — | expires | 24h, preserve timestamp |
| create direct OPEN Challenge | allowed initiator | as Athlete | as Athlete | — | from conversion/queue | pair matrix; exact ruleset snapshot/ack; OPTIONAL max 3 unanswered and pair quiet elapsed |
| accept/decline optional Challenge | RECIPIENT | as Athlete | as Athlete | — | timeout | current eligibility; ruleset snapshot shown/ack proof |
| accept mandatory Challenge | RECIPIENT | as Athlete | as Athlete | — | timeout → Forfeit | refusal UI warns consequence; ruleset snapshot shown/ack proof |
| withdraw before acceptance | initiator | as Athlete | as Athlete | — | — | no loss |
| cancel after acceptance | participant | as Athlete | as Athlete | CENTRAL may no-fault | creates Forfeit if culpable | explicit consequence |
| request reschedule | participant | assigned Coach external reason | host external reason | exception | timer/holds | cause attribution, count |
| grant +7d capacity extension | — | — | — | exception >normal | SYSTEM once | expansion/group options already exposed |
| voluntary status-only release | OWN status holder | as Athlete | as Athlete | anomaly review only | projection saga | two steps; no accepted obligation; Membership remains ACTIVE; no loss/Cooldown/medical docs |
| voluntary Membership exit | OWN status holder | as Athlete | as Athlete | — | saga | two steps, exact obligations, waiver; current exit rules |

## 6. Session, Attendance и Result

| Команда | Athlete | Assigned/Guest Coach | Gym Admin | Central | System | Guards |
|---|---:|---:|---:|---:|---:|---|
| open Session window / freeze stakes | — | — | — | exception | only at scheduled start | booked, no blocking hold, eligibility; creates READY, never attendance |
| confirm actual Session start | — | assigned/guest SCOPE | — | exception only | — | READY; Coach non-participant; explicit Start or first Attendance |
| report Coach/Venue operational failure | participant report only | assigned/replacement may report | host SCOPE confirms | CENTRAL review | may open repeated-failure case | no actual start; equivalent replacement within grace else external no-fault |
| mark PRESENT/LATE/NO_SHOW | — | SCOPE | — | correction workflow | — | assigned Coach; NO_SHOW only after grace when absence prevented Session; LATE + held Session uses normal Result; Coach not participant |
| end Session | — | SCOPE | — | exception | scheduled fallback may mark awaiting | Session IN_PROGRESS |
| record ordinary attendance | — | SCOPE | — | correction workflow | — | no Result/status effect |
| record official Result | — | assigned/session-scoped reviewer SCOPE | — | coordinates missing-result/correction path but never authors winner | administrative Forfeit only | actual Session started; Coach not participant; frozen ruleset; injury/withdrawal method allowed; one Result |
| edit descriptive Result metadata ≤24h | — | recording Coach | — | CENTRAL | — | winner/outcome unchanged; revision audit |
| change winner/outcome directly | — | — | — | only through Appeal/approved correction command | — | never raw DB edit |
| file Technical Correction | — | recording/assigned Coach | — | may initiate internal | — | winner/outcome or late correction |
| decide Technical Correction | — | — | — | CENTRAL independent reviewer | applies decision | reason/evidence |
| collect missing-Result statements/attendance evidence | separate statement only | may respond if original Coach | confirms Venue attendance only | CENTRAL case-scoped | opens case at 24h | parties cannot see/edit each other's statement before submission |
| assign missing-Result reviewer Coach | — | may receive session scope | — | CENTRAL | — | consistent Athlete statements + Venue attendance, or NO_CONTEST-only fallback |
| order missing-Result repeat | — | — | — | CENTRAL | applies CH-28 | conflicting/insufficient evidence; no loss/status/cooldown |

Athlete не имеет permission на Check-in, attendance claim, Result claim или Result confirmation.

## 7. Appeal и waiver

| Команда | Winner | Loser | Either on DRAW/NO_CONTEST | Coach | Gym Admin | Central | Guards |
|---|---:|---:|---:|---:|---:|---:|---|
| submit Appeal on decisive result | — | yes | — | — | — | — | ≤48h; no prior filing/waiver |
| submit Appeal on DRAW/NO_CONTEST | — | — | yes | — | — | — | ≤48h; one per appellant |
| waive Appeal | only if eligible appellant | yes | each eligible user | — | — | — | explicit; irreversible |
| withdraw submitted Appeal | — | appellant | appellant | — | — | — | before decision; no resubmit |
| add Appeal response | opposing participant | opposing participant | other participant | assigned Coach | — | CENTRAL may add evidence | target 24h, non-blocking |
| assign reviewer/extend SLA | — | — | — | — | — | CENTRAL | no conflict; reason for extension |
| uphold/reverse/annul/repeat | — | — | — | — | — | CENTRAL | complete reason/evidence; compensating event |
| open/review Final Result IntegrityCase | report concern only | evidence response only | evidence response only | CENTRAL independent reviewer only | may flag system error | FINAL; only fraud/system/identity categories; ordinary Appeal stays closed |
| decide IntegrityCase | — | — | — | — | — | CENTRAL independent reviewer | uphold/correct/annul/repeat via compensations/replay; public neutral reason only |

Central cannot punish a rejected Appeal automatically. Any abuse concern requires a separate ModerationCase.

## 8. Status и Competition administration

| Команда/effect | Athlete | Coach | Gym Admin | Central | System | Rule |
|---|---:|---:|---:|---:|---:|---|
| assign Champion/Contender from Result | — | — | — | — | only | deterministic snapshot/outcome function |
| GENESIS pair selection | candidate explicitly opts in/out and answers own pairing | — | — | resolve exception only | only | first two FIFO; mutual acceptance 48h; no obligation before both accept |
| single-candidate succession timer | — | — | — | exception only | only | full 3d public window |
| direct manual status edit | — | — | — | — | — | prohibited |
| apply voluntary succession | status holder confirms resignation | — | — | review anomaly | only projection handler | two-step event |
| apply administrative succession | — | — | request/reason | decides removal | projection handler | review final first |
| age transition | — | — | — | correct identity only | only | birth date/server date |
| pause status transition | — | — | request | CENTRAL | SYSTEM from Result | process hold, no transfer |
| rebuild Competition projection | — | — | — | authorized incident command | deterministic replay | pause + hash + audit |
| confirm/reject PlatformIncident | report symptom only | report symptom only | report symptom only | only | monitoring detects | objective service/window evidence; user claim alone insufficient |
| resolve/compensate PlatformIncident | — | — | — | may fix exact recovery window | deterministic only | extend pausable overlap; compensate fired timeout without deleting source; never pause Session/Cooldown/retention |

## 9. Safety, removal и enforcement

| Команда | Athlete | Coach | Gym Admin | Central | System | Guards |
|---|---:|---:|---:|---:|---:|---|
| REPORT | OWN reporter | reporter | reporter | internal report | — | scoped subject/reason |
| REPORT_SAFETY_AND_CANCEL | participant | assigned Coach | host Admin | CENTRAL | applies hold/cancel | linked Session/Challenge; no auto Forfeit |
| refuse unsafe Session | — | assigned Coach | host SCOPE | CENTRAL | — | external no-fault until case decides abuse |
| triage/review/decide Case | — | provide response only | provide response only | CENTRAL | apply decision | accused/reporter conflict rules |
| temporary scoped hold | request through report | request | request | CENTRAL | policy on safety report | least restrictive scope |
| full account restriction | — | — | request evidence | CENTRAL | enforce | only serious confirmed categories |
| choose `ADMIN_CANCEL_NO_FAULT` vs `FORFEIT_BY_ENFORCEMENT` | — | — | — | CENTRAL | apply | causal link to opponent/Session required for Forfeit |
| appeal full restriction | restricted OWN | restricted OWN | restricted OWN | different CENTRAL reviewer | — | ≤7d; restriction continues |
| remove Ordinary Membership | — | — | SCOPE | CENTRAL | — | reason; cancellation no loss |
| remove Champion/Contender | — | — | request only | CENTRAL decision | status handler | UNDER_REVIEW first |

Reporter identity доступна только назначенному Central reviewer и строго необходимым safety personnel.

### 9.1. Appeal/Safety evidence

| Команда | Submitter | Opponent | Assigned Coach | Gym Admin | Central | System | Guards |
|---|---:|---:|---:|---:|---:|---:|---|
| upload EvidenceAttachment | OWN open scope | own scope only | own response scope | — | internal Case evidence | scan | Appeal/Safety only; ≤5 files/100MB; image/audio/video allowlist |
| view original | OWN upload | — | — | — | need-to-know | signed delivery | object AVAILABLE; short-lived URL; audit |
| grant safe/redacted disclosure | — | recipient only after grant | recipient only if assigned | — | only | expires/revokes | exact Case purpose/version; no raw original disclosure |
| moderate quarantine | — | — | — | — | only | scan creates queue | prohibited/uncertain content; safe reason to submitter |
| delete payload at retention | — | — | — | — | legal exception | only | remove object/key, preserve minimal audit checksum |

Result attachment, PDF, archive and office-document upload has no permission in MVP.

## 10. Youth consent

`Guardian contact/consenter` не является общей аккаунтной ролью MVP. Это ограниченный external actor, который может выполнить только `GRANT/DECLINE/REVOKE_YOUTH_CHALLENGE_CONSENT` по одноразовому signed token конкретного Challenge/Athlete и тому же подтверждённому contact channel.

Guards:

- Athlete 14–17;
- token связан с Challenge, Athlete и policy version;
- не истёк и не использован;
- guardian декларирует имя/родство и подтверждает e-mail либо добровольный SMS; документы не запрашиваются;
- для двух Youth создаются два независимых consent records;
- consent зафиксирован до acceptance/Booking confirmation по серверной политике;
- Coach и Venue всё равно подтверждают Session независимо.

Guardian не получает Chat, profile, Result, Appeal или Membership permissions.

## 11. Conflict-of-interest denies

Эти правила отменяют любое положительное permission:

1. Coach cannot record attendance/Result, если `coach_user_id` совпадает с Athlete A/B.
2. Accused Coach/Admin/Central staff cannot triage or decide own ModerationCase.
3. Reviewer of enforcement appeal cannot equal original decision maker.
4. Central support staff без Competition-governance capability не может решать Appeal/status case.
5. Gym Admin cannot use venue-confirm permission to alter Challenge response/Result.
6. User cannot consent/waive/appeal on behalf of opponent.
7. System handler cannot originate a merits decision; only execute policy timer or apply an already-authorized decision.

## 12. Irreversible-action confirmation

Перед следующими user commands API выдаёт short-lived `consequence_token`, привязанный к aggregate version и точному тексту эффекта:

- accepted/booked Official cancellation → Forfeit;
- mandatory status refusal → Forfeit;
- third culpable reschedule → Forfeit;
- voluntary Champion/Contender resignation → Succession/vacancy/Forfeit + Appeal waiver;
- leave Community with accepted obligation → Forfeit;
- Appeal waiver → no later Appeal.

Изменение obligations/version инвалидирует token и требует нового preview. Это обеспечивает понятный UX и защищает от stale confirmation.

## 13. Audit requirements by permission class

| Класс | Обязательные audit fields |
|---|---|
| Athlete irreversible | actor, consequence token, aggregate version, displayed consequence key |
| Coach Result/attendance | Coach grant/scope, Session, payload hash, device/request, timestamps |
| Gym Admin Membership/Slot | scope, subject/resource, reason, before/after |
| Central decision | capability, assigned case, reviewer conflict check, reason/evidence refs, decision version |
| System timer | policy/config version, expected state/version/deadline, scheduler job ID |

Ни одна административная операция над Membership, Result, status, Safety или role grant не допускает пустой reason.
