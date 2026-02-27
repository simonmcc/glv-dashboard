import { execSync } from 'child_process';

const REPO_URL = 'https://github.com/simonmcc/glv-dashboard';

export function getGitVersion(): string {
  try {
    return execSync('git describe --tags --always', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Returns a GitHub URL pointing directly to the relevant context:
 *  - A release page when built from a tag (e.g. v1.2.0)
 *  - A pull-request page when built from a PR branch (GITHUB_REF=refs/pull/N/merge)
 *  - A branch tree when built from a named branch
 *  - A specific commit when none of the above apply
 */
export function getGitUrl(): string {
  // GITHUB_REF is set by GitHub Actions, e.g.:
  //   refs/pull/42/merge   → PR
  //   refs/tags/v1.2.0     → release tag
  //   refs/heads/my-branch → branch
  const githubRef = process.env.GITHUB_REF ?? '';

  const prMatch = githubRef.match(/^refs\/pull\/(\d+)\//);
  if (prMatch) {
    return `${REPO_URL}/pull/${prMatch[1]}`;
  }

  const tagMatch = githubRef.match(/^refs\/tags\/(.+)$/);
  if (tagMatch) {
    return `${REPO_URL}/releases/tag/${tagMatch[1]}`;
  }

  const branchMatch = githubRef.match(/^refs\/heads\/(.+)$/);
  if (branchMatch) {
    return `${REPO_URL}/tree/${branchMatch[1]}`;
  }

  // Fallback: use local git state
  try {
    // If we're exactly on a tag, link to the release page
    const exactTag = execSync('git describe --tags --exact-match 2>/dev/null', { encoding: 'utf8' }).trim();
    if (exactTag) {
      return `${REPO_URL}/releases/tag/${exactTag}`;
    }
  } catch { /* not on an exact tag */ }

  try {
    const branch = execSync('git symbolic-ref --short HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
    if (branch) {
      return `${REPO_URL}/tree/${branch}`;
    }
  } catch { /* detached HEAD */ }

  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    return `${REPO_URL}/commit/${sha}`;
  } catch {
    return REPO_URL;
  }
}
