import Markdoc from "@markdoc/markdoc";
import * as React from "react";
import { notFound } from "next/navigation";
import { Shell } from "../../components/shell";
import { MermaidDiagram } from "../../components/mermaid-diagram";
import { readDoc } from "../../lib/content";
import { navGroups } from "../../lib/navigation";

export const dynamicParams = false;

export function generateStaticParams() {
  return navGroups.flatMap((group) => group.items.map(([slug]) => ({ slug: slug.split("/") })));
}

export default async function Doc({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const content = await readDoc(slug);
  if (!content) notFound();

  return (
    <Shell>
      <article className="prose">
        {Markdoc.renderers.react(content, React, { components: { MermaidDiagram } })}
      </article>
    </Shell>
  );
}
