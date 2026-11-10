# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The official Node.js SDK, `@yesly/node` on npm. TypeScript, compiled with `tsc`. Usage is in `README.md`.

## Commands

```bash
npm install
npm test                                     # build, type-check the README usage (test/tsconfig.json), node --test
npm run build && node --test --test-name-pattern "<name>" test/*.test.mjs   # one test
npm run generate                             # regenerate src/generated/ from ../yesly-openapi
npm run build && YESLY_API_KEY=ysk_test_… node scripts/smoke.mjs   # smoke test against the real API
```

Smoke tests run against staging with a `ysk_test_` key and `YESLY_BASE_URL=https://api.dev.yesly.dev/v1`; they create and clean up one object per resource.

## How it is built

The API-shaped part is generated from `yesly-openapi/openapi.yaml` by `yesly-openapi/sdk/generate.mjs` (`npm run generate`): `src/generated/`. Never edit it by hand: change the spec in `yesly-openapi`, lint it, and regenerate with both repos checked out side by side. Everything else is hand-written: `client.ts`, `pagination.ts`, `webhooks.ts`, `errors.ts`, `index.ts`. The hand-written client sends `Authorization: Bearer <key>` and `Yesly-Version`, retries with backoff honouring `Retry-After`, adds an automatic `Idempotency-Key` to writes, pages with `starting_after`, and verifies webhook signatures. The procedure for an API change across all SDKs is `yesly-openapi/docs/sdks.md`; package names must match `yesly-web/src/lib/sdks.ts`.

## Releasing

Bump `version` in `package.json` and `src/version.ts`, then push a tag `v<version>`.
