import React from 'react';
import { LedgerEntryDto } from '../types/api.types.js';
import { GitCommit, ShieldCheck, CheckCircle2, RefreshCw, Hash } from 'lucide-react';

interface SecurityTimelineProps {
  entries: LedgerEntryDto[];
}

export const SecurityTimeline: React.FC<SecurityTimelineProps> = ({ entries }) => {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-xs text-zinc-500 font-mono py-4">
        No cryptographic audit events recorded for this release yet.
      </div>
    );
  }

  // Sort chronological by sequence
  const sortedEntries = [...entries].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
      {sortedEntries.map((entry) => {
        let icon = Hash;
        let eventColor = 'bg-zinc-800 text-zinc-300 border-zinc-700';

        switch (entry.event_type) {
          case 'RELEASE_CREATED':
            icon = GitCommit;
            eventColor = 'bg-blue-950/60 text-blue-400 border-blue-600/40';
            break;
          case 'ATTESTATION_VERIFIED':
            icon = CheckCircle2;
            eventColor = 'bg-emerald-950/60 text-emerald-400 border-emerald-600/40';
            break;
          case 'QUORUM_EVALUATED':
            icon = ShieldCheck;
            eventColor = 'bg-purple-950/60 text-purple-400 border-purple-600/40';
            break;
          case 'RELEASE_STATUS_CHANGED':
            icon = RefreshCw;
            eventColor = 'bg-amber-950/60 text-amber-400 border-amber-600/40';
            break;
        }

        const IconComponent = icon;

        let parsedPayload: any = null;
        if (entry.payload_json) {
          try {
            parsedPayload = JSON.parse(entry.payload_json);
          } catch {
            // fallback
          }
        }

        return (
          <div key={entry.id || entry.sequence} className="relative group">
            {/* Timeline node dot */}
            <div className="absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-zinc-700 group-hover:border-emerald-500 transition-colors" />

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3.5 hover:border-zinc-700 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${eventColor}`}
                  >
                    <IconComponent className="w-3 h-3" />
                    <span>{entry.event_type}</span>
                  </span>
                  <span className="text-xs font-mono text-zinc-500">
                    {`Seq #${entry.sequence}`}
                  </span>
                </div>
                <time className="text-[11px] font-mono text-zinc-500">
                  {new Date(entry.timestamp).toLocaleString()}
                </time>
              </div>

              {/* Payload Details */}
              {parsedPayload && (
                <div className="mt-2 text-xs font-mono text-zinc-400 bg-zinc-950/60 rounded p-2 border border-zinc-900 overflow-x-auto">
                  {entry.event_type === 'RELEASE_STATUS_CHANGED' && (
                    <div className="flex items-center gap-2">
                      <span>Status transition:</span>
                      <span className="text-zinc-500">{parsedPayload.previousStatus}</span>
                      <span>&rarr;</span>
                      <span className="text-emerald-400 font-bold">{parsedPayload.newStatus}</span>
                    </div>
                  )}
                  {entry.event_type === 'ATTESTATION_VERIFIED' && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>Builder: <span className="text-zinc-200">{parsedPayload.builderId}</span></span>
                      <span>Status: <span className={parsedPayload.status === 'VALID' ? 'text-emerald-400' : 'text-rose-400'}>{parsedPayload.status}</span></span>
                      <span>Signature: <span className={parsedPayload.signatureValid ? 'text-emerald-400' : 'text-rose-400'}>{parsedPayload.signatureValid ? 'VALID' : 'INVALID'}</span></span>
                    </div>
                  )}
                  {entry.event_type === 'QUORUM_EVALUATED' && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>Decision: <span className="text-emerald-400 font-bold">{parsedPayload.status}</span></span>
                      <span>Consensus: <span className="text-zinc-200">{parsedPayload.consensusPercentage}%</span></span>
                      <span>Valid: <span className="text-zinc-200">{parsedPayload.validAttestations}</span></span>
                      <span>Dissent: <span className={parsedPayload.disagreementDetected ? 'text-amber-400 font-semibold' : 'text-zinc-400'}>{parsedPayload.disagreementDetected ? 'YES' : 'NO'}</span></span>
                    </div>
                  )}
                  {entry.event_type === 'RELEASE_CREATED' && (
                    <div>
                      <span>Registered intent for {parsedPayload.projectName} v{parsedPayload.version} ({parsedPayload.commitSha?.slice(0, 10)})</span>
                    </div>
                  )}
                </div>
              )}

              {/* Hashes info */}
              <div className="mt-2 pt-2 border-t border-zinc-800/40 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>Hash: {entry.current_hash ? `${entry.current_hash.slice(0, 12)}...` : '—'}</span>
                <span>Prev: {entry.previous_hash ? `${entry.previous_hash.slice(0, 12)}...` : 'None (Genesis)'}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
