/**
 * The developers credited on /about (#7). Source: "Roles and area owners" in
 * docs/development/workflow.md. GitHub handles and roles only: no names, emails or other PII.
 */
export interface Developer {
  /** GitHub handle; also the key into PORTRAITS. */
  handle: string;
  roles: readonly string[];
  bio: string;
}

// TODO(owner): confirm each developer is happy with an ASCII portrait drawn from their GitHub avatar.
// TODO(owner): replace the four draft bios (written from workflow.md roles) with the developers' own words.
export const TEAM: readonly Developer[] = [
  {
    handle: "fuisl",
    roles: ["Project owner", "Design", "Web", "Features"],
    bio: "Leads the design language, the web app and the product features, and approves architecture decisions.",
  },
  {
    handle: "nhientruong04",
    roles: ["Backend", "Infrastructure"],
    bio: "Leads the API, the data model and the homelab the ceremony runs on.",
  },
  {
    handle: "dducwsxuaan",
    roles: ["Web"],
    bio: "Builds parts of the guest-facing web app and reviews web and design work.",
  },
  {
    handle: "AndrwPham",
    roles: ["Web", "Project management", "Backend"],
    bio: "Builds parts of the web app, keeps the project board moving and backs up the API.",
  },
];

export const githubUrl = (handle: string) => `https://github.com/${encodeURIComponent(handle)}`;

export const SOURCE_URL = "https://github.com/fuisl/vgu-graduation";
