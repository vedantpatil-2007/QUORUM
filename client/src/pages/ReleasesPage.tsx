import React from 'react';
import { ReleaseDto } from '../types/api.types.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ConsensusBadge } from '../components/ConsensusBadge.js';
import { VerifyRepositoryModal } from '../components/VerifyRepositoryModal.js';
import {
  Search,
  ArrowRight,
  Layers,
  Copy,
  Check,
  Github,
} from 'lucide-react';

interface ReleasesPageProps {
  releases: ReleaseDto[];
  onNavigate: (path: string) => void;
  onRefresh?: () => void;
}

export const ReleasesPage: React.FC<ReleasesPageProps> = ({ releases, onNavigate, onRefresh }) => {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [isVerifyModalOpen, setIsVerifyModalOpen] = React.useState(false);
  const [tableCopiedSha, setTableCopiedSha] = React.useState<string | null>(null);

  const handleTableCopy = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setTableCopiedSha(id);
    setTimeout(() => setTableCopiedSha(null), 2000);
  };

  const filteredReleases = releases.filter((r) => {
    const matchesSearch =
      r.project.toLowerCase().includes(search.toLowerCase()) ||
      r.releaseId.toLowerCase().includes(search.toLowerCase()) ||
      r.commitSha.toLowerCase().includes(search.toLowerCase()) ||
      r.version.toLowerCase().includes(search.toLowerCase()) ||
      (r.expectedHash && r.expectedHash.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' || r.status.toUpperCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Verify Repository Modal */}
      <VerifyRepositoryModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        onSuccess={(releaseId) => {
          if (onRefresh) onRefresh();
          onNavigate(`/releases/${releaseId}`);
        }}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>Release Registry</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
            Tracked Releases
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            All registered software releases evaluated against independent builder attestations.
          </p>
        </div>

        {/* Action & Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsVerifyModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-mono text-xs font-bold transition-all shadow-md shadow-emerald-950/50 hover:shadow-emerald-900/80"
          >
            <Github className="w-3.5 h-3.5" />
            <span>Verify a Repository</span>
          </button>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search release, commit, or SHA..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="FLAGGED">Flagged</option>
            <option value="REJECTED">Rejected</option>
            <option value="INSUFFICIENT_EVIDENCE">Insufficient Evidence</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
      </div>

      {/* Releases Table */}
      {filteredReleases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-12 text-center bg-zinc-900/20 space-y-3">
          <p className="text-xs text-zinc-400 font-mono">No releases recorded yet.</p>
          <button
            onClick={() => setIsVerifyModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 font-mono text-xs font-semibold transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            <span>Verify the first repository</span>
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Release ID / Project</th>
                <th className="py-3 px-4">Version</th>
                <th className="py-3 px-4">Expected Artifact</th>
                <th className="py-3 px-4">Authoritative SHA-256</th>
                <th className="py-3 px-4">Quorum Status</th>
                <th className="py-3 px-4">Agreement</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredReleases.map((release) => {
                const isVerified = release.status === 'VERIFIED';
                const isFlagged = release.status === 'FLAGGED';
                const consensusEst = isVerified ? 100 : isFlagged ? 66.67 : release.status === 'REJECTED' ? 33.33 : 0;
                const hashDisplay = release.expectedHash
                  ? `${release.expectedHash.slice(0, 8)}...${release.expectedHash.slice(-6)}`
                  : '—';

                return (
                  <tr
                    key={release.releaseId}
                    className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    onClick={() => onNavigate(`/releases/${release.releaseId}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-200">{release.project}</div>
                      <div className="text-[10px] text-zinc-500 font-sans">{release.releaseId}</div>
                    </td>
                    <td className="py-3 px-4 text-zinc-300">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60">
                        {release.version}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-[11px]">
                      {release.expectedArtifactName}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                      {release.expectedHash ? (
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-emerald-400/90" title={release.expectedHash}>
                            {hashDisplay}
                          </span>
                          <button
                            onClick={(e) => handleTableCopy(release.releaseId, release.expectedHash!, e)}
                            className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                            title="Copy full SHA-256"
                          >
                            {tableCopiedSha === release.releaseId ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={release.status} size="sm" />
                    </td>
                    <td className="py-3 px-4">
                      {release.status === 'PENDING' ? (
                        <span className="text-zinc-500 font-mono text-xs">—</span>
                      ) : (
                        <ConsensusBadge percentage={consensusEst} size="sm" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
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
    </div>
  );
};
