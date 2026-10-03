import React from 'react';

interface BuilderStatusBadgeProps {
  status: string;
}

export const BuilderStatusBadge: React.FC<BuilderStatusBadgeProps> = ({ status }) => {
  const norm = (status || '').toUpperCase();
  const isActive = norm === 'ACTIVE';
  const isSuspended = norm === 'SUSPENDED';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium border ${
        isActive
          ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/30'
          : isSuspended
          ? 'bg-amber-950/30 text-amber-400 border-amber-500/30'
          : 'bg-rose-950/30 text-rose-400 border-rose-500/30'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isActive ? 'bg-emerald-400 animate-pulse' : isSuspended ? 'bg-amber-400' : 'bg-rose-400'
        }`}
      />
      {norm}
    </span>
  );
};
