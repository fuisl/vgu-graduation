export const navGroups = [
  { title: "Product", items: [["product/vision", "Vision"], ["product/principles", "Principles"]] },
  { title: "Design", items: [["design/philosophy", "Visual philosophy"], ["design/moodboard", "Moodboard"], ["design/tokens", "Tokens"], ["design/components", "Components"], ["design/responsive", "Responsive"], ["design/motion", "Motion"], ["design/anti-patterns", "Anti-patterns"], ["design/llm-reference", "AI design reference"], ["design/documentation", "Docs experience"]] },
  { title: "Architecture", items: [["architecture/overview", "Overview"], ["architecture/data-model", "Data model"], ["adr/README", "Decision records"]] },
  { title: "Development", items: [["development/workflow", "Workflow"], ["development/ai-assisted-development", "AI-assisted development"]] },
  { title: "Operations", items: [["operations/event-runbook", "Event runbook"]] },
] as const;
