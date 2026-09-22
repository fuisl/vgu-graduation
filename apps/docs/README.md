# GRAD '26 Docs

Markdoc-powered internal project handbook. It reads canonical Markdown from the repository-level `docs/` directory rather than duplicating content.

Run from repository root with `pnpm --filter @grad/docs dev`; default port is 3001.

## Authoring
Add durable knowledge to the appropriate repository `docs/` area. Add a navigation entry in `lib/navigation.ts` when a new canonical page should be exposed. The navigation also acts as an explicit route allowlist, preventing arbitrary filesystem paths from becoming routes.

Fenced `mermaid` blocks render as diagrams on the client, using a restrained light/dark theme. The source remains visible until rendering succeeds and stays available if rendering fails or JavaScript is unavailable. Other fenced blocks remain code.
