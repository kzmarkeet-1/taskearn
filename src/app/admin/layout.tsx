import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/dashboard/app-shell";
import { ADMIN_NAV } from "@/components/dashboard/nav-config";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  // The middleware already blocks non-admins; this is the authoritative check.
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <AppShell nav={ADMIN_NAV} user={user} variant="admin">
      <div id="main">{children}</div>
    </AppShell>
  );
}
