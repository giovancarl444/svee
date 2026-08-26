import {
  Compass,
  Zap,
  CandlestickChart,
  Wallet,
  Trophy,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Discover", href: "/discover", icon: Compass },
  { label: "Pulse", href: "/pulse", icon: Zap },
  { label: "Trade", href: "/trade", icon: CandlestickChart },
  { label: "Portfolio", href: "/portfolio", icon: Wallet },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "Settings", href: "/settings", icon: Settings },
];
