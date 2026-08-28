import {
  BarChart3,
  Bell,
  ClipboardList,
  Coins,
  FileText,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
  Banknote,
  UserPlus,
  PlaySquare,
  ScrollText,
  Plug,
  Gem,
} from "lucide-react";

export const USER_NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/tasks", label: "Video tasks", icon: PlaySquare },
  { href: "/dashboard/surveys", label: "Surveys", icon: ClipboardList },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/withdraw", label: "Withdraw", icon: Banknote },
  { href: "/dashboard/membership", label: "Membership", icon: Gem },
  { href: "/dashboard/referrals", label: "Referrals", icon: UserPlus },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
];

/** Four items the thumb can reach, for the mobile bar. */
export const USER_MOBILE_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/tasks", label: "Tasks", icon: PlaySquare },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/withdraw", label: "Withdraw", icon: Banknote },
];

export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/admin/tasks", label: "Tasks", icon: PlaySquare },
  { href: "/admin/surveys", label: "Surveys", icon: ClipboardList },
  { href: "/admin/survey-providers", label: "Survey providers", icon: Plug },
  { href: "/admin/wallet", label: "Wallet", icon: Wallet },
  { href: "/admin/transactions", label: "Transactions", icon: Coins },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: Banknote },
  { href: "/admin/referrals", label: "Referrals", icon: UserPlus },
  { href: "/admin/fraud", label: "Fraud detection", icon: ShieldAlert },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
];

export const ICONS = { FileText, Flag };
