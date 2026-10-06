# MOLOKH State Machines

## 1. Нормативные правила чтения

1. Разрешены только перечисленные переходы. Любой другой command возвращает `INVALID_STATE_TRANSITION` без side effects.
2. `Actor` — субъект, имеющий право отправить command. `SYSTEM` действует только по server timer/domain event.
3. `Guards` проверяются повторно внутри транзакции непосредственно перед записью.
4. Event и новое состояние фиксируются атомарно; notifications отправляются через outbox.
5. `Timeout = —` означает, что автоматического перехода нет. Deadline может вызывать reminder без смены state.
6. Terminal-состояние не переоткрывается; исправление создаёт новую сущность или compensating event.
7. `ProcessHold` из §14 — независимый overlay. Пока hold ACTIVE, base state не меняется, clocks следуют `deadline_policy`.

Сокращения actor: `ATH` — соответствующий Athlete; `RECIPIENT` — адресат; `COACH`; `ADMIN` — Gym Admin в scope; `CENTRAL`; `SYSTEM`; `HOST` — Coach или Admin принимающего Venue.

## 2. AccountVerification

States: `NOT_STARTED`, `PENDING`, `VERIFIED`, `REJECTED`, `EXPIRED`, `REVOKED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| V-01 | NOT_STARTED | `START_VERIFICATION` / ATH | phone verified, age 14+ | PENDING | `VerificationStarted` | Central moderation task/audit | Central review SLA | no |
| V-02 | PENDING | `APPROVE_VERIFICATION` / CENTRAL | profile/phone/duplicate moderation passed; no document stored; no verified duplicate | VERIFIED | `AccountVerified` | capability enabled; badge projection; `expires_at=null` in MVP | — | no |
| V-03 | PENDING | `REJECT_VERIFICATION` / CENTRAL | reason supplied; no document required | REJECTED | `VerificationRejected` | notify; official actions denied | — | yes; new attempt = new record |
| V-04 | PENDING | `CANCEL_VERIFICATION` / ATH | no decision | NOT_STARTED | `VerificationCancelled` | close Central moderation task | — | no |
| V-05 | VERIFIED | `EXPIRE_VERIFICATION` / SYSTEM | future policy enabled and `expires_at <= now`; transition disabled in MVP | EXPIRED | `VerificationExpired` | deny new Official Challenge; existing obligations preserved/reviewed | future `expires_at` | yes for record |
| V-06 | VERIFIED | `REVOKE_VERIFICATION` / CENTRAL | identity/fraud decision, reason | REVOKED | `VerificationRevoked` | enforcement review; no silent status transfer | — | yes for record |

### 2.1. Age division transition

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| AD-01 | YOUTH | `TRANSITION_TO_ADULT` / SYSTEM | verified birth_date reaches 18 at server date boundary; expected division/version | ADULT | `AgeDivisionChanged` | started Session keeps Youth snapshot; close not-started Youth Official no-fault; offer B-26 retention for confirmed Booking; expire guardian consent/invalidate Youth queue; close Youth tenure `AGE_TRANSITION`; activate Adult Ordinary | date boundary | yes for Youth division |

### 2.2. AccountAccessCase

States: `PENDING`, `SECURITY_HOLD`, `COMPLETED`, `REJECTED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| AR-01 | — | `REQUEST_ACCOUNT_RECOVERY` / USER or support-assisted | account identified; verified-phone/trusted-session/recovery signals; no identity file | PENDING | `AccountRecoveryRequested` | Central task; preserve all obligations/deadlines until specific hold | review SLA | no |
| AR-02 | PENDING | `APPROVE_PHONE_CHANGE` / CENTRAL | control signals sufficient; no unresolved duplicate/fraud conflict | SECURITY_HOLD | `AccountRecoveryApproved` | change verified phone; 24h deny sensitive actions; trusted old session service-response-only | 24h | no |
| AR-03 | PENDING | `COMPLETE_VERIFIED_RECOVERY` / SYSTEM or CENTRAL | existing verified phone/trusted route succeeds; no phone change | COMPLETED | `AccountRecoveryCompleted` | restore normal access; obligations unchanged | — | yes |
| AR-04 | SECURITY_HOLD | `EXPIRE_SECURITY_HOLD` / SYSTEM | 24h reached; no new risk case | COMPLETED | `AccountRecoveryCompleted` | revoke obsolete sessions; restore sensitive actions | hold_until | yes |
| AR-05 | PENDING | `REJECT_RECOVERY` / CENTRAL | signals insufficient or conflict; reason | REJECTED | `AccountRecoveryRejected` | account/obligations unchanged; safe support notice | — | yes |
| AR-06 | PENDING/SECURITY_HOLD | `CONFIRM_ACCESS_INCIDENT` / CENTRAL | objective inability interval and affected obligation proven | same state | `AccountAccessIncidentConfirmed` | scoped ProcessHold or compensating no-fault deadline review; no blanket cancellation | case decision | no |

### 2.3. DuplicateAccountCase

States: `UNDER_REVIEW`, `CLEARED`, `RESOLVED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| DA-01 | — | `OPEN_DUPLICATE_REVIEW` / SYSTEM or CENTRAL | material duplicate signals; at least two distinct Users | UNDER_REVIEW | `DuplicateAccountReviewStarted` | restrict risky duplicate actions; hold affected obligations/status; do not merge/delete | review SLA | no |
| DA-02 | UNDER_REVIEW | `CLEAR_DUPLICATE_SIGNAL` / CENTRAL | evidence does not support same controller; independent reviewer | CLEARED | `DuplicateAccountCleared` | release holds/restrictions; histories remain separate | — | yes |
| DA-03 | UNDER_REVIEW | `RESOLVE_DUPLICATE` / CENTRAL | canonical User chosen; per-obligation/status dispositions recorded; reason | RESOLVED | `DuplicateAccountResolved` | restrict/pseudonymize duplicate; create private alias; apply governed dispositions/compensations only, never status-by-merge | — | yes |

## 3. CommunityMembership

States: `PENDING`, `ACTIVE`, `UNDER_REVIEW`, `REJECTED`, `LEFT`, `REMOVED`, `ARCHIVED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| M-01 | — | `JOIN_BY_QR_OR_INVITE` / ATH | valid token, age contour, no duplicate; MVP active-membership policy | ACTIVE | `MembershipActivated` | Competition eligibility; GENESIS candidate visibility | token expiry | no |
| M-02 | — | `REQUEST_MEMBERSHIP` / ATH | Community active, no duplicate; no prior self-rejection in 7d unless Admin/Central early authorization | PENDING | `MembershipRequested` | notify Admin | remind 12h; escalate Central 24h | no |
| M-03 | PENDING | `APPROVE_MEMBERSHIP` / ADMIN | request valid, MVP active-membership policy | ACTIVE | `MembershipApproved` | Competition eligibility | — | no |
| M-04 | PENDING | `REJECT_MEMBERSHIP` / ADMIN | public neutral reason category + internal reason required | REJECTED | `MembershipRejected` | notify applicant with neutral reason; `reapply_not_before_at=+7d`; internal Safety context need-to-know | — | yes |
| M-05 | PENDING | `WITHDRAW_MEMBERSHIP_REQUEST` / ATH | requester only | LEFT | `MembershipRequestWithdrawn` | close request | — | yes |
| M-06 | ACTIVE | `LEAVE_COMMUNITY` / ATH | no accepted obligation, or resignation workflow already produced required Forfeit | LEFT | `MembershipLeft` | release status via succession; invalidate queued entries; preserve history | — | yes |
| M-07 | ACTIVE | `REMOVE_ORDINARY` / ADMIN | subject Ordinary, reason; not admin's own case conflict | REMOVED | `MembershipRemoved` | cancel incomplete competition/Booking no-loss; 48h removal appeal | — | yes; restore = new ACTIVE record |
| M-08 | ACTIVE | `REQUEST_STATUS_HOLDER_REMOVAL` / ADMIN | subject Champion/Contender, reason | UNDER_REVIEW | `StatusHolderRemovalReviewStarted` | hold status/processes; visible UNDER_REVIEW | Central SLA policy | no |
| M-09 | UNDER_REVIEW | `REJECT_REMOVAL` / CENTRAL | reviewed evidence | ACTIVE | `MembershipRemovalRejected` | release holds/deadlines | — | no |
| M-10 | UNDER_REVIEW | `CONFIRM_REMOVAL` / CENTRAL | reason/evidence | REMOVED | `MembershipRemovalConfirmed` | succession/vacancy; decide confirmed Sessions explicitly | — | yes |
| M-11 | PENDING/ACTIVE/UNDER_REVIEW | `ARCHIVE_FOR_COMMUNITY_CLOSURE` / SYSTEM | approved Closure Plan reached finalization | ARCHIVED | `MembershipArchivedByCommunityClosure` | close relationship without loss/punishment; preserve history | closure finalization | yes |

## 4. RoleGrant

States: `PENDING`, `ACTIVE`, `DECLINED`, `REVOKED`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| RG-01 | — | `INVITE_COACH` / ADMIN | Account verified, Community scope | PENDING | `CoachInvited` | notify invitee | invite TTL (config) | no |
| RG-02 | PENDING | `ACCEPT_COACH_ROLE` / invited user | invitation valid | ACTIVE | `CoachAuthorized` | coach capabilities enabled | — | no |
| RG-03 | PENDING | `DECLINE_COACH_ROLE` / invitee | valid pending invitation | DECLINED | `CoachInviteClosed` | no capabilities | — | yes |
| RG-04 | PENDING | `EXPIRE_COACH_INVITE` / SYSTEM | invitation TTL reached | EXPIRED | `CoachInviteClosed` | no capabilities | invite TTL | yes |
| RG-05 | ACTIVE | `REVOKE_ROLE` / ADMIN or CENTRAL | actor controls scope; reason | REVOKED | `RoleRevoked` | future Sessions need replacement; completed history preserved | — | yes |
| RG-06 | — | `AUTHORIZE_GUEST_COACH` / ADMIN | exact Session, account verified, no conflict | ACTIVE | `GuestCoachAuthorized` | Session-only permission | Session Result final/cancel | no |
| RG-07 | ACTIVE | `EXPIRE_GUEST_COACH` / SYSTEM | scoped Session final/cancelled | EXPIRED | `GuestCoachAuthorizationExpired` | remove capability | result/cancel event | yes |
| RG-08 | — | `APPOINT_ADMIN` / CENTRAL | verified account, Venue verified | ACTIVE | `GymAdminAppointed` | admin capability | — | no |
| RG-09 | — | `APPOINT_PRIMARY_ADMIN` / CENTRAL | verified active Admin; Venue has no active Primary | ACTIVE | `PrimaryAdminAppointed` | grant PRIMARY_ADMIN; ordinary operational capability unchanged | — | no |
| RG-10 | ACTIVE | `TRANSFER_PRIMARY_ADMIN` / CENTRAL | current Primary and target active Admin; Venue lock; reason | ACTIVE | `PrimaryAdminTransferred` | atomically downgrade prior Primary to GYM_ADMIN and promote target; exactly one Primary | — | no |

## 5. Like

States: `ACTIVE`, `MATCHED`, `EXPIRED`, `WITHDRAWN`, `REMOVED_BY_SKIP`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| L-01 | — | `LIKE` / ATH | Discovery source; same age contour; no Block/Match/suppression | ACTIVE | `LikeCreated` | inbound card priority/highlight | 30d | no |
| L-02 | ACTIVE + reverse ACTIVE | `LIKE` / other ATH | both valid in same transaction | MATCHED (both) | `MutualLikeDetected`, `MatchCreated` | create one Match/chat; remove pair from Discovery | immediate | yes |
| L-03 | ACTIVE | `WITHDRAW_LIKE` / sender | unmatched | WITHDRAWN | `LikeWithdrawn` | remove signal | — | yes |
| L-04 | ACTIVE | `SKIP` / recipient | pair visible | REMOVED_BY_SKIP | `LikeRemovedBySkip` | suppress pair 15d | — | yes |
| L-05 | ACTIVE | `EXPIRE_LIKE` / SYSTEM | `expires_at <= now` | EXPIRED | `LikeExpired` | remove signal | 30d | yes |

## 6. Match

States: `ACTIVE`, `ARCHIVED`, `UNMATCHED`, `BLOCKED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| MT-01 | — | `CREATE_FROM_MUTUAL_LIKE` / SYSTEM | normalized pair unique | ACTIVE | `MatchCreated` | open personal Chat | — | no |
| MT-02 | ACTIVE | `ARCHIVE_INACTIVE_MATCH` / SYSTEM | no message/action 30d | ARCHIVED | `MatchArchived` | move from active list | 30d inactivity | no |
| MT-03 | ARCHIVED | `SEND_MESSAGE` / either ATH | no Block | ACTIVE | `MatchReactivated` | show active chat | — | no |
| MT-04 | ACTIVE/ARCHIVED | `UNMATCH` / either ATH | actor in pair | UNMATCHED | `MatchEnded` | close personal chat; suppress 15d; close pre-accept Match-based optional Challenge/GroupPlan/Slot request no-fault; preserve accepted/status obligations | — | yes |
| MT-05 | ACTIVE/ARCHIVED | `BLOCK` / either ATH | actor in pair | BLOCKED | `MatchBlocked` | same optional pre-accept cleanup; preserve accepted obligation and status FIFO/mandatory path in structured service UI | — | yes; future relationship needs new Match |

## 7. Group scheduling

### 7.1. GroupOffering

States: `PUBLISHED`, `WITHDRAWN`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| GO-01 | — | `PUBLISH_GROUP_OFFERING` / ADMIN | Venue active; future valid interval; required display/contact data | PUBLISHED | `GroupOfferingPublished` | show with freshness and capacity disclaimer | start_at | no |
| GO-02 | PUBLISHED | `UPDATE_GROUP_OFFERING` / ADMIN | before start; valid fields | PUBLISHED | `GroupOfferingUpdated` | increment version/updated_at; new GroupPlan uses new snapshot | — | no |
| GO-03 | PUBLISHED | `WITHDRAW_GROUP_OFFERING` / ADMIN | before start | WITHDRAWN | `GroupOfferingWithdrawn` | hide from new plans; existing plans keep snapshot and show unavailable warning | — | yes |
| GO-04 | PUBLISHED | `EXPIRE_GROUP_OFFERING` / SYSTEM | start_at <= now | EXPIRED | `GroupOfferingExpired` | hide from discovery; existing GroupPlan lifecycle handles own expiry | start_at | yes |

### 7.2. GroupPlan

States: `PROPOSED`, `NOTIFIED`, `CONVERSION_PENDING`, `CONVERTED`, `DECLINED`, `CANCELLED`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| GP-01 | — | `PROPOSE_GROUP_PLAN` / either matched ATH | active Match, group offering future, no Block | PROPOSED | `GroupPlanProposed` | action card to peer | until offering start | no |
| GP-02 | PROPOSED | `CONFIRM_GROUP_PLAN` / other ATH | offering not started | NOTIFIED | `GroupPlanMutuallyConfirmed` | notify Venue; show contacts/plan; no reservation/stats | offering start | no |
| GP-03 | PROPOSED | `DECLINE_GROUP_PLAN` / other ATH | — | DECLINED | `GroupPlanDeclined` | close card | — | yes |
| GP-04 | PROPOSED/NOTIFIED/CONVERSION_PENDING | `CANCEL_GROUP_PLAN` / either ATH | not converted | CANCELLED | `GroupPlanCancelled` | notify pair; release active conversion status slot if held; no Competition effect | — | yes |
| GP-05 | NOTIFIED | `REQUEST_OFFICIAL_CONVERSION` / either ATH | before start; no status-bearing FIFO required; no existing conversion | CONVERSION_PENDING | `GroupPlanChallengeConversionRequested` | store requester confirmation; ask peer and Coach | group start | no |
| GP-06 | CONVERSION_PENDING | `CONFIRM_CONVERSION_PARTY` / required ATH or COACH | actor not yet confirmed; not all required confirmations collected after command | CONVERSION_PENDING | `GroupPlanConversionPartyConfirmed` | store actor confirmation; keep waiting for named party | min(72h, group start) | no |
| GP-07 | CONVERSION_PENDING | `CONFIRM_CONVERSION_PARTY` / final required ATH or COACH | both ATH + authorized Coach now confirmed; start within 14d; Official eligibility incl. Youth consent; neither Athlete has another accepted Official obligation | CONVERTED | `GroupPlanConversionPartyConfirmed`, `GroupPlanConvertedToChallenge` | create Challenge/participant obligations and official Session context; no group attendance stats | min(72h, group start) | yes |
| GP-08 | CONVERSION_PENDING | `DECLINE_CONVERSION` / any required party | group plan still valid | NOTIFIED | `GroupPlanConversionDeclined` | retain social plan, no Challenge; release active conversion status slot | — | no |
| GP-09 | PROPOSED/NOTIFIED/CONVERSION_PENDING | `EXPIRE_GROUP_PLAN` / SYSTEM | `start_at <= now`, not converted | EXPIRED | `GroupPlanExpired` | close actions; release active conversion status slot if held | group start | yes |
| GP-10 | NOTIFIED | `REQUEST_STATUS_CONVERSION` / either ATH | pair currently requires Contender FIFO; before start; no live entry | NOTIFIED | `GroupPlanOfficialConversionQueued` | create `PREBOOKED_CONVERSION` QueueEntry; social plan unchanged | queue activation/group start | no |
| GP-11 | NOTIFIED | `ACTIVATE_STATUS_CONVERSION` / SYSTEM | linked QueueEntry strict head; same bound holder/pair; before start | CONVERSION_PENDING | `GroupPlanChallengeConversionRequested` | consume entry; hold status slot; store requester confirmation; ask peer and Coach | min(72h, group start) | no |
| GP-12 | CONVERSION_PENDING | `EXPIRE_CONVERSION_CONFIRMATION` / SYSTEM | min(72h, group start) reached without all confirmations | NOTIFIED | `GroupPlanConversionClosed` | preserve social plan; release active conversion status slot | confirmation deadline | no |
| GP-13 | CONVERSION_PENDING | `CLOSE_INVALID_CONVERSION` / SYSTEM | eligibility/consent/Coach/status context lost before final commit | NOTIFIED | `GroupPlanConversionClosed` | preserve social plan; release active conversion status slot; explain failed guard | eligibility event | no |
| GP-14 | PROPOSED/NOTIFIED/CONVERSION_PENDING | `CLOSE_AFTER_PAIR_SOCIAL_END` / SYSTEM | Match ended/Block effective; no accepted Official conversion and no activated status-bearing conversion | CANCELLED | `GroupPlanClosedByPairSocialEnd` | close social card no-fault; detach any WAITING status entry through Q-15 preserving FIFO; Venue notification history remains | social event | yes |

## 8. Slot

States: `PUBLISHED`, `BOOKED`, `WITHDRAWN`, `EXPIRED`, `CANCELLED`, `COMPLETED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| SL-01 | — | `PUBLISH_SLOT` / COACH or ADMIN | Coach authorized; interval valid; ≤30d; no Coach overlap | PUBLISHED | `SlotPublished` | visible to eligible pairs | start_at | no |
| SL-02 | PUBLISHED | `EDIT_SLOT` / owner COACH or ADMIN | no confirmed Booking; still valid/no overlap | PUBLISHED | `SlotEdited` | invalidate mismatching selections; notify affected pair | — | no |
| SL-03 | PUBLISHED | `WITHDRAW_SLOT` / owner COACH or ADMIN | no confirmed Booking | WITHDRAWN | `SlotWithdrawn` | expire pending Booking requests no-fault | — | yes |
| SL-04 | PUBLISHED | `CLAIM_SLOT` / SYSTEM inside host confirm | Booking request valid; atomic resource locks/no conflicts | BOOKED | `SlotBooked` | link Booking/Session | — | no |
| SL-05 | PUBLISHED | `EXPIRE_SLOT` / SYSTEM | start_at reached unbooked | EXPIRED | `SlotExpired` | close pending selections | start_at | yes |
| SL-06 | BOOKED | `CANCEL_BOOKED_SLOT` / Booking workflow | valid cancellation policy | CANCELLED | `SlotBookingCancelled` | release resource; Challenge reschedule/Forfeit handled by cause | — | yes |
| SL-07 | BOOKED | `COMPLETE_SLOT` / SYSTEM | linked Session ended | COMPLETED | `SlotCompleted` | close calendar resource | session end | yes |

## 9. Booking

States: `SELECTING`, `HOST_CONFIRMATION_PENDING`, `CONFIRMED_PAIR`, `OFFICIAL_CONVERSION_PENDING`, `OFFICIAL_RELEASE_PENDING`, `SOLO_DECISION_PENDING`, `CONFIRMED_SOLO`, `EXPIRED`, `REJECTED`, `CANCELLED`, `COMPLETED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| B-01 | — | `SELECT_SLOT` / either ATH | active Match or accepted Challenge; one pending pair request; Slot PUBLISHED | SELECTING | `SlotSelectedByAthlete` | show highlighted selection to peer; expiry +1h | 1h | no |
| B-02 | SELECTING | `SELECT_SAME_SLOT` / other ATH | same Slot/commercial version still PUBLISHED; eligibility valid; both saw terms | HOST_CONFIRMATION_PENDING | `SlotMutuallySelected` | freeze immutable commercial terms snapshot; ask HOST; no reservation | before `start_at-min_notice` | no |
| B-03 | SELECTING | `CHANGE_SELECTION` / selecting ATH | TTL active; new Slot valid | SELECTING | `SlotSelectionChanged` | reset peer selection and TTL | 1h from new first selection | no |
| B-04 | SELECTING/HOST_CONFIRMATION_PENDING | `WITHDRAW_SLOT_REQUEST` / either ATH | not host-confirmed | CANCELLED | `BookingRequestWithdrawn` | Challenge returns ACCEPTED_UNSCHEDULED; no penalty | — | yes |
| B-05 | SELECTING | `EXPIRE_SELECTION` / SYSTEM | selection TTL reached | EXPIRED | `SlotSelectionExpired` | return to slot list; Challenge remains accepted | 1h | yes |
| B-06 | HOST_CONFIRMATION_PENDING | `CONFIRM_BOOKING` / HOST | Slot/Coach/Venue/Athlete calendars, member/verification/consent/eligibility recheck; min notice | CONFIRMED_PAIR | `BookingConfirmed` | atomically Slot→BOOKED; create Session; Challenge→BOOKED | host deadline | no |
| B-07 | HOST_CONFIRMATION_PENDING | `REJECT_BOOKING` / HOST | reason | REJECTED | `BookingRejected` | Challenge returns unscheduled; no reschedule/fault | — | yes |
| B-08 | HOST_CONFIRMATION_PENDING | `FAIL_ATOMIC_CLAIM` / SYSTEM | Slot/resource conflict | REJECTED | `BookingConflictDetected` | preserve alternatives, no auto-booking | host action | yes |
| B-09 | HOST_CONFIRMATION_PENDING | `EXPIRE_HOST_CONFIRMATION` / SYSTEM | min-notice boundary reached | EXPIRED | `BookingConfirmationExpired` | return Challenge to scheduling; no fault | `start_at-min_notice` | yes |
| B-10 | CONFIRMED_PAIR | `CANCEL_TRAINING_PARTICIPANT` / one ATH | purpose TRAINING; before start | SOLO_DECISION_PENDING | `TrainingParticipantCancelled` | ask remaining ATH and Coach; cancelled athlete removed | min(1h, start boundary) | no |
| B-11 | SOLO_DECISION_PENDING | `CONFIRM_SOLO` / remaining ATH or COACH | actor not yet confirmed; other confirmation still missing | SOLO_DECISION_PENDING | `SoloContinuationConfirmed` | store actor confirmation; retain Slot temporarily | min(1h, start boundary) | no |
| B-12 | SOLO_DECISION_PENDING | `CONFIRM_SOLO` / final remaining ATH or COACH | both confirmations now present; Slot still valid | CONFIRMED_SOLO | `SoloContinuationConfirmed`, `BookingConvertedToSolo` | retain Slot; update Session participants | min(1h, start boundary) | no |
| B-13 | SOLO_DECISION_PENDING | `DECLINE/EXPIRE_SOLO` / remaining ATH, COACH or SYSTEM | decline or timer | CANCELLED | `SoloContinuationClosed` | cancel Session; release Slot; no Competition effect | min(1h,start) | yes |
| B-14 | CONFIRMED_PAIR | `CANCEL_OFFICIAL_BY_ATHLETE` / ATH | purpose OFFICIAL; before start | CANCELLED | `OfficialBookingCancelledByAthlete` | synthetic FORFEIT Result; Slot release; Appeal 48h | — | yes |
| B-15 | CONFIRMED_PAIR | `CANCEL_EXTERNAL_OR_MUTUAL` / COACH/HOST/both ATH/CENTRAL | external or mutual reason | CANCELLED | `BookingCancelledNoFault` | Challenge reschedule; counter rules; Slot release | — | yes |
| B-16 | CONFIRMED_PAIR/CONFIRMED_SOLO | `SESSION_COMPLETED` / SYSTEM | linked Session ended | COMPLETED | `BookingCompleted` | profile Training projection if present | session end | yes |
| B-17 | CONFIRMED_PAIR | `REQUEST_OFFICIAL_CONVERSION` / either ATH | purpose TRAINING; paired Session SCHEDULED; no status-bearing FIFO required; before window opens | OFFICIAL_CONVERSION_PENDING | `TrainingOfficialConversionRequested` | requester confirmation stored; ask other Athlete and assigned Coach | scheduled start | no |
| B-18 | OFFICIAL_CONVERSION_PENDING | `CONFIRM_OFFICIAL_CONVERSION` / other required ATH or COACH | actor not yet confirmed; another confirmation still missing | OFFICIAL_CONVERSION_PENDING | `TrainingOfficialConversionPartyConfirmed` | store confirmation; Training remains effective until final commit | min(72h, scheduled start) | no |
| B-19 | OFFICIAL_CONVERSION_PENDING | `CONFIRM_OFFICIAL_CONVERSION` / final required ATH or COACH | both ATH + non-conflicted assigned Coach; scheduled start within 14d; full Official eligibility/consent; neither Athlete has another accepted Official obligation; before window opens | CONFIRMED_PAIR | `TrainingOfficialConversionPartyConfirmed`, `BookingConvertedToOfficial` | atomically purpose OFFICIAL; create Challenge BOOKED and participant obligations; Session type/link official | min(72h, scheduled start) | no |
| B-20 | OFFICIAL_CONVERSION_PENDING | `DECLINE/EXPIRE_OFFICIAL_CONVERSION` / required party or SYSTEM | explicit decline or confirmation deadline | CONFIRMED_PAIR | `TrainingOfficialConversionClosed` | clear conversion request; preserve original Training Booking/Session; release active conversion status slot | min(72h, scheduled start) | no |
| B-21 | CONFIRMED_PAIR | `REQUEST_STATUS_CONVERSION` / either ATH | purpose TRAINING; pair currently requires Contender FIFO; before window opens; no live entry | CONFIRMED_PAIR | `TrainingOfficialConversionQueued` | create `PREBOOKED_CONVERSION` QueueEntry; Booking stays Training | queue activation/scheduled start | no |
| B-22 | CONFIRMED_PAIR | `ACTIVATE_STATUS_CONVERSION` / SYSTEM | linked QueueEntry strict head; same bound holder/pair; Session window not opened | OFFICIAL_CONVERSION_PENDING | `TrainingOfficialConversionRequested` | consume entry; requester confirmation stored; ask peer and Coach | scheduled start | no |
| B-23 | OFFICIAL_CONVERSION_PENDING | `CLOSE_INVALID_CONVERSION` / SYSTEM | eligibility/consent/Coach/status context lost before final commit | CONFIRMED_PAIR | `TrainingOfficialConversionClosed` | preserve original Training; release active conversion status slot; explain failed guard | eligibility event | no |
| B-24 | OFFICIAL_CONVERSION_PENDING | `CANCEL_TRAINING_PARTICIPANT` / one ATH | conversion not committed; source purpose still TRAINING | SOLO_DECISION_PENDING | `TrainingOfficialConversionClosed`, `TrainingParticipantCancelled` | release conversion status slot; ask remaining ATH and Coach; no Forfeit | min(1h,start) | no |
| B-25 | OFFICIAL_CONVERSION_PENDING | `CANCEL_TRAINING_EXTERNAL_OR_MUTUAL` / COACH/HOST/both ATH/CENTRAL | conversion not committed; valid ordinary cancellation cause | CANCELLED | `TrainingOfficialConversionClosed`, `BookingCancelledNoFault` | release conversion status slot and Slot; no Competition effect | — | yes |
| B-26 | CONFIRMED_PAIR | `OFFER_TRAINING_RETENTION` / SYSTEM | purpose OFFICIAL; linked Challenge closed no-fault before start; Slot/Coach still valid | OFFICIAL_RELEASE_PENDING | `BookingTrainingRetentionRequested` | retain Slot temporarily; ask both Athlete and Coach/host | min(1h,start) | no |
| B-27 | OFFICIAL_RELEASE_PENDING | `CONFIRM_TRAINING_RETENTION` / required ATH or COACH/HOST | actor not decided; another confirmation still missing | OFFICIAL_RELEASE_PENDING | `BookingTrainingRetentionConfirmed` | store confirmation | min(1h,start) | no |
| B-28 | OFFICIAL_RELEASE_PENDING | `CONFIRM_TRAINING_RETENTION` / final required ATH or COACH/HOST | both Athlete + Coach/host confirmed; before start | CONFIRMED_PAIR | `BookingTrainingRetentionConfirmed`, `BookingConvertedToTraining` | purpose/Session type TRAINING; preserve Challenge lineage; no Competition effect | min(1h,start) | no |
| B-29 | OFFICIAL_RELEASE_PENDING | `DECLINE/EXPIRE_TRAINING_RETENTION` / required party or SYSTEM | decline or deadline | CANCELLED | `BookingTrainingRetentionClosed`, `BookingCancelledNoFault` | cancel Session; release Slot; no Competition effect | min(1h,start) | yes |
| B-30 | SELECTING/HOST_CONFIRMATION_PENDING | `CLOSE_AFTER_PAIR_SOCIAL_END` / SYSTEM | purpose TRAINING; Match ended/Block effective; no accepted Challenge | CANCELLED | `BookingClosedByPairSocialEnd` | release selection/request no-fault; Slot remains available | social event | yes |
| B-31 | CONFIRMED_PAIR/CONFIRMED_SOLO | `REPLACE_COACH_EQUIVALENT` / ADMIN | before actual start; if Session READY, within operational grace; new Coach authorized/non-conflicted; same Venue/time/price/ruleset hashes | same state | `BookingCoachReplaced` | atomically update Session assignment; append old/new audit; notify Athlete; expose no-fault reschedule action | actual start/grace | no |
| B-32 | CONFIRMED_PAIR/CONFIRMED_SOLO | `REQUEST_RESCHEDULE_AFTER_COACH_REPLACEMENT` / ATH | before actual start; latest replacement not yet accepted by start/attendance | CANCELLED | `BookingCancelledNoFault` | release Slot/Session; Official Challenge returns scheduling with EXTERNAL cause and no user count; Training closes no-fault | actual start | yes |

`ASSUMPTION A-06`: solo decision TTL = one hour or remaining time to start, whichever is smaller. Product may change it without altering state semantics.

## 10. Session

States: `SCHEDULED`, `READY_FOR_COACH`, `IN_PROGRESS`, `ENDED`, `CANCELLED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| S-01 | — | `CREATE_FROM_BOOKING/CONVERSION` / SYSTEM | Booking confirmed or valid group conversion; Coach/Venue assigned | SCHEDULED | `SessionScheduled` | show plan; prepare reminders | scheduled_start | no |
| S-02 | SCHEDULED | `OPEN_SESSION_WINDOW` / SYSTEM at scheduled time | no active blocking hold; Coach assignment valid; Membership recheck; official stakes resolvable | READY_FOR_COACH | `SessionWindowOpened` | create immutable competitive snapshot; enable Coach Start/Attendance; do not assert actual start/attendance | scheduled_start | no |
| S-03 | SCHEDULED | `INVALIDATE_COMPETITIVE_CONTEXT` / SYSTEM | planned TITLE participants no longer Champion+Contender, age contour changed, or other no-fault eligibility loss | CANCELLED | `CompetitiveSessionInvalidated` | Challenge no-fault cancel; offer cancel Booking or explicitly preserve physical activity as Training | before/at start | yes for this Session |
| S-04 | SCHEDULED/READY_FOR_COACH | `CANCEL_SESSION` / Booking workflow/CENTRAL | valid cancellation cause | CANCELLED | `SessionCancelled` | effects delegated by cause; no deletion | — | yes |
| S-05 | IN_PROGRESS | `RECORD_ATTENDANCE` / COACH | assigned/guest Coach; not athlete-arbiter conflict; NO_SHOW only after Venue grace and only if absence objectively prevented Session | IN_PROGRESS | `AttendanceRecorded` | store PRESENT/LATE/NO_SHOW fact; if Session occurred, LATE never forces outcome; double absence normalizes to NO_CONTEST | configured grace | no |
| S-06 | IN_PROGRESS | `END_SESSION` / COACH or SYSTEM at end | actual end; attendance available or may follow | ENDED | `SessionEnded` | official Challenge→RESULT_PENDING; training stats for PRESENT/LATE | scheduled_end / coach action | yes physical outcome |
| S-07 | SCHEDULED | `CONVERT_TRAINING_TO_OFFICIAL` / SYSTEM | Booking conversion B-19 committed; same participants/Coach/Venue; before window opens | SCHEDULED | `SessionConvertedToOfficial` | set type/link Challenge; stakes still wait for S-02 | scheduled start | no |
| S-08 | SCHEDULED/READY_FOR_COACH | `REPLACE_COACH_FROM_BOOKING` / SYSTEM | B-31 committed; new Coach valid; no actual start; if window open, within operational grace | same state | `SessionCoachReplaced` | append assignment revision; preserve competitive snapshot when already open | actual start/grace | no |
| S-09 | READY_FOR_COACH | `START_SESSION` / assigned/guest COACH | authorized non-participant Coach; competitive snapshot exists; within operational window | IN_PROGRESS | `SessionStarted` | set actual_start_at; Challenge→IN_SESSION; enable attendance/result path | operational window | no |
| S-10 | READY_FOR_COACH | `RECORD_FIRST_ATTENDANCE` / assigned/guest COACH | S-09 guards plus valid Attendance payload | IN_PROGRESS | `SessionStarted`, `AttendanceRecorded` | atomically set actual start and first attendance; Challenge→IN_SESSION | operational window | no |
| S-11 | READY_FOR_COACH | `FAIL_COACH_OR_VENUE` / assigned COACH, scoped ADMIN, CENTRAL or SYSTEM from confirmed operation | no actual start; Coach/Venue failed; equivalent replacement unavailable by grace | CANCELLED | `SessionFailedExternal`, `BookingCancelledNoFault` | Official Challenge returns scheduling with EXTERNAL cause/no user count; Training closes no-fault; repeated Venue failure opens operational Case | configured grace/review | yes |
| S-12 | SCHEDULED | `CONVERT_PAIR_TO_SOLO` / SYSTEM after B-12 | remaining Athlete and Coach confirmed; before actual start | SCHEDULED | `SessionConvertedToSolo` | retain time/Coach; only confirmed Athlete remains active; no Competition effect | min(1h,start) | no |
| S-13 | SCHEDULED | `CONVERT_OFFICIAL_TO_TRAINING` / SYSTEM after B-28 | both Athletes and Coach/host confirmed; before actual start | SCHEDULED | `SessionConvertedToTraining` | clear live Challenge link; retain immutable lineage through retention record; no Competition effect | min(1h,start) | no |

Stakes замораживаются в S-02 на logical `scheduled_start_at`; это не `actual_start_at`. Actual start фиксируется только S-09/S-10, а `recorded_at` отражает момент Coach/system commit (`ASSUMPTION A-05`).
S-07, S-08 while still `SCHEDULED`, S-12 and S-13 advance the Session version and therefore atomically reissue the scheduled-window timer with that new exact version. The previous job is intentionally stale; the replacement preserves the original logical boundary.

## 11. Competition phase и availability

### 11.1. Phase states

`FOUNDING_OPEN`, `FOUNDING_CHALLENGE`, `RUNNING`, `CONTENDER_VACANT_OPEN`, `CONTENDER_GENESIS`, `CLOSED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| C-01 | — | `CREATE_COMPETITION` / CENTRAL | verified Community; age division unique | FOUNDING_OPEN | `CompetitionCreated` | open public genesis candidates | 3d after first candidate | no |
| C-02 | FOUNDING_OPEN | `PAIR_FIRST_TWO` / SYSTEM | first two valid willing ACTIVE by FIFO | FOUNDING_CHALLENGE | `FoundingGenesisPaired` | create mutual GENESIS Challenge | when second arrives | no |
| C-03 | FOUNDING_OPEN | `PROMOTE_SINGLE_FOUNDER` / SYSTEM | exactly one valid candidate for full 3d | CONTENDER_VACANT_OPEN | `GenesisWithoutOpponent` | candidate→Champion; open Contender candidates | 3d | no |
| C-04 | FOUNDING_CHALLENGE | `FINALIZE_GENESIS` / SYSTEM | effective decisive Result final | RUNNING or CONTENDER_VACANT_OPEN | `FoundingGenesisFinalized` | assign Champion; assign Contender unless loser FORFEIT/NO_SHOW | Result final | no |
| C-05 | FOUNDING_CHALLENGE | `REPEAT_GENESIS` / Appeal/System | DRAW/NO_CONTEST/repeat decision | FOUNDING_CHALLENGE | `GenesisRepeatRequired` | return same Challenge cycle to scheduling | — | no |
| C-06 | RUNNING | `VACATE_CONTENDER` / status event | Contender leaves/removed/promoted | CONTENDER_VACANT_OPEN | `ContenderVacated` | queue→candidate pool; start public window | 3d after first candidate | no |
| C-07 | CONTENDER_VACANT_OPEN | `PAIR_FIRST_TWO` / SYSTEM | first two valid candidates FIFO | CONTENDER_GENESIS | `ContenderGenesisPaired` | create GENESIS Challenge | second candidate | no |
| C-08 | CONTENDER_VACANT_OPEN | `PROMOTE_SINGLE_CANDIDATE` / SYSTEM | one candidate for full 3d | RUNNING | `SuccessionWithoutOpponent` | candidate→Contender; activate queue | 3d | no |
| C-09 | CONTENDER_GENESIS | `FINALIZE_CONTENDER_GENESIS` / SYSTEM | effective decisive Result final | RUNNING | `ContenderGenesisFinalized` | winner→Contender | Result final | no |
| C-10 | CONTENDER_GENESIS | `REPEAT_GENESIS` / Appeal/System | DRAW/NO_CONTEST/repeat | CONTENDER_GENESIS | `GenesisRepeatRequired` | same pair reschedules | — | no |
| C-11 | any non-CLOSED | `CLOSE_COMPETITION` / CENTRAL | Community Closure Plan finalizing; retained Sessions/result paths resolved | CLOSED | `CompetitionClosed` | close Champion/Contender tenures as `COMMUNITY_CLOSED`; no W/L/Succession; terminate queue/new actions; preserve history; no migration | — | yes |
| C-12 | RUNNING/CONTENDER_VACANT_OPEN | `REOPEN_FOUNDING_AFTER_CHAMPION_VACANCY` / SYSTEM | Champion exited and no valid Contender successor | FOUNDING_OPEN | `ChampionVacated` | open explicit GENESIS candidates under existing FIFO rules | status event | no |
| C-13 | FOUNDING_CHALLENGE | `RELEASE_UNACCEPTED_GENESIS_PAIR` / SYSTEM | GENESIS Challenge declined/expired before mutual acceptance | FOUNDING_OPEN | `GenesisPairingReleased` | close failing candidate entry; return counterpart with original FIFO key; re-evaluate 3d single-candidate rule | response event | no |
| C-14 | CONTENDER_GENESIS | `RELEASE_UNACCEPTED_GENESIS_PAIR` / SYSTEM | GENESIS Challenge declined/expired before mutual acceptance | CONTENDER_VACANT_OPEN | `GenesisPairingReleased` | close failing candidate entry; return counterpart with original FIFO key; re-evaluate 3d single-candidate rule | response event | no |

### 11.2. Availability states

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| CA-01 | ACTIVE | `PAUSE_COMMUNITY` / CENTRAL | reason | PAUSED | `CompetitionPaused` | holds all non-confirmed Session processes; pausable clocks stop; Cooldown continues | — | no |
| CA-02 | PAUSED | `REACTIVATE_COMMUNITY` / CENTRAL | cause resolved | ACTIVE | `CompetitionReactivated` | release holds; extend deadlines by pause duration | — | no |
| CA-03 | ACTIVE/PAUSED | `CLOSE` / CENTRAL | permanent closure | CLOSED | `CompetitionAvailabilityClosed` | no new actions | — | yes |

Confirmed Sessions remain executable during Community pause unless Central attaches a Session-specific Safety hold.

## 12. ChallengeQueueEntry

States: `WAITING`, `PAIRED_PENDING_ACCEPTANCE`, `RECONFIRMATION_REQUIRED`, `ACTIVATED`, `CONSUMED`, `WITHDRAWN`, `INVALIDATED`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| Q-01 | — | `SUBMIT_QUEUE_ENTRY` / eligible ATH | kind allowed; one live entry; verified Membership; no cooldown; Block cannot deny status path | WAITING | `ChallengeQueued` | assign FIFO key/position; structured service mode if pair blocked | activation event | no |
| Q-02 | WAITING | `WITHDRAW_ENTRY` / initiator | not activated | WITHDRAWN | `QueueEntryWithdrawn` | remove; resubmit gets new timestamp | — | yes |
| Q-03 | WAITING | `ACTIVATE_HEAD` / SYSTEM | strict head; kind not PREBOOKED_CONVERSION; status slot free; eligibility rechecked | ACTIVATED | `QueueEntryActivated` | bind current holder; create Challenge; mandatory clock begins only if policy mandatory | slot-free event | no |
| Q-04 | ACTIVATED | `CREATE_CHALLENGE_COMMITTED` / SYSTEM | normal Challenge created atomically | CONSUMED | `QueueEntryConsumed` | queue advances only when status slot later free | immediate | yes |
| Q-05 | WAITING | `HOLDER_CHANGED` / SYSTEM | entry kind migratable | RECONFIRMATION_REQUIRED | `QueueReconfirmationRequested` | show new Contender; preserve submitted_at | 24h | no |
| Q-06 | RECONFIRMATION_REQUIRED | `RECONFIRM` / initiator | still eligible, within 24h | WAITING | `QueueEntryReconfirmed` | preserve FIFO key; bind new holder | — | no |
| Q-07 | RECONFIRMATION_REQUIRED | `DECLINE/EXPIRE` / initiator or SYSTEM | explicit or deadline | WITHDRAWN or EXPIRED | `QueueEntryReconfirmationClosed` | remove from queue | 24h | yes |
| Q-08 | WAITING/RECONFIRMATION_REQUIRED | `INVALIDATE` / SYSTEM/CENTRAL | membership/age/status no longer eligible; initiator already has accepted Official obligation at activation; former Contender TITLE intent; prebooked source started/expired/holder changed | INVALIDATED | `QueueEntryInvalidated` | remove without loss; busy Athlete may requeue later with new timestamp; prebooked source remains Training/Group Plan; audit reason | eligibility/source event | yes |
| Q-09 | WAITING | `ACTIVATE_PREBOOKED_HEAD` / SYSTEM | strict head; kind PREBOOKED_CONVERSION; same bound holder/source pair; source not started; eligibility rechecked | ACTIVATED | `QueueEntryActivated` | signal B-22 or GP-11; do not create Challenge yet | slot-free event | no |
| Q-10 | ACTIVATED | `CONVERSION_FLOW_ACTIVATED` / SYSTEM | source entered conversion-pending state atomically | CONSUMED | `QueueEntryConsumed` | status slot remains occupied by conversion intent until converted/declined/expired | immediate | yes |
| Q-11 | WAITING | `PAIR_GENESIS_FIRST_TWO` / SYSTEM | kind GENESIS_CANDIDATE; first two valid entries locked atomically | PAIRED_PENDING_ACCEPTANCE | `GenesisCandidatePaired` | bind same genesis_pair/Challenge; start 48h mutual response | 48h | no |
| Q-12 | PAIRED_PENDING_ACCEPTANCE | `GENESIS_MUTUALLY_ACCEPTED` / SYSTEM | linked Challenge accepted by both | CONSUMED | `GenesisCandidateConsumed` | accepted obligation now governs; FIFO pair no longer waiting | acceptance event | yes |
| Q-13 | PAIRED_PENDING_ACCEPTANCE | `RETURN_AFTER_COUNTERPART_FAILURE` / SYSTEM | counterpart declined/expired/withdrew; this entry did not fail | WAITING | `GenesisCandidateReturnedToQueue` | preserve original submitted_at/entry_id; clear pair binding; re-evaluate head/public window | response event | no |
| Q-14 | PAIRED_PENDING_ACCEPTANCE | `DECLINE_OR_EXPIRE_GENESIS` / candidate or SYSTEM | own explicit decline/withdraw or own 48h response timeout | WITHDRAWN or EXPIRED | `GenesisCandidateClosed` | no loss; counterpart handled by Q-13; re-entry gets new FIFO key | 48h | yes |
| Q-15 | WAITING/RECONFIRMATION_REQUIRED | `DETACH_CLOSED_SOCIAL_SOURCE` / SYSTEM | kind PREBOOKED_CONVERSION; source GroupPlan closed by Block/Unmatch; equivalent direct status intent remains eligible | same state | `QueueEntrySourceDetached` | clear source; change to direct status kind; preserve submitted_at/entry_id/bound holder and reconfirm state | social event | no |

Ordering is exactly `(submitted_at, entry_id)`. UI position is a projection and may skip temporarily invalid entries only after Q-08 commits.

## 13. Challenge

States: `AWAITING_RESPONSE`, `ACCEPTED_UNSCHEDULED`, `BOOKING_PENDING`, `BOOKED`, `IN_SESSION`, `RESULT_PENDING`, `RESULT_RECORDED`, `UNDER_APPEAL`, `COMPLETED`, `DECLINED`, `WITHDRAWN`, `CANCELLED_NO_FAULT`, `EXPIRED_NO_FAULT`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| CH-01 | — | `CREATE_CHALLENGE` / initiator or SYSTEM from queue | matrix eligibility; pair uniqueness; snapshot response policy/ruleset; initiator acknowledgment or SYSTEM genesis pending; explicit proof when required; if OPTIONAL: initiator unanswered count <3 and pair quiet elapsed | AWAITING_RESPONSE | `ChallengeCreated` | store initiator acknowledgment when user-created; increment unanswered only if OPTIONAL; service UI; OPTIONAL reminders +12h/+24h and deadline +48h; MANDATORY reminder +48h and deadline +72h; Youth consent request | 48h optional / 72h mandatory | no |
| CH-02 | AWAITING_RESPONSE | `ACCEPT_CHALLENGE` / RECIPIENT (each required participant for genesis) | eligibility recheck; required consents; exact ruleset snapshot shown; recipient explicit proof when required; all required acknowledgments now present; neither Athlete has another accepted Official obligation | ACCEPTED_UNSCHEDULED | `ChallengeAccepted` | decrement unanswered if OPTIONAL; atomically store final acknowledgment and claim each Athlete obligation; scheduling deadline +14d; slot suggestions | 14d pausable | no |
| CH-03 | AWAITING_RESPONSE | `DECLINE_OPTIONAL` / RECIPIENT | response policy OPTIONAL | DECLINED | `ChallengeDeclined` | decrement unanswered; set pair quiet +48h; release pair/status slot; no loss/cooldown | — | yes no-fault |
| CH-04 | AWAITING_RESPONSE | `DECLINE_MANDATORY` / RECIPIENT | response policy MANDATORY | RESULT_RECORDED | `MandatoryChallengeRefused`, `ResultRecorded(FORFEIT)` | administrative context snapshot; provisional status/cooldown; Appeal 48h | — | no; Result lifecycle remains |
| CH-05 | AWAITING_RESPONSE | `WITHDRAW` / initiator | not accepted | WITHDRAWN | `ChallengeWithdrawn` | decrement optional unanswered projection; release pair/status slot; no loss | — | yes |
| CH-06 | AWAITING_RESPONSE | `EXPIRE_RESPONSE` / SYSTEM | OPTIONAL deadline +48h reached | EXPIRED_NO_FAULT | `ChallengeResponseExpired` | decrement unanswered; no extra quiet; release pair/status slot; no penalty; later new invitation allowed by eligibility | 48h; reminders +12h/+24h | yes no-fault |
| CH-07 | AWAITING_RESPONSE | `EXPIRE_RESPONSE` / SYSTEM | deadline reached, MANDATORY | RESULT_RECORDED | `MandatoryChallengeExpired`, `ResultRecorded(FORFEIT)` | administrative context snapshot; provisional status/cooldown; Appeal 48h; release response slot | 72h; reminder 48h | no |
| CH-08 | ACCEPTED_UNSCHEDULED | `START_SLOT_SELECTION` / either ATH | scheduling deadline active; Slot valid | BOOKING_PENDING | `ChallengeBookingStarted` | create Booking SELECTING | — | no |
| CH-09 | BOOKING_PENDING | `BOOKING_REQUEST_CLOSED` / SYSTEM | Booking cancelled/rejected/expired before confirm | ACCEPTED_UNSCHEDULED | `ChallengeReturnedToScheduling` | preserve obligation/deadline; no reschedule | booking event | no |
| CH-10 | BOOKING_PENDING | `BOOKING_CONFIRMED` / SYSTEM | Booking CONFIRMED; all rechecks passed | BOOKED | `ChallengeBooked` | link Session; reminders | Session start | no |
| CH-11 | ACCEPTED_UNSCHEDULED/BOOKING_PENDING | `CANCEL_ACCEPTED_BY_ATHLETE` / either ATH | unilateral, not external/mutual | RESULT_RECORDED | `AcceptedChallengeAbandoned`, `ResultRecorded(FORFEIT)` | loser=canceling actor; provisional status/cooldown; cancel Booking | — | no |
| CH-12 | BOOKED | `CANCEL_BOOKED_BY_ATHLETE` / either ATH | unilateral | RESULT_RECORDED | `BookedChallengeCancelledByAthlete`, `ResultRecorded(FORFEIT)` | cancel Booking/Session; notify Coach; Appeal 48h | — | no |
| CH-13 | BOOKED | `SESSION_STARTED` / SYSTEM from Coach-confirmed actual start | scheduled-window stake snapshot exists; no blocking hold | IN_SESSION | `ChallengeSessionStarted` | bind actual start to pre-frozen roles/stakes/config; never recompute snapshot | Coach Start/first Attendance | no |
| CH-14 | IN_SESSION | `SESSION_ENDED` / SYSTEM | physical Session ENDED | RESULT_PENDING | `ChallengeAwaitingResult` | Coach action; reminders/escalations | 2h/12h/24h reminders only | no |
| CH-15 | RESULT_PENDING | `RECORD_RESULT` / COACH | authorized non-participant Coach; payload valid | RESULT_RECORDED | `ResultRecorded` | provisional status; Cooldown if loss; Appeal 48h; status lock | 48h appeal | no |
| CH-16 | RESULT_RECORDED | `SUBMIT_APPEAL` / eligible ATH | within 48h; no prior appeal history | UNDER_APPEAL | `AppealSubmitted` | Result→UNDER_APPEAL; freeze affected status processes | 72h Central SLA | no |
| CH-17 | RESULT_RECORDED | `FINALIZE_RESULT` / SYSTEM | appeal window expired or every eligible actor waived/withdrew | COMPLETED | `ResultFinalized`, `ChallengeCompleted` | release participant obligations; make status tenure non-provisional; unlock/activate queue | 48h or waiver | yes |
| CH-18 | UNDER_APPEAL | `APPEAL_UPHELD` / SYSTEM from decision | Central decision UPHOLD | COMPLETED | `AppealUpheld`, `ChallengeCompleted` | release participant obligations; finalize provisional transition; unlock queue | decision | yes |
| CH-19 | UNDER_APPEAL | `APPEAL_REVERSED/ANNULLED` / SYSTEM | Central decision | COMPLETED | `ResultReversed` or `ResultAnnulled` | release participant obligations; compensate status/cooldown; rebuild queue; terminal effective outcome | decision | yes |
| CH-20 | UNDER_APPEAL | `APPEAL_REPEAT` / SYSTEM | Central decision REPEAT | ACCEPTED_UNSCHEDULED | `RepeatSessionOrdered` | rollback pre-result status/cooldown; cycle_no+1; new scheduling deadline; old Result terminal REPEAT_ORDERED | decision | no |
| CH-21 | ACCEPTED_UNSCHEDULED/BOOKING_PENDING/BOOKED | `RESCHEDULE_EXTERNAL_OR_MUTUAL` / valid actors | reason external/mutual; Booking if any cancelled | ACCEPTED_UNSCHEDULED | `ChallengeRescheduled` | mutual count+1 no fault; external no user count; new suggestions/deadline adjustment | — | no |
| CH-22 | ACCEPTED_UNSCHEDULED/BOOKING_PENDING | `RESCHEDULE_BY_ATHLETE` / ATH | Booking not confirmed; count <2 | ACCEPTED_UNSCHEDULED | `ChallengeRescheduledByAthlete` | increment user counter; store initiator/reason; cancel pending Booking request | — | no |
| CH-23 | ACCEPTED_UNSCHEDULED/BOOKING_PENDING | `RESCHEDULE_AFTER_LIMIT` / culpable ATH | user count >=2 and new culpable attempt | RESULT_RECORDED | `RescheduleLimitForfeit`, `ResultRecorded(FORFEIT)` | provisional status/cooldown/Appeal | — | no |
| CH-24 | ACCEPTED_UNSCHEDULED | `EXTEND_SCHEDULING` / SYSTEM | no suitable Slot; expansion/group offered; extension_count=0 | ACCEPTED_UNSCHEDULED | `ChallengeSchedulingExtended` | deadline +7d; extension_count=1 | day 14 | no |
| CH-25 | ACCEPTED_UNSCHEDULED/BOOKING_PENDING | `EXPIRE_NO_CAPACITY` / SYSTEM | deadline after extension; external no availability | CANCELLED_NO_FAULT | `ChallengeCancelledNoCapacity` | release participant obligations/slot/queue; no loss/cooldown | day 21 adjusted holds | yes |
| CH-26 | pre-start active states | `CANCEL_NO_FAULT` / CENTRAL/SYSTEM | Safety decision, consent revocation, removal policy, title invalidation, external impossibility | CANCELLED_NO_FAULT | `ChallengeCancelledNoFault` | release participant obligations; start B-26 when physical retention is allowed, otherwise cancel Booking; no status/cooldown | — | yes |
| CH-27 | — | `CREATE_FROM_CONFIRMED_TRAINING` / SYSTEM | Booking conversion B-19; pair/Competition eligibility; one live relation; obligation rows claimed | BOOKED | `ChallengeCreatedFromConfirmedTraining`, `ChallengeBooked` | link existing Booking/Session; accepted obligation begins at conversion commit; stakes frozen only when Session window opens | scheduled start | no |
| CH-28 | RESULT_PENDING | `ORDER_MISSING_RESULT_REPEAT` / SYSTEM from Central case | MissingResultReview decided repeat; no Result exists; evidence disputed/insufficient | ACCEPTED_UNSCHEDULED | `MissingResultRepeatOrdered` | preserve original Session as ended without Result; cycle_no+1; no status/cooldown; new scheduling deadline | review decision | no |
| CH-29 | AWAITING_RESPONSE | `CLOSE_AFTER_PAIR_SOCIAL_END` / SYSTEM | response OPTIONAL; source Match ended/Block effective; not accepted | CANCELLED_NO_FAULT | `ChallengeClosedByPairSocialEnd` | decrement unanswered; close social service card; no pair quiet/loss; status paths excluded | social event | yes |
| CH-30 | AWAITING_RESPONSE | `ACCEPT_GENESIS_PARTY` / one candidate | response MUTUAL_GENESIS; eligible; exact ruleset shown/acknowledged; other candidate not yet accepted | AWAITING_RESPONSE | `GenesisChallengePartyAccepted` | record immutable party acceptance; keep 48h deadline | 48h | no |
| CH-31 | AWAITING_RESPONSE | `DECLINE_GENESIS` / either candidate | response MUTUAL_GENESIS; not mutually accepted | DECLINED | `GenesisChallengeDeclined` | no loss/cooldown; Q-14 for actor and Q-13 for counterpart; release Competition pairing | — | yes no-fault |
| CH-32 | AWAITING_RESPONSE | `EXPIRE_GENESIS_RESPONSE` / SYSTEM | response MUTUAL_GENESIS; 48h reached without both acceptances | EXPIRED_NO_FAULT | `GenesisChallengeResponseExpired` | close unanswered entries; return any accepted/non-failing counterpart with original FIFO key; release Competition pairing | 48h; reminders +12h/+24h | yes no-fault |

Status-changing Forfeit before physical Session uses an immutable `CompetitiveContextSnapshot` at the moment obligation is breached. It is not disguised as attended Session.

## 14. ProcessHold

States: `ACTIVE`, `RELEASED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| H-01 | — | `PLACE_HOLD` / CENTRAL or SYSTEM policy | scoped reason; no duplicate active hold | ACTIVE | `ProcessHeld` | block disallowed commands; record start; optionally cancel Booking for Safety | case SLA, no auto release | no |
| H-02 | ACTIVE | `RELEASE_HOLD` / CENTRAL or SYSTEM on cause resolution | matching authority/reason | RELEASED | `ProcessHoldReleased` | extend pausable deadlines by duration; recompute eligibility/queue | — | yes |

`COMMUNITY_PAUSE`: confirmed Session command path остаётся разрешённым. `SAFETY`: связанная Session/Booking блокируется. `STATUS_REVIEW`: новые status-bearing actions запрещены.

## 15. Result

States: `RECORDED`, `UNDER_APPEAL`, `FINAL`, `REVERSED`, `ANNULLED`, `REPEAT_ORDERED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| R-01 | — | `RECORD_RESULT` / authorized COACH or SYSTEM for explicit administrative Forfeit | valid Session/context; one Result; required fields | RECORDED | `ResultRecorded` | provisional status/cooldown; Appeal deadline; locks | 48h | no |
| R-02 | RECORDED | `EDIT_METADATA` / recording COACH | within 24h; no winner/outcome change | RECORDED | `ResultMetadataRevised` | projection refresh; full revision history | 24h | no |
| R-03 | RECORDED | `SUBMIT_APPEAL` / eligible ATH | within window; no waiver/history | UNDER_APPEAL | `ResultPutUnderAppeal` | Appeal created; keep lock | Central SLA | no |
| R-04 | RECORDED | `FINALIZE` / SYSTEM | window expired or all eligible waivers/withdrawals | FINAL | `ResultFinalized` | tenure final; unlock; queue recompute | 48h/early waiver | yes |
| R-05 | UNDER_APPEAL | `UPHOLD` / CENTRAL through Appeal | reason/decision complete | FINAL | `ResultUpheld` | tenure final; unlock | — | yes |
| R-06 | UNDER_APPEAL | `REVERSE_WINNER` / CENTRAL | corrected decisive outcome valid | REVERSED | `ResultReversed` | compensate old transition/cooldown; apply corrected projection; unlock | — | yes |
| R-07 | UNDER_APPEAL | `ANNUL` / CENTRAL | decision reason | ANNULLED | `ResultAnnulled` | restore pre-result status; remove cooldown/loss stats; unlock | — | yes |
| R-08 | UNDER_APPEAL | `ORDER_REPEAT` / CENTRAL | repeat appropriate | REPEAT_ORDERED | `RepeatSessionOrdered` | restore pre-result; remove cooldown; Challenge new cycle | — | yes |

DRAW/NO_CONTEST переходят тем же lifecycle, но не создают status transition или Cooldown.

## 16. Appeal

States: `SUBMITTED`, `UNDER_REVIEW`, `WITHDRAWN`, `DECIDED_UPHELD`, `DECIDED_REVERSED`, `DECIDED_ANNULLED`, `DECIDED_REPEAT`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| A-01 | — | `SUBMIT_APPEAL` / eligible ATH | loser for decisive result; either for DRAW/NO_CONTEST; ≤48h; no waiver/prior filing | SUBMITTED | `AppealSubmitted` | responses requested from peer/Coach for 24h | 24h response; 72h SLA | no |
| A-02 | SUBMITTED | `ASSIGN_REVIEWER` / CENTRAL | reviewer no conflict | UNDER_REVIEW | `AppealReviewStarted` | SLA visible | 72h from submit | no |
| A-03 | SUBMITTED/UNDER_REVIEW | `ADD_RESPONSE` / opponent or COACH | review open | originating state unchanged | `AppealResponseAdded` | evidence append; never blocks review | 24h target | no |
| A-04 | SUBMITTED/UNDER_REVIEW | `WITHDRAW_APPEAL` / appellant | no decision | WITHDRAWN | `AppealWithdrawn` | cannot resubmit; Result finalizes only when every eligible appellant has waived/withdrawn or window expired | — | yes |
| A-05 | UNDER_REVIEW | `EXTEND_SLA` / CENTRAL | reason + new due_at | UNDER_REVIEW | `AppealSlaExtended` | notify parties; lock retained | new due_at reminder | no |
| A-06 | UNDER_REVIEW | `DECIDE_UPHOLD` / CENTRAL | complete reason | DECIDED_UPHELD | `AppealDecidedUpheld` | Result FINAL | — | yes |
| A-07 | UNDER_REVIEW | `DECIDE_REVERSE` / CENTRAL | corrected winner/outcome supplied | DECIDED_REVERSED | `AppealDecidedReversed` | Result REVERSED + projection compensation | — | yes |
| A-08 | UNDER_REVIEW | `DECIDE_ANNUL` / CENTRAL | reason | DECIDED_ANNULLED | `AppealDecidedAnnulled` | Result ANNULLED + rollback | — | yes |
| A-09 | UNDER_REVIEW | `DECIDE_REPEAT` / CENTRAL | reason | DECIDED_REPEAT | `AppealDecidedRepeat` | Result REPEAT_ORDERED; Challenge reschedules | — | yes |

## 17. PairCooldown

States: `ACTIVE`, `EXPIRED`, `REMOVED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| CD-01 | — | `CREATE_FROM_LOSS` / SYSTEM | decisive effective loss; not DRAW/NO_CONTEST | ACTIVE | `PairCooldownStarted` | pair Official eligibility denied until end | 15d configurable | no |
| CD-02 | ACTIVE | `EXPIRE` / SYSTEM/query-time projection | ends_at <= now | EXPIRED | `PairCooldownExpired` | eligibility restored | ends_at | yes |
| CD-03 | ACTIVE | `REMOVE_BY_DECISION` / SYSTEM | Result annulled/repeat/reversal makes loss ineffective | REMOVED | `PairCooldownRemoved` | eligibility restored immediately | decision | yes |

## 18. Status projection transitions

Здесь state — пара позиций Competition. Actor обычно `SYSTEM`, реагирующий на effective domain event; Central не меняет поле напрямую.

| ID | Before | Trigger / actor | Guards | After | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| ST-01 | C=∅, T=∅ | founding normal win / SYSTEM | Result snapshot GENESIS; final/provisional apply | C=winner, T=loser | `GenesisStatusApplied` | provisional tenures; queue closed | Result lifecycle | no |
| ST-02 | C=∅, T=∅ | founding FORFEIT/NO_SHOW / SYSTEM | valid context | C=winner, T=∅ | `GenesisStatusAppliedWithVacancy` | open Contender candidates | Result lifecycle | no |
| ST-03 | C=∅, T=∅ | single founder timer / SYSTEM | one valid candidate 3d | C=candidate, T=∅ | `GenesisWithoutOpponent` | tenure non-loss; open vacancy | 3d | no |
| ST-04 | C=x, T=∅ | contender genesis/single succession / SYSTEM | decisive Result RECORDED or valid 3d single | C=x, T=winner/candidate | `ContenderAssigned` | Result path provisional until final; single succession final immediately | Result/3d | no |
| ST-05 | C=x, T=y | Ordinary z defeats T=y / SYSTEM | Session snapshot CONTENDER; effective decisive win | C=x, T=z | `ContenderTransferred` | y→Ordinary; queue migration/reconfirmation after Appeal | Result lifecycle | no |
| ST-06 | C=x, T=y | T defeats Ordinary / SYSTEM | CONTENDER snapshot | unchanged | `ContenderDefended` | history/result only | Result lifecycle | no |
| ST-07 | C=x, T=y | T defeats C in TITLE / SYSTEM | TITLE snapshot | C=y, T=x | `TitleTransferred` | swap tenures; queue migrates after Appeal | Result lifecycle | no |
| ST-08 | C=x, T=y | C defeats T / DRAW / NO_CONTEST | TITLE snapshot | unchanged | `TitleDefended` or no-change event | history only; no cooldown on draw/no-contest | Result lifecycle | no |
| ST-09 | C=x, T=y | Champion voluntary/admin/age exit without active TITLE / SYSTEM | confirmed exit; waiver/review completed | C=y, T=∅ | `ChampionSuccessionApplied` | open Contender candidates | immediate | no |
| ST-10 | C=x, T=y | Contender voluntary/admin/age exit without obligation / SYSTEM | exit final | C=x, T=∅ | `ContenderVacated` | queue→candidate pool | immediate | no |
| ST-11 | any | result reversed / SYSTEM | lock Competition; pre-snapshot matches lineage | corrected projection | `StatusTransitionCompensated`, corrected event | tenure compensation; cooldown/queue rebuild | Appeal decision | no |
| ST-12 | any provisional | result annul/repeat / SYSTEM | source Result owns status lock | exact pre-result snapshot | `StatusTransitionRolledBack` | close provisional tenures; restore prior; remove cooldown | Appeal decision | no |
| ST-13 | any provisional | result final/waiver / SYSTEM | source Result matches lock | same positions, non-provisional | `StatusTransitionFinalized` | unlock participants/status slot; activate FIFO | 48h/waiver | no |
| ST-14 | C=x, T=∅ | Champion voluntary/admin/age exit / SYSTEM | confirmed exit; no accepted obligation or governed exception | C=∅, T=∅ | `ChampionVacated` | execute C-12; no Result/loss/Cooldown | immediate | no |

`C` = Champion, `T` = Contender. Ordinary имеет отсутствие tenure, а не отдельную строку. Для Forfeit/NO_SHOW winner определяется контекстом и использует те же ST-05/ST-07 правила.

## 19. ModerationCase и enforcement appeal

Case states: `SUBMITTED`, `TRIAGED`, `UNDER_REVIEW`, `DECIDED`, `CLOSED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| MC-01 | — | `REPORT` / ATH/COACH/ADMIN | reason + scope; reporter != subject | SUBMITTED | `ModerationCaseSubmitted` | reporter identity hidden; account otherwise active | triage SLA | no |
| MC-02 | — | `REPORT_SAFETY_AND_CANCEL` / ATH/COACH/ADMIN | linked Challenge/Session | SUBMITTED | `SafetyCaseSubmitted` | cancel Booking no-fault; Challenge SAFETY hold; deadline pause | initial 24h | no |
| MC-03 | SUBMITTED | `TRIAGE` / CENTRAL | reviewer not accused; severity/scope set | TRIAGED | `CaseTriaged` | scoped temporary measures; serious restriction if threshold | Safety final 48h | no |
| MC-04 | TRIAGED | `START_REVIEW` / CENTRAL | assigned reviewer valid | UNDER_REVIEW | `CaseReviewStarted` | collect evidence; no public mark | final due | no |
| MC-05 | UNDER_REVIEW | `DECIDE_CASE` / CENTRAL | reason; remedy explicit | DECIDED | `CaseDecided` | release/replace Venue/Coach, reschedule, no-fault cancel, or enforcement Forfeit | — | no |
| MC-06 | DECIDED | `APPLY_AND_CLOSE` / SYSTEM | all decision commands committed | CLOSED | `CaseClosed` | release holds; notify permitted parties | immediate | yes |

Serious access `EnforcementAppeal`: `SUBMITTED → UNDER_REVIEW → DECIDED_UPHELD/DECIDED_REVOKED/DECIDED_MODIFIED`; submitter = restricted User within 7d, reviewer = different Central employee, no auto stay of restriction. Все decision states terminal.

## 20. Voluntary status release and Membership exit

Это saga с двухшаговым пользовательским подтверждением, а не отдельный mutable status.

| Step | Actor | Guards | Event | Side effects / terminal outcome |
|---|---|---|---|---|
| Status-only preview | ATH | active Membership and Champion/Contender; no accepted obligation | `StatusReleasePreviewed` | UI показывает Succession/vacancy; no loss/Cooldown; Membership remains ACTIVE |
| Status-only confirm | same ATH | nonce valid; status version unchanged; still no accepted obligation | `VoluntaryStatusReleased` | apply ST-09/ST-10; Athlete becomes Ordinary; no Result/waiver/medical evidence; saga terminal |
| Membership-exit preview | ATH | active Membership/status | `ResignationPreviewed` | UI перечисляет конкретный Forfeit/Succession и waiver |
| Membership-exit confirm | same ATH | nonce valid, preview version/current obligations unchanged | `VoluntaryResignationConfirmed` | если accepted obligation — administrative Forfeit; затем Membership LEFT и освобождение любой позиции, которую Result мог временно назначить уходящему; иначе ST-09/ST-10; waiver immutable; saga terminal |
| Abort either preview | ATH/SYSTEM | before confirm / nonce TTL | `ResignationAborted` | no domain change; terminal preview |

Discovery pause and personal/injury reason never pause a status clock or accepted obligation. Central no-fault remains a separate audited Case path, not a self-declared status freeze.

## 21. Timer ownership summary

| Timer | Owner state | On expiry |
|---|---|---|
| Like 30d | Like ACTIVE | L-05 |
| Match inactivity 30d | Match ACTIVE | MT-02 |
| Slot selection 1h | Booking SELECTING | B-05 |
| Host confirmation | Booking HOST_CONFIRMATION_PENDING | B-09 at min-notice boundary |
| Mandatory response 72h | Challenge AWAITING_RESPONSE | CH-07; reminder at 48h |
| Accepted scheduling 14d/+7d | Challenge accepted states | CH-24 then CH-25 |
| Queue reconfirm 24h | Queue RECONFIRMATION_REQUIRED | Q-07 |
| Genesis single 3d | Competition open phase | C-03/C-08 |
| No-show/operational grace 15m | Session READY_FOR_COACH/IN_PROGRESS | permits Coach Start/replacement/attendance or confirmed external-failure path; no automatic Result |
| Result reminder 2h / Admin 12h / Central 24h | Challenge RESULT_PENDING | at 24h create MR-01 exactly once; earlier timers notify only |
| Appeal window 48h | Result RECORDED | R-04 |
| Appeal response 24h | Appeal open | reminder/close response target; review continues |
| Appeal SLA 72h | Appeal UNDER_REVIEW | escalation; no auto-decision |
| Safety 24/48h | ModerationCase | escalation; no auto merits decision |
| Pair cooldown 15d | Cooldown ACTIVE | CD-02 |

Каждый timer command содержит ожидаемые state/version/deadline. Поздний worker не может применить timeout после ручного перехода.

## 22. User account

States: `ACTIVE`, `RESTRICTED`, `CLOSED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| U-01 | — | `ACTIVATE_ACCOUNT` / SYSTEM after onboarding | phone verified; age 14+ | ACTIVE | `UserAccountActivated` | Social capabilities enabled | — | no |
| U-02 | ACTIVE | `APPLY_ACCOUNT_RESTRICTION` / CENTRAL | final/temporary serious enforcement; reason/category | RESTRICTED | `AccountRestrictionApplied` | deny commands by enforcement scope; status hold, not transfer | enforcement end/review | no |
| U-03 | RESTRICTED | `REVOKE_RESTRICTION` / CENTRAL | case/appeal decision | ACTIVE | `AccountRestrictionRevoked` | release holds; recompute eligibility | — | no |
| U-04 | ACTIVE/RESTRICTED | `CLOSE_ACCOUNT` / CENTRAL through approved closure workflow | accepted obligations/status resignation resolved; retention policy recorded | CLOSED | `UserAccountClosed` | revoke sessions/tokens; preserve/minimize immutable history | — | yes |

Account closure follows the OQ-207 policy: 30-day recovery, then public pseudonymization with immutable competition/audit history preserved. Raw `DELETE User` is prohibited.

### 22.1. Account closure request

States: `REQUESTED`, `CANCELLED`, `EXECUTED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| ACR-01 | — | `REQUEST_ACCOUNT_CLOSURE` / OWN User | User not CLOSED; no other live request | REQUESTED | `AccountClosureRequested` | record policy version and recovery_until=+30d; request or reuse one live self-export when selected | 30d recovery | no |
| ACR-02 | REQUESTED | `CANCEL_ACCOUNT_CLOSURE` / OWN User | strictly before recovery_until | CANCELLED | `AccountClosureCancelled` | retain any independently prepared export until its own retention deadline | — | yes |
| ACR-03 | REQUESTED | `CLOSE_ACCOUNT` / CENTRAL | recovery elapsed; no accepted obligation, held status, active Session/Membership/role/FIFO entry; reason required | EXECUTED | `AccountClosureExecuted` | apply U-04 atomically; revoke current verification/session projection; preserve minimized lineage | — | yes |

### 22.2. Account data export

States: `REQUESTED`, `READY`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| ADE-01 | — | `REQUEST_ACCOUNT_EXPORT` / OWN User | User not CLOSED; no live export | REQUESTED | `AccountDataExportRequested` | enqueue asynchronous preparation; closure flow reuses an existing live export | worker | no |
| ADE-02 | REQUESTED | `PREPARE_ACCOUNT_EXPORT` / SYSTEM | exact state/version | READY | `AccountDataExportPrepared` | store private JSON payload and SHA-256; schedule expiry at ready_at+48h | 48h | no |
| ADE-03 | READY | `EXPIRE_ACCOUNT_EXPORT` / SYSTEM | expires_at reached; exact state/version | EXPIRED | `AccountDataExportExpired` | delete payload; retain checksum, policy version and audit/event lineage | — | yes |

## 23. Venue and Community

### 23.1. Venue

States: `PENDING_VERIFICATION`, `ACTIVE`, `PAUSED`, `CLOSED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| VE-01 | — | `REGISTER_VENUE` / CENTRAL | required legal/contact/location data | PENDING_VERIFICATION | `VenueRegistrationStarted` | verification task | verification SLA | no |
| VE-02 | PENDING_VERIFICATION | `VERIFY_VENUE` / CENTRAL | evidence valid | ACTIVE | `VenueVerified` | Community may be created; Slots allowed | — | no |
| VE-03 | PENDING_VERIFICATION | `REJECT_VENUE` / CENTRAL | reason | CLOSED | `VenueVerificationRejected` | no operational capabilities | — | yes for application |
| VE-04 | ACTIVE | `PAUSE_VENUE` / CENTRAL | operational/safety reason | PAUSED | `VenuePaused` | no new Slots/Booking; affected bookings reschedule policy | — | no |
| VE-05 | PAUSED | `REACTIVATE_VENUE` / CENTRAL | cause resolved | ACTIVE | `VenueReactivated` | Slot publication resumes | — | no |
| VE-06 | ACTIVE/PAUSED | `CLOSE_VENUE` / CENTRAL | closure plan | CLOSED | `VenueClosed` | no new actions; linked Community closure/migration workflow | — | yes |

### 23.2. Community

States: `ACTIVE`, `PAUSED`, `CLOSING`, `CLOSED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| CO-01 | — | `CREATE_COMMUNITY` / CENTRAL | verified active Venue; MVP one Community per Venue | ACTIVE | `CommunityCreated` | create YOUTH/ADULT Competition | — | no |
| CO-02 | ACTIVE | `PAUSE_COMMUNITY` / CENTRAL | reason | PAUSED | `CommunityPaused` | CA-01 for each Competition; holds/deadlines policy | — | no |
| CO-03 | PAUSED | `REACTIVATE_COMMUNITY` / CENTRAL | cause resolved | ACTIVE | `CommunityReactivated` | CA-02; extend pausable deadlines | — | no |
| CO-04 | ACTIVE/PAUSED | `SCHEDULE_COMMUNITY_CLOSURE` / CENTRAL | versioned Closure Plan; future effective_at unless emergency; confirmed Session dispositions recorded | CLOSING | `CommunityClosureScheduled` | execute CA-03 for each Competition; notify members; no-fault close pending/unconfirmed processes; retain only plan-approved safe confirmed Sessions | effective_at/plan | no |
| CO-05 | CLOSING | `FINALIZE_COMMUNITY_CLOSURE` / CENTRAL or SYSTEM | effective_at reached; retained Session Result/Appeal paths resolved or explicitly transferred to archival service path | CLOSED | `CommunityClosed` | C-11 Competitions; M-11 Memberships; close status tenures without W/L/Succession; preserve history | plan completion | yes |

## 24. Block and pair suppression

### 24.1. Block

States: `ACTIVE`, `REVOKED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| BL-01 | — | `BLOCK_USER` / blocker | distinct users; no same directed active Block | ACTIVE | `BlockCreated` | close personal contact; preserve obligations | — | no |
| BL-02 | ACTIVE | `UNBLOCK_USER` / same blocker | owns directed Block | REVOKED | `BlockRevoked` | does not restore old Match automatically | — | yes |

### 24.2. DiscoveryPairSuppression

States: `ACTIVE`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| DS-01 | — | `SUPPRESS_PAIR` / SYSTEM from SKIP/UNMATCH | normalized pair; 15d policy | ACTIVE | `PairSuppressionStarted` | omit pair from Discovery | 15d | no |
| DS-02 | ACTIVE | `EXPIRE_SUPPRESSION` / SYSTEM | until_at <= now | EXPIRED | `PairSuppressionExpired` | pair may re-enter Discovery if otherwise eligible | until_at | yes |

## 25. Chat projection

States: `OPEN`, `ARCHIVED`, `READ_ONLY`, `CLOSED`. Это deterministic projection; прямой `setState` запрещён.

| ID | From | Trigger / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| CT-01 | — | Match/Challenge created / SYSTEM | participants valid | OPEN | `ChatOpened` | messaging/actions enabled by scope | — | no |
| CT-02 | OPEN | Match archived / SYSTEM | personal scope, inactivity | ARCHIVED | `ChatArchived` | hide from active; history readable | 30d inactivity | no |
| CT-03 | ARCHIVED | message / participant | no Block | OPEN | `ChatReopened` | return to active | — | no |
| CT-04 | OPEN/ARCHIVED | Block/Unmatch / SYSTEM | Challenge service scope with accepted obligation or surviving status FIFO/mandatory process | READ_ONLY | `ChatRestrictedToServiceActions` | free text off; only structured service actions on | until unblock/terminal | no |
| CT-05 | READ_ONLY | Block revoked / SYSTEM | obligation active; no other Block | OPEN | `ChatServiceRestrictionReleased` | service text policy restored | — | no |
| CT-06 | OPEN/ARCHIVED/READ_ONLY | Unmatch/terminal process / SYSTEM | personal match ended or service process terminal | CLOSED | `ChatClosed` | no new messages/actions; history retained | — | yes |

### 25.1. ChatMessage

States: `ACTIVE`, `HIDDEN_BY_MODERATION`. User-local deletion is a visibility projection, not a message state.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| MSG-01 | — | `SEND_MESSAGE` / participant or SYSTEM | Chat permits payload type | ACTIVE | `ChatMessageSent` | append initial revision; deliver projection | — | no |
| MSG-02 | ACTIVE | `EDIT_MESSAGE` / sender | PERSONAL_TEXT; created <15m; not reported; Chat permits access | ACTIVE | `ChatMessageEdited` | append revision; visible edited marker; no overwrite | 15m | no |
| MSG-03 | ACTIVE/HIDDEN_BY_MODERATION | `DELETE_FOR_SELF` / participant | message belongs to participant Chat | same | `ChatMessageHiddenForUser` | upsert own visibility row only; other copies/audit unchanged | — | no |
| MSG-04 | ACTIVE | `REPORT_MESSAGE` / participant | open report allowed; reporter != sender | ACTIVE | `ChatMessageReported` | freeze edit; copy original/revisions to Case evidence; hide reporter identity | — | no |
| MSG-05 | ACTIVE | `HIDE_MESSAGE_FOR_ALL` / CENTRAL | decided Case; reason; reviewer no conflict | HIDDEN_BY_MODERATION | `ChatMessageHiddenByModeration` | remove from participant projections; retain originals in Case/audit | — | yes logical |

Retention cleanup is a storage lifecycle, not a user-visible ChatMessage state transition. After
the effective 12-month personal or 3-year service inactivity period, an uncaptured revision payload
is removed in a bounded audited batch. Its SHA-256, deletion time and policy version remain; a
message/report captured by a Case is excluded and canonical business/audit history is untouched.

## 26. StatusTenure lifecycle

Conceptual states: `PROVISIONAL_OPEN`, `FINAL_OPEN`, `CLOSED`. Они выводятся из `provisional/ended_at`.

| ID | From | Trigger / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| TN-01 | — | provisional status Result / SYSTEM | valid transition | PROVISIONAL_OPEN | `StatusTenureOpenedProvisional` | current status projection points to tenure | Appeal lifecycle | no |
| TN-02 | PROVISIONAL_OPEN | Result final/upheld / SYSTEM | matching source Result | FINAL_OPEN | `StatusTenureFinalized` | provisional label removed | 48h/decision | no |
| TN-03 | PROVISIONAL_OPEN | reverse/annul/repeat / SYSTEM | matching compensation | CLOSED | `StatusTenureCompensated` | ended_by compensation; replacement/restored tenure may open | decision | yes |
| TN-04 | — | non-Result GENESIS/succession/age/admin event / SYSTEM | deterministic status event | FINAL_OPEN | `StatusTenureOpenedFinal` | projection update | — | no |
| TN-05 | FINAL_OPEN | later valid status/vacancy/Community closure event / SYSTEM | event lineage and Competition lock | CLOSED | `StatusTenureClosed` | next tenure/projection applied atomically, or `COMMUNITY_CLOSED` with no successor/W/L | — | yes |

## 27. Result governance

### 27.1. TechnicalCorrectionRequest

States: `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `WITHDRAWN`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| TC-01 | — | `REQUEST_TECHNICAL_CORRECTION` / COACH or CENTRAL | Result exists; proposed old/new + reason/evidence | SUBMITTED | `TechnicalCorrectionRequested` | Central inbox; Result unchanged | review SLA policy | no |
| TC-02 | SUBMITTED | `START_REVIEW` / CENTRAL | reviewer no conflict | UNDER_REVIEW | `TechnicalCorrectionReviewStarted` | evidence collection | review SLA | no |
| TC-03 | SUBMITTED/UNDER_REVIEW | `WITHDRAW` / requester | no decision | WITHDRAWN | `TechnicalCorrectionWithdrawn` | Result unchanged | — | yes |
| TC-04 | UNDER_REVIEW | `APPROVE` / CENTRAL | reason; corrected outcome valid | APPROVED | `TechnicalCorrectionApproved` | governed ResultDecision + status compensation/reapply | — | yes |
| TC-05 | UNDER_REVIEW | `REJECT` / CENTRAL | reason | REJECTED | `TechnicalCorrectionRejected` | Result unchanged | — | yes |

### 27.2. MissingResultReview

States: `OPEN`, `UNDER_REVIEW`, `REVIEWER_ASSIGNED`, `RESOLVED`, `REPEAT_ORDERED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| MR-01 | — | `OPEN_MISSING_RESULT_REVIEW` / SYSTEM | Official Challenge RESULT_PENDING for 24h; no Result | OPEN | `MissingResultReviewOpened` | notify Central; open separate Coach nonresponse operational follow-up | 24h after Session end | no |
| MR-02 | OPEN | `START_MISSING_RESULT_REVIEW` / CENTRAL | independent reviewer assigned | UNDER_REVIEW | `MissingResultReviewStarted` | request separate Athlete statements and Venue attendance confirmation | visible review clock | no |
| MR-03 | UNDER_REVIEW | `ASSIGN_RESULT_REVIEWER_COACH` / CENTRAL | Athlete statements consistent; Venue confirms attendance; authorized non-conflicted Coach available | REVIEWER_ASSIGNED | `MissingResultReviewerCoachAssigned` | session-scoped review grant; allowed outcome equals consistent evidence | reviewer action | no |
| MR-04 | REVIEWER_ASSIGNED | `CONFIRM_REVIEWED_RESULT` / assigned COACH | evidence and allowed outcome match; Challenge still RESULT_PENDING; no Result | RESOLVED | `MissingResultReviewResolved` | atomically execute CH-15; Central is not Result author | — | yes |
| MR-05 | UNDER_REVIEW | `ORDER_REPEAT` / CENTRAL | statements conflict or evidence insufficient; repeat objectively possible | REPEAT_ORDERED | `MissingResultRepeatOrdered` | execute CH-28; no loss/status/cooldown | — | yes |
| MR-06 | UNDER_REVIEW | `ASSIGN_NO_CONTEST_REVIEWER` / CENTRAL | statements conflict/insufficient; repeat objectively impossible; reason audited | REVIEWER_ASSIGNED | `MissingResultReviewerCoachAssigned` | session-scoped Coach may record only NO_CONTEST | reviewer action | no |
| MR-07 | OPEN/UNDER_REVIEW/REVIEWER_ASSIGNED | `CLOSE_AFTER_LATE_COACH_RESULT` / SYSTEM | original Coach commits valid Result before case resolution | RESOLVED | `MissingResultReviewResolved` | preserve operational nonresponse review; close sporting case | Result event | yes |

### 27.3. IntegrityCase for Final Result

States: `OPEN`, `UNDER_REVIEW`, `DECIDED_UPHELD`, `DECIDED_CORRECTED`, `DECIDED_ANNULLED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| IG-01 | — | `OPEN_INTEGRITY_CASE` / CENTRAL | source Result FINAL; category FRAUD/SYSTEM_ERROR/IDENTITY_ERROR; concrete evidence reference/reason; no duplicate open case | OPEN | `IntegrityCaseOpened` | notify affected parties neutrally; ordinary Appeal remains closed | review SLA | no |
| IG-02 | OPEN | `START_INTEGRITY_REVIEW` / CENTRAL | independent reviewer assigned; no conflict | UNDER_REVIEW | `IntegrityCaseReviewStarted` | hold affected status/queue and incompatible new actions; source/public result marked under review | visible SLA | no |
| IG-03 | UNDER_REVIEW | `UPHOLD_FINAL_RESULT` / CENTRAL | reason/evidence evaluated | DECIDED_UPHELD | `IntegrityCaseUpheld` | release holds; keep source/effective Result; remove review marker | — | yes |
| IG-04 | UNDER_REVIEW | `CORRECT_FINAL_RESULT` / CENTRAL | corrected outcome valid under frozen snapshot/ruleset; reason | DECIDED_CORRECTED | `IntegrityCaseCorrected` | append ResultDecision; compensate/reapply status and Cooldown; deterministic Competition replay; publish neutral review fact | — | yes |
| IG-05 | UNDER_REVIEW | `ANNUL_OR_ORDER_REPEAT` / CENTRAL | source cannot be upheld/corrected; repeat requires current eligibility/obligation guards | DECIDED_ANNULLED | `IntegrityCaseAnnulled` | compensate source effects; ANNUL or create governed repeat cycle; preserve source/history; release holds after replay | — | yes |

## 28. Consent and evidence

### 28.1. YouthChallengeConsent

States: `PENDING`, `GRANTED`, `DECLINED`, `REVOKED`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| YC-01 | — | `REQUEST_YOUTH_CONSENT` / SYSTEM | Youth Athlete, exact Challenge/policy | PENDING | `YouthChallengeConsentRequested` | signed one-time web link via verified e-mail or opt-in SMS; no account/document | token/deadline | no |
| YC-02 | PENDING | `GRANT_CONSENT` / guardian token holder | valid unused token; contact OTP/link verified; name/relationship declared; consent text accepted | GRANTED | `YouthChallengeConsentGranted` | this Athlete's acceptance/Booking guard satisfied; audit hash only | Challenge start | no |
| YC-03 | PENDING | `DECLINE_CONSENT` / guardian token holder | valid token | DECLINED | `YouthChallengeConsentDeclined` | Challenge no-fault close/review | — | yes |
| YC-04 | GRANTED | `REVOKE_CONSENT` / same verified consent channel | before Session start | REVOKED | `YouthChallengeConsentRevoked` | no-fault hold/cancel official context; physical Training option | — | yes |
| YC-05 | PENDING/GRANTED | `EXPIRE_CONSENT` / SYSTEM | token/deadline reached or Challenge terminal | EXPIRED | `YouthChallengeConsentExpired` | unsatisfied guard or archival close | token/challenge event | yes |

### 28.2. EvidenceAttachment

States: `PENDING_SCAN`, `AVAILABLE`, `QUARANTINED`, `REJECTED`, `DELETED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| EVI-01 | — | `SUBMIT_EVIDENCE` / eligible Case/Appeal participant | open Appeal/Safety scope; count <5; aggregate size ≤100MB; allowlisted image/audio/video; duration ≤ configured limit; not Result/PDF/archive/office | PENDING_SCAN | `EvidenceAttachmentSubmitted` | encrypted private object; no participant disclosure | scan SLA | no |
| EVI-02 | PENDING_SCAN | `ACCEPT_SCAN` / SYSTEM | malware/content/type checks pass | AVAILABLE | `EvidenceAttachmentAccepted` | submitter + Central original access; eligible for redacted disclosure | — | no |
| EVI-03 | PENDING_SCAN | `QUARANTINE_SCAN` / SYSTEM | malware/content/type check fails or uncertain | QUARANTINED | `EvidenceAttachmentQuarantined` | deny all non-Central access; Central moderation queue | moderation SLA | no |
| EVI-04 | QUARANTINED | `REJECT_ATTACHMENT` / CENTRAL | moderation confirms prohibited/invalid | REJECTED | `EvidenceAttachmentRejected` | notify submitter with safe reason; retain isolated until retention/deletion policy | retention | yes logical |
| EVI-05 | AVAILABLE/QUARANTINED/REJECTED | `DELETE_RETAINED_PAYLOAD` / SYSTEM | retention deadline/legal deletion instruction | DELETED | `EvidenceAttachmentDeleted` | remove payload/key; preserve minimal checksum/audit metadata | retention deadline | yes |

### 28.3. EvidenceDisclosure

States: `ACTIVE`, `REVOKED`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| ED-01 | — | `GRANT_EVIDENCE_DISCLOSURE` / CENTRAL | source AVAILABLE; safe/redacted derivative; recipient is opponent or assigned reviewer-Coach; need-to-know purpose | ACTIVE | `EvidenceDisclosureGranted` | short-lived signed access; exact derivative/version audit | grant expiry | no |
| ED-02 | ACTIVE | `REVOKE_EVIDENCE_DISCLOSURE` / CENTRAL | Case access no longer needed or granted in error | REVOKED | `EvidenceDisclosureRevoked` | signed access invalidated | — | yes |
| ED-03 | ACTIVE | `EXPIRE_EVIDENCE_DISCLOSURE` / SYSTEM | expires_at <= now | EXPIRED | `EvidenceDisclosureExpired` | signed access invalidated | expires_at | yes |

## 29. Enforcement and its Appeal

### 29.1. Enforcement

States: `ACTIVE`, `MODIFIED`, `REVOKED`, `EXPIRED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| EN-01 | — | `APPLY_ENFORCEMENT` / CENTRAL | decided Case, explicit scope/reason | ACTIVE | `EnforcementApplied` | permission denies/holds; no direct status transfer | optional ends_at | no |
| EN-02 | ACTIVE/MODIFIED | `MODIFY_ENFORCEMENT` / CENTRAL | new least-restrictive scope/reason | MODIFIED | `EnforcementModified` | replace effective permission scope; audit old/new | optional ends_at | no |
| EN-03 | ACTIVE/MODIFIED | `REVOKE_ENFORCEMENT` / CENTRAL | case/appeal decision | REVOKED | `EnforcementRevoked` | release associated denies/holds | — | yes |
| EN-04 | ACTIVE/MODIFIED | `EXPIRE_ENFORCEMENT` / SYSTEM | ends_at <= now | EXPIRED | `EnforcementExpired` | release associated denies/holds | ends_at | yes |

### 29.2. EnforcementAppeal

States: `SUBMITTED`, `UNDER_REVIEW`, `DECIDED_UPHELD`, `DECIDED_REVOKED`, `DECIDED_MODIFIED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| EA-01 | — | `APPEAL_ENFORCEMENT` / restricted User | within 7d; no prior appeal | SUBMITTED | `EnforcementAppealSubmitted` | restriction stays active | review SLA | no |
| EA-02 | SUBMITTED | `START_REVIEW` / CENTRAL | reviewer != original decision maker/subject | UNDER_REVIEW | `EnforcementAppealReviewStarted` | collect evidence | review SLA | no |
| EA-03 | UNDER_REVIEW | `UPHOLD` / CENTRAL | reason | DECIDED_UPHELD | `EnforcementAppealUpheld` | Enforcement unchanged | — | yes |
| EA-04 | UNDER_REVIEW | `REVOKE` / CENTRAL | reason | DECIDED_REVOKED | `EnforcementAppealRevoked` | Enforcement→REVOKED | — | yes |
| EA-05 | UNDER_REVIEW | `MODIFY` / CENTRAL | replacement scope/reason | DECIDED_MODIFIED | `EnforcementAppealModified` | Enforcement→MODIFIED | — | yes |

## 30. Immutable/internal records

`CompetitionEvent`, `AuditEvent`, `ResultMetadataRevision`, `AppealResponse` и `InboxReceipt` не имеют mutable business state: они append-only и terminal в момент создания. `OutboxMessage`/notification delivery states являются transport concerns и не могут изменять Core deadline или business outcome.

## 31. PlatformIncident

States: `DETECTED`, `CONFIRMED_ACTIVE`, `RESOLVED`, `COMPENSATED`, `REJECTED`.

| ID | From | Command / actor | Guards | To | Event | Side effects | Timeout | Terminal outcome |
|---|---|---|---|---|---|---|---|---|
| PI-01 | — | `DETECT_PLATFORM_INCIDENT` / SYSTEM | objective monitoring anomaly; exact surface/window candidate | DETECTED | `PlatformIncidentDetected` | alert Central; no business compensation yet | triage SLA | no |
| PI-02 | DETECTED | `CONFIRM_PLATFORM_INCIDENT` / CENTRAL | monitoring evidence; affected services/surfaces and start fixed; reason | CONFIRMED_ACTIVE | `PlatformIncidentConfirmed` | suppress affected pausable timeout execution while active; notify operations | resolution | no |
| PI-03 | DETECTED | `REJECT_PLATFORM_INCIDENT` / CENTRAL | evidence insufficient/not platform-wide | REJECTED | `PlatformIncidentRejected` | no deadline or outcome changes | — | yes |
| PI-04 | CONFIRMED_ACTIVE | `RESOLVE_PLATFORM_INCIDENT` / SYSTEM or CENTRAL | objective recovery; exact end fixed | RESOLVED | `PlatformIncidentResolved` | calculate exact overlaps; extend only pausable deadlines; enqueue deterministic fired-timeout review | — | no |
| PI-05 | RESOLVED | `COMPENSATE_INCIDENT_IMPACTS` / SYSTEM | all affected aggregates scanned with idempotent IncidentImpact keys | COMPENSATED | `PlatformIncidentCompensated` | already-fired timeout/Forfeit gets compensating no-fault event; source history retained; Session/Cooldown/retention unchanged | reconciliation SLA | yes |
