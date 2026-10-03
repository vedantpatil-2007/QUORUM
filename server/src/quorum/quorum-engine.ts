import type Database from 'better-sqlite3';
import {
  QuorumEvaluationResult,
  HashGroup,
  QuorumOptions,
} from './quorum.types.js';
import {
  MIN_BUILDERS,
  QUORUM_THRESHOLD_PERCENT,
  calculateConsensusPercentage,
  meetsQuorumThreshold,
} from './quorum-rules.js';
import { VerificationRepository } from '../db/repositories/verification.repository.js';
import { AttestationsRepository } from '../db/repositories/attestations.repository.js';
import { ReleasesRepository } from '../db/repositories/releases.repository.js';
import { QuorumRepository } from '../db/repositories/quorum.repository.js';
import { QuorumStatus } from '../models/db.types.js';
import { LedgerService } from '../ledger/ledger-service.js';

export class QuorumEngine {
  private readonly verificationRepo: VerificationRepository;
  private readonly attestationsRepo: AttestationsRepository;
  private readonly releasesRepo: ReleasesRepository;
  private readonly quorumRepo: QuorumRepository;
  private readonly ledgerService: LedgerService;

  constructor(private readonly db: Database.Database, _artifactsDir?: string) {
    this.verificationRepo = new VerificationRepository(db);
    this.attestationsRepo = new AttestationsRepository(db);
    this.releasesRepo = new ReleasesRepository(db);
    this.quorumRepo = new QuorumRepository(db);
    this.ledgerService = new LedgerService(db);
  }

  /**
   * Evaluates release-level consensus based on verified builder attestations.
   * 
   * CRITICAL SECURITY PRINCIPLE:
   * Consumes INDIVIDUAL VERIFICATION RESULTS, never raw unverified attestations.
   * Phase 6 strictly reads persisted verification_results from VerificationRepository.
   * It NEVER automatically invokes Phase 5 Verification Engine.
   * Invalid attestations are strictly disqualified from consensus voting.
   */
  async evaluateReleaseQuorum(
    releaseId: string,
    options: QuorumOptions = {}
  ): Promise<QuorumEvaluationResult> {
    const evaluatedAt = new Date().toISOString();

    const release = this.releasesRepo.getReleaseById(releaseId);
    if (!release) {
      throw new Error(`Release "${releaseId}" not found in database.`);
    }

    // 1. Strictly load persisted verification results from VerificationRepository
    // CRITICAL: Phase 6 does NOT automatically invoke Phase 5.
    const verificationResults = this.verificationRepo.getVerificationResultsByReleaseId(releaseId);

    // 2. Separate into VALID and INVALID verification results
    const validResults = verificationResults.filter((r) => r.status === 'VALID');
    const invalidResults = verificationResults.filter((r) => r.status === 'INVALID');

    // 3. Enforce Builder Independence (one builder = one vote)
    // Map each valid verification result to its underlying attestation
    interface ValidBuilderVote {
      builderId: string;
      artifactSha256: string;
      attestationId: string;
    }

    const seenBuilders = new Set<string>();
    const eligibleVotes: ValidBuilderVote[] = [];

    for (const vr of validResults) {
      const att = this.attestationsRepo.getAttestationById(vr.attestation_id);
      if (!att) continue;

      if (!seenBuilders.has(att.builder_id)) {
        seenBuilders.add(att.builder_id);
        eligibleVotes.push({
          builderId: att.builder_id,
          artifactSha256: att.artifact_sha256,
          attestationId: att.id,
        });
      }
    }

    const totalValidBuilders = eligibleVotes.length;
    const eligibleBuilderIds = eligibleVotes.map((v) => v.builderId);

    // 4. Group valid votes by artifact SHA-256
    const groupMap = new Map<string, string[]>();
    for (const vote of eligibleVotes) {
      const existing = groupMap.get(vote.artifactSha256) ?? [];
      existing.push(vote.builderId);
      groupMap.set(vote.artifactSha256, existing);
    }

    // Format and sort hash groups: highest votes first, then alphabetically by hash
    const hashGroups: HashGroup[] = Array.from(groupMap.entries())
      .map(([hash, builders]) => ({
        artifactSha256: hash,
        builderIds: builders.sort(),
        count: builders.length,
        percentage: calculateConsensusPercentage(builders.length, totalValidBuilders),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.artifactSha256.localeCompare(b.artifactSha256);
      });

    const dominantGroup = hashGroups[0];
    const dominantHash = dominantGroup ? dominantGroup.artifactSha256 : null;
    const dominantBuilderCount = dominantGroup ? dominantGroup.count : 0;
    const consensusPercentage = dominantGroup
      ? dominantGroup.percentage
      : 0;

    const disagreementDetected = hashGroups.length > 1;
    const sufficientEvidence = totalValidBuilders >= MIN_BUILDERS;

    // 5. Apply Deterministic Decision Rules
    let status: QuorumStatus;
    let explanation: string;

    if (!sufficientEvidence) {
      status = 'INSUFFICIENT_EVIDENCE';
      explanation = totalValidBuilders === 0
        ? `Insufficient evidence: 0 valid builder attestations found for release "${releaseId}". Verification results must be recorded before consensus can be established.`
        : `Insufficient evidence: received ${totalValidBuilders} valid builder attestation(s), but at least ${MIN_BUILDERS} are required to establish consensus.`;
    } else if (!disagreementDetected) {
      // 100% agreement among >= 3 valid builders
      status = 'VERIFIED';
      explanation = `Unanimous consensus: all ${totalValidBuilders} independent builders produced identical artifact hash ${dominantHash} (100.00% agreement).`;
    } else if (meetsQuorumThreshold(dominantBuilderCount, totalValidBuilders)) {
      // Majority reaches >= 66.67%, but disagreement exists
      status = 'FLAGGED';
      const dissentingCount = totalValidBuilders - dominantBuilderCount;
      explanation = `Consensus majority reached (${consensusPercentage}%), but active builder disagreement detected (${dissentingCount} dissenting builder(s)). Detailed inspection recommended before trusting release.`;
    } else {
      // No hash reached the 66.67% threshold
      status = 'REJECTED';
      explanation = `Consensus failure: dominant hash received ${consensusPercentage}%, falling below required ${QUORUM_THRESHOLD_PERCENT}% threshold. Release rejected due to lack of builder quorum.`;
    }

    const quorumResult: QuorumEvaluationResult = {
      releaseId,
      status,
      totalAttestations: verificationResults.length,
      validAttestations: validResults.length,
      invalidAttestations: invalidResults.length,
      eligibleBuilders: eligibleBuilderIds,
      hashGroups,
      dominantHash,
      dominantBuilderCount,
      consensusPercentage,
      threshold: QUORUM_THRESHOLD_PERCENT,
      sufficientEvidence,
      disagreementDetected,
      evaluatedAt,
      explanation,
    };

    // 6. Persist Quorum Result and Update Release Status in SQLite
    if (!options.skipPersistence) {
      const breakdownJson = JSON.stringify({
        hashGroups,
        explanation,
        totalValidBuilders,
        invalidAttestationCount: invalidResults.length,
        disagreementDetected,
      });

      this.quorumRepo.createOrReplaceQuorumResult({
        id: `qrm_${releaseId}`,
        releaseId,
        totalBuilders: totalValidBuilders,
        agreeingCount: dominantBuilderCount,
        disagreeingCount: totalValidBuilders - dominantBuilderCount,
        consensusPercentage,
        canonicalHash: dominantHash,
        quorumStatus: status,
        breakdownJson,
        decidedAt: evaluatedAt,
      });

      // Update release status to reflect the new quorum consensus
      const previousReleaseStatus = release.status;
      this.releasesRepo.updateReleaseStatus(releaseId, status);

      // Phase 7 Integration: append audit ledger events
      if (!options.skipLedger) {
        if (previousReleaseStatus !== status) {
          this.ledgerService.recordReleaseStatusChanged({
            releaseId,
            previousStatus: previousReleaseStatus,
            newStatus: status,
          });
        }

        this.ledgerService.recordQuorumEvaluated({
          releaseId,
          status,
          validAttestations: totalValidBuilders,
          invalidAttestations: invalidResults.length,
          dominantHash,
          dominantBuilderCount,
          consensusPercentage,
          disagreementDetected,
        });
      }
    }

    return quorumResult;
  }

  /**
   * Retrieves previously computed and stored quorum result for a release.
   */
  getQuorumResult(releaseId: string): QuorumEvaluationResult | null {
    const record = this.quorumRepo.getQuorumResultByReleaseId(releaseId);
    if (!record) return null;

    let parsedBreakdown: {
      hashGroups?: HashGroup[];
      explanation?: string;
      totalValidBuilders?: number;
      invalidAttestationCount?: number;
      disagreementDetected?: boolean;
    } = {};

    try {
      parsedBreakdown = JSON.parse(record.breakdown_json);
    } catch {
      // fallback
    }

    const hashGroups = parsedBreakdown.hashGroups ?? [];
    const dominantGroup = hashGroups[0];

    return {
      releaseId: record.release_id,
      status: record.quorum_status,
      totalAttestations: record.total_builders + (parsedBreakdown.invalidAttestationCount ?? 0),
      validAttestations: record.total_builders,
      invalidAttestations: parsedBreakdown.invalidAttestationCount ?? 0,
      eligibleBuilders: hashGroups.flatMap((g) => g.builderIds),
      hashGroups,
      dominantHash: record.canonical_hash,
      dominantBuilderCount: record.agreeing_count,
      consensusPercentage: record.consensus_percentage,
      threshold: QUORUM_THRESHOLD_PERCENT,
      sufficientEvidence: record.total_builders >= MIN_BUILDERS,
      disagreementDetected: parsedBreakdown.disagreementDetected ?? (record.disagreeing_count > 0),
      evaluatedAt: record.decided_at,
      explanation: parsedBreakdown.explanation ?? `Quorum status: ${record.quorum_status}`,
    };
  }
}
