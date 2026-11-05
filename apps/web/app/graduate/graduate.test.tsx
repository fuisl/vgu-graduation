import type { GraduateGuest } from "@grad/contract";
import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { pickMessages } from "../../lib/i18n/dictionary";
import { GuestLinkPanel } from "./_components/GuestLinkPanel";
import { GuestSummary, GuestsProvider } from "./_components/GuestsProvider";
import { GuestsPanel } from "./_components/GuestsPanel";
import { InviteForm } from "./_components/InviteForm";

// The actions read cookies and call the API; rendering never runs them.
vi.mock("./actions", () => ({ removeGuest: vi.fn(), inviteGuest: vi.fn(), confirmGraduateSignIn: vi.fn(), signOutGraduate: vi.fn() }));

const guest = (overrides: Partial<GraduateGuest> = {}): GraduateGuest => ({
  id: "9b2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  name: "Bao Tran",
  email: "bao@example.com",
  status: "attending",
  answeredAt: "2026-11-03T04:00:00.000Z",
  removal: "revoke",
  ...overrides,
});

const panel = (guests: GraduateGuest[], locale: "en" | "vi" = "en") =>
  html(
    <GuestsProvider initial={guests}>
      <GuestsPanel intl={locale === "en" ? "en-GB" : "vi-VN"} messages={pickMessages(locale, "graduatePortal.guests.")} fallback={<p>list failed</p>} />
    </GuestsProvider>,
  );

describe("GuestsPanel", () => {
  it("explains how to share the link when there are no guests, with no empty controls", () => {
    const page = panel([]);
    expect(page).toContain("No guests yet");
    expect(page).toContain("Send your guest link");
    expect(page).not.toContain('type="search"');
  });

  it("shows name, email, answer and date in a list, never a table", () => {
    const page = panel([
      guest(),
      guest({ id: "9b2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Chi Pham", email: null, status: "pending", answeredAt: null, removal: "unlink" }),
    ]);
    expect(page).toContain("<ul");
    expect(page).not.toContain("<table");
    expect(page).toContain("Bao Tran");
    expect(page).toContain("bao@example.com");
    expect(page).toContain("Answered 3 Nov 2026");
    expect(page).toContain("No answer yet");
    expect(page).toContain("No email on file");
    expect(page).toContain("2 guests");
    expect(page).toContain('aria-label="Remove Bao Tran"');
  });

  it("has no Remove for a guest the organizers added, only a note, in both languages", () => {
    const row = guest({ removal: "not_allowed" });
    const en = panel([row]);
    expect(en).toContain("Added by the organizers");
    expect(en).not.toContain("Remove Bao Tran");
    const vi = panel([row], "vi");
    expect(vi).toContain("Do ban tổ chức thêm");
    expect(vi).not.toContain("aria-label=\"Xóa Bao Tran\"");
    expect(panel([guest({ removal: "unlink" })])).toContain('aria-label="Remove Bao Tran"');
  });

  it("has search and filter, and reads in Vietnamese with full diacritics", () => {
    const page = panel([guest()], "vi");
    expect(page).toContain('type="search"');
    expect(page).toContain("Sẽ tham dự");
    expect(page).toContain("Không tham dự");
    expect(page).toContain("Chưa trả lời");
  });
});

describe("when the guest list failed to load", () => {
  const degraded = html(
    <GuestsProvider initial={null}>
      <GuestSummary messages={pickMessages("en", "graduatePortal.summary.")} />
      <GuestsPanel intl="en-GB" messages={pickMessages("en", "graduatePortal.guests.")} fallback={<p>list failed</p>} />
      <InviteForm messages={pickMessages("en", "graduatePortal.invite.")} />
    </GuestsProvider>,
  );

  it("shows the section's error and no counts, and the invite form still works", () => {
    expect(degraded).toContain("list failed");
    expect(degraded).not.toContain("portal-summary");
    expect(degraded).not.toContain("No guests yet");
    expect(degraded).toContain("Send invitation");
  });
});

describe("GuestSummary", () => {
  it("counts from the same list the panel shows", () => {
    const page = html(
      <GuestsProvider initial={[guest(), guest({ status: "pending", answeredAt: null })]}>
        <GuestSummary messages={pickMessages("en", "graduatePortal.summary.")} />
      </GuestsProvider>,
    );
    expect(page).toContain("<dt>Attending</dt><dd>1</dd>");
    expect(page).toContain("<dt>Declined</dt><dd>0</dd>");
    expect(page).toContain("<dt>Not answered yet</dt><dd>1</dd>");
  });
});

describe("removal copy", () => {
  const en = pickMessages("en", "graduatePortal.guests.");
  const vi_ = pickMessages("vi", "graduatePortal.guests.");

  it("says plainly that a sole inviter's removal stops the guest's link", () => {
    expect(en["graduatePortal.guests.confirmSole"]).toContain("their invitation link will stop working");
    expect(vi_["graduatePortal.guests.confirmSole"]).toContain("đường dẫn thiệp mời của họ sẽ ngừng hoạt động");
  });

  it("says an unlinked guest's invitation stays, without naming anyone", () => {
    expect(en["graduatePortal.guests.confirmUnlink"]).toContain("Their invitation stays active");
    expect(vi_["graduatePortal.guests.confirmUnlink"]).toContain("vẫn còn hiệu lực");
  });
});

describe("GuestLinkPanel", () => {
  it("shows the link read-only with a copy button; sharing appears only once the device says it can", () => {
    const page = html(<GuestLinkPanel joinUrl="https://grad26.example.com/join/code-ann-123" messages={pickMessages("en", "graduatePortal.link.")} />);
    expect(page).toContain('value="https://grad26.example.com/join/code-ann-123"');
    expect(page).toContain("readOnly");
    expect(page).toContain("Copy link");
    expect(page).not.toContain(">Share<");
  });
});

describe("InviteForm", () => {
  it("asks for a name and email, sends no code, and says an invitation goes only once", () => {
    const page = html(
      <GuestsProvider initial={[]}>
        <InviteForm messages={pickMessages("en", "graduatePortal.invite.")} />
      </GuestsProvider>,
    );
    expect(page).toContain('name="name"');
    expect(page).toContain('name="email"');
    expect(page).not.toContain("code");
    expect(page).toContain("An invitation is emailed only once");
  });
});
