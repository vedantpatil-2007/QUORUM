import React from 'react';
import { LedgerEntryDto, LedgerVerifyDto } from '../types/api.types.js';
import { api } from '../services/api.js';
import { LedgerStatusBadge } from '../components/LedgerStatusBadge.js';
import { LedgerTamperAlert } from '../components/LedgerTamperAlert.js';
import {
  Database,
  RefreshCw,
  Eye,
  X,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

function formatHash(hash: string | null | undefined, isPrevious = false): string {
  if (hash === null || hash === undefined || hash === '') {
    return isPrevious ? 'GENESIS (null)' : '—';
  }
  const str = String(hash);
  if (str.length <= 16) {
    return str;
  }
  return `${str.slice(0, 10)}...${str.slice(-6)}`;
}

interface AuditLedgerPageProps {
  entries: LedgerEntryDto[];
  ledgerVerify: LedgerVerifyDto | null;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
}

export const AuditLedgerPage: React.FC<AuditLedgerPageProps> = ({
  entries,
  ledgerVerify,
  onRefresh,
  onNavigate,
}) => {
  const [selectedEntry, setSelectedEntry] = React.useState<LedgerEntryDto | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [liveVerify, setLiveVerify] = React.useState<LedgerVerifyDto | null>(ledgerVerify);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  // Sync state if prop changes
  React.useEffect(() => {
    setLiveVerify(ledgerVerify);
  }, [ledgerVerify]);

  const handleVerifyChain = async () => {
    if (verifying) return;
    try {
      setVerifying(true);
      setVerifyError(null);
      const res = await api.verifyLedger();
      setLiveVerify(res);
      onRefresh();
    } catch {
      setVerifyError('Ledger verification failed. Check that the API server is running.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopy = (field: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isIntact = liveVerify ? liveVerify.valid : true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono mb-1">
            <Database className="w-3.5 h-3.5" />
            <span>Cryptographic Proof Engine</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
            Tamper-Evident Audit Ledger
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Chronological, cryptographically linked hash chain recording all release security transitions.
          </p>
        </div>

        {/* Live Verify Button */}
        <div>
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-mono text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{verifying ? 'Verifying...' : 'Verify Ledger Integrity'}</span>
          </button>
          {liveVerify && (
            <p className="text-[11px] font-mono text-zinc-500 mt-1 text-right">
              Last verified: {liveVerify.verifiedAt ? new Date(liveVerify.verifiedAt).toLocaleString() : '—'} —{' '}
              <span className={liveVerify.valid ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {liveVerify.valid ? 'Chain Intact' : 'TAMPERED'}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Verification Result Banner */}
      {liveVerify && liveVerify.valid && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-5 font-mono text-xs text-emerald-200 space-y-2 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>LEDGER INTEGRITY VERIFIED</span>
            </div>
            <span className="text-[11px] text-zinc-400">
              Last verified: {liveVerify.verifiedAt ? new Date(liveVerify.verifiedAt).toLocaleString() : '—'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1 text-zinc-300 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span>✓ Chain intact</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span>✓ All entries cryptographically verified</span>
            </div>
            <div>
              <span className="text-zinc-400">Entries: </span>
              <strong className="text-zinc-100">{liveVerify.verifiedEntries} / {liveVerify.totalEntries}</strong>
            </div>
            <div>
              <span className="text-zinc-400">First invalid sequence: </span>
              <strong className="text-emerald-400">None</strong>
            </div>
          </div>
        </div>
      )}

      {liveVerify && !liveVerify.valid && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-5 font-mono text-xs text-rose-200 space-y-2 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-rose-500/20 pb-2">
            <div className="flex items-center gap-2 text-sm font-bold text-rose-300">
              <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>LEDGER INTEGRITY FAILURE (TAMPERED)</span>
            </div>
            <span className="text-[11px] text-zinc-400">
              Last verified: {liveVerify.verifiedAt ? new Date(liveVerify.verifiedAt).toLocaleString() : '—'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-zinc-300 text-xs">
            <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
              <span>✕ Chain integrity violation detected</span>
            </div>
            <div>
              <span className="text-zinc-400">Verified entries: </span>
              <strong className="text-zinc-100">{liveVerify.verifiedEntries} / {liveVerify.totalEntries}</strong>
            </div>
            <div>
              <span className="text-zinc-400">First invalid sequence: </span>
              <strong className="text-rose-400 font-bold">#{liveVerify.firstInvalidSequence}</strong>
            </div>
          </div>
          {liveVerify.error && (
            <div className="text-[11px] text-rose-300/90 pt-1 border-t border-rose-800/40">
              <span className="font-semibold text-rose-400">Violation: </span>
              <span>{liveVerify.error}</span>
            </div>
          )}
        </div>
      )}

      {verifyError && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 font-mono text-xs text-rose-200 flex items-center justify-between shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{verifyError}</span>
          </div>
          <button
            onClick={() => setVerifyError(null)}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tamper Alert (If broken) */}
      <LedgerTamperAlert verification={liveVerify} />

      {/* Ledger Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">Chain Status</span>
          <div className="my-1">
            <LedgerStatusBadge isValid={isIntact} size="md" />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            {isIntact ? 'Genesis to tip unbroken' : 'Hash mismatch detected!'}
          </span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">Total Entries</span>
          <div className="text-2xl font-bold font-mono text-zinc-100 my-1">
            {liveVerify?.totalEntries ?? entries.length}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            Recorded security events
          </span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">Verified Entries</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 my-1">
            {liveVerify?.verifiedEntries ?? entries.length}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            Cryptographically re-computed
          </span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">First Invalid Sequence</span>
          <div className={`text-2xl font-bold font-mono my-1 ${liveVerify?.firstInvalidSequence ? 'text-rose-400' : 'text-zinc-400'}`}>
            {liveVerify?.firstInvalidSequence ? `#${liveVerify.firstInvalidSequence}` : 'None'}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            {liveVerify?.firstInvalidSequence ? 'Point of tampering' : 'Clean verification'}
          </span>
        </div>
      </div>

      {/* Ledger Chain Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Seq</th>
              <th className="py-3 px-4">Event Type</th>
              <th className="py-3 px-4">Associated Release</th>
              <th className="py-3 px-4">Previous Hash</th>
              <th className="py-3 px-4">Current Block Hash</th>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4 text-right">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {entries.map((entry, idx) => {
              const seq = entry.sequence ?? idx + 1;
              const isInvalidSeq = liveVerify && liveVerify.firstInvalidSequence === seq;
              const relId = entry.release_id ?? (entry as any).releaseId ?? null;
              const prevHash = entry.previous_hash ?? (entry as any).previousHash ?? null;
              const currHash = entry.current_hash ?? (entry as any).currentHash ?? null;

              return (
                <tr
                  key={seq}
                  className={`hover:bg-zinc-800/30 transition-colors cursor-pointer ${
                    isInvalidSeq ? 'bg-rose-950/40 border-l-4 border-l-rose-500' : ''
                  }`}
                  onClick={() => setSelectedEntry(entry)}
                >
                  <td className="py-3 px-4 font-bold text-zinc-300">
                    {`#${seq}`}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-zinc-800 text-zinc-200 border border-zinc-700">
                      {entry.event_type ?? (entry as any).eventType ?? 'EVENT'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-zinc-400">
                    {relId ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate(`/releases/${relId}`);
                        }}
                        className="text-emerald-400 hover:underline hover:text-emerald-300"
                      >
                        {relId}
                      </button>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                    {formatHash(prevHash, true)}
                  </td>
                  <td className="py-3 px-4 text-emerald-400/90 font-mono text-[11px]">
                    {formatHash(currHash, false)}
                  </td>
                  <td className="py-3 px-4 text-zinc-500 text-[11px]">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntry(entry);
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1 font-mono"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Raw Entry Inspector Modal */}
      {selectedEntry && (() => {
        const currHash = selectedEntry.current_hash ?? (selectedEntry as any).currentHash ?? null;
        const prevHash = selectedEntry.previous_hash ?? (selectedEntry as any).previousHash ?? null;
        const payloadHash = selectedEntry.payload_hash ?? (selectedEntry as any).payloadHash ?? null;
        const payloadJson = selectedEntry.payload_json ?? (selectedEntry as any).payloadJson ?? null;
        const seq = selectedEntry.sequence != null ? `#${selectedEntry.sequence}` : '—';
        const eventType = selectedEntry.event_type ?? (selectedEntry as any).eventType ?? 'EVENT';
        const timestampStr = selectedEntry.timestamp ? new Date(selectedEntry.timestamp).toISOString() : '—';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold font-mono text-zinc-100">
                    Ledger Entry {seq}: {eventType}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">Sequence Number</span>
                    <span className="text-zinc-200 font-bold">{seq}</span>
                  </div>
                  <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">Timestamp</span>
                    <span className="text-zinc-200">{timestampStr}</span>
                  </div>
                </div>

                {/* Hashes */}
                <div className="space-y-2">
                  <div className="rounded bg-zinc-900/70 p-2.5 border border-zinc-800">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase mb-1">
                      <span>Current Hash (H_k = SHA-256(Seq || PrevHash || PayloadHash))</span>
                      {currHash && (
                        <button
                          onClick={() => handleCopy('current', currHash)}
                          className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                        >
                          {copiedField === 'current' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      )}
                    </div>
                    <div className="text-emerald-400 break-all select-all">{currHash ?? '—'}</div>
                  </div>

                  <div className="rounded bg-zinc-900/70 p-2.5 border border-zinc-800">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase mb-1">
                      <span>Previous Hash (H_{'{k-1}'})</span>
                      {prevHash && (
                        <button
                          onClick={() => handleCopy('prev', prevHash)}
                          className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                        >
                          {copiedField === 'prev' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      )}
                    </div>
                    <div className="text-zinc-300 break-all select-all">
                      {prevHash ?? 'GENESIS (null — First Block in Chain)'}
                    </div>
                  </div>

                  <div className="rounded bg-zinc-900/70 p-2.5 border border-zinc-800">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase mb-1">
                      <span>Payload Hash (SHA-256(canonical(payload)))</span>
                      {payloadHash && (
                        <button
                          onClick={() => handleCopy('payload', payloadHash)}
                          className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                        >
                          {copiedField === 'payload' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      )}
                    </div>
                    <div className="text-zinc-300 break-all select-all">{payloadHash ?? '—'}</div>
                  </div>
                </div>

                {/* Raw JSON Payload */}
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block mb-1">Payload JSON</span>
                  <pre className="rounded-lg bg-zinc-900 p-3 font-mono text-[11px] text-zinc-200 border border-zinc-800 overflow-x-auto max-h-48">
                    {(() => {
                      if (!payloadJson) return 'null';
                      try {
                        return JSON.stringify(typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson, null, 2);
                      } catch {
                        return String(payloadJson);
                      }
                    })()}
                  </pre>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
