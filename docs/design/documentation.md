# Documentation Experience

The docs application is a presentation layer over canonical repository Markdown.

## Information architecture
Product answers **why/what**. Design answers **how it should feel**. Architecture answers **how the system is shaped**. Development answers **how we collaborate**. Operations answers **how we run the ceremony**. ADRs preserve consequential technical decisions.

The handbook navigation groups pages by these areas and highlights the current page. Decisions have their own group, since ADRs and the open-items list are read differently from the architecture description. A group with many pages is split into titled sections (Design: Foundations, Interface, Tooling; Architecture: Start here, System, Data and behavior, Platform; Decisions: Open and decided, Architecture decision records) so no list grows past about a screenful.

Add new canonical pages to the matching group and section in `apps/docs/lib/navigation.ts`. A test (`navigation.test.ts`) fails if any Markdown file under `docs/` is missing from the navigation, listed twice, or points at a file that doesn't exist.

## Visual language
The handbook uses the same tokens as the product but remains quieter than the event site. Navigation is compact and technical; reading width is constrained; decorative motion is unnecessary.

## Diagrams
Use fenced `mermaid` blocks in Markdown for architecture and process diagrams that benefit from source-controlled text. The handbook renders them in the browser with the product's restrained light/dark palette and shows the source if rendering is unavailable. Prefer simple diagrams that remain understandable from their source. More expressive D2 or bespoke diagrams may be introduced when they provide material clarity.
