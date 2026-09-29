# SEO Guard

A sandboxed plugin for [EmDash CMS](https://emdashcms.com) that stops posts going live without the SEO basics, and shows you which published posts need attention.

## What it does

- **Blocks publish and schedule** when an entry fails a check. The editor sees a "Failed to publish" message listing exactly what to fix, and the entry stays a draft.
- **Re-checks scheduled posts** when they come due. EmDash unschedules a post that fails and lists the reason on the dashboard.
- **SEO health widget** on the dashboard, and an **SEO report** page that lists every failing published entry with a link to its editor.

### Checks

| Check | Default |
| --- | --- |
| Title length | 15–60 characters |
| Meta description present and length | required, 50–160 characters |
| Featured image present | required |
| Slug length | up to 75 characters |

If the collection has EmDash's core SEO panel enabled, its title, description, and image take priority over the raw fields, matching what the page renders. Set any length limit to `0` to turn that check off.

### Settings

Everything is configurable under **Plugins → seo-guard → Settings**:

- **Mode:** `Block publishing` (default), `Warn only` (report and log, but allow publishing), or `Off`.
- **Collections:** comma-separated collection slugs to check (default `posts`).
- **Field names:** the title, description, and featured-image field slugs (defaults `title`, `excerpt`, `featured_image`), so it works with custom content types.
- **Limits** for each check, and whether a description and featured image are required.

Only actions taken by people (admin, visual editor, MCP) and the scheduler are blocked. Imports, seeds, and other plugins' actions are logged but never blocked, so SEO Guard can't break a migration.

### Permissions

| Capability | Why |
| --- | --- |
| `hooks.content-policy:register` | Reject a publish or schedule action. Grants no content access by itself. |
| `content:read` | Read published entries for the report and widget. |

No network access, no content writes.

## Develop

```sh
npm install --legacy-peer-deps   # plain npm install hits an npm 10 peer-resolution bug
npm run validate
npm run typecheck
npm run test
npm run build
```

To test against a running EmDash site, run `npm run dev` in this
directory (rebuilds on save) and `npm install file:../path/to/this`
in the site. Then `import seoGuard from "seo-guard"` and pass
it into `emdash({ sandboxed: [seoGuard] })`.

`npm run test` builds the plugin and runs its tests through Worker Loader using
EmDash's production sandbox wrapper and host bridge. The rules live in
`src/rules.ts` with no host dependencies, so they're unit-tested directly in
`tests/rules.test.ts`; `tests/plugin.test.ts` covers the hooks and admin routes
through the sandbox.

Stop the site's dev server before rebuilding the plugin. Rebuilding under a
running Vite server leaves a stale dependency cache (`The file does not exist
... in the optimize deps directory`); fix it with `rm -rf node_modules/.vite`
in the site and a restart.

## Publish

```sh
npm run login -- alice.example.com
npm run publish          # builds and uploads artifacts to your PDS
```

To publish from GitHub Actions, run `npm run release:setup`. The command
creates one shared workflow at the Git repository root.

## Version bumps

Bump `version` in `package.json` when you ship a release. The
scaffold's `emdash-plugin.jsonc` deliberately omits `version` —
the build pipeline reads it from `package.json` so there's a single
source of truth. **Bump major** for breaking changes, **bump minor**
for new routes or hooks, **bump patch** for fixes.

You MUST bump version whenever you change `capabilities`, `allowedHosts`,
or `storage` in the manifest. Installed users have consented to the
old trust contract; a change without a version bump would let new
behaviour slip past consent.
