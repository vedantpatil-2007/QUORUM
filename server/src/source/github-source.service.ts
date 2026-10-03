import {
  SourceResolution,
  SourceResolutionRequest,
  SourceResolutionError,
} from './source.types.js';
import {
  parseAndValidateGitHubUrl,
  validateRef,
  isValidCommitSha,
} from './source-validator.js';

export interface GitHubSourceServiceOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export class GitHubSourceService {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GitHubSourceServiceOptions = {}) {
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  /**
   * Resolves a public GitHub repository and branch/commit into an immutable SourceResolution.
   * Never shells out to Git or CLI tools.
   */
  async resolveSource(request: SourceResolutionRequest): Promise<SourceResolution> {
    if (!request || !request.repositoryUrl) {
      throw new SourceResolutionError('Repository URL is required', 'MISSING_URL');
    }

    // 1. Validate and normalize the repository URL
    const { owner, repository, normalizedUrl } = parseAndValidateGitHubUrl(request.repositoryUrl);

    // 2. Validate and normalize the ref (default 'main')
    const rawRef = request.ref?.trim() || 'main';
    const ref = validateRef(rawRef);

    const resolvedAt = new Date().toISOString();

    // 3. If the provided ref is already a 40-character commit SHA, use it directly after validation
    if (isValidCommitSha(ref)) {
      return {
        repositoryUrl: normalizedUrl,
        provider: 'github',
        owner,
        repository,
        ref,
        commitSha: ref.toLowerCase(),
        resolvedAt,
        isDirectCommitSha: true,
        ownerAvatarUrl: `https://github.com/${owner}.png?size=128`,
        visibility: 'public',
      };
    }

    // 4. Resolve branch/tag reference to authoritative commit SHA via GitHub's public API
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repository
    )}/commits/${encodeURIComponent(ref)}`;

    let response: Response;
    try {
      response = await this.fetcher(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Quorum-Verification-Engine/1.0',
          Accept: 'application/vnd.github.v3+json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new SourceResolutionError(
          `GitHub API request timed out after ${this.timeoutMs}ms while resolving "${owner}/${repository}"`,
          'TIMEOUT',
          504
        );
      }
      throw new SourceResolutionError(
        `Failed to reach GitHub API: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR',
        502
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new SourceResolutionError(
          `Repository "${owner}/${repository}" or reference "${ref}" was not found on GitHub. Verify the repository is public and the branch exists.`,
          'NOT_FOUND',
          404
        );
      }

      if (response.status === 403) {
        const remaining = response.headers.get('x-ratelimit-remaining');
        if (remaining === '0') {
          throw new SourceResolutionError(
            'GitHub API rate limit exceeded for unauthenticated requests. Please wait or provide a direct commit SHA.',
            'RATE_LIMITED',
            429
          );
        }
        throw new SourceResolutionError(
          `GitHub repository "${owner}/${repository}" access was forbidden (HTTP 403). It may be private or restricted.`,
          'FORBIDDEN',
          403
        );
      }

      throw new SourceResolutionError(
        `GitHub API returned HTTP ${response.status}: ${response.statusText}`,
        'GITHUB_API_ERROR',
        response.status
      );
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new SourceResolutionError('Invalid JSON response returned by GitHub API', 'INVALID_JSON', 502);
    }

    const commitSha = payload?.sha;
    if (!commitSha || typeof commitSha !== 'string' || !isValidCommitSha(commitSha)) {
      throw new SourceResolutionError(
        `GitHub API did not return a valid 40-character commit SHA for "${ref}" in "${owner}/${repository}". Received: "${commitSha}"`,
        'INVALID_COMMIT_RESPONSE',
        502
      );
    }

    const avatarUrl =
      payload?.author?.avatar_url ||
      payload?.committer?.avatar_url ||
      `https://github.com/${owner}.png?size=128`;

    return {
      repositoryUrl: normalizedUrl,
      provider: 'github',
      owner,
      repository,
      ref,
      commitSha: commitSha.toLowerCase(),
      resolvedAt,
      isDirectCommitSha: false,
      ownerAvatarUrl: avatarUrl,
      visibility: 'public',
    };
  }
}
