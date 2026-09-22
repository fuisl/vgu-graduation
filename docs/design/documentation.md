# Documentation Experience

The docs application is a presentation layer over canonical repository Markdown.

## Information architecture
Product answers **why/what**. Design answers **how it should feel**. Architecture answers **how the system is shaped**. Development answers **how we collaborate**. Operations answers **how we run the ceremony**. ADRs preserve consequential technical decisions.

The handbook navigation groups pages by these areas and highlights the current page. Add new canonical pages to the matching group in `apps/docs/lib/navigation.ts`.

## Visual language
The handbook uses the same tokens as the product but remains quieter than the event site. Navigation is compact and technical; reading width is constrained; decorative motion is unnecessary.

## Diagrams
Use fenced `mermaid` blocks in Markdown for architecture and process diagrams that benefit from source-controlled text. The handbook renders them in the browser with the product's restrained light/dark palette and shows the source if rendering is unavailable. Prefer simple diagrams that remain understandable from their source. More expressive D2 or bespoke diagrams may be introduced when they provide material clarity.
