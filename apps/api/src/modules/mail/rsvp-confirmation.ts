import type { JobHandler } from "../../worker/worker.js";

/** The job type RSVP confirmations used. Nothing queues it any more (ADR-012 amendment). */
export const RSVP_CONFIRMATION_JOB = "mail.rsvp_confirmation";

/**
 * Lets jobs queued before confirmations stopped finish, sending nothing: an unregistered type would
 * fail and retry. Delete this and its registration in worker.ts once a deploy without the queueing
 * has run for a day and this finds no job waiting:
 * `SELECT count(*) FROM jobs WHERE type = 'mail.rsvp_confirmation' AND status IN ('queued', 'running')`.
 */
export const drainRsvpConfirmation: JobHandler = async () => {};
