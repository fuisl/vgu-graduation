/**
 * The "names to review" list filter (#170): `?names=review` on the graduates
 * and invitations pages shows only rows whose given/family split is still the
 * API's guess (`nameReviewed: false`). The query holds no PII.
 */
export const NAME_REVIEW_QUERY = { key: "names", value: "review" } as const;

export function isNameReviewFilter(searchParams: Record<string, string | string[] | undefined>): boolean {
  const value = searchParams[NAME_REVIEW_QUERY.key];
  return (Array.isArray(value) ? value[0] : value) === NAME_REVIEW_QUERY.value;
}

export function nameReviewHref(basePath: string): string {
  return `${basePath}?${NAME_REVIEW_QUERY.key}=${NAME_REVIEW_QUERY.value}`;
}
