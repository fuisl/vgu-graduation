/**
 * Something this guest just sent from this phone (a photo from the locket camera, a wish from
 * the composer), drawn at the top of the feed before the server lists it. Purely presentational:
 * the owner (Locket, WishesView) translates the labels and wires the actions.
 */
export type LocalTone = "pending" | "error" | "done";

export type LocalAction = { label: string; onClick: () => void };

type LocalBase = {
  key: string;
  /**
   * The server's id once accepted (a photo's publicId, a wish's id). When the feed's own
   * listing contains it, the feed shows the server copy and drops this one.
   */
  serverId?: string;
  /** Short visible status, e.g. "Sending…", "Waiting for signal", "Not sent", "Sent". */
  status: string;
  tone: LocalTone;
  /** At most one action fits a photo tile: Retry or Remove. Wishes may have Retry and Edit. */
  actions: LocalAction[];
};

export type LocalPhoto = LocalBase & { kind: "photo"; url: string; alt: string };
export type LocalWish = LocalBase & { kind: "wish"; body: string; author: string };
export type LocalItem = LocalPhoto | LocalWish;

/** Whether this browser says it has no network at all (the venue Wi-Fi dropped). */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
