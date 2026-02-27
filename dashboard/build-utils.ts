import { execSync } from 'child_process';

export function getGitVersion(): string {
  try {
    return execSync('git describe --tags --always', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
