import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

function clampNumber(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Number(val.toFixed(2))));
}

function clampString(val: string, maxLen: number, fallback = 'Untitled'): string {
  const trimmed = (val || '').trim();
  const safe = trimmed.length > 0 ? trimmed : fallback;
  return safe.slice(0, maxLen);
}

export async function signInWithGoogle(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  if (res.user) {
    await upsertUserProfile(res.user);
  }
  return res.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function upsertUserProfile(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid);
  const path = `users/${uid}`;
  try {
    await setDoc(doc(db, 'users', uid), {
      uid,
      email: clampString(user.email || 'user@evalguard.ai', 256, 'user@evalguard.ai'),
      displayName: clampString(user.displayName || 'AI Engineer', 120, 'AI Engineer'),
      organization: 'Innodata AI Evaluation Lab',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface StoredEvaluationRun {
  id: string;
  ownerId: string;
  name: string;
  datasetName: string;
  modelNames: string;
  sampleCount: number;
  overallScore: number;
  accuracy: number;
  faithfulness: number;
  relevance: number;
  completeness: number;
  hallucinationRate: number;
  safetyPassRate: number;
  avgLatencyMs: number;
  isSimulated: boolean;
  detailsJson: string;
  createdAt: string;
}

export async function persistEvaluationRun(run: Omit<StoredEvaluationRun, 'ownerId'>): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const runId = sanitizeId(run.id);
  const path = `evaluationRuns/${runId}`;
  try {
    await setDoc(doc(db, 'evaluationRuns', runId), {
      ownerId: user.uid,
      name: clampString(run.name, 160, 'Evaluation Run'),
      datasetName: clampString(run.datasetName, 160, 'Custom Dataset'),
      modelNames: clampString(run.modelNames, 500, 'gemini-4-hydrogen'),
      sampleCount: Math.max(1, Math.min(10000, Math.round(run.sampleCount))),
      overallScore: clampNumber(run.overallScore, 0, 100),
      accuracy: clampNumber(run.accuracy, 0, 100),
      faithfulness: clampNumber(run.faithfulness, 0, 100),
      relevance: clampNumber(run.relevance, 0, 100),
      completeness: clampNumber(run.completeness, 0, 100),
      hallucinationRate: clampNumber(run.hallucinationRate, 0, 100),
      safetyPassRate: clampNumber(run.safetyPassRate, 0, 100),
      avgLatencyMs: clampNumber(run.avgLatencyMs, 0, 600000),
      isSimulated: Boolean(run.isSimulated),
      detailsJson: clampString(run.detailsJson, 240000, '{}'),
      createdAt: clampString(run.createdAt || new Date().toISOString(), 64),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function persistHallucinationAnalysis(record: {
  id: string;
  title: string;
  modelName: string;
  overallFaithfulness: number;
  supportedCount: number;
  unsupportedCount: number;
  contradictoryCount: number;
  isSimulated: boolean;
  claimsPayload: string;
  createdAt: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const analysisId = sanitizeId(record.id);
  const path = `hallucinationAnalyses/${analysisId}`;
  try {
    await setDoc(doc(db, 'hallucinationAnalyses', analysisId), {
      ownerId: user.uid,
      title: clampString(record.title, 160, 'Document Grounding Check'),
      modelName: clampString(record.modelName, 120, 'gemini-4-hydrogen'),
      overallFaithfulness: clampNumber(record.overallFaithfulness, 0, 100),
      supportedCount: Math.max(0, Math.min(1000, Math.round(record.supportedCount))),
      unsupportedCount: Math.max(0, Math.min(1000, Math.round(record.unsupportedCount))),
      contradictoryCount: Math.max(0, Math.min(1000, Math.round(record.contradictoryCount))),
      isSimulated: Boolean(record.isSimulated),
      claimsPayload: clampString(record.claimsPayload, 140000, '[]'),
      createdAt: clampString(record.createdAt || new Date().toISOString(), 64),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function persistRedTeamCampaign(record: {
  id: string;
  campaignName: string;
  modelName: string;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  reviewCount: number;
  passRate: number;
  isSimulated: boolean;
  findingsPayload: string;
  createdAt: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const campaignId = sanitizeId(record.id);
  const path = `redTeamCampaigns/${campaignId}`;
  try {
    await setDoc(doc(db, 'redTeamCampaigns', campaignId), {
      ownerId: user.uid,
      campaignName: clampString(record.campaignName, 160, 'Red-Team Audit'),
      modelName: clampString(record.modelName, 120, 'gemini-4-hydrogen'),
      totalTests: Math.max(1, Math.min(1000, Math.round(record.totalTests))),
      passedCount: Math.max(0, Math.min(1000, Math.round(record.passedCount))),
      failedCount: Math.max(0, Math.min(1000, Math.round(record.failedCount))),
      reviewCount: Math.max(0, Math.min(1000, Math.round(record.reviewCount))),
      passRate: clampNumber(record.passRate, 0, 100),
      isSimulated: Boolean(record.isSimulated),
      findingsPayload: clampString(record.findingsPayload, 190000, '[]'),
      createdAt: clampString(record.createdAt || new Date().toISOString(), 64),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function persistDatasetRecord(record: {
  id: string;
  name: string;
  category: string;
  recordCount: number;
  duplicateCount: number;
  missingValueCount: number;
  trainCount: number;
  evalCount: number;
  samplePayload: string;
  createdAt: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const datasetId = sanitizeId(record.id);
  const path = `datasets/${datasetId}`;
  try {
    await setDoc(doc(db, 'datasets', datasetId), {
      ownerId: user.uid,
      name: clampString(record.name, 160, 'Uploaded Dataset'),
      category: clampString(record.category, 80, 'Multi-Task'),
      recordCount: Math.max(0, Math.min(100000, Math.round(record.recordCount))),
      duplicateCount: Math.max(0, Math.min(100000, Math.round(record.duplicateCount))),
      missingValueCount: Math.max(0, Math.min(100000, Math.round(record.missingValueCount))),
      trainCount: Math.max(0, Math.min(100000, Math.round(record.trainCount))),
      evalCount: Math.max(0, Math.min(100000, Math.round(record.evalCount))),
      samplePayload: clampString(record.samplePayload, 240000, '[]'),
      createdAt: clampString(record.createdAt || new Date().toISOString(), 64),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteEvaluationRunFromFirestore(runId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const cleanId = sanitizeId(runId);
  try {
    await deleteDoc(doc(db, 'evaluationRuns', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `evaluationRuns/${cleanId}`);
  }
}

export { onAuthStateChanged, collection, query, where, onSnapshot };
export type { User };
