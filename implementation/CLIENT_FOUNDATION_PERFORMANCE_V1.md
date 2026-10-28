# Client Foundation & Performance v1

## Scope

This increment changes the universal Expo client only. Core Engine, API and DB semantics remain unchanged. Booking, Challenge, Result and status commands are never queued offline.

## Baseline and budgets

Baseline commit: `3bba1c57635b4c3e54351ade6e8fd275a9bffacc` (same tree as `0409b569`).

| Metric | Baseline | Acceptance |
|---|---:|---:|
| Web entry | 1,775,773 B raw / 407,684 B gzip | no more than +5% gzip |
| Web export | 31.31 s | informational |
| Initial ordinary-user reads | 16 serial stages | no more than 2 stages to useful content |
| Central/Admin reads | up to about 28 serial stages | secondary failure must stay partial |
| Main client tests | 36 | all passing |

Use `pnpm build && pnpm measure:client` to enforce the bundle regression budget.

### Measured result (2026-10-27)

| Metric | Baseline | Result |
|---|---:|---:|
| Web entry gzip | 407,684 B | 415,913 B (+2.02%) |
| Web entry raw | 1,775,773 B | 1,814,191 B |
| Web export total | 1,951,202 B | 2,026,104 B |
| Warm local Web shell p75 (10 runs) | not recorded | 100 ms |
| Warm local Web FCP p75 (10 runs) | not recorded | 56 ms |
| Warm local Web LCP p75 (10 runs) | not recorded | 96 ms |
| Warm local Web CLS p75 (10 runs) | not recorded | 0 |

The runtime figures are production exports served locally in the desktop in-app browser. They verify the probe and the warm-cache path; they are not substitutes for cold device or test-4G measurements. Browser Event Timing did not expose INP in this environment.

## Result architecture

- `/me` unlocks the interactive shell; independent projections load in parallel in the background.
- Stable session-scoped query keys provide deduplication, cancellation and exact resource invalidation.
- Operational data is fresh for 45 seconds; profile and Community data for 5 minutes.
- A failed secondary endpoint leaves the rest of the screen usable. A failed refresh may show cached reads with an explicit offline warning; commands are not replayed.
- Main IA is Home, Discovery, Chats, Community and Profile. The URL `section` parameter restores the current destination.
- Compact layouts use bottom navigation; medium and expanded layouts use a rail. Portrait is not locked.
- Chat messages use FlatList and cursor pagination; scheduling controls remain a list header.
- Light/Dark semantic tokens cover the primary shell, Discovery, Chat and public athlete profile.

## Verification matrix

Automated checks cover cold query, warm cache, slow concurrent deduplication, stale offline fallback, reconnect, partial copy fallback, deep-link parsing, breakpoints, theme contrast, internal-key suppression and cursor-page merging. Production Web timing uses `?__molokhPerf=1`; the opt-in probe records FCP, LCP, CLS, INP and load timing as `data-molokh-*` attributes without sending telemetry.

Real iOS/Android cold/warm start, frozen-frame, VoiceOver/TalkBack, 200% Dynamic Type and test-4G measurements remain device/external release gates and must not be inferred from desktop Web measurements.

Expo Atlas was attempted after the ordinary production export. Its `expo-atlas@0.4` auto-install was incompatible with the current Expo/Metro pnpm layout (`createFileMap.js` resolution); the dependency was removed and the normal export reverified. The checked-in gzip budget remains the reproducible bundle gate until Atlas is compatible.
