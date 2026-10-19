/**
 * Splitting a full name into the name a person is called by (`given`) and their
 * family name (#170). Used by the API when an admin enters only a full name,
 * and by migration 0005 (same rules, in SQL) to backfill existing guests. The
 * result is a guess: rows it produces keep `nameReviewed = false` until an
 * admin confirms them. Documented in docs/architecture/data-model.md.
 *
 * Rules, applied to the NFC-normalised name with whitespace collapsed:
 * 1. One word: that word is the given name; no family name.
 * 2. Two words where the last is one of the most common Vietnamese family
 *    names: a Vietnamese name written in Western order, even when the first
 *    word could also be a family name ("Mai Tran" → given "Mai", family "Tran").
 * 3. The first word is a common Vietnamese family name (with or without
 *    diacritics, any case): Vietnamese order. Family = first word, given = last
 *    word ("Nguyễn Văn An" → family "Nguyễn", given "An").
 * 4. Otherwise Western order: given = first word, family = last word
 *    ("John Smith" → given "John", family "Smith"; "Ann Nguyen" → given "Ann").
 */

/**
 * The most common Vietnamese family names, lowercase, with diacritics. Together
 * they cover the large majority of Vietnamese people. Rule 2 uses this list.
 */
export const COMMON_VIETNAMESE_FAMILY_NAMES = [
  "nguyễn", "trần", "lê", "phạm", "hoàng", "huỳnh", "phan", "vũ", "võ", "đặng",
  "bùi", "đỗ", "hồ", "ngô", "dương", "lý",
] as const;

/**
 * Common Vietnamese family names, lowercase, with diacritics (rule 3).
 * Migration 0005 carries the same lists (keep them in sync).
 */
export const VIETNAMESE_FAMILY_NAMES = [
  ...COMMON_VIETNAMESE_FAMILY_NAMES,
  "đinh", "đào", "trương", "lâm", "mai", "trịnh", "đoàn", "cao", "lương", "hà",
  "tạ", "châu", "tôn", "thái", "quách", "kiều", "từ", "lưu", "triệu", "khổng",
  "vương", "chu",
] as const;

/** Strips Vietnamese diacritics ("Nguyễn" → "nguyen", "Đặng" → "dang") for the ASCII spellings. */
export function foldVietnamese(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function withAsciiSpellings(names: readonly string[]): Set<string> {
  return new Set<string>([...names, ...names.map(foldVietnamese)]);
}

const FAMILY_NAMES = withAsciiSpellings(VIETNAMESE_FAMILY_NAMES);
const COMMON_FAMILY_NAMES = withAsciiSpellings(COMMON_VIETNAMESE_FAMILY_NAMES);

function inList(list: Set<string>, word: string): boolean {
  return list.has(word.normalize("NFC").toLowerCase());
}

/** Whether `word` is one of the common Vietnamese family names, with or without diacritics, in any case. */
export function isVietnameseFamilyName(word: string): boolean {
  return inList(FAMILY_NAMES, word);
}

export interface SplitName {
  /** What the person is called by, e.g. in the header chip. Never empty for a non-empty name. */
  givenName: string;
  familyName: string | null;
}

/** Splits a full display name with the rules above. */
export function splitPersonName(fullName: string): SplitName {
  const words = fullName.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { givenName: fullName.trim(), familyName: null };
  if (words.length === 1) return { givenName: words[0]!, familyName: null };
  const first = words[0]!;
  const last = words[words.length - 1]!;
  if (words.length === 2 && inList(COMMON_FAMILY_NAMES, last)) return { givenName: first, familyName: last };
  if (isVietnameseFamilyName(first)) return { givenName: last, familyName: first };
  return { givenName: first, familyName: last };
}
