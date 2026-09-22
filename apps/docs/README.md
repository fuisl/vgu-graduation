# GRAD '26 Docs

Markdoc-powered internal project handbook. It reads canonical Markdown from the repository-level `docs/` directory rather than duplicating content.

Run from repository root with `pnpm --filter @grad/docs dev`; default port is 3001.

## Authoring
Add durable knowledge to the appropriate repository `docs/` area. Add a navigation entry in `lib/content.ts` when a new canonical page should be exposed. The renderer uses an explicit allowlist, preventing arbitrary filesystem paths from becoming routes.

Mermaid source blocks remain readable as code in this first version. A later visualization PR can add client-side Mermaid/D2 rendering without changing the canonical Markdown.
