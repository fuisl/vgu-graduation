"use client";

import Link from "next/link";
import {useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject} from "react";
import {BrandLogo} from "../logo/BrandLogo";
import {VENUE_HREF, nextTrapIndex, type SiteNavKey, type SiteNavLink} from "./nav";

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

type Labels = {menu: string; close: string; nav: string; home: string; language: string; textSize: string};

type Props = {
  current?: SiteNavKey;
  /** The guest's own entry (the chip, /me). */
  action: ReactNode;
  /** The EN | VI switch (#9). */
  language: ReactNode;
  /** The compact text size switch (#176). */
  textSize: ReactNode;
  /** The event essentials (date, time, venue), already rendered on the server; wrapped in the /venue link here. */
  essentials: ReactNode;
  /** Action links with labels in the page's language. */
  links: readonly SiteNavLink[];
  /** The one link that stays in the bar beside Menu: the camera, one tap away. */
  quick?: SiteNavLink;
  labels: Labels;
};

/** Mobile (<= 960px): a one-tap Camera link, the Menu button and the full-screen blue sheet. */
export function MobileMenu({current, action, language, textSize, essentials, links, quick, labels}: Props) {
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
      {/* A shortcut, not a second nav: the current page is marked once, in the sheet's rows. */}
      {quick ? <a className="brand-menu-button brand-menu-button--text" href={quick.href}>{quick.label}</a> : null}
      <button
        ref={buttonRef}
        type="button"
        className="brand-menu-button brand-menu-button--icon"
        aria-label={labels.menu}
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
        aria-label={labels.menu}
        hidden={!open}
        onKeyDown={onKeyDown}
      >
        <SheetBody
          current={current}
          action={action}
          language={language}
          textSize={textSize}
          essentials={essentials}
          links={links}
          labels={labels}
          closeRef={closeRef}
          onClose={close}
        />
      </div>
    </div>
  );
}

type SheetBodyProps = Omit<Props, "quick"> & {closeRef?: RefObject<HTMLButtonElement | null>; onClose?: () => void};

/**
 * The sheet's contents, top to bottom: mark and Close; the essentials (date, time, venue) as the
 * link to /venue; the action links as large rows; then, within thumb reach, the guest's own entry
 * and the two settings (language and text size) with visible labels.
 */
function SheetBody({current, action, language, textSize, essentials, links, labels, closeRef, onClose}: SheetBodyProps) {
  return (
    <>
      <div className="brand-header__inner">
        <Link className="brand-wordmark" href="/" aria-label={labels.home}><BrandLogo variant="compact" tone="on-blue" alt="" /></Link>
        <button ref={closeRef} type="button" className="brand-menu-button brand-menu-button--icon" aria-label={labels.close} onClick={onClose}><XIcon /></button>
      </div>
      <nav className="brand-sheet__nav" aria-label={labels.nav}>
        <a className="brand-sheet__when" href={VENUE_HREF} aria-current={current === "venue" ? "page" : undefined} onClick={onClose}>
          {essentials}
        </a>
        {links.map((item) => (
          <a
            key={item.key}
            className="brand-sheet__link"
            href={item.href}
            aria-current={item.key === current ? "page" : undefined}
            onClick={onClose}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="brand-sheet__action">
        {action}
        <div className="brand-sheet__settings">
          <div className="brand-sheet__setting">
            <span className="brand-sheet__setting-label" aria-hidden="true">{labels.language}</span>
            {language}
          </div>
          <div className="brand-sheet__setting">
            <span className="brand-sheet__setting-label" aria-hidden="true">{labels.textSize}</span>
            {textSize}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The open sheet as a static picture for `/design-system` (#153): same markup and styles, laid out
 * in the page instead of fixed over it, not a dialog, and `inert` so nothing in it is focusable.
 */
export function MenuSheetPreview(props: Omit<Props, "quick"> & {label: string}) {
  const {label, ...body} = props;
  return (
    <div className="brand-sheet brand-sheet--preview" role="img" aria-label={label} inert>
      <SheetBody {...body} />
    </div>
  );
}
