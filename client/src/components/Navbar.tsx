import React from 'react';
import { Shield, RefreshCw, Menu, X, Activity, Database } from 'lucide-react';
import { LedgerVerifyDto, HealthDto } from '../types/api.types.js';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  health: HealthDto | null;
  ledgerStatus: LedgerVerifyDto | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  onNavigate,
  onRefresh,
  isRefreshing,
  health,
  ledgerStatus,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navLinks = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Releases', path: '/releases' },
    { label: 'Builders', path: '/builders' },
    { label: 'Audit Ledger', path: '/audit' },
  ];

  const isApiOnline = !!health && health.status === 'ok';
  const isLedgerValid = ledgerStatus ? ledgerStatus.valid : true;

  const handleLinkClick = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleLinkClick('/dashboard')}>
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-base tracking-wider text-zinc-100">
                  QUORUM
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400">
                  v1.0
                </span>
              </div>
              <p className="text-[10px] font-mono text-zinc-500 hidden sm:block">
                Don't Trust the Binary, Trust the Builders
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive =
                currentPath === link.path ||
                (link.path === '/dashboard' && currentPath === '/') ||
                (link.path === '/releases' && currentPath.startsWith('/releases/'));

              return (
                <button
                  key={link.path}
                  onClick={() => handleLinkClick(link.path)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-emerald-400 border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Right Status Indicators & Refresh */}
          <div className="flex items-center gap-3">
            {/* System Status Indicators */}
            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px]">
              {/* API Status */}
              <div
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${
                  isApiOnline
                    ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-950/30 text-rose-400 border-rose-500/30'
                }`}
                title={isApiOnline ? 'API service responding normally' : 'Cannot reach API'}
              >
                <Activity className="w-3 h-3" />
                <span>{`API: ${isApiOnline ? 'ONLINE' : 'OFFLINE'}`}</span>
              </div>

              {/* Ledger Status */}
              <div
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${
                  isLedgerValid
                    ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-950/60 text-rose-300 border-rose-500 animate-pulse font-bold'
                }`}
                title={
                  isLedgerValid
                    ? 'Cryptographic audit ledger hash chain intact'
                    : 'Ledger integrity failure detected!'
                }
              >
                <Database className="w-3 h-3" />
                <span>{`LEDGER: ${isLedgerValid ? 'VALID' : 'TAMPERED'}`}</span>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors disabled:opacity-50"
              title="Refresh Quorum data"
              aria-label="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((link) => {
            const isActive =
              currentPath === link.path ||
              (link.path === '/dashboard' && currentPath === '/') ||
              (link.path === '/releases' && currentPath.startsWith('/releases/'));

            return (
              <button
                key={link.path}
                onClick={() => handleLinkClick(link.path)}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-emerald-400 border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                {link.label}
              </button>
            );
          })}

          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <span className={isApiOnline ? 'text-emerald-400' : 'text-rose-400'}>
              API: {isApiOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
            <span className={isLedgerValid ? 'text-emerald-400' : 'text-rose-400'}>
              LEDGER: {isLedgerValid ? 'VALID' : 'TAMPERED'}
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
