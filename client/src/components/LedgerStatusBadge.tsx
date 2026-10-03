import React from 'react';
import { ShieldCheck, AlertOctagon } from 'lucide-react';

interface LedgerStatusBadgeProps {
  isValid: boolean;
  size?: 'sm' | 'md';
}

export const LedgerStatusBadge: React.FC<LedgerStatusBadgeProps> = ({
  isValid,
  size = 'md',
}) => {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';

  if (isValid) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border bg-emerald-950/40 text-emerald-400 border-emerald-500/40 ${sizeClasses} font-mono font-medium`}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>CHAIN INTACT</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border bg-rose-950/60 text-rose-300 border-rose-500 ${sizeClasses} font-mono font-bold animate-pulse`}
    >
      <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
      <span>INTEGRITY FAILURE</span>
    </span>
  );
};
