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
| M2 — Identity & Community | Athlete profile, verification, pilot Venue, membership and scoped roles | NEXT | Verified Adult joins one Community and cannot bypass role/scope guards |
| M3 — Discovery, Match & Chat | Transparent card ordering, Like/Match, personal chat and structured actions | PLANNED | Two Users can discover, match and coordinate without hidden reliability scoring |
| M4 — Training slice | Slot choice, mutual agreement, host confirmation, Session and Coach attendance/result path | PLANNED | One end-to-end ordinary training works on the universal client |
| M5 — Challenge & Status | Challenge eligibility, FIFO, booking, Forfeit, Champion/Contender transfer and cooldown | PLANNED | Concurrent status scenarios remain deterministic and auditable |
| M6 — Appeal & Governance | Provisional result, 48-hour Appeal, waiver, reversal/annul/repeat and Central queues | PLANNED | A disputed result changes outcome without deleting history |
| M7 — Lifecycle P0 | Youth boundary, account/community lifecycle and platform-incident compensation | PLANNED | Lifecycle P0 scenarios have no age/status/obligation leakage |
| M8 — Pilot hardening | Security, accessibility, failure recovery, backups, runbooks and Venue onboarding | PLANNED | Closed pilot can run with documented support and rollback paths |

## 3. Weekly sprint plan

| Sprint | Dates | Primary deliverable | Demonstrable exit |
|---:|---|---|---|
| 0 | Through 06 Sep | M0 + M1 platform foundation | All current infrastructure gates pass; baseline committed |
| 1 | 07–13 Sep | User, AthleteProfile, local auth adapter and capability projection | Seeded User signs in locally, edits profile and sees explicit capability denials |
| 2 | 14–20 Sep | Venue, Community, Membership, Coach/Admin grants and Central verification | Verified User joins the pilot Community; scope and role denials are tested |
| 3 | 21–27 Sep | Discovery hard gates/order, Like, Skip, Match, Block and suppression timers | Two seeded Athletes reach Match; inbound interest is visible without bypassing Like |
| 4 | 28 Sep–04 Oct | Personal Chat, structured action cards, edit/archive/report seams | Matched Athletes coordinate through Chat; clients never parse action text |
| 5 | 05–11 Oct | Slot, GroupOffering, mutual selection and Booking snapshot | Both Athletes choose one real option; no reservation exists before host confirmation |
| 6 | 12–18 Oct | Atomic host confirmation, Coach replacement, Session, attendance and Training stats | Racing bookings have one winner; Coach completes an ordinary Session end to end |
| 7 | 19–25 Oct | Challenge eligibility, response policies, FIFO and scheduling/reschedule rules | Allowed Challenge reaches confirmed Session; forbidden title paths are denied |
| 8 | 26 Oct–01 Nov | Result, provisional status, Champion/Contender transfer, Forfeit and cooldown | Status moves immediately and deterministically; affected Users are temporarily locked |
| 9 | 02–08 Nov | Appeal, waiver, reversal/annul/repeat and Central review queue | 48-hour Appeal can compensate status while preserving the original journal |
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

- Core Engine v1.0: 300 transitions, 278 registered events, 213 acceptance scenarios and zero open blocking questions.
- Workspace: TypeScript checks and Web production build pass across all packages.
- Tests: 22 non-database tests plus four additional real PostgreSQL scenarios pass.
- Database: migrations `0001`–`0005` applied locally; PostgreSQL 18 is healthy.
- Source control: M0/M1 foundation is preserved in three local commits; remote protection remains external.

## 8. Immediate next actions

1. Define the M2 Identity module boundary and first stable TypeBox contracts.
2. Add User/AthleteProfile migration with arbitrary display name and 14+ activation guard.
3. Implement the local authentication adapter without coupling Core to an SMS provider.
4. Seed one pilot Venue/Community and capability-scoped Coach/Admin/Central grants.
5. Demonstrate the Sprint 1 exit through API, minimal universal client and automated tests.
