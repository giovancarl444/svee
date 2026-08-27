import {
  Compass,
  Zap,
  CandlestickChart,
  Wallet,
  Trophy,
  Radio,
  LayoutDashboard,
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
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Callouts", href: "/callouts", icon: Radio },
  { label: "Cupsey", href: "/cupsey", icon: Radio },
  { label: "Trade", href: "/trade", icon: CandlestickChart },
  { label: "Portfolio", href: "/portfolio", icon: Wallet },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "Settings", href: "/settings", icon: Settings },
];
