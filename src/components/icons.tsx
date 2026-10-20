import {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  Database,
  FileSignature,
  FolderOpen,
  Globe,
  Landmark,
  Link2,
  Mail,
  PenLine,
  Search,
  Shield,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { ICON_KEYS, type IconKey } from "@/lib/portal.types";

const ICONS: Record<IconKey, LucideIcon> = {
  search: Search,
  building: Building2,
  globe: Globe,
  chart: BarChart3,
  signature: FileSignature,
  pen: PenLine,
  briefcase: Briefcase,
  users: Users,
  mail: Mail,
  video: Video,
  calendar: Calendar,
  landmark: Landmark,
  calculator: Calculator,
  link: Link2,
  folder: FolderOpen,
  shield: Shield,
  book: BookOpen,
  database: Database,
};

export function ServiceIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[(ICON_KEYS as readonly string[]).includes(name) ? (name as IconKey) : "link"];
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}

export const ICON_CHOICES = ICON_KEYS;
