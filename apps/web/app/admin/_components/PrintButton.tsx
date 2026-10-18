"use client";

/** Opens the browser's print dialog; the admin print styles hide the chrome (admin.css). */
export function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className="admin-button admin-button--outline admin-no-print" onClick={() => window.print()}>
      {children}
    </button>
  );
}
