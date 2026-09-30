"use client";

/** Unexpected failures while rendering an admin page. API errors are shown inline by each page instead. */
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="admin-notice admin-notice--error" role="alert">
      <h1>Something went wrong</h1>
      <p>This page could not be shown. Nothing was changed.</p>
      <button type="button" className="admin-button admin-button--outline" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
