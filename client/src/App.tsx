import React from 'react';
import {
  ReleaseDto,
  BuilderDto,
  LedgerVerifyDto,
  LedgerEntryDto,
  HealthDto,
} from './types/api.types.js';
import { api, ApiError } from './services/api.js';
import { Navbar } from './components/Navbar.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ReleasesPage } from './pages/ReleasesPage.js';
import { ReleaseDetailPage } from './pages/ReleaseDetailPage.js';
import { BuildersPage } from './pages/BuildersPage.js';
import { AuditLedgerPage } from './pages/AuditLedgerPage.js';
import { LoadingState } from './components/LoadingState.js';
import { ErrorState } from './components/ErrorState.js';

export const App: React.FC = () => {
  // Normalize current path from pathname or hash fallback
  const getInitialPath = (): string => {
    if (window.location.hash.startsWith('#/')) {
      return window.location.hash.slice(1);
    }
    return window.location.pathname || '/dashboard';
  };

  const [currentPath, setCurrentPath] = React.useState<string>(getInitialPath);
  const [health, setHealth] = React.useState<HealthDto | null>(null);
  const [releases, setReleases] = React.useState<ReleaseDto[]>([]);
  const [builders, setBuilders] = React.useState<BuilderDto[]>([]);
  const [ledgerVerify, setLedgerVerify] = React.useState<LedgerVerifyDto | null>(null);
  const [ledgerEntries, setLedgerEntries] = React.useState<LedgerEntryDto[]>([]);

  const [loading, setLoading] = React.useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Synchronize route with browser history
  const navigate = (path: string) => {
    setCurrentPath(path);
    window.history.pushState(null, '', path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  React.useEffect(() => {
    const handlePopState = () => {
      const path = window.location.hash.startsWith('#/')
        ? window.location.hash.slice(1)
        : window.location.pathname || '/dashboard';
      setCurrentPath(path);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Fetch core dashboard data
  const fetchData = React.useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setIsRefreshing(true);
      setError(null);

      const [healthData, releasesData, buildersData, verifyData, entriesData] =
        await Promise.all([
          api.getHealth().catch(() => null),
          api.getReleases(),
          api.getBuilders(),
          api.verifyLedger().catch(() => null),
          api.getLedgerEntries(100).catch(() => []),
        ]);

      setHealth(healthData);
      setReleases(releasesData);
      setBuilders(buildersData);
      setLedgerVerify(verifyData);
      setLedgerEntries(entriesData);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to connect to Quorum API. Please verify the backend service is running and reachable.');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Route matching
  let pageContent: React.ReactNode;

  if (loading) {
    pageContent = <LoadingState message="Connecting to Quorum API and loading security state..." />;
  } else if (error) {
    pageContent = (
      <ErrorState
        title="Quorum API Unavailable"
        message={error}
        onRetry={() => fetchData(false)}
      />
    );
  } else if (currentPath === '/' || currentPath === '/dashboard') {
    pageContent = (
      <DashboardPage
        releases={releases}
        builders={builders}
        ledgerVerify={ledgerVerify}
        ledgerEntries={ledgerEntries}
        onNavigate={navigate}
        onRefresh={() => fetchData(true)}
      />
    );
  } else if (currentPath === '/releases') {
    pageContent = (
      <ReleasesPage
        releases={releases}
        onNavigate={navigate}
        onRefresh={() => fetchData(true)}
      />
    );
  } else if (currentPath.startsWith('/releases/')) {
    const releaseId = currentPath.replace('/releases/', '').split('?')[0].split('#')[0];
    pageContent = (
      <ReleaseDetailPage
        releaseId={releaseId}
        onNavigate={navigate}
        onRefreshParent={() => fetchData(true)}
      />
    );
  } else if (currentPath === '/builders') {
    pageContent = <BuildersPage builders={builders} />;
  } else if (currentPath === '/audit') {
    pageContent = (
      <AuditLedgerPage
        entries={ledgerEntries}
        ledgerVerify={ledgerVerify}
        onRefresh={() => fetchData(true)}
        onNavigate={navigate}
      />
    );
  } else {
    // Default redirect to dashboard
    pageContent = (
      <DashboardPage
        releases={releases}
        builders={builders}
        ledgerVerify={ledgerVerify}
        ledgerEntries={ledgerEntries}
        onNavigate={navigate}
        onRefresh={() => fetchData(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Navbar
        currentPath={currentPath}
        onNavigate={navigate}
        onRefresh={() => fetchData(true)}
        isRefreshing={isRefreshing}
        health={health}
        ledgerStatus={ledgerVerify}
      />

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {pageContent}
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-center text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Quorum — Don't Trust the Binary, Trust the Builders</span>
          <span>Decentralized Reproducible Build Attestation & Verification</span>
        </div>
      </footer>
    </div>
  );
};
