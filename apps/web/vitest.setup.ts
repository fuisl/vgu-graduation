import { vi } from "vitest";

/**
 * Pages call getI18n(), which reads the `lang` cookie and Accept-Language (#9). Outside a Next
 * request there are neither, so by default tests render in English. A test file that mocks
 * next/headers itself overrides this.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
  headers: async () => new Headers(),
}));
