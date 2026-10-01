"use client";

import Link from "next/link";
import {useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode} from "react";
import {BrandLogo} from "../logo/BrandLogo";
import {SITE_NAV, nextTrapIndex, type SiteNavKey} from "./nav";

const FOCUSABLE = "a[href], button:not([disabled])";

/** Primer Octicons `x-24` (MIT, https://primer.style/octicons/). Inherits the button colour. */
function XIcon() {
  return (
    <svg className="brand-menu-button__icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M5.72 5.72a.75.75 0 0 1 1.06 0L12 10.94l5.22-5.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L13.06 12l5.22 5.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L12 13.06l-5.22 5.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L10.94 12 5.72 6.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

/** Primer Octicons `three-bars-24` (MIT, https://primer.style/octicons/). Inherits the button colour. */
function ThreeBarsIcon() {
  return (
    <svg className="brand-menu-button__icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M3.75 5.25h16.5a.75.75 0 1 1 0 1.5H3.75a.75.75 0 0 1 0-1.5Zm0 6h16.5a.75.75 0 1 1 0 1.5H3.75a.75.75 0 0 1 0-1.5Zm0 6h16.5a.75.75 0 1 1 0 1.5H3.75a.75.75 0 0 1 0-1.5Z" />
    </svg>
  );
}

/** Mobile (<= 960px) menu button and full-screen blue sheet. */
export function MobileMenu({current, action}: {current?: SiteNavKey; action: ReactNode}) {
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const wide = window.matchMedia("(min-width: 961px)");
    const onWide = () => { if (wide.matches) setOpen(false); };
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = previous;
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !sheetRef.current) return;
    const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const next = nextTrapIndex(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey);
    if (next < 0) return;
    event.preventDefault();
    items[next].focus();
  }

  return (
    <div className="brand-header__mobile">
      <button
        ref={buttonRef}
        type="button"
        className="brand-menu-button brand-menu-button--icon"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => setOpen(true)}
      >
        <ThreeBarsIcon />
      </button>
      <div
        ref={sheetRef}
        id={sheetId}
        className="brand-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!open}
        onKeyDown={onKeyDown}
      >
        <div className="brand-header__inner">
          <Link className="brand-wordmark" href="/"><BrandLogo variant="compact" tone="on-blue" /></Link>
          <button ref={closeRef} type="button" className="brand-menu-button brand-menu-button--icon" aria-label="Close menu" onClick={close}><XIcon /></button>
        </div>
        <nav className="brand-sheet__nav" aria-label="Main">
          {SITE_NAV.map((item) => (
            <a
              key={item.key}
              className="brand-sheet__link"
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
              onClick={close}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="brand-sheet__action">{action}</div>
      </div>
    </div>
  );
}
