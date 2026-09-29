import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PassBadgeView } from "./PassBadgeView";

// Called as a function so the test needs no JSX transform (the app's vitest config has none).
describe("PassBadgeView", () => {
  it("renders an accessible image naming the guest", () => {
    const html = renderToStaticMarkup(
      PassBadgeView({ state: "ready", svg: "<svg></svg>", guestName: "Nguyễn Ánh", eventName: "GRAD '26", date: "Saturday" }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain("QR code badge for Nguyễn Ánh");
    expect(html).toContain("Save badge");
  });

  it("shows a short note when unavailable", () => {
    const html = renderToStaticMarkup(PassBadgeView({ state: "unavailable" }));
    expect(html).toContain("unavailable");
    expect(html).not.toContain('role="img"');
  });
});
