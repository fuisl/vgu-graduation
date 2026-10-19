/**
 * The developers credited on /about (#7). Source: "Roles and area owners" in
 * docs/development/workflow.md. GitHub handles and roles only: no names, emails or other PII.
 * Role names are `about.role.<role>` messages and bios `about.bio.<handle>` (#9).
 */
export type TeamHandle = "fuisl" | "nhientruong04" | "dducwsxuaan" | "AndrwPham";
export type TeamRole = "owner" | "design" | "web" | "features" | "backend" | "infrastructure" | "pm";

export interface Developer {
  /** GitHub handle; also the key into PORTRAITS. */
  handle: TeamHandle;
  roles: readonly TeamRole[];
}

// TODO(owner): confirm each developer is happy with an ASCII portrait drawn from their GitHub avatar.
// TODO(owner): replace the four draft bios (`about.bio.*` in lib/i18n/messages, written from workflow.md roles) with the developers' own words.
export const TEAM: readonly Developer[] = [
  { handle: "fuisl", roles: ["owner", "design", "web", "features"] },
  { handle: "nhientruong04", roles: ["backend", "infrastructure"] },
  { handle: "dducwsxuaan", roles: ["web"] },
  { handle: "AndrwPham", roles: ["web", "pm", "backend"] },
];

export const githubUrl = (handle: string) => `https://github.com/${encodeURIComponent(handle)}`;

export const SOURCE_URL = "https://github.com/fuisl/vgu-graduation";
