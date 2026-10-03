import { ParsedRepositoryUrl, SourceResolutionError } from './source.types.js';

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const COMMIT_SHA_REGEX = /^[0-9a-fA-F]{40}$/;
const VALID_REF_REGEX = /^[a-zA-Z0-9_./-]+$/;
const OWNER_REPO_SEGMENT_REGEX = /^[a-zA-Z0-9_.-]+$/;

/**
 * Validates that a string is a 40-character hexadecimal Git commit SHA.
 */
export function isValidCommitSha(sha: string): boolean {
  return COMMIT_SHA_REGEX.test(sha.trim());
}

/**
 * Validates a Git branch, tag, or ref name.
 * Disallows path traversal and shell injection characters.
 */
export function validateRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new SourceResolutionError('Ref/branch name cannot be empty', 'INVALID_REF');
  }

  if (trimmed.includes('..') || trimmed.includes('@{') || !VALID_REF_REGEX.test(trimmed)) {
    throw new SourceResolutionError(
      `Invalid Git reference name: "${trimmed}". Must contain only alphanumeric characters, '.', '_', '/', or '-'.`,
      'INVALID_REF'
    );
  }

  return trimmed;
}

/**
 * Validates and normalizes a GitHub HTTPS repository URL.
 * Rejects non-HTTPS protocols, non-GitHub domains, and malformed paths.
 */
export function parseAndValidateGitHubUrl(rawUrl: string): ParsedRepositoryUrl {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new SourceResolutionError('Repository URL is required and must be a string', 'INVALID_URL');
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SourceResolutionError(
      `Malformed repository URL: "${trimmed}". Must be a valid HTTPS URL.`,
      'MALFORMED_URL'
    );
  }

  // 1. Strict protocol check: HTTPS ONLY
  if (parsed.protocol !== 'https:') {
    throw new SourceResolutionError(
      `Unsupported protocol "${parsed.protocol}". Only secure "https:" GitHub repository URLs are allowed.`,
      'INVALID_PROTOCOL'
    );
  }

  // 2. Strict host check: github.com ONLY
  const host = parsed.hostname.toLowerCase();
  if (!GITHUB_HOSTS.has(host)) {
    throw new SourceResolutionError(
      `Unsupported host "${parsed.hostname}". Only "github.com" repositories are supported in this version.`,
      'UNSUPPORTED_HOST'
    );
  }

  // 3. Extract and normalize path segments: /owner/repo
  const cleanPath = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = cleanPath.split('/').filter(Boolean);

  if (segments.length !== 2) {
    throw new SourceResolutionError(
      `Invalid GitHub repository path: "${parsed.pathname}". Expected format: https://github.com/owner/repository`,
      'INVALID_REPO_PATH'
    );
  }

  const rawOwner = segments[0];
  const rawRepo = segments[1];

  if (!rawOwner || !rawRepo) {
    throw new SourceResolutionError(
      `Invalid GitHub repository path: "${parsed.pathname}". Expected format: https://github.com/owner/repository`,
      'INVALID_REPO_PATH'
    );
  }

  // Strip .git suffix if present
  const repository = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
  const owner = rawOwner;

  if (
    !OWNER_REPO_SEGMENT_REGEX.test(owner) ||
    !OWNER_REPO_SEGMENT_REGEX.test(repository) ||
    owner === '.' ||
    repository === '.'
  ) {
    throw new SourceResolutionError(
      `Invalid repository path segments: owner="${owner}", repo="${repository}". Contains invalid characters.`,
      'INVALID_PATH_SEGMENTS'
    );
  }

  const normalizedUrl = `https://github.com/${owner}/${repository}`;

  return {
    provider: 'github',
    owner,
    repository,
    normalizedUrl,
  };
}
