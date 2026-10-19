import { Fragment, createElement, type ReactNode } from "react";
import type { MessageId } from "./messages/en";

/**
 * Client-safe message helpers (#9, ADR-010). Nothing here imports a dictionary:
 * client components receive the slice they need as a prop (`pickMessages` on the
 * server) and format it with these.
 */

export type MessageValues = Record<string, string | number>;

/** The message ids under a prefix, e.g. `MessageKeys<"rsvp.">`. */
export type MessageKeys<P extends string> = Extract<MessageId, `${P}${string}`>;

/** What a client component receives: only the strings it renders. */
export type MessageSlice<P extends string> = { readonly [K in MessageKeys<P>]: string };

/** `{name}` placeholders. Unknown placeholders stay as they are, so a typo is visible, never blank. */
export function formatMessage(template: string, values?: MessageValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/**
 * Like formatMessage, with elements as values: `formatRich(t("x"), { link: <a href="/">…</a> })`.
 * Returns a fragment so word order stays the translator's, not the component's.
 */
export function formatRich(template: string, values: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/(\{\w+\})/g);
  return createElement(
    Fragment,
    null,
    ...parts.map((part, index) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      const value = key !== undefined && key in values ? values[key] : part;
      return createElement(Fragment, { key: index }, value);
    }),
  );
}

/** `.one` for exactly one, `.other` otherwise; enough for English and Vietnamese (which has no plural forms). */
export function pluralKey(count: number): "one" | "other" {
  return count === 1 ? "one" : "other";
}

/**
 * A typed formatter over a slice: `const t = sliceTranslator(messages); t("rsvp.save")`.
 * A key missing from the slice renders the key itself (and warns in development) instead of throwing.
 */
export function sliceTranslator<K extends string>(messages: { readonly [P in K]: string }) {
  const lookup = (id: K): string => {
    const value = messages[id];
    if (value === undefined) {
      if (process.env.NODE_ENV !== "production") console.warn(`[i18n] message "${id}" was not passed to this component`);
      return id;
    }
    return value;
  };
  const t = (id: K, values?: MessageValues) => formatMessage(lookup(id), values);
  /** `t.plural("gallery.count", n)` reads `gallery.count.one` or `gallery.count.other`, with `{count}` filled in. */
  t.plural = (base: PluralBase<K>, count: number, values?: MessageValues) =>
    formatMessage(lookup(`${base}.${pluralKey(count)}` as K), { count, ...values });
  return t;
}

/** The formatter sliceTranslator returns, for passing down to helpers. */
export type SliceTranslator<K extends string> = ReturnType<typeof sliceTranslator<K>>;

/** `foo` when both `foo.one` and `foo.other` exist in K. */
export type PluralBase<K extends string> = PluralBaseOf<K, K>;
type PluralBaseOf<Each extends string, All extends string> = Each extends `${infer B}.one`
  ? `${B}.other` extends All
    ? B
    : never
  : never;
