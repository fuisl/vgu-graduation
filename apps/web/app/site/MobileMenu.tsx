"use client";

import Link from "next/link";
import {useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode} from "react";
import {BrandLogo} from "../logo/BrandLogo";
import {SITE_NAV, nextTrapIndex, type SiteNavKey} from "./nav";

const FOCUSABLE = "a[href], button:not([disabled])";

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
        className="brand-menu-button"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => setOpen(true)}
      >
        Menu
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
          <button ref={closeRef} type="button" className="brand-menu-button" onClick={close}>Close</button>
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
