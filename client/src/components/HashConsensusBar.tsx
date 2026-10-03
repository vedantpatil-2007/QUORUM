import React from 'react';
import { HashGroupDto } from '../types/api.types.js';
import { Layers, Copy, Check } from 'lucide-react';

interface HashConsensusBarProps {
  hashGroups: HashGroupDto[];
  dominantHash: string | null;
  threshold?: number;
}

export const HashConsensusBar: React.FC<HashConsensusBarProps> = ({
  hashGroups,
  dominantHash,
  threshold = 66.67,
}) => {
  const [copiedHash, setCopiedHash] = React.useState<string | null>(null);

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  if (!hashGroups || hashGroups.length === 0) {
    return (
      <div className="text-xs text-zinc-500 font-mono py-2">
        No artifact hash groups available for this release.
      </div>
    );
  }

  // Sort groups: dominant first, then by count descending
  const sortedGroups = [...hashGroups].sort((a, b) => {
    if (a.artifactSha256 === dominantHash) return -1;
    if (b.artifactSha256 === dominantHash) return 1;
    return b.count - a.count;
  });

  return (
    <div className="space-y-4">
      {/* Overall Progress Distribution Bar */}
      <div className="h-3 w-full rounded-full bg-zinc-800 flex overflow-hidden border border-zinc-700/60 p-0.5">
        {sortedGroups.map((group, idx) => {
          const isDominant = group.artifactSha256 === dominantHash;
          const meetsThreshold = group.percentage >= threshold;
          let barBg = 'bg-rose-500';
          if (isDominant && meetsThreshold) {
            barBg = 'bg-emerald-500';
          } else if (isDominant) {
            barBg = 'bg-amber-500';
          }

          return (
            <div
              key={group.artifactSha256 || idx}
              style={{ width: `${Math.max(group.percentage, 2)}%` }}
              className={`h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full ${barBg} ${
                idx > 0 ? 'border-l border-zinc-950' : ''
              }`}
              title={`${isDominant ? 'Dominant Hash' : 'Divergent Hash'}: ${group.percentage}% (${group.count} builder${group.count > 1 ? 's' : ''})`}
            />
          );
        })}
      </div>

      {/* Hash Group Cards */}
      <div className="space-y-3">
        {sortedGroups.map((group, idx) => {
          const isDominant = group.artifactSha256 === dominantHash;
          const meetsThreshold = group.percentage >= threshold;
          const shortHash = `${group.artifactSha256.slice(0, 14)}...${group.artifactSha256.slice(-10)}`;

          let statusTag = {
            text: 'DISSENTING HASH',
            badgeBg: 'bg-rose-950/40 text-rose-400 border-rose-500/40',
            borderClass: 'border-rose-900/40 bg-rose-950/10',
          };

          if (isDominant) {
            if (meetsThreshold) {
              statusTag = {
                text: 'DOMINANT HASH (QUORUM REACHED)',
                badgeBg: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40',
                borderClass: 'border-emerald-900/40 bg-emerald-950/10',
              };
            } else {
              statusTag = {
                text: 'DOMINANT HASH (BELOW THRESHOLD)',
                badgeBg: 'bg-amber-950/40 text-amber-400 border-amber-500/40',
                borderClass: 'border-amber-900/40 bg-amber-950/10',
              };
            }
          }

          return (
            <div
              key={group.artifactSha256 || idx}
              className={`rounded-lg border p-3.5 transition-colors ${statusTag.borderClass}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${statusTag.badgeBg}`}
                  >
                    {statusTag.text}
                  </span>
                  <div className="flex items-center gap-1 font-mono text-xs text-zinc-300">
                    <Layers className="w-3.5 h-3.5 text-zinc-500" />
                    <span title={group.artifactSha256}>{shortHash}</span>
                    <button
                      onClick={() => handleCopy(group.artifactSha256)}
                      className="p-1 hover:text-white transition-colors text-zinc-500 rounded"
                      title="Copy full SHA-256 hash"
                      aria-label="Copy full SHA-256 hash"
                    >
                      {copiedHash === group.artifactSha256 ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 font-mono">
                    {group.count} builder{group.count > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-mono font-bold text-zinc-100">
                    {group.percentage.toFixed(group.percentage % 1 === 0 ? 0 : 2)}%
                  </span>
                </div>
              </div>

              {/* Builder Membership Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-zinc-500 font-mono mr-1">Produced by:</span>
                {group.builderIds.map((bId) => (
                  <span
                    key={bId}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-300"
                  >
                    {bId}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
