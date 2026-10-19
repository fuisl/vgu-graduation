"use client";

import type {MouseEvent} from "react";

/**
 * "Skip to content" (#78): the first focusable element on brand pages, off-screen until focused.
 * It points at `#main` (pages give their `<main>` that id, so it works before hydration); with
 * JavaScript it also finds a `<main>` without the id and moves focus there (tabindex -1), so a
 * page with any `<main>` works. `label` is the `shell.skipToContent` message; admin passes its
 * own English label, `target` and class.
 */
export function SkipLink({label, target = "main", className = "brand-skip-link"}: {label: string; target?: string; className?: string}) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById(target) ?? document.querySelector("main");
    if (!main) return;
    event.preventDefault();
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus();
  }
  return <a className={className} href={`#${target}`} onClick={onClick}>{label}</a>;
}
