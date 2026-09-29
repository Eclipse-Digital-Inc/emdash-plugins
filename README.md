# EmDash plugins by Eclipse Digital

Sandboxed plugins for [EmDash CMS](https://emdashcms.com), published to the EmDash plugin registry as [`eclipsedigi.bsky.social`](https://bsky.app/profile/eclipsedigi.bsky.social).

| Plugin | What it does |
| --- | --- |
| [`seo-guard`](./seo-guard) | Blocks publishing posts that fail SEO basics (title and description length, featured image, slug) and reports what needs fixing. |

## Releasing

Releases run from GitHub Actions through [`.github/workflows/emdash-release.yml`](.github/workflows/emdash-release.yml). To release a plugin:

1. Bump `version` in its `package.json` and commit.
2. Push a tag in `<slug>@<version>` form:

   ```sh
   git tag seo-guard@0.1.0
   git push origin seo-guard@0.1.0
   ```

The workflow builds the plugin, attaches build provenance, and publishes it to the registry. The first run asks the publisher to approve this repository in the EmDash release dashboard.

## Adding a plugin

```sh
npx @emdash-cms/plugin-cli init <slug> --publisher did:plc:u6uomfqtinodqei7xyl4ewe3 --package-manager npm
```

Then add `"repo": "https://github.com/Eclipse-Digital-Inc/emdash-plugins"` to its `emdash-plugin.jsonc` and run `npx emdash-plugin profile setup --dir <slug>`. The existing workflow covers it; no workflow changes needed. See the notes in [`seo-guard/README.md`](./seo-guard/README.md) for scaffold version pins to fix.

## License

MIT
