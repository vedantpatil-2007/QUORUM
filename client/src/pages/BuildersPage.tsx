import React from 'react';
import { BuilderDto } from '../types/api.types.js';
import { BuilderStatusBadge } from '../components/BuilderStatusBadge.js';
import { Server, Key, Shield, Globe, Check, Copy, X } from 'lucide-react';

interface BuildersPageProps {
  builders: BuilderDto[];
}

export const BuildersPage: React.FC<BuildersPageProps> = ({ builders }) => {
  const [selectedBuilder, setSelectedBuilder] = React.useState<BuilderDto | null>(null);
  const [copiedKey, setCopiedKey] = React.useState(false);

  const handleCopyKey = (keyPem: string) => {
    navigator.clipboard.writeText(keyPem);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono mb-1">
          <Server className="w-3.5 h-3.5" />
          <span>Independent Builder Network</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
          Registered Builder Nodes
        </h1>
        <p className="text-xs text-zinc-400 font-sans mt-1">
          Independent nodes participating in reproducible build compilation and cryptographic attestation generation.
        </p>
      </div>

      {/* Builders Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Builder Node</th>
              <th className="py-3 px-4">Operator / Region</th>
              <th className="py-3 px-4">Key Type</th>
              <th className="py-3 px-4">Public Key Fingerprint</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Registered</th>
              <th className="py-3 px-4 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {builders.map((builder) => {
              // Extract fingerprint or preview of public key
              const keyLines = builder.publicKey.split('\n').filter(Boolean);
              const keyBody = keyLines.find((l) => !l.startsWith('---')) || 'ED25519_KEY';
              const fingerprint = `${keyBody.slice(0, 12)}...${keyBody.slice(-8)}`;

              return (
                <tr
                  key={builder.id}
                  className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedBuilder(builder)}
                >
                  <td className="py-3 px-4">
                    <div className="font-semibold text-zinc-200">{builder.name}</div>
                    <div className="text-[10px] text-zinc-500 font-sans">{builder.id}</div>
                  </td>
                  <td className="py-3 px-4 text-zinc-300">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-[11px]">
                      <Globe className="w-3 h-3 text-zinc-500" />
                      <span>{builder.operatorIdentity}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-zinc-400">
                    <span className="text-[11px] font-semibold text-emerald-400 uppercase">
                      {(builder.keyType || 'ed25519').toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-zinc-400">
                    <div className="flex items-center gap-1 font-mono text-[11px]">
                      <Key className="w-3 h-3 text-zinc-500" />
                      <span>{fingerprint}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <BuilderStatusBadge status={builder.status} />
                  </td>
                  <td className="py-3 px-4 text-zinc-500 text-[11px]">
                    {new Date(builder.registeredAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBuilder(builder);
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-mono"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Builder Details Modal / Drawer */}
      {selectedBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold font-mono text-zinc-100">
                  Builder Identity: {selectedBuilder.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedBuilder(null)}
                className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800"
                aria-label="Close details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Builder ID</span>
                <span className="text-zinc-200 font-semibold">{selectedBuilder.id}</span>
              </div>
              <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Operator / Host</span>
                <span className="text-zinc-200 font-semibold">{selectedBuilder.operatorIdentity}</span>
              </div>
              <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Algorithm</span>
                <span className="text-emerald-400 font-bold uppercase">{selectedBuilder.keyType} (Ed25519)</span>
              </div>
              <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Status</span>
                <div className="mt-1">
                  <BuilderStatusBadge status={selectedBuilder.status} />
                </div>
              </div>
            </div>

            {/* Public Key Card */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-1.5">
                <span className="font-semibold text-zinc-300">Registered Public Key (PEM)</span>
                <button
                  onClick={() => handleCopyKey(selectedBuilder.publicKey)}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
                >
                  {copiedKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
              <pre className="rounded-lg bg-zinc-900 p-3 font-mono text-[11px] text-emerald-400/90 border border-zinc-800 overflow-x-auto select-all max-h-36">
                {selectedBuilder.publicKey}
              </pre>
              <p className="text-[10px] font-mono text-zinc-500 mt-1">
                * Note: Private signing keys are kept strictly in local secure storage on the builder node and never transmitted.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedBuilder(null)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
