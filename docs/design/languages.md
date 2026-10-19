# Languages (English and Vietnamese)

The guest-facing site reads in English or Vietnamese (#9). English is the source and the fallback. German appears only as a caption language on `/live` and the event display. Admin is internal and stays English. The decision and its trade-offs are in [ADR-010](../adr/010-site-languages.md).

## How a guest gets a language

- First visit: the browser's `Accept-Language` (any `vi*` tag ranked above English gives Vietnamese), else English.
- After choosing: the `lang` cookie, for a year. The URL never changes; invitation links keep working as they are.
- The switch is a small mono **EN | VI** pill: next to the guest chip on desktop, above it in the mobile menu sheet, and in the footer's meta row. It is a form posting to `/api/locale`, so it also works before or without JavaScript, and it reloads the same page in the new language. Each option is named by its code and then in its own language (`aria-label="VI, Tiếng Việt"`, `lang="vi"`; the name starts with the visible text), the current one has `aria-current="true"`, and each is a 44px target.

## Writing copy

- Every guest-facing string is a message in `apps/web/lib/i18n/messages/en.ts` with the same key in `vi.ts`. This includes headings, buttons, status, loading, empty and error states, `aria-label`, `alt`, `title` and page metadata.
- Keys are `<surface>.<thing>` (`venue.email.send`, `rsvp.a11y.need.wheelchair`). Reuse `common.*` (Try again, Directions, When, Where) before adding a new one.
- Page titles (`<surface>.metaTitle`) read `<Page> | GRAD '26` in both languages; the landing is `GRAD '26 | VGU graduation`. Every guest page sets one, the 404 page and `/invite/demo` included (#78).
- Placeholders are `{name}`. Never build a sentence from fragments; put a link inside a sentence with `formatRich(t("x"), { link: <a …>{t("x.link")}</a> })` so translators control word order.
- Counts are a pair, `foo.one` and `foo.other`, read with `t.plural("foo", n)`. Vietnamese repeats the same text in both.
- Proper nouns stay as they are in both languages: VGU, GRAD '26, Ceremony Hall, Sunrise River, West Bridge, Ring Road 4, programme names on the sculpture, and the language endonyms Deutsch, English, Tiếng Việt.
- Vietnamese uses a formal register for families: guests are "Quý khách", graduates "các tân khoa", organizers "ban tổ chức". Write full diacritics; Inter Tight and Geist Mono both carry them (checked at 360px, including uppercase mono eyebrows).
- Mark a phrase you are unsure of with an inline `// TODO(owner): …` in `vi.ts`. The whole file is a draft until a native speaker has reviewed it.

## Event information

Event facts come from `GET /event`. The venue name, contact and times are the same in both languages. The event name, the address and the arrival notes have optional Vietnamese twins (`nameVi`, `venue.addressVi`, `arrivalInfoVi`), edited in the admin event form; empty shows the English text. Pages call `localizeEvent` (or `localizeEventResult`) before using the event. Guide-book items, wishes and names are shown as typed.

## Dates

Format with `Intl` and `i18n.intl` (`en-GB` or `vi-VN`): "Friday 20 November" / "Thứ Sáu, 20 tháng 11". Clock times stay 24-hour in both. The landing hero keeps `en-US` in English ("November 20").
