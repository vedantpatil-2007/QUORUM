import React from 'react';
import {
  X,
  Github,
  GitBranch,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Cpu,
  Check,
  Copy,
} from 'lucide-react';
import { api } from '../services/api.js';
import { StatusBadge } from './StatusBadge.js';
import { ConsensusBadge } from './ConsensusBadge.js';
import type { CreateReleaseFromSourceResponse } from '../types/api.types.js';

interface VerifyRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (releaseId: string) => void;
}

type StageStatus = 'pending' | 'active' | 'completed' | 'failed';

interface Stage {
  id: string;
  label: string;
  detail: string;
}

const VERIFICATION_STAGES: Stage[] = [
  {
    id: 'validate_url',
    label: 'Validating Repository URL',
    detail: 'Enforcing HTTPS protocol and valid GitHub repository syntax',
  },
  {
    id: 'resolve_commit',
    label: 'Resolving Source Reference',
    detail: 'Authoritative 40-character Git commit SHA resolved via GitHub API',
  },
  {
    id: 'init_release',
    label: 'Initializing Release Record',
    detail: 'Registering release metadata and expected build parameters',
  },
  {
    id: 'builder_alpha',
    label: 'Builder Alpha Execution',
    detail: 'Running deterministic build and producing Ed25519 signed attestation',
  },
  {
    id: 'builder_beta',
    label: 'Builder Beta Execution',
    detail: 'Running independent deterministic build and signing attestation',
  },
  {
    id: 'builder_gamma',
    label: 'Builder Gamma Execution',
    detail: 'Running independent deterministic build and signing attestation',
  },
  {
    id: 'phase5_verify',
    label: 'Phase 5: Attestation Verification',
    detail: 'Cryptographic signature, in-toto schema, and artifact digest checks',
  },
  {
    id: 'phase6_quorum',
    label: 'Phase 6: Quorum Consensus Engine',
    detail: 'Evaluating consensus threshold and determining release security decision',
  },
  {
    id: 'phase7_ledger',
    label: 'Phase 7: Tamper-Evident Audit Ledger',
    detail: 'Cryptographically appending immutable events to hash-chained ledger',
  },
  {
    id: 'complete',
    label: 'Consensus Decision Reached',
    detail: 'Verification complete and persisted to Quorum database',
  },
];

export const VerifyRepositoryModal: React.FC<VerifyRepositoryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [repositoryUrl, setRepositoryUrl] = React.useState('https://github.com/octocat/Hello-World');
  const [ref, setRef] = React.useState('master');
  const [scenario, setScenario] = React.useState<'clean' | 'conflict' | 'no-consensus' | 'insufficient'>('clean');

  const [isRunning, setIsRunning] = React.useState(false);
  const [currentStageIndex, setCurrentStageIndex] = React.useState<number>(-1);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CreateReleaseFromSourceResponse | null>(null);
  const [copiedSha, setCopiedSha] = React.useState(false);

  // Reset state when opened
  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setResult(null);
      setIsRunning(false);
      setCurrentStageIndex(-1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const handleStartVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repositoryUrl.trim()) {
      setError('Please provide a valid GitHub repository URL.');
      return;
    }

    setError(null);
    setResult(null);
    setIsRunning(true);
    setCurrentStageIndex(0); // Validating URL

    try {
      // Stage 0: Validate URL
      setCurrentStageIndex(0);
      await new Promise((r) => setTimeout(r, 150));

      // Stage 1: Resolve commit via API
      setCurrentStageIndex(1);

      // Perform backend release creation & simulation
      const res = await api.createReleaseFromSource({
        repositoryUrl: repositoryUrl.trim(),
        ref: ref.trim() || 'main',
        scenario,
      });

      // Animate through simulation and verification stages for rich visual feedback
      for (let s = 2; s < VERIFICATION_STAGES.length - 1; s++) {
        setCurrentStageIndex(s);
        await new Promise((r) => setTimeout(r, 180));
      }

      // Final complete stage
      setCurrentStageIndex(VERIFICATION_STAGES.length - 1);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  const getStageStatus = (index: number): StageStatus => {
    if (error && index === currentStageIndex) return 'failed';
    if (currentStageIndex > index || result !== null) return 'completed';
    if (currentStageIndex === index) return 'active';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/60 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-mono text-zinc-100 flex items-center gap-2">
                <span>VERIFY A REPOSITORY</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  GitHub
                </span>
              </h2>
              <p className="text-xs text-zinc-400 font-sans">
                Verify a source repository against independently produced builder attestations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Disclosure Banner (Critical System Boundary) */}
          <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 p-3.5 text-xs font-mono text-cyan-300 flex items-start gap-2.5">
            <Cpu className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-cyan-200 uppercase tracking-wider text-[11px] block">
                Deterministic Builder Simulation Notice
              </span>
              <p className="text-[11px] text-cyan-300/90 leading-relaxed font-sans">
                Source repository resolved. Builder verification uses Quorum's deterministic builder simulation for this MVP.
              </p>
            </div>
          </div>

          {/* Form when not completed */}
          {!result ? (
            <form onSubmit={handleStartVerification} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-zinc-400 text-[11px] uppercase mb-1 font-semibold">
                  Source Repository URL *
                </label>
                <div className="relative">
                  <Github className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="url"
                    value={repositoryUrl}
                    onChange={(e) => setRepositoryUrl(e.target.value)}
                    disabled={isRunning}
                    placeholder="https://github.com/user/project"
                    required
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-zinc-500">
                  <span>Quick Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRepositoryUrl('https://github.com/yashnanavare6/Food-Express-Website');
                      setRef('master');
                    }}
                    className="text-emerald-400 hover:underline font-semibold"
                  >
                    yashnanavare6/Food-Express-Website (master)
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRepositoryUrl('https://github.com/octocat/Hello-World');
                      setRef('master');
                    }}
                    className="text-emerald-400 hover:underline"
                  >
                    octocat/Hello-World (master)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-[11px] uppercase mb-1 font-semibold">
                    Branch, Tag, or Commit SHA *
                  </label>
                  <div className="relative">
                    <GitBranch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={ref}
                      onChange={(e) => setRef(e.target.value)}
                      disabled={isRunning}
                      placeholder="main"
                      required
                      className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] uppercase mb-1 font-semibold">
                    Simulation Scenario
                  </label>
                  <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value as any)}
                    disabled={isRunning}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  >
                    <option value="clean">Clean (100% Agreement → VERIFIED)</option>
                    <option value="conflict">Conflict (2 vs 1 Dissent → FLAGGED)</option>
                    <option value="no-consensus">No Consensus (All Disagree → REJECTED)</option>
                    <option value="insufficient">Insufficient Evidence (&lt;3 Builders → INSUFFICIENT)</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-600/40 bg-rose-950/20 p-3.5 text-xs font-mono text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Verification Error:</span> {error}
                  </div>
                </div>
              )}

              {/* Progress Pipeline Visualization while running */}
              {isRunning && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3 font-mono">
                  <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-2">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Verification Pipeline Execution
                    </span>
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Processing</span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    {VERIFICATION_STAGES.map((stg, idx) => {
                      const stgStatus = getStageStatus(idx);
                      return (
                        <div
                          key={stg.id}
                          className={`flex items-center justify-between text-xs py-1 px-2 rounded transition-colors ${
                            stgStatus === 'active'
                              ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-500/30'
                              : stgStatus === 'completed'
                              ? 'text-zinc-300'
                              : 'text-zinc-600'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {stgStatus === 'completed' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            ) : stgStatus === 'active' ? (
                              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin flex-shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 flex-shrink-0" />
                            )}
                            <span className="font-medium">{stg.label}</span>
                          </div>
                          <span className="text-[10px] text-zinc-500 hidden sm:inline">
                            {stg.detail}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isRunning}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRunning}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-mono text-xs font-bold transition-colors disabled:opacity-50 shadow-md shadow-emerald-950/50"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying Source...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3.5 h-3.5" />
                      <span>START VERIFICATION</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Results Screen */
            <div className="space-y-5 font-mono text-xs">
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Consensus Evaluation Complete</span>
                  </div>
                  <StatusBadge status={result.status} size="md" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-zinc-300">
                  <div className="space-y-1">
                    <span className="text-zinc-500 text-[10px] uppercase">Resolved Repository</span>
                    <div className="font-semibold text-zinc-100 flex items-center gap-2">
                      {result.source.ownerAvatarUrl ? (
                        <img
                          src={result.source.ownerAvatarUrl}
                          alt={result.source.owner}
                          className="w-5 h-5 rounded-full border border-zinc-700 bg-zinc-800 object-cover"
                        />
                      ) : (
                        <Github className="w-4 h-4 text-zinc-400" />
                      )}
                      <span>
                        {result.source.owner}/{result.source.repository}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-500 text-[10px] uppercase">Resolved Reference</span>
                    <div className="text-zinc-200 flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{result.source.ref}</span>
                    </div>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <div className="flex items-center justify-between text-zinc-500 text-[10px] uppercase">
                      <span>Authoritative Commit SHA (40-char)</span>
                      <button
                        onClick={() => handleCopy(result.source.commitSha)}
                        className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"
                      >
                        {copiedSha ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSha ? 'Copied' : 'Copy SHA'}</span>
                      </button>
                    </div>
                    <div className="p-2 rounded bg-zinc-900 border border-zinc-800 text-emerald-400 select-all break-all text-[11px]">
                      {result.source.commitSha}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-500 text-[10px] uppercase">Quorum Consensus</span>
                    <div>
                      <ConsensusBadge percentage={result.quorum.consensusPercentage} size="sm" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-500 text-[10px] uppercase">Attestation Evidence</span>
                    <div className="text-zinc-200">
                      <span className="text-emerald-400 font-bold">{result.verification.valid}</span> valid /{' '}
                      {result.verification.total} total
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-400 font-sans border-t border-zinc-800/80 pt-3">
                  {result.simulationNote}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setCurrentStageIndex(-1);
                  }}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs transition-colors"
                >
                  Verify Another Repository
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSuccess(result.releaseId);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-mono text-xs font-bold transition-colors shadow-md shadow-emerald-950/50"
                >
                  <span>Inspect Release Details</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
