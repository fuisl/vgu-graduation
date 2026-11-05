# ADR-018: Patch Next's bundled React for a page that never finished saving
Status: Proposed
Date: 2026-11-05
## Context
The graduate dashboard sometimes stayed stale after a Server Action until a reload. ADR-017 worked around it without finding the cause. The same thing was then measured on `/invite`, the top-priority flow, in a production build at 390px.

In 75 trials, every answer reached the database, a reload always showed it, and `/me` and its share band always agreed. But the page itself failed in two different ways:
- **16 of 59 saves through the form stuck on "Saving...".** The form stayed disabled, for at least 90 seconds when watched that long, until the guest reloaded.
- **14 of 16 confirmations from an email's Yes or No link** showed "your RSVP is saved" above an old status, because of a separate bug described below.

Neither happened in the 11 trials throttled to 150 ms latency and 4x CPU, or in 36 trials on a dev server. Both depend on timing, so how often they would happen on a real phone is unknown.

**The cause of the first.** React renders a transition, suspends on a piece of the server's response that hasn't arrived, and attaches a wake-up listener to it. If that piece arrives just before the listener is attached, the Flight client's `then` calls the listener at once, during the render. `pingSuspendedRoot` in React 19.2 canary (`0bdb9206`, bundled by every Next 15.5 up to 15.5.29) then does nothing when the render's exit status is "suspended with delay" and it is inside a render. The render finishes, and `markRootSuspended` clears the wake-up. React then waits for a wake-up that has already happened.

The evidence: on a stuck page both pending updates held fulfilled promises, every piece of the response had arrived, and `root.pendingLanes` and `root.suspendedLanes` were equal with `pingedLanes` at 0. The last listener attached in each stuck run had `status: "resolved_model"` at attach time, and in the runs that worked it was `pending`. Setting `root.pingedLanes` by hand from outside made the page commit, 3 of 3, with no new data fetched. React 19.3 changed exactly this line (seen in Next 16.4.5).

It can affect any transition rendering a streamed response: a `revalidatePath` action, `router.refresh()`, and client navigation.

**The cause of the second.** After saving from an email link, `RsvpForm` removed `?answer=` with `history.replaceState` as soon as the action returned. Next's patched `replaceState` dispatches a router restore, which discards a server action still in the queue, along with its refreshed page.
## Decision
**Backport React's one-line fix with `pnpm patch next`**, in the production and development client bundles of `react-dom`, the same change React 19.3 made: a wake-up during a render is recorded in `workInProgressRootPingedLanes`, so it isn't lost. `apps/web/lib/react-lost-ping.test.ts` fails if the fix goes missing.

**`RsvpForm` removes `?answer=` in the effect that runs after the save has committed**, not as soon as the action returns.

`revalidatePath` stays on `/invite`. With both changes, the same 75 trials had no failures: every save showed the saved answer and status together, within 72 ms locally and 366 ms throttled. The form change alone fixed the email path (16 of 16).
## Alternatives considered
- Next 16, which has the fix: a major upgrade two weeks before the ceremony. Rejected for now. Do it after the event, and drop the patch then.
- Next 15.5.29, the newest backport: it bundles the same React and the same bug.
- Dropping `revalidatePath` on `/invite` and returning the saved answer, as the dashboard does: it fixes only this page, and Back and `/me` would need extra work to avoid showing an older answer from the router's cache. Client navigation would still have the bug.
## Consequences
- Any change to the `next` version makes `pnpm install` fail until the patch is redone or removed: a loud failure, which is what we want here.
- `react-dom-profiling` isn't patched. It is used only with `next build --profile`.
