"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";

const BadgeCanvas = dynamic(() => import("./BadgeCanvas").then((module) => module.BadgeCanvas), { ssr: false });

class BadgeErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function BadgeScene({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReady(false); setEnabled(!preference.matches && !!window.WebGLRenderingContext); };
    update();
    preference.addEventListener("change", update);
    const visibility = () => setVisible(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => { preference.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  return <div className="guest-badge-view" role="img" aria-label={enabled && !failed ? "Interactive three-dimensional GRAD '26 guest badge. Drag the badge to move it." : "GRAD '26 guest badge preview. Your name here."}>
    <div className={`guest-badge-fallback${ready && enabled && !failed ? " is-hidden" : ""}`} aria-hidden="true">{children}</div>
    {enabled && !failed && <BadgeErrorBoundary onError={() => setFailed(true)}>
      <BadgeCanvas onReady={setReady} visible={visible} />
    </BadgeErrorBoundary>}
  </div>;
}
