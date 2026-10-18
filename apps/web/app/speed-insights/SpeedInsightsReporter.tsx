"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { scrubSpeedInsightsEvent } from "../../lib/analytics/speed-insights";

/**
 * Vercel Speed Insights (#8). Client-only because `beforeSend` is a function; every event goes
 * through `scrubSpeedInsightsEvent`, so no invitation token, query string or admin page is reported.
 */
export function SpeedInsightsReporter() {
  return <SpeedInsights beforeSend={scrubSpeedInsightsEvent} />;
}
