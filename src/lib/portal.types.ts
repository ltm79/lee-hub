export const ICON_KEYS = [
  "search",
  "building",
  "globe",
  "chart",
  "signature",
  "pen",
  "briefcase",
  "users",
  "mail",
  "video",
  "calendar",
  "landmark",
  "calculator",
  "link",
  "folder",
  "shield",
  "book",
  "database",
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

export type Office = {
  name: string;
  city: string;
  tagline: string;
};

export type MemberRole = "admin" | "staff" | "assistant" | "agent";

export function roleLabel(role: MemberRole | null): string {
  if (role === "admin") return "Administrator";
  if (role === "staff") return "Staff";
  if (role === "assistant") return "Assistant";
  return "Agent";
}

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type DeskLink = {
  id: string;
  categoryId: string;
  name: string;
  url: string;
  blurb: string;
  hint: string;
  icon: string;
  sortOrder: number;
};

export type AdminLink = DeskLink & { active: boolean };

export type RosterPerson = {
  userId: string;
  name: string;
  email: string;
  title: string;
  role: MemberRole;
};

export type PortalReady = {
  status: "ready";
  office: Office;
  member: {
    role: MemberRole;
    title: string;
    name: string;
    email: string;
    deals: boolean;
  };
  categories: Category[];
  links: DeskLink[];
  favoriteIds: string[];
  people: RosterPerson[];
};

export type PortalSnapshot =
  | PortalReady
  | { status: "pending"; name: string; email: string }
  | { status: "disabled"; name: string; email: string };

export const MEMBER_OFFICES = ["LA Central", "City of Industry"] as const;
export type MemberOffice = (typeof MEMBER_OFFICES)[number];

export type AdminPerson = {
  userId: string;
  name: string;
  email: string;
  title: string;
  office: string;
  agentIds: string[];
  role: MemberRole | null;
  deals: boolean;
  active: boolean;
  pending: boolean;
  hasPassword: boolean;
};

export type AdminSnapshot = {
  people: AdminPerson[];
  categories: Category[];
  links: AdminLink[];
};

export type ActionResult = { ok: true } | { ok: false; error: string };

export type LibraryNode = {
  id: string;
  kind: "folder" | "file";
  name: string;
  sizeBytes: number;
};

export type AdminResponse =
  | { ok: true; data: AdminSnapshot }
  | { ok: false; error: string };
