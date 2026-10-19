import { INTL_LOCALE, type Locale } from "./config";
import { formatMessage, pluralKey, type MessageKeys, type MessageSlice, type MessageValues, type PluralBase } from "./format";
import { en, type MessageId, type Messages } from "./messages/en";
import { vi } from "./messages/vi";

/**
 * Server-side dictionaries (#9, ADR-010). Server components get a translator;
 * client components get only a slice (`pickMessages`), so neither dictionary is
 * shipped to the browser whole.
 */
const DICTIONARIES: Record<Locale, Partial<Messages>> = { en, vi };

const warned = new Set<string>();

/** The message in `locale`, else English. A missing translation warns once per key in development. */
export function lookupMessage(locale: Locale, id: MessageId, dictionaries: Record<Locale, Partial<Messages>> = DICTIONARIES): string {
  const value = dictionaries[locale][id];
  if (typeof value === "string") return value;
  if (process.env.NODE_ENV !== "production" && !warned.has(`${locale}:${id}`)) {
    warned.add(`${locale}:${id}`);
    console.warn(`[i18n] "${id}" has no ${locale} translation; using English`);
  }
  return dictionaries.en[id] ?? en[id] ?? id;
}

export type Translator = ((id: MessageId, values?: MessageValues) => string) & {
  /** `t.plural("invite.plusOnes", n)` reads `.one` or `.other`, with `{count}` filled in. */
  plural: (base: PluralBase<MessageId>, count: number, values?: MessageValues) => string;
};

export type I18n = {
  locale: Locale;
  /** For `Intl.DateTimeFormat` and friends: `en-GB` or `vi-VN`. */
  intl: string;
  t: Translator;
};

export function createI18n(locale: Locale, dictionaries?: Record<Locale, Partial<Messages>>): I18n {
  const t = ((id: MessageId, values?: MessageValues) => formatMessage(lookupMessage(locale, id, dictionaries), values)) as Translator;
  t.plural = (base, count, values) =>
    formatMessage(lookupMessage(locale, `${base}.${pluralKey(count)}` as MessageId, dictionaries), { count, ...values });
  return { locale, intl: INTL_LOCALE[locale], t };
}

/** Every message under the given prefixes, in `locale` with English filling any gap: the prop for one client component. */
export function pickMessages<P extends string>(locale: Locale, ...prefixes: P[]): MessageSlice<P> {
  const slice: Record<string, string> = {};
  for (const id of Object.keys(en) as MessageId[]) {
    if (prefixes.some((prefix) => id.startsWith(prefix))) slice[id] = lookupMessage(locale, id);
  }
  return slice as MessageSlice<P>;
}

export type { MessageId, MessageKeys };
