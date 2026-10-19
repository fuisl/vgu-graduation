import type { Mailer, MailMessage } from "./mailer.js";

/** In-memory Mailer for tests: records what was sent, or fails every send while `failing`. */
export function fakeMailer() {
  const sent: MailMessage[] = [];
  const state = { failing: false };
  const mailer: Mailer = {
    async send(message) {
      if (state.failing) throw Object.assign(new Error("Invalid login"), { code: "EAUTH" });
      sent.push(message);
    },
  };
  return {
    mailer,
    sent,
    fail(on = true) {
      state.failing = on;
    },
  };
}
