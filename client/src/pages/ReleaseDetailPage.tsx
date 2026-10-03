import React from 'react';
import {
  ReleaseDto,
  VerificationResultDto,
  QuorumResultDto,
  LedgerEntryDto,
  BuilderDto,
} from '../types/api.types.js';
import { api } from '../services/api.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ConsensusBadge } from '../components/ConsensusBadge.js';
import { BuilderMatrix } from '../components/BuilderMatrix.js';
import { HashConsensusBar } from '../components/HashConsensusBar.js';
import { SecurityTimeline } from '../components/SecurityTimeline.js';
import { LoadingState } from '../components/LoadingState.js';
import { ErrorState } from '../components/ErrorState.js';
import {
  ArrowLeft,
  GitCommit,
  GitBranch,
  Package,
  Layers,
  Shield,
  Clock,
  History,
  Check,
  Copy,
  Github,
  ExternalLink,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  RefreshCw,
} from 'lucide-react';

interface ReleaseDetailPageProps {
  releaseId: string;
  onNavigate: (path: string) => void;
  onRefreshParent: () => void;
}

export const ReleaseDetailPage: React.FC<ReleaseDetailPageProps> = ({
  releaseId,
  onNavigate,
  onRefreshParent,
}) => {
  const [release, setRelease] = React.useState<ReleaseDto | null>(null);
  const [verifications, setVerifications] = React.useState<VerificationResultDto[]>([]);
  const [quorum, setQuorum] = React.useState<QuorumResultDto | null>(null);
  const [auditEntries, setAuditEntries] = React.useState<LedgerEntryDto[]>([]);
  const [builders, setBuilders] = React.useState<BuilderDto[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [evaluating, setEvaluating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copiedSha, setCopiedSha] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Parallel fetch release, builders, verifications, quorum, audit
      const [relData, bldData] = await Promise.all([
        api.getRelease(releaseId),
        api.getBuilders(),
      ]);
      setRelease(relData);
      setBuilders(bldData);

      // Fetch verification results (Phase 5)
      try {
        const vResults = await api.getVerificationResults(releaseId);
        setVerifications(vResults);
      } catch {
        setVerifications([]);
      }

      // Fetch quorum result (Phase 6)
      try {
        const qResult = await api.getQuorumResult(releaseId);
        setQuorum(qResult);
      } catch {
        setQuorum(null);
      }

      // Fetch audit ledger events for release (Phase 7)
      try {
        const aEntries = await api.getReleaseAudit(releaseId);
        setAuditEntries(aEntries);
      } catch {
        setAuditEntries([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load release data');
    } finally {
      setLoading(false);
    }
  }, [releaseId]);

  const [evaluationResult, setEvaluationResult] = React.useState<{
    success: boolean;
    status: string;
    consensusPercentage: number;
    validCount: number;
    invalidCount: number;
    dissentingCount: number;
    disagreementDetected: boolean;
  } | null>(null);
  const [evaluationError, setEvaluationError] = React.useState<string | null>(null);
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEvaluate = async () => {
    if (evaluating) return;
    try {
      setEvaluating(true);
      setEvaluationError(null);
      setEvaluationResult(null);

      const evalRes = await api.evaluateRelease(releaseId);
      await loadData();
      onRefreshParent();

      setEvaluationResult({
        success: true,
        status: evalRes.status,
        consensusPercentage: evalRes.quorum.consensusPercentage,
        validCount: evalRes.verification.valid,
        invalidCount: evalRes.verification.invalid,
        dissentingCount: evalRes.quorum.disagreementDetected ? 1 : 0,
        disagreementDetected: evalRes.quorum.disagreementDetected,
      });
    } catch {
      setEvaluationError('Quorum evaluation failed. Check that the API server is running.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleCopySha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const [avatarFailed, setAvatarFailed] = React.useState(false);

  // Deduplicate verification results per unique builder (keeping latest evaluation)
  const uniqueVerifications = React.useMemo(() => {
    const builderMap = new Map<string, VerificationResultDto>();
    const sorted = [...verifications].sort(
      (a, b) => new Date(a.verifiedAt).getTime() - new Date(b.verifiedAt).getTime()
    );
    for (const v of sorted) {
      builderMap.set(v.builderId, v);
    }
    return Array.from(builderMap.values());
  }, [verifications]);

  // Extract owner, repo, and avatar for Source Repository section
  const [owner, repoName] = React.useMemo(() => {
    if (!release) return ['repository-owner', 'repository'];
    if (release.project.includes('/')) {
      const parts = release.project.split('/');
      return [parts[0] || 'repository-owner', parts[1] || 'repository'];
    }
    if (release.repoUrl.includes('github.com/')) {
      const segs = release.repoUrl.replace(/https?:\/\/github\.com\//, '').split('/');
      return [segs[0] || 'repository-owner', segs[1] || release.project];
    }
    return ['repository-owner', release.project];
  }, [release?.project, release?.repoUrl]);

  React.useEffect(() => {
    if (!release?.ownerAvatarUrl && owner && owner !== 'repository-owner') {
      fetch(`https://api.github.com/users/${owner}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.avatar_url) {
            setFetchedAvatarUrl(data.avatar_url);
          }
        })
        .catch(() => {});
    }
  }, [release?.ownerAvatarUrl, owner]);

  const effectiveAvatarUrl =
    release?.ownerAvatarUrl ||
    fetchedAvatarUrl ||
    (owner && owner !== 'repository-owner' ? `https://github.com/${owner}.png?size=128` : null);

  if (loading) {
    return <LoadingState message="Loading release verification and quorum consensus details..." />;
  }

  if (error || !release) {
    return (
      <ErrorState
        title="Release Not Found"
        message={error || `Release with ID '${releaseId}' was not found.`}
        onRetry={loadData}
      />
    );
  }

  const validBuilderCount = uniqueVerifications.filter((v) => v.status === 'VALID').length;
  const invalidEvidenceCount = uniqueVerifications.filter((v) => v.status === 'INVALID').length;
  const currentStatus = quorum?.status || release.status;
  const consensusPct = quorum ? quorum.consensusPercentage : 0;
  const threshold = quorum ? quorum.threshold : 66.67;
  const dissentingCount =
    quorum && quorum.dominantBuilderCount
      ? quorum.validAttestations - quorum.dominantBuilderCount
      : 0;

  return (
    <div className="space-y-8">
      {/* Navigation Back */}
      <button
        onClick={() => onNavigate('/releases')}
        className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Releases</span>
      </button>

      {/* Release Header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
                {release.project}
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-xs font-mono font-medium text-emerald-400">
                {release.version}
              </span>
              <StatusBadge status={currentStatus} size="md" />
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-zinc-400 pt-1">
              <div className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-zinc-500" />
                <span>Artifact:</span>
                <span className="text-zinc-200">{release.expectedArtifactName}</span>
              </div>
              {release.expectedHash && (
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Authoritative SHA-256:</span>
                  <span className="text-emerald-400 font-mono text-[11px]" title={release.expectedHash}>
                    {release.expectedHash.slice(0, 10)}...{release.expectedHash.slice(-8)}
                  </span>
                  <button
                    onClick={() => handleCopySha(release.expectedHash!)}
                    className="p-0.5 hover:text-white transition-colors text-zinc-500 rounded"
                    title="Copy full SHA-256"
                  >
                    {copiedSha ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <GitCommit className="w-3.5 h-3.5 text-zinc-500" />
                <span>Commit:</span>
                <span className="text-zinc-200" title={release.commitSha}>
                  {release.commitSha.slice(0, 10)}
                </span>
                <button
                  onClick={() => handleCopySha(release.commitSha)}
                  className="p-0.5 hover:text-white transition-colors text-zinc-500 rounded"
                  title="Copy full commit SHA"
                >
                  {copiedSha ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span>Created:</span>
                <span className="text-zinc-400">{new Date(release.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Evaluate Pipeline Action */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-mono text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-950/50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
              <span>{evaluating ? 'Evaluating...' : 'Evaluate Quorum Pipeline'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Evaluation Result / Error Feedback */}
      {evaluationResult && (
        <div
          className={`rounded-xl border p-4 font-mono text-xs shadow-lg animate-in fade-in duration-200 ${
            evaluationResult.status === 'VERIFIED'
              ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
              : evaluationResult.status === 'FLAGGED'
              ? 'border-amber-500/40 bg-amber-950/30 text-amber-200'
              : 'border-rose-500/40 bg-rose-950/30 text-rose-200'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
            <div className="flex items-center gap-2 font-bold text-sm">
              {evaluationResult.status === 'VERIFIED' && (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">Evaluation complete</span>
                </>
              )}
              {evaluationResult.status === 'FLAGGED' && (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300">Evaluation complete</span>
                </>
              )}
              {evaluationResult.status === 'REJECTED' && (
                <>
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <span className="text-rose-300">Quorum decision: REJECTED</span>
                </>
              )}
              {evaluationResult.status === 'INSUFFICIENT_EVIDENCE' && (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span className="text-rose-300">Quorum decision: INSUFFICIENT_EVIDENCE</span>
                </>
              )}
            </div>
            <button
              onClick={() => setEvaluationResult(null)}
              className="text-zinc-400 hover:text-zinc-200 p-1 rounded"
              aria-label="Dismiss evaluation notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {evaluationResult.status === 'VERIFIED' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-zinc-300">
              <div>✓ Verification: <strong className="text-emerald-300">{evaluationResult.validCount} valid / {evaluationResult.invalidCount} invalid</strong></div>
              <div>✓ Quorum: <strong className="text-emerald-300">VERIFIED</strong></div>
              <div>✓ Consensus: <strong className="text-emerald-300">{evaluationResult.consensusPercentage.toFixed(2)}%</strong></div>
              <div className="text-emerald-300">✓ Audit ledger updated</div>
            </div>
          )}

          {evaluationResult.status === 'FLAGGED' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-zinc-300">
              <div>⚠ Quorum decision: <strong className="text-amber-300">FLAGGED</strong></div>
              <div>Consensus: <strong className="text-amber-300">{evaluationResult.consensusPercentage.toFixed(2)}%</strong></div>
              <div>Dissenting builders: <strong className="text-amber-300">{evaluationResult.dissentingCount}</strong></div>
            </div>
          )}

          {evaluationResult.status === 'REJECTED' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-300">
              <div>Quorum decision: <strong className="text-rose-300">REJECTED</strong></div>
              <div>Consensus: <strong className="text-rose-300">{evaluationResult.consensusPercentage.toFixed(2)}%</strong></div>
            </div>
          )}

          {evaluationResult.status === 'INSUFFICIENT_EVIDENCE' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-300">
              <div>Quorum decision: <strong className="text-rose-300">INSUFFICIENT_EVIDENCE</strong></div>
              <div>Valid builders: <strong className="text-rose-300">{evaluationResult.validCount} (&lt; 3 minimum)</strong></div>
            </div>
          )}
        </div>
      )}

      {evaluationError && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 font-mono text-xs text-rose-200 flex items-center justify-between shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{evaluationError}</span>
          </div>
          <button
            onClick={() => setEvaluationError(null)}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Source Repository Information Card */}
      <section aria-labelledby="source-info-title">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-3.5">
              {/* GitHub Owner Avatar with onError fallback */}
              {effectiveAvatarUrl && !avatarFailed ? (
                <img
                  src={effectiveAvatarUrl}
                  alt={`GitHub avatar for ${owner}`}
                  onError={() => setAvatarFailed(true)}
                  className="w-12 h-12 rounded-full border border-zinc-700 bg-zinc-800 object-cover flex-shrink-0 shadow-md"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-200 font-mono font-bold text-sm flex-shrink-0 shadow-md"
                  title={`GitHub avatar for ${owner}`}
                >
                  {owner && owner !== 'repository-owner' ? owner.slice(0, 2).toUpperCase() : 'GH'}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono font-medium text-zinc-300">
                    {owner}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-semibold">
                    Public Repository
                  </span>
                </div>
                <h2 id="source-info-title" className="text-lg font-bold font-mono text-zinc-100 flex items-center gap-1.5">
                  <span className="text-emerald-300">{repoName}</span>
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <a
                href={release.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                <span>View on GitHub</span>
                <ExternalLink className="w-3 h-3 text-zinc-400" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
            {/* Repository URL */}
            <div className="space-y-1">
              <span className="text-zinc-500 text-[10px] uppercase font-semibold">Repository URL</span>
              <div className="text-zinc-200 truncate">
                <a
                  href={release.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline inline-flex items-center gap-1 truncate"
                >
                  <span className="truncate">{release.repoUrl}</span>
                </a>
              </div>
            </div>

            {/* Branch / Ref */}
            <div className="space-y-1">
              <span className="text-zinc-500 text-[10px] uppercase font-semibold">Branch / Reference</span>
              <div className="flex items-center gap-1.5 text-zinc-200">
                <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
                <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold">
                  {release.version}
                </span>
              </div>
            </div>

            {/* Authoritative Commit SHA */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 text-[10px] uppercase font-semibold">Authoritative Commit SHA</span>
                <button
                  onClick={() => handleCopySha(release.commitSha)}
                  className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"
                >
                  {copiedSha ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSha ? 'Copied' : 'Copy Full SHA'}</span>
                </button>
              </div>
              <div className="p-2 rounded bg-zinc-900 border border-zinc-800 text-emerald-400 font-mono text-[11px] select-all break-all">
                {release.commitSha}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>Resolved: {new Date(release.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 text-cyan-300/90 text-[11px] bg-cyan-950/30 px-2.5 py-1 rounded border border-cyan-800/40">
              <Cpu className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span>Builder verification uses Quorum's deterministic builder simulation for this MVP.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Consensus Summary Banner */}
      <section aria-labelledby="consensus-summary-title">
        <h2 id="consensus-summary-title" className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
          <span>Quorum Consensus Summary</span>
          <span className="h-px bg-zinc-800 flex-grow" />
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Main Status */}
          <div className="col-span-2 md:col-span-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col justify-between">
            <span className="text-[11px] font-mono uppercase text-zinc-400">Security Decision</span>
            <div className="my-2">
              <StatusBadge status={currentStatus} size="lg" />
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              Release-level consensus
            </span>
          </div>

          {/* Consensus % */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">Consensus</span>
            <div className="text-2xl font-bold font-mono text-zinc-100 my-1">
              <ConsensusBadge percentage={consensusPct} threshold={threshold} size="lg" />
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              Threshold: {threshold}%
            </span>
          </div>

          {/* Valid Unique Builders */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">Valid Builder Evidence</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 my-1">
              {validBuilderCount}
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              Unique builders verified (Min: 3)
            </span>
          </div>

          {/* Invalid Evidence */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">Invalid Evidence</span>
            <div className="text-2xl font-bold font-mono text-zinc-100 my-1">
              {invalidEvidenceCount}
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              Schema/hash rejected
            </span>
          </div>

          {/* Dissenting Builders */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">Dissent Detected</span>
            <div className={`text-2xl font-bold font-mono my-1 ${dissentingCount > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
              {dissentingCount} {dissentingCount === 1 ? 'builder' : 'builders'}
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              {dissentingCount > 0 ? 'Conflicting artifact' : 'Full agreement'}
            </span>
          </div>
        </div>

        {/* Quorum Explanation Principle (Part 15) */}
        <div className="mt-4 p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 font-mono text-xs text-zinc-200 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-emerald-300">Quorum Verification Principle:</strong> Quorum compares independently produced artifact identities. A valid signature proves who signed the attestation; quorum determines whether independent builders agree on the artifact.
          </p>
        </div>

        {/* Intentionally Divergent Artifact Explanation (Part 14) */}
        {dissentingCount > 0 && (
          <div className="mt-3 p-3.5 rounded-lg border border-amber-500/40 bg-amber-950/20 font-mono text-xs text-amber-200/90 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-amber-300">Divergent Artifact Detected:</strong> Builder Gamma produced a validly signed attestation, but its artifact hash differs from the majority.
            </p>
          </div>
        )}

        {/* Insufficient Evidence Explanation (Part 9) */}
        {validBuilderCount < 3 && (
          <div className="mt-3 p-3.5 rounded-lg border border-rose-500/40 bg-rose-950/20 font-mono text-xs text-rose-200/90 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-rose-300">Insufficient Evidence:</strong> Fewer than the required 3 valid builder attestations are available.
            </p>
          </div>
        )}

        {/* Quorum Explanation text if available */}
        {quorum?.explanation && (
          <div className="mt-3 p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/20 font-mono text-xs text-zinc-300">
            <span className="text-emerald-400 font-bold uppercase mr-2">Rationale:</span>
            {quorum.explanation}
          </div>
        )}
      </section>

      {/* Hash Consensus Visualization */}
      <section aria-labelledby="hash-consensus-title">
        <h2 id="hash-consensus-title" className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-zinc-400" />
          <span>Artifact Hash Group Consensus</span>
          <span className="h-px bg-zinc-800 flex-grow" />
        </h2>

        {quorum ? (
          <HashConsensusBar
            hashGroups={quorum.hashGroups}
            dominantHash={quorum.dominantHash}
            threshold={quorum.threshold}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs font-mono text-zinc-500">
            Consensus has not yet been evaluated for this release. Click "Evaluate Quorum Pipeline" above.
          </div>
        )}
      </section>

      {/* Builder Verification Matrix */}
      <section aria-labelledby="builder-matrix-title">
        <h2 id="builder-matrix-title" className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          <span>Builder Verification Matrix (Phase 5)</span>
          <span className="h-px bg-zinc-800 flex-grow" />
        </h2>

        <BuilderMatrix
          verifications={uniqueVerifications}
          builders={builders}
          dominantHash={quorum?.dominantHash || null}
          releaseStatus={currentStatus}
        />
      </section>

      {/* Release Security Timeline */}
      <section aria-labelledby="security-timeline-title">
        <h2 id="security-timeline-title" className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-zinc-400" />
          <span>Cryptographic Audit Trail (Phase 7 Ledger)</span>
          <span className="h-px bg-zinc-800 flex-grow" />
        </h2>

        <SecurityTimeline entries={auditEntries} />
      </section>
    </div>
  );
};
