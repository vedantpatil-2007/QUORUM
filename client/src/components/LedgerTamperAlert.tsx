import React from 'react';
import { AlertOctagon, ShieldAlert } from 'lucide-react';
import { LedgerVerifyDto } from '../types/api.types.js';

interface LedgerTamperAlertProps {
  verification: LedgerVerifyDto | null;
}

export const LedgerTamperAlert: React.FC<LedgerTamperAlertProps> = ({ verification }) => {
  if (!verification || verification.valid) {
    return null;
  }

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="rounded-lg border-2 border-rose-600 bg-rose-950/70 p-5 my-4 text-rose-100 shadow-xl shadow-rose-950/40 animate-pulse"
    >
      <div className="flex items-start gap-4">
        <div className="p-3 bg-rose-900/60 rounded-lg border border-rose-500/60 flex-shrink-0">
          <AlertOctagon className="w-8 h-8 text-rose-300" />
        </div>
        <div className="space-y-2 flex-grow">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h2 className="text-lg font-black tracking-wider text-rose-200 uppercase font-mono">
              LEDGER INTEGRITY FAILURE
            </h2>
          </div>
          <p className="text-xs font-mono text-rose-200/90 leading-relaxed">
            The cryptographic hash chain of the Quorum audit ledger has been broken.
            Unauthorized modification, deletion, or tampering has been detected in the persistence layer.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 font-mono text-xs">
            <div className="rounded bg-rose-900/40 p-2.5 border border-rose-700/50">
              <span className="text-[10px] text-rose-300/70 block uppercase">Broken Sequence</span>
              <span className="text-sm font-bold text-rose-100">
                {`#${verification.firstInvalidSequence ?? 'Unknown'}`}
              </span>
            </div>
            <div className="rounded bg-rose-900/40 p-2.5 border border-rose-700/50">
              <span className="text-[10px] text-rose-300/70 block uppercase">Verified Entries</span>
              <span className="text-sm font-bold text-rose-100">{verification.verifiedEntries}</span>
            </div>
            <div className="rounded bg-rose-900/40 p-2.5 border border-rose-700/50">
              <span className="text-[10px] text-rose-300/70 block uppercase">Total Entries</span>
              <span className="text-sm font-bold text-rose-100">{verification.totalEntries}</span>
            </div>
            <div className="rounded bg-rose-900/40 p-2.5 border border-rose-700/50">
              <span className="text-[10px] text-rose-300/70 block uppercase">Verification Time</span>
              <span className="text-xs text-rose-200">
                {new Date(verification.verifiedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {verification.error && (
            <div className="rounded bg-black/40 p-3 border border-rose-800 font-mono text-xs text-rose-300 mt-2">
              <span className="font-bold text-rose-400">Cryptographic Error: </span>
              {verification.error}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
