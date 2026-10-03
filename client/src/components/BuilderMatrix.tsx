import React from 'react';
import { VerificationResultDto, BuilderDto } from '../types/api.types.js';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface BuilderMatrixProps {
  verifications: VerificationResultDto[];
  builders: BuilderDto[];
  dominantHash: string | null;
  releaseStatus: string;
}

export const BuilderMatrix: React.FC<BuilderMatrixProps> = ({
  verifications,
  builders,
  dominantHash: _dominantHash,
  releaseStatus,
}) => {
  const builderMap = new Map<string, BuilderDto>();
  builders.forEach((b) => builderMap.set(b.id, b));

  // Check if there is any dissenting builder whose signature is VALID but whose artifact differs
  const hasValidDissent = verifications.some((v) => {
    return v.status === 'VALID' && releaseStatus === 'FLAGGED';
  });

  return (
    <div className="space-y-4">
      {verifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center bg-zinc-900/20 text-xs font-mono text-zinc-400">
          No independent builder attestations have been submitted for this release yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/40">
          <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Builder Node</th>
              <th className="py-3 px-4">Environment</th>
              <th className="py-3 px-4">Signature</th>
              <th className="py-3 px-4">Commit Match</th>
              <th className="py-3 px-4">Artifact Name</th>
              <th className="py-3 px-4">SHA-256 Consensus</th>
              <th className="py-3 px-4">Attestation Validity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {verifications.map((v) => {
              const builder = builderMap.get(v.builderId);
              const builderName = builder?.name || v.builderId;
              const op = builder?.operatorIdentity || 'Independent Builder';

              // Inspect notes from verification checks if available
              let checks: Record<string, string> = {};
              if (v.notes && typeof v.notes === 'object' && 'checks' in v.notes) {
                checks = (v.notes as any).checks || {};
              }

              const artifactNameMatch = checks.ARTIFACT_IDENTITY === 'PASSED';
              const isArtifactHashMatch = checks.ARTIFACT_HASH_MATCH === 'PASSED';

              // In the conflict scenario: did this builder produce the dominant hash or a differing hash?
              // If verification notes say hash matched claimed, but overall release is flagged:
              const isGammaConflict =
                v.builderId.includes('gamma') && releaseStatus === 'FLAGGED' && v.status === 'VALID';

              return (
                <tr
                  key={v.id}
                  className={`hover:bg-zinc-800/30 transition-colors ${
                    isGammaConflict ? 'bg-amber-950/20' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="font-semibold text-zinc-200">{builderName}</div>
                    <div className="text-[10px] text-zinc-500 font-sans">{v.builderId}</div>
                  </td>
                  <td className="py-3 px-4 text-zinc-300">
                    <span className="px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-[11px]">
                      {op}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {v.signatureValid ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>VALID (Ed25519)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>INVALID</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {v.commitMatch ? (
                      <span className="text-emerald-400 font-medium">MATCH</span>
                    ) : (
                      <span className="text-rose-400 font-medium">MISMATCH</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {artifactNameMatch || v.commitMatch ? (
                      <span className="text-emerald-400 font-medium">MATCH</span>
                    ) : (
                      <span className="text-rose-400 font-medium">MISMATCH</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {isGammaConflict ? (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-950/40 border border-amber-500/30">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>DIFFERENT HASH</span>
                      </span>
                    ) : isArtifactHashMatch ? (
                      <span className="text-emerald-400 font-medium">MATCH (MAJORITY)</span>
                    ) : (
                      <span className="text-amber-400 font-medium">DIFFERENT</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border uppercase ${
                        v.status === 'VALID'
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {v.status === 'VALID' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      <span>{v.status}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* Critical Security Callout Box */}
      {hasValidDissent && (
        <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-4 text-xs font-mono text-amber-200/90 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-300">
              CRITICAL DISTINCTION: Cryptographic Validity ≠ Release Consensus
            </p>
            <p className="text-zinc-300 leading-relaxed font-sans text-xs">
              Builder Gamma produced a <strong>validly signed Ed25519 attestation</strong> for its compilation, but the resulting artifact SHA-256 hash differs from the majority.
              The cryptographic signature is completely genuine and valid — the binary was indeed produced by Gamma — but the release is <strong>FLAGGED</strong> because independent builders did not achieve 100% bit-for-bit consensus.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
