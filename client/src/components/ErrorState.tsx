import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Unable to connect to Quorum API',
  message,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-6 my-4 text-center max-w-lg mx-auto"
    >
      <div className="flex justify-center mb-3">
        <div className="p-3 bg-rose-900/30 rounded-full border border-rose-700/40">
          <AlertCircle className="w-6 h-6 text-rose-400" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-rose-200 mb-1">{title}</h3>
      <p className="text-xs text-rose-300/80 font-mono mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Connection</span>
        </button>
      )}
    </div>
  );
};
