import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Briefcase, LayoutGrid, Menu, Settings, Trophy, Users, X } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { LeeLogo } from "@/components/mark";

export type DeskSection = "desk" | "deals" | "people" | "admin" | "board";

export type HubGroup = { id: string; name: string; tone: number };

export function hubGroups(snap: {
  favoriteIds: string[];
  categories: { id: string; name: string }[];
  links: { categoryId: string }[];
}): HubGroup[] {
  const groups: HubGroup[] = [];
  let tone = 0;
  if (snap.favoriteIds.length > 0) {
    groups.push({ id: "pinned", name: "Pinned", tone });
    tone += 1;
  }
  for (const category of snap.categories) {
    const hasLinks = snap.links.some((link) => link.categoryId === category.id);
    const market = category.id === "research" || category.name.trim().toLowerCase() === "market research";
    if (hasLinks || market) {
      groups.push({ id: category.id, name: category.name, tone });
      tone += 1;
    }
  }
  const hasMarket = snap.categories.some(
    (category) => category.id === "research" || category.name.trim().toLowerCase() === "market research",
  );
  if (!hasMarket) groups.push({ id: "market", name: "Market research", tone });
  return groups;
}

const NAV: { id: DeskSection; label: string; to: "/" | "/deals" | "/leaderboard" | "/people" | "/admin"; icon: typeof LayoutGrid }[] = [
  { id: "desk", label: "Hub", to: "/", icon: LayoutGrid },
  { id: "deals", label: "Deals", to: "/deals", icon: Briefcase },
  { id: "board", label: "Leaderboard", to: "/leaderboard", icon: Trophy },
  { id: "people", label: "People", to: "/people", icon: Users },
  { id: "admin", label: "Admin", to: "/admin", icon: Settings },
];
