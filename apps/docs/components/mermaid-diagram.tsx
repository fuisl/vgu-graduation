"use client";

import { useEffect, useId, useState } from "react";

export function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

    async function render() {
      setSvg(null);
      setFailed(false);
      try {
        const { default: mermaid } = await import("mermaid");
        const dark = colorScheme.matches;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          flowchart: { htmlLabels: false, curve: "linear" },
          themeVariables: {
            background: dark ? "#0a0a0a" : "#fafafa",
            primaryColor: dark ? "#111111" : "#ffffff",
            primaryTextColor: dark ? "#ededed" : "#111111",
            primaryBorderColor: dark ? "#444444" : "#b8b8b8",
            lineColor: dark ? "#929292" : "#686868",
            secondaryColor: dark ? "#111111" : "#ffffff",
            tertiaryColor: dark ? "#111111" : "#ffffff",
            clusterBkg: dark ? "#111111" : "#ffffff",
            clusterBorder: dark ? "#444444" : "#b8b8b8",
            edgeLabelBackground: dark ? "#0a0a0a" : "#fafafa",
            fontFamily: "Arial, Helvetica, sans-serif",
          },
        });
        const result = await mermaid.render(`grad-diagram-${id}`, chart);
        if (active) setSvg(result.svg);
      } catch {
        if (active) setFailed(true);
      }
    }

    void render();
    colorScheme.addEventListener("change", render);
    return () => {
      active = false;
      colorScheme.removeEventListener("change", render);
    };
  }, [chart, id]);

  return (
    <figure className="mermaid-figure">
      <div className="mermaid-label">DIAGRAM / SOURCE CONTROLLED</div>
      {svg ? <div className="mermaid-graphic" dangerouslySetInnerHTML={{ __html: svg }} /> : <pre className="mermaid-source">{chart}</pre>}
      {failed && <figcaption>Diagram unavailable. Mermaid source is shown above.</figcaption>}
    </figure>
  );
}
