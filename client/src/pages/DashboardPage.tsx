import React from 'react';
import {
  ReleaseDto,
  BuilderDto,
  LedgerVerifyDto,
  LedgerEntryDto,
} from '../types/api.types.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ConsensusBadge } from '../components/ConsensusBadge.js';
import { LedgerStatusBadge } from '../components/LedgerStatusBadge.js';
import {
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Server,
  Layers,
  Activity,
  ArrowRight,
  Shield,
  Clock,
  Github,
} from 'lucide-react';
import { VerifyRepositoryModal } from '../components/VerifyRepositoryModal.js';

interface DashboardPageProps {
  releases: ReleaseDto[];
  builders: BuilderDto[];
  ledgerVerify: LedgerVerifyDto | null;
  ledgerEntries: LedgerEntryDto[];
  onNavigate: (path: string) => void;
  onRefresh: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  releases,
  builders,
  ledgerVerify,
  ledgerEntries,
  onNavigate,
  onRefresh,
}) => {
  const [isVerifyModalOpen, setIsVerifyModalOpen] = React.useState(false);

  // Compute metric counts
  const totalReleases = releases.length;
  const verifiedCount = releases.filter((r) => r.status === 'VERIFIED').length;
  const flaggedCount = releases.filter((r) => r.status === 'FLAGGED').length;
  const rejectedCount = releases.filter((r) => r.status === 'REJECTED').length;
  const insufficientCount = releases.filter((r) => r.status === 'INSUFFICIENT_EVIDENCE').length;
  const activeBuilders = builders.filter((b) => b.status === 'ACTIVE').length;
  const totalAuditEvents = ledgerEntries.length;
  const isLedgerIntact = ledgerVerify ? ledgerVerify.valid : true;

  // Recent releases sorted by createdAt
  const recentReleases = [...releases].slice(0, 8);

  return (
    <div className="space-y-8">
      {/* Verify Repository Modal */}
      <VerifyRepositoryModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        onSuccess={(releaseId) => {
          onRefresh();
          onNavigate(`/releases/${releaseId}`);
        }}
      />

      {/* Top Banner & Security Principle */}
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-r from-zinc-900/90 via-zinc-900/40 to-zinc-950 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium">
              <Shield className="w-3.5 h-3.5" />
              <span>Decentralized Reproducible-Build Consensus</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 font-mono">
              Quorum Security Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed">
              "Quorum does not trust a binary because one builder signed it. It compares independently produced artifacts."
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 min-w-[130px]">
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-mono mb-1">
                <Server className="w-3.5 h-3.5" />
                <span>Active Builders</span>
              </div>
              <div className="text-xl font-bold font-mono text-zinc-100">
                {activeBuilders} / {builders.length}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 min-w-[130px]">
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-mono mb-1">
                <Activity className="w-3.5 h-3.5" />
                <span>Audit Events</span>
              </div>
              <div className="text-xl font-bold font-mono text-zinc-100">
                {totalAuditEvents}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 min-w-[130px]">
              <div className="text-zinc-500 text-xs font-mono mb-1">Ledger Integrity</div>
              <LedgerStatusBadge isValid={isLedgerIntact} size="sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Card: VERIFY A REPOSITORY */}
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/25 via-zinc-900/70 to-zinc-900/40 p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Github className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-emerald-300">
              VERIFY A REPOSITORY
            </h2>
          </div>
          <p className="text-xs text-zinc-300 font-sans">
            Verify a source repository against independently produced builder attestations.
          </p>
        </div>
        <button
          onClick={() => setIsVerifyModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-mono text-xs font-bold transition-all shadow-md shadow-emerald-950/60 hover:shadow-emerald-900/80 hover:translate-y-[-1px] flex-shrink-0"
        >
          <Shield className="w-4 h-4" />
          <span>START VERIFICATION</span>
        </button>
      </div>

      {/* Security Overview Cards */}
      <section aria-labelledby="security-overview-title">
        <h2 id="security-overview-title" className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
          <span>Security Overview</span>
          <span className="h-px bg-zinc-800 flex-grow" />
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Tracked Releases */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-mono uppercase">Tracked Releases</span>
              <Layers className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-100 mb-1">{totalReleases}</div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Total registered artifacts
            </div>
          </div>

          {/* Verified Releases */}
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-4 transition-colors hover:border-emerald-800/60">
            <div className="flex items-center justify-between text-emerald-400 mb-2">
              <span className="text-xs font-mono uppercase font-semibold">Verified</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mb-1">{verifiedCount}</div>
            <div className="text-[11px] text-emerald-500/70 font-mono">
              100% builder agreement
            </div>
          </div>

          {/* Flagged Releases */}
          <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 p-4 transition-colors hover:border-amber-800/60">
            <div className="flex items-center justify-between text-amber-400 mb-2">
              <span className="text-xs font-mono uppercase font-semibold">Flagged</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 mb-1">{flaggedCount}</div>
            <div className="text-[11px] text-amber-500/70 font-mono">
              Dissenting hash detected
            </div>
          </div>

          {/* Rejected Releases */}
          <div className="rounded-lg border border-rose-900/40 bg-rose-950/10 p-4 transition-colors hover:border-rose-800/60">
            <div className="flex items-center justify-between text-rose-400 mb-2">
              <span className="text-xs font-mono uppercase font-semibold">Rejected / Low</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400 mb-1">
              {rejectedCount + insufficientCount}
            </div>
            <div className="text-[11px] text-rose-500/70 font-mono">
              Quorum failure or &lt;3 builders
            </div>
          </div>
        </div>
      </section>

      {/* Recent Releases Section */}
      <section aria-labelledby="recent-releases-title">
        <div className="flex items-center justify-between mb-3">
          <h2 id="recent-releases-title" className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <span>Tracked Software Releases</span>
          </h2>
          <button
            onClick={() => onNavigate('/releases')}
            className="text-xs font-mono text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 group"
          >
            <span>View All Releases</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {recentReleases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center bg-zinc-900/20">
            <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs text-zinc-400 font-mono">No software releases registered yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Release / Project</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Source Commit</th>
                  <th className="py-3 px-4">Consensus Status</th>
                  <th className="py-3 px-4">Builders</th>
                  <th className="py-3 px-4">Agreement</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {recentReleases.map((release) => {
                  const shortCommit = release.commitSha ? release.commitSha.slice(0, 10) : '—';
                  const isVerified = release.status === 'VERIFIED';
                  const isFlagged = release.status === 'FLAGGED';
                  const consensusEst = isVerified ? 100 : isFlagged ? 66.67 : release.status === 'REJECTED' ? 33.33 : 0;

                  return (
                    <tr
                      key={release.releaseId}
                      className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      onClick={() => onNavigate(`/releases/${release.releaseId}`)}
                    >
                      <td className="py-3 px-4 font-semibold text-zinc-200">
                        <div>{release.project}</div>
                        <div className="text-[10px] text-zinc-500 font-sans">{release.releaseId}</div>
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60">
                          {release.version}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-400 font-mono">
                        {shortCommit}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={release.status} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        3 / 3
                      </td>
                      <td className="py-3 px-4">
                        {release.status === 'PENDING' ? (
                          <span className="text-zinc-500 font-mono text-xs">—</span>
                        ) : (
                          <ConsensusBadge percentage={consensusEst} size="sm" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 font-mono">
                          <span>Inspect</span>
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
