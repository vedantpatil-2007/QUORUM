import React from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert, HelpCircle, Clock } from 'lucide-react';
import { ReleaseStatus } from '../types/api.types.js';

interface StatusBadgeProps {
  status: ReleaseStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const normStatus = (status || '').toUpperCase();

  let config = {
    label: 'UNKNOWN',
    bg: 'bg-zinc-800/80',
    border: 'border-zinc-700',
    text: 'text-zinc-300',
    icon: HelpCircle,
    ariaLabel: 'Unknown status',
  };

  switch (normStatus) {
    case 'VERIFIED':
      config = {
        label: 'VERIFIED',
        bg: 'bg-emerald-950/40',
        border: 'border-emerald-500/40',
        text: 'text-emerald-400',
        icon: ShieldCheck,
        ariaLabel: 'Release status: Verified consensus reached',
      };
      break;
    case 'FLAGGED':
      config = {
        label: 'FLAGGED',
        bg: 'bg-amber-950/40',
        border: 'border-amber-500/40',
        text: 'text-amber-400',
        icon: AlertTriangle,
        ariaLabel: 'Release status: Flagged due to dissenting builders',
      };
      break;
    case 'REJECTED':
      config = {
        label: 'REJECTED',
        bg: 'bg-rose-950/40',
        border: 'border-rose-500/40',
        text: 'text-rose-400',
        icon: ShieldAlert,
        ariaLabel: 'Release status: Rejected due to consensus failure',
      };
      break;
    case 'INSUFFICIENT_EVIDENCE':
      config = {
        label: 'INSUFFICIENT EVIDENCE',
        bg: 'bg-slate-900/60',
        border: 'border-slate-600/40',
        text: 'text-slate-300',
        icon: HelpCircle,
        ariaLabel: 'Release status: Insufficient builder attestations',
      };
      break;
    case 'PENDING':
      config = {
        label: 'PENDING',
        bg: 'bg-zinc-900/60',
        border: 'border-zinc-700/50',
        text: 'text-zinc-400',
        icon: Clock,
        ariaLabel: 'Release status: Pending evaluation',
      };
      break;
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium tracking-wide',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold tracking-wider',
  }[size];

  const IconComponent = config.icon;

  return (
    <span
      role="status"
      aria-label={config.ariaLabel}
      className={`inline-flex items-center rounded-md border ${config.bg} ${config.border} ${config.text} ${sizeClasses} shadow-sm uppercase select-none`}
    >
      {showIcon && <IconComponent className={size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />}
      <span>{config.label}</span>
    </span>
  );
};
