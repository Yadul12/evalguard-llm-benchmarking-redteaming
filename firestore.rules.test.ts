/**
 * Phase 0 TDD Security Spec Runner — Verifies all 12 "Dirty Dozen" Payloads
 * are rejected by the Firestore Security Rules logic.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  docId: string;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unverified Email Write',
    collection: 'evaluationRuns',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: false },
    docId: 'run_01',
    payload: { ownerId: 'user_a', name: 'Test Run' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Cross-Tenant Ownership Spoof',
    collection: 'evaluationRuns',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    docId: 'run_01',
    payload: { ownerId: 'user_b', name: 'Spoofed Run' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Shadow Field Injection',
    collection: 'evaluationRuns',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    docId: 'run_01',
    payload: { ownerId: 'user_a', name: 'Run', isAdminOverride: true },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Path ID Poisoning',
    collection: 'datasets',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    docId: 'bad$id!@#',
    payload: { ownerId: 'user_a', name: 'Dataset' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Denial-of-Wallet String Overflow',
    collection: 'evaluationRuns',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    docId: 'run_02',
    payload: { ownerId: 'user_a', name: 'x'.repeat(5000) },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'PII Lateral Read',
    collection: 'users',
    operation: 'get',
    auth: { uid: 'user_b', email: 'b@example.com', email_verified: true },
    docId: 'user_a',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Unfiltered Tenant List Scraping',
    collection: 'evaluationRuns',
    operation: 'list',
    auth: { uid: 'user_b', email: 'b@example.com', email_verified: true },
    docId: '*',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Timestamp Forgery on Create',
    collection: 'evaluationRuns',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    docId: 'run_03',
    payload: { ownerId: 'user_a', createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Immutable Owner Mutation on Update',
    collection: 'datasets',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    docId: 'ds_01',
    payload: { ownerId: 'user_b' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Immutable Timestamp Mutation on Update',
    collection: 'redTeamCampaigns',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    docId: 'rt_01',
    payload: { createdAt: '2026-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Value Poisoning on Update',
    collection: 'evaluationRuns',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    docId: 'run_01',
    payload: { name: 12345 },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Unauthenticated Write',
    collection: 'hallucinationAnalyses',
    operation: 'create',
    auth: null,
    docId: 'ha_01',
    payload: { ownerId: 'anon', title: 'Test' },
    expectedOutcome: 'PERMISSION_DENIED'
  }
];
