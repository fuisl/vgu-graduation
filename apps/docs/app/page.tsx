import Link from "next/link";
import { Shell } from "../components/shell";

const sections = [
  { href: "/product/vision", title: "Product", description: "Vision, experience and principles" },
  { href: "/design/philosophy", title: "Design", description: "Visual language and UI foundations" },
  { href: "/architecture/overview", title: "Architecture", description: "System shape and data model" },
  { href: "/development/workflow", title: "Development", description: "Workflow and agent context" },
  { href: "/operations/event-runbook", title: "Operations", description: "Ceremony-day readiness" },
];

export default function Home() {
  return (
    <Shell>
      <div className="eyebrow">PROJECT KNOWLEDGE / 0.1</div>
      <h1>Build from shared context.</h1>
      <p className="lede">Product, design, architecture and operating knowledge for GRAD &apos;26. Markdown in the repository remains canonical; this site makes it navigable.</p>
      <div className="doc-grid">
        {sections.map((section, index) => (
          <Link href={section.href} key={section.title}>
            <span className="doc-grid-meta">{String(index + 1).padStart(2, "0")} / {section.description}</span>
            <span className="doc-grid-title">{section.title} →</span>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
