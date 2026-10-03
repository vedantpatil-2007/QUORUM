import { QuorumStatus } from '../models/db.types.js';

export interface HashGroup {
  artifactSha256: string;
  builderIds: string[];
  count: number;
  percentage: number;
}

export interface QuorumEvaluationResult {
  releaseId: string;
  status: QuorumStatus;
  totalAttestations: number;
  validAttestations: number;
  invalidAttestations: number;
  eligibleBuilders: string[];
  hashGroups: HashGroup[];
  dominantHash: string | null;
  dominantBuilderCount: number;
  consensusPercentage: number;
  threshold: number; // 66.67
  sufficientEvidence: boolean;
  disagreementDetected: boolean;
  evaluatedAt: string;
  explanation: string;
}

export interface QuorumOptions {
  skipPersistence?: boolean;
  skipLedger?: boolean;
  artifactsDir?: string;
}
