# Publishing to npm

The package is `@yesly/node`. Releases are published by
`.github/workflows/release.yml` when a `v*` tag is pushed. It uses npm trusted
publishing (OIDC from GitHub Actions), so no npm token is stored anywhere.

## One-time setup

1. **npm account.** Sign up at <https://www.npmjs.com/signup> with a shared
   address (not a personal one) and turn on two-factor authentication.
2. **The `@yesly` scope.** Create the organisation `yesly` at
   <https://www.npmjs.com/org/create>; the free plan is enough for public
   packages.
   - Check first that it is free: on 2026-11-07 the registry answered for the
     org `yesly` as if it already existed. If someone else owns it, use another
     scope, such as `@yesly-dev/node`. Change `name` in `package.json`, this
     repo's README and `src/lib/sdks.ts` in yesly-web together.
3. **Make the GitHub repo public.** Provenance (the "Built and signed on GitHub
   Actions" badge) is only generated for public repos.
4. **First publish, by hand.** Trusted publishing is configured on an existing
   package, so the first version goes out from a laptop:

   ```bash
   npm login
   npm test
   npm publish            # publishConfig.access is "public"
   ```

5. **Trusted publisher.** On npmjs.com, open the package, then *Settings* →
   *Trusted publishing* → *GitHub Actions*:
   - Organization or user: `yesly-dev`
   - Repository: `yesly-node`
   - Workflow filename: `release.yml`
   - Environment: `npm`
6. **Lock it down.** In the same settings, under *Publishing access*, choose
   *Require two-factor authentication and disallow tokens*. From then on only
   the workflow can publish.
7. **GitHub environment.** In the repo, *Settings* → *Environments* → create
   `npm`. Optionally add required reviewers so each release needs an approval.

## Each release

1. Bump `version` in `package.json` and `VERSION` in `src/version.ts` (a test
   checks they match).
2. Merge to `main`.
3. Tag and push:

   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```

The workflow checks the tag against `package.json`, runs the tests and
publishes. Check the result at <https://www.npmjs.com/package/@yesly/node>.

## If something goes wrong

- A version cannot be published twice. Fix forward with a new patch version.
- `npm deprecate @yesly/node@0.2.0 "reason"` warns installers off a bad
  version; `npm unpublish` only works within 72 hours and is best avoided.
