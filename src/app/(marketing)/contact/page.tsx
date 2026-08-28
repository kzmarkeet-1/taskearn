import type { Metadata } from "next";
import { PageIntro } from "@/components/site/prose";
import { ContactForm } from "./contact-form";
import { Card, CardContent } from "@/components/ui/card";
import { LifeBuoy, Megaphone, ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach the TaskEarn team about your account, a campaign or a suspected scam.",
};

const ROUTES = [
  {
    icon: LifeBuoy,
    title: "Account and rewards",
    body: "Signed in already? A support ticket from your dashboard reaches the team with your account attached, which is faster.",
  },
  {
    icon: Megaphone,
    title: "Advertising",
    body: "Tell us the video, the audience and the budget, and we will come back with a campaign plan.",
  },
  {
    icon: ShieldAlert,
    title: "Report a scam",
    body: "If anyone asked you to pay TaskEarn, or promised you guaranteed earnings, send us the details. We never charge members.",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageIntro
        eyebrow="Contact"
        title="Get in touch"
        description="Tell us what you need and we will route it to the right person."
      />
      <div className="container grid max-w-5xl gap-8 py-12 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="p-6">
            <ContactForm />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {ROUTES.map((route) => (
            <div key={route.title} className="rounded-xl border bg-card p-5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <route.icon className="size-4" aria-hidden />
              </span>
              <h3 className="mt-3 text-sm font-semibold">{route.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{route.body}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
