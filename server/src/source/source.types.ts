export interface SourceResolutionRequest {
  repositoryUrl: string;
  ref?: string;
}

export interface SourceResolution {
  repositoryUrl: string;
  provider: 'github';
  owner: string;
  repository: string;
  ref: string;
  commitSha: string;
  resolvedAt: string;
  isDirectCommitSha?: boolean;
  ownerAvatarUrl?: string | null;
  visibility?: 'public';
}

export interface ParsedRepositoryUrl {
  provider: 'github';
  owner: string;
  repository: string;
  normalizedUrl: string;
}

export class SourceResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'SourceResolutionError';
  }
}
