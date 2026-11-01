# Security and code audit — 1 November 2026

Audit scope: the Molokh monorepo on `codex/client-foundation-performance-v1`, including
API, Worker, Expo client, Core, PostgreSQL persistence and migrations, CI, infrastructure
configuration, release scripts and the complete dependency graph. This is a source-code and
local-runtime audit, not an external penetration test of a deployed production environment.

## Outcome

No unresolved critical or high-severity issue was found in production runtime code or runtime
dependencies. The audit fixed the concrete findings listed below and preserved all 214 mapped
acceptance scenarios. Remaining dependency advisories are confined to build/development tooling
and are documented under Residual risks.

## Fixes applied

- Upgraded the published `node-forge` fix and removed the temporary local backport and exception.
- Upgraded exposed transitive packages and tooling pins, including Fastify, Vitest, Expo packages,
  `ajv`, `brace-expansion`, `decode-uri-component`, `fast-uri`, `ip-address`, `joi`, `minimatch`,
  `moment`, `nanoid`, `tar`, `vite` and `yaml`.
- Made production client API configuration fail closed: an explicit HTTPS
  `EXPO_PUBLIC_API_URL` is required; credentials, query strings and fragments are rejected; local
  test tokens and localhost fallbacks remain development-only.
- Derived the client operational role from DB-authoritative grants. Central and Gym Admin views
  no longer depend on local test-account metadata and no longer issue role-incompatible Gym Admin
  or Athlete Discovery reads.
- Added `Cache-Control: no-store` to `/api/v1/*` responses so authenticated and private API data is
  not retained by intermediary or browser caches.
- Disabled Android backup and blocked legacy external-storage and overlay permissions in release
  manifests. The release manifest contains no cleartext-traffic opt-in.
- Pinned GitHub Actions to immutable commit SHAs.
- Aligned Expo package versions; `expo-doctor` reports 21/21 checks passing.

## Reviewed controls

- Production configuration rejects missing secrets, insecure Web origins and non-exact release
  identifiers. CORS is allowlisted; Helmet and rate limiting are enabled.
- Refresh tokens are hashed and rotated; reuse revokes the session. Production cookies are
  `HttpOnly`, `Secure` and `SameSite=Lax`. Authorization headers, cookies and tokens are redacted
  from logs.
- Critical commands use PostgreSQL locks, expected versions and request hashes. Business mutation,
  audit, domain event, outbox and idempotency records commit in one transaction.
- Evidence upload permissions and count/size limits are rechecked in PostgreSQL. Provider access
  fails closed; protected object references and checksums are not placed in public events/outbox.
- PostgreSQL is bound to `127.0.0.1` in local compose. CI has read-only repository permissions and
  no untrusted privileged trigger.
- Repository scans found no tracked private keys or common live-token formats, no dynamic
  `eval`/`new Function`, no unsafe/raw SQL entry point, no shell execution with `shell: true`, and
  no product-source TODO/FIXME/HACK marker hiding unfinished behavior.
- TypeScript uses strict mode, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

## Verification

| Gate | Result |
|---|---|
| TypeScript, 365 non-DB tests, accessibility, builds, acceptance mapping | PASS |
| PostgreSQL integration suite | PASS — 79/79 |
| Acceptance mapping | PASS — 214/214, including P0 196/196, P1 17/17, P2 1/1 |
| Canonical specification validation | PASS — 0 errors |
| Production dependency gate | PASS — no unapproved high/critical runtime advisory |
| Production Web smoke and bundle budget | PASS — gzip delta +2.04% |
| Expo compatibility | PASS — `expo-doctor` 21/21 |
| Android debug APK | PASS — assembled, installed and loaded seeded Athlete/Central data |
| Android release manifest | PASS — backup off; no storage/overlay permissions; no cleartext opt-in |
| Rollback compatibility against `origin/main` | PASS — 79 immutable migrations |
| `git diff --check` | PASS |

The local historical `molokh` database correctly rejected a changed migration checksum. Runtime
smoke used a new isolated database instead of rewriting applied migration history.

## Residual risks and release prerequisites

- Raw `pnpm audit` reports five non-runtime tooling advisories: one high (`zod` through Expo/EAS
  CLI), two moderate (`uuid`, `ts-deepmerge`) and two low (`diff`, `deepmerge`). The production
  gate excludes only the reviewed Expo CLI `zod` path until 24 November 2026 and will fail after
  that date unless it is upgraded or reviewed again. No advisory is accepted in application
  runtime.
- Android lint itself crashes while analysing third-party `react-native-worklets` with
  `Cannot find a KaModule for the VirtualFile`. APK assembly, TypeScript, Expo Doctor and Molokh
  tests pass; this is recorded as an upstream lint/toolchain blocker rather than a clean lint pass.
- The generated local debug APK is for emulator testing only. A production artifact must be built
  through EAS or another controlled pipeline with the real release keystore and the production
  HTTPS API URL.
- Physical Android/iOS checks, iOS build, production signing, deployed canary and an external
  penetration test remain release-operations work; they cannot be proven by this Windows local
  audit.

