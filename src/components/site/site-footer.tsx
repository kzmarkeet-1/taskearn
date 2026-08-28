import Link from "next/link";
import { Wallet } from "lucide-react";

const GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/earn", label: "Video tasks" },
      { href: "/surveys", label: "Paid surveys" },
      { href: "/advertisers", label: "Advertise with us" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/terms", label: "Terms & conditions" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/responsible-earnings", label: "Responsible earnings" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="size-4" />
            </span>
            TaskEarn
          </Link>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Rewards for completing sponsored video tasks and qualifying surveys. Taking part is free — TaskEarn never
            asks members for money.
          </p>
        </div>

        {GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-semibold">{group.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t">
        <div className="container flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} TaskEarn. All rights reserved.</p>
          <p>
            Rewards depend on what tasks and surveys are available to you. Earnings are not guaranteed and are not an
            investment.
          </p>
        </div>
      </div>
    </footer>
  );
}
