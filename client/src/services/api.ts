import {
  ApiResponse,
  BuilderDto,
  ReleaseDto,
  VerificationResultDto,
  QuorumResultDto,
  LedgerEntryDto,
  LedgerVerifyDto,
  HealthDto,
  ReleaseEvaluationResponse,
  UploadReleaseResponse,
  SourceResolutionDto,
  CreateReleaseFromSourceRequest,
  CreateReleaseFromSourceResponse,
} from '../types/api.types.js';

// Base URL defaults to empty string so it leverages Vite proxy /api or absolute if set
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  const headers: Record<string, string> = {};

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (options?.headers) {
    Object.assign(headers, options.headers);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    throw new ApiError(
      'NETWORK_ERROR',
      `Unable to connect to Quorum API at ${url}. Ensure the backend server is running.`,
      0,
      networkErr
    );
  }

  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch (err) {
    throw new ApiError(
      'INVALID_JSON',
      `Server returned invalid JSON response (status ${res.status}).`,
      res.status,
      err
    );
  }

  if (!res.ok || !json.success) {
    const code = json.error?.code || `HTTP_${res.status}`;
    const message = json.error?.message || `Request failed with status ${res.status}`;
    throw new ApiError(code, message, res.status, json.error?.details);
  }

  return json.data as T;
}

export const api = {
  /**
   * Check API health and service metadata.
   */
  async getHealth(): Promise<HealthDto> {
    return request<HealthDto>('/api/health');
  },

  /**
   * List all registered independent builders (public keys only).
   */
  async getBuilders(): Promise<BuilderDto[]> {
    return request<BuilderDto[]>('/api/builders');
  },

  /**
   * Get single builder details by ID.
   */
  async getBuilder(builderId: string): Promise<BuilderDto> {
    return request<BuilderDto>(`/api/builders/${encodeURIComponent(builderId)}`);
  },

  /**
   * List all tracked software releases.
   */
  async getReleases(): Promise<ReleaseDto[]> {
    return request<ReleaseDto[]>('/api/releases');
  },

  /**
   * Get single release metadata.
   */
  async getRelease(releaseId: string): Promise<ReleaseDto> {
    return request<ReleaseDto>(`/api/releases/${encodeURIComponent(releaseId)}`);
  },

  /**
   * Get Phase 5 individual attestation verification results.
   */
  async getVerificationResults(releaseId: string): Promise<VerificationResultDto[]> {
    return request<VerificationResultDto[]>(
      `/api/releases/${encodeURIComponent(releaseId)}/verification`
    );
  },

  /**
   * Get Phase 6 quorum consensus decision & hash breakdown.
   */
  async getQuorumResult(releaseId: string): Promise<QuorumResultDto> {
    return request<QuorumResultDto>(
      `/api/releases/${encodeURIComponent(releaseId)}/quorum`
    );
  },

  /**
   * Get Phase 7 audit ledger events associated with a specific release.
   */
  async getReleaseAudit(releaseId: string): Promise<LedgerEntryDto[]> {
    return request<LedgerEntryDto[]>(
      `/api/releases/${encodeURIComponent(releaseId)}/audit`
    );
  },

  /**
   * List audit ledger entries in chronological sequence.
   */
  async getLedgerEntries(limit = 100): Promise<LedgerEntryDto[]> {
    return request<LedgerEntryDto[]>(`/api/ledger?limit=${limit}`);
  },

  /**
   * Get single audit ledger entry by sequence index.
   */
  async getLedgerEntry(sequence: number): Promise<LedgerEntryDto> {
    return request<LedgerEntryDto>(`/api/ledger/entry/${sequence}`);
  },

  /**
   * Verify complete tamper-evident audit ledger cryptographic hash chain.
   */
  async verifyLedger(): Promise<LedgerVerifyDto> {
    return request<LedgerVerifyDto>('/api/ledger/verify');
  },

  /**
   * Trigger complete Phase 5 -> Phase 6 -> Phase 7 evaluation pipeline for a release.
   */
  async evaluateRelease(releaseId: string): Promise<ReleaseEvaluationResponse> {
    return request<ReleaseEvaluationResponse>(
      `/api/releases/${encodeURIComponent(releaseId)}/evaluate`,
      { method: 'POST' }
    );
  },

  /**
   * Upload an actual artifact file to the backend via multipart/form-data.
   * Real SHA-256 is computed dynamically on the backend and recorded to audit ledger.
   */
  async uploadReleaseArtifact(formData: FormData): Promise<UploadReleaseResponse> {
    return request<UploadReleaseResponse>('/api/releases/upload', {
      method: 'POST',
      body: formData,
    });
  },

  /**
   * Resolves a public GitHub repository and branch/commit reference.
   */
  async resolveRepositorySource(
    repositoryUrl: string,
    ref?: string
  ): Promise<SourceResolutionDto> {
    return request<SourceResolutionDto>('/api/source/resolve', {
      method: 'POST',
      body: JSON.stringify({ repositoryUrl, ref }),
    });
  },

  /**
   * Creates a release directly from a resolved GitHub repository source,
   * runs the builder simulation, performs verification, consensus, and audit logging.
   */
  async createReleaseFromSource(
    payload: CreateReleaseFromSourceRequest
  ): Promise<CreateReleaseFromSourceResponse> {
    return request<CreateReleaseFromSourceResponse>('/api/releases/from-source', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
