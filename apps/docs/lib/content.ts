import fs from "node:fs/promises";
import path from "node:path";
import Markdoc from "@markdoc/markdoc";
import { navGroups } from "./navigation";

const ROOT = path.resolve(process.cwd(), "../../docs");

const allowedSlugs = new Set<string>(navGroups.flatMap((group) => group.items.map(([slug]) => slug)));

export async function readDoc(slug: string[]) {
  const key = slug.join("/");
  if (!allowedSlugs.has(key)) return null;

  const source = await fs.readFile(path.join(ROOT, `${key}.md`), "utf8");
  const ast = Markdoc.parse(source);
  return Markdoc.transform(ast, {
    nodes: {
      fence: {
        ...Markdoc.nodes.fence,
        transform(node, config) {
          if (node.attributes.language === "mermaid") {
            return new Markdoc.Tag("MermaidDiagram", { chart: node.attributes.content });
          }
          return Markdoc.nodes.fence.transform!(node, config);
        },
      },
    },
  });
}
