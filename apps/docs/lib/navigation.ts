/** `[slug under docs/, sidebar label]`. */
export type NavItem = readonly [slug: string, label: string];

/** A titled cluster inside a group. A group with one untitled section renders flat. */
export interface NavSection {
  readonly title?: string;
  readonly items: readonly NavItem[];
}

export interface NavGroup {
  readonly title: string;
  readonly sections: readonly NavSection[];
}

/**
 * Handbook navigation (docs/design/documentation.md). Top-level groups follow the
 * questions the docs answer; a group with many pages is split into sections so no
 * sidebar list grows past about a screenful. Every Markdown file under docs/ must
 * appear here exactly once (enforced by navigation.test.ts).
 */
export const navGroups: readonly NavGroup[] = [
  {
    title: "Product",
    sections: [{ items: [["product/vision", "Vision"], ["product/principles", "Principles"]] }],
  },
  {
    title: "Design",
    sections: [
      {
        title: "Foundations",
        items: [
          ["design/philosophy", "Visual philosophy"],
          ["design/moodboard", "Moodboard"],
          ["design/tokens", "Tokens"],
          ["design/anti-patterns", "Anti-patterns"],
        ],
      },
      {
        title: "Interface",
        items: [
          ["design/landing", "Landing teaser"],
          ["design/components", "Components"],
          ["design/responsive", "Responsive"],
          ["design/motion", "Motion"],
        ],
      },
      {
        title: "Tooling",
        items: [
          ["design/llm-reference", "AI design reference"],
          ["design/documentation", "Docs experience"],
        ],
      },
    ],
  },
  {
    title: "Architecture",
    sections: [
      {
        title: "Start here",
        items: [
          ["architecture/overview", "Overview"],
          ["architecture/target-architecture", "Target architecture"],
        ],
      },
      {
        title: "System",
        items: [
          ["architecture/target/goals-and-constraints", "1 Goals and constraints"],
          ["architecture/target/system-context", "2 System context"],
          ["architecture/target/traffic-paths", "3 Traffic paths"],
          ["architecture/target/applications-and-repository", "4 Applications and layout"],
        ],
      },
      {
        title: "Data and behavior",
        items: [
          ["architecture/target/data-and-storage", "5 Data and storage"],
          ["architecture/data-model", "Data model"],
          ["architecture/target/use-cases", "6 Use cases"],
        ],
      },
      {
        title: "Platform",
        items: [
          ["architecture/target/kubernetes-workloads", "7 Kubernetes workloads"],
          ["architecture/target/networking-and-setup", "8 Networking and setup"],
          ["architecture/target/homelab-robustness", "9 Homelab robustness"],
          ["architecture/target/security-summary", "10 Security summary"],
        ],
      },
    ],
  },
  {
    title: "Decisions",
    sections: [
      {
        title: "Open and decided",
        items: [["architecture/target/open-items-and-decisions", "11 Open items and decisions"]],
      },
      {
        title: "Architecture decision records",
        items: [
          ["adr/README", "Index and template"],
          ["adr/001-hosting-split", "ADR-001 Hosting split"],
          ["adr/002-api-application", "ADR-002 API application"],
          ["adr/003-browser-direct-traffic", "ADR-003 Browser-direct traffic"],
          ["adr/004-gitops-flux", "ADR-004 GitOps with Flux"],
          ["adr/005-storage", "ADR-005 Storage"],
          ["adr/006-homelab-system-of-record", "ADR-006 Homelab system of record"],
          ["adr/007-venue-audio-ingest", "ADR-007 Venue audio ingest"],
          ["adr/008-infrastructure-repository", "ADR-008 Infrastructure repository"],
          ["adr/009-direct-home-network-exposure", "ADR-009 Direct network exposure"],
        ],
      },
    ],
  },
  {
    title: "Development",
    sections: [
      {
        items: [
          ["development/workflow", "Workflow"],
          ["development/local-development", "Local development"],
          ["development/private-dependencies", "Private dependencies"],
          ["development/ai-assisted-development", "AI-assisted development"],
        ],
      },
    ],
  },
  {
    title: "Operations",
    sections: [
      { items: [["operations/event-runbook", "Event runbook"], ["operations/deployment", "Deployment"]] },
    ],
  },
];

/** Every page in navigation order. */
export const navItems: readonly NavItem[] = navGroups.flatMap((group) =>
  group.sections.flatMap((section) => section.items),
);

export function groupSize(group: NavGroup): number {
  return group.sections.reduce((total, section) => total + section.items.length, 0);
}
