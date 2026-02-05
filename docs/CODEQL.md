# CodeQL Security Scanning

## Overview

This project uses [CodeQL](https://codeql.github.com/) for automated security vulnerability scanning. CodeQL is GitHub's code analysis engine that helps identify security vulnerabilities and coding errors in the codebase.

## Configuration

The CodeQL workflow is configured in `.github/workflows/codeql.yml` and runs:

- **On every push** to the `main` branch
- **On every pull request** targeting the `main` branch  
- **Weekly on schedule** (Mondays at 1:30 AM UTC) to catch newly discovered vulnerabilities

## Language Coverage

The current configuration scans:
- **JavaScript/TypeScript** - Covers both the frontend (React/Vite) and backend (Express/Node.js) codebases

## Build Configuration

The workflow uses `build-mode: none` which is appropriate for JavaScript/TypeScript projects that don't require compilation. CodeQL automatically analyzes the source files directly.

## Viewing Results

Security scan results are available in:
1. The **Security** tab of the GitHub repository
2. Under **Code scanning alerts** section
3. Pull request checks will show CodeQL results

## Customizing Queries

To enable additional security checks, you can uncomment the `queries` line in `.github/workflows/codeql.yml`:

```yaml
queries: security-extended,security-and-quality
```

This enables:
- `security-extended`: Additional security-focused queries
- `security-and-quality`: Both security and code quality queries

## Permissions

The workflow requires specific permissions to upload security scan results:
- `security-events: write` - Upload scan results to GitHub Security
- `actions: read` - Access workflow information
- `contents: read` - Read repository contents
- `packages: read` - Fetch CodeQL query packs

## Resources

- [CodeQL Documentation](https://codeql.github.com/docs/)
- [GitHub Code Scanning](https://docs.github.com/en/code-security/code-scanning)
- [CodeQL Query Packs](https://github.com/github/codeql/tree/main/javascript)
