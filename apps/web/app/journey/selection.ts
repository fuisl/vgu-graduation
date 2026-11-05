/** Which entry is open and which of its photos is on the plate. Pure, so it is tested without a browser. */
export type JourneySelection = { entry: number; photo: number };

export const INITIAL_SELECTION: JourneySelection = { entry: 0, photo: 0 };

/** Opening an entry always starts at its first photo. An index outside the list is ignored. */
export function selectEntry(selection: JourneySelection, entry: number, count: number): JourneySelection {
  if (!Number.isInteger(entry) || entry < 0 || entry >= count) return selection;
  return entry === selection.entry ? selection : { entry, photo: 0 };
}

/** ← and Next →: one step, wrapping round both ends of the list. */
export function stepEntry(selection: JourneySelection, delta: 1 | -1, count: number): JourneySelection {
  if (count === 0) return selection;
  return selectEntry(selection, (selection.entry + delta + count) % count, count);
}

export function selectPhoto(selection: JourneySelection, photo: number, photoCount: number): JourneySelection {
  if (!Number.isInteger(photo) || photo < 0 || photo >= photoCount) return selection;
  return { ...selection, photo };
}
