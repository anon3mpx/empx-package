# EMPX SDK Package Deployment Guide

This guide is for the current repo layout where the npm package root is `src/`.

## 1) Package Root and What Gets Published

- Package root: `src/`
- Publish command must run from: `src/`
- Published files are controlled by `src/package.json -> files`.

Current publish allowlist:
- `index.js`
- `index.d.ts`
- `router.js`
- `chains/`
- `core/`
- `README.md`

## 2) Files You Should Push to Git

Push these (source-of-truth) files:
- `src/package.json`
- `src/package-lock.json`
- `src/index.js`
- `src/index.d.ts`
- `src/router.js`
- `src/chains/**`
- `src/core/**`
- `src/tests/**`
- `src/README.md`
- `PACKAGE_DEPLOYMENT_GUIDE.md`

Optional but recommended:
- root `.gitignore`

## 3) Files You Should Not Push

Do not commit generated, local, or machine-specific artifacts:
- `src/node_modules/`
- any `node_modules/`
- `*.tgz` (from `npm pack`)
- `src/.npm-cache/`
- `.DS_Store`
- `.env` and `.env.*`
- local IDE folders (`.vscode/`, `.idea/`)
- test coverage output (`coverage/`, `.nyc_output/`)

## 4) Build and Pre-Publish Verification

From repo root:

```bash
cd src
npm ci
npm run build
npm test
```

What this means in this SDK:
- `npm run build` performs a packaging dry-run (`npm pack --dry-run`) to verify publishable content.
- `npm test` runs live RPC-based tests. These can fail if RPC endpoint/config for a chain is incorrect.

Optional detailed artifact check:

```bash
cd src
npm pack --dry-run --json --cache ./.npm-cache
```

## 5) Release and Publish

From `src/`:

```bash
npm whoami
npm version patch
npm publish --access public
```

Use `minor` or `major` instead of `patch` when appropriate.

Recommended release flow:
1. Update version + changelog.
2. Run `npm run build` and tests.
3. Publish from `src/` only.
4. Tag and push git changes.

## 6) Industry Best-Practice Checklist

- Keep package exports explicit (`exports`, `main`, `types` are already set).
- Keep publish surface minimal via `files` allowlist.
- Keep lockfile committed for reproducible installs.
- Validate tarball before every publish (`npm pack --dry-run`).
- Avoid leaking ABI-heavy/internal files unless intentionally part of public API.
- Ensure tests fail CI on real regressions (set non-zero exit on failures in test scripts).

