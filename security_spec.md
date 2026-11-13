# EvalGuard AI — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Strict Identity Ownership**: Every document in `/users/{userId}`, `/evaluationRuns/{runId}`, `/hallucinationAnalyses/{analysisId}`, `/redTeamCampaigns/{campaignId}`, and `/datasets/{datasetId}` must be owned by an authenticated, email-verified user (`request.auth.uid == ownerId` and `request.auth.token.email_verified == true`).
2. **PII Isolation**: `/users/{userId}` contains `email` and `displayName`. Read (`get`, `list`) and write (`create`, `update`, `delete`) access to `/users/{userId}` is strictly limited to `request.auth.uid == userId` (or verified `isAdmin()`). Blanket `isSignedIn()` reads are prohibited.
3. **Immutable Ownership & Temporal Integrity**: `ownerId` (or `uid`) and `createdAt` are immutable across updates, and `createdAt` must equal `request.time` on creation.
4. **Strict Key & Size Enforcement**: Every create and update operation must validate exact allowed keys (`hasAll` and `hasOnly`), enforce `isValidId` on document path IDs (`^[a-zA-Z0-9_\-]+$`, max 128 chars), and enforce `.size()` bounds on every string.
5. **Query Enforcer on Lists**: Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid` so unauthorized cross-tenant list queries are rejected at the rule level.

## 2. The "Dirty Dozen" Payloads

1. **Unverified Email Write**: Authenticated user with `email_verified == false` attempts to create an `/evaluationRuns/{runId}` document.
2. **Cross-Tenant Ownership Spoof**: User `uid_A` attempts to create `/evaluationRuns/run_1` with `ownerId: "uid_B"`.
3. **Shadow Field Injection**: User `uid_A` creates `/evaluationRuns/run_1` with an undeclared field `"isAdminOverride": true`.
4. **Path ID Poisoning**: User attempts to create `/datasets/invalid$id!@#` violating `^[a-zA-Z0-9_\-]+$`.
5. **Denial-of-Wallet String Overflow**: User attempts to set `name` to a 5,000-character string on `/evaluationRuns/run_1` (exceeding `maxLength: 160`).
6. **PII Lateral Read**: Authenticated user `uid_B` attempts `get` on `/users/uid_A`.
7. **Unfiltered Tenant List Scraping**: Authenticated user `uid_B` attempts `list` on `/evaluationRuns` without filtering `ownerId == request.auth.uid`.
8. **Timestamp Forgery on Create**: User sends a past or future client timestamp for `createdAt` instead of `request.time`.
9. **Immutable Owner Mutation on Update**: User `uid_A` attempts `update` on `/datasets/ds_1` changing `ownerId` to `"uid_B"`.
10. **Immutable Timestamp Mutation on Update**: User `uid_A` attempts `update` on `/redTeamCampaigns/rt_1` changing `createdAt`.
11. **Value Poisoning on Update**: User `uid_A` updates `name` on `/evaluationRuns/run_1` with an integer `12345` instead of a bounded string.
12. **Unauthenticated Write**: Anonymous (`request.auth == null`) request attempts `create` on `/hallucinationAnalyses/ha_1`.
