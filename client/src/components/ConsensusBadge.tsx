import React from 'react';

interface ConsensusBadgeProps {
  percentage: number;
  threshold?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const ConsensusBadge: React.FC<ConsensusBadgeProps> = ({
  percentage,
  threshold = 66.67,
  size = 'md',
}) => {
  const isComplete = percentage >= 100;
  const isQuorumReached = percentage >= threshold;

  let colorClasses = 'bg-rose-950/40 text-rose-400 border-rose-500/40';
  if (isComplete) {
    colorClasses = 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40';
  } else if (isQuorumReached) {
    colorClasses = 'bg-amber-950/40 text-amber-400 border-amber-500/40';
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1 font-medium',
    lg: 'text-sm px-3 py-1.5 font-bold',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-mono ${colorClasses} ${sizeClasses}`}
      title={`Consensus: ${percentage.toFixed(2)}% (Threshold: ${threshold}%)`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isComplete ? 'bg-emerald-400' : isQuorumReached ? 'bg-amber-400' : 'bg-rose-400'
        }`}
      />
      <span>{`${percentage.toFixed(percentage % 1 === 0 ? 0 : 2)}%`}</span>
    </span>
  );
};
