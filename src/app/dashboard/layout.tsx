import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/dashboard/app-shell";
import { USER_NAV, USER_MOBILE_NAV } from "@/components/dashboard/nav-config";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const unread = await unreadCount(user.id);

  return (
    <AppShell nav={USER_NAV} mobileNav={USER_MOBILE_NAV} user={user} unread={unread}>
      <div id="main">{children}</div>
    </AppShell>
  );
}
