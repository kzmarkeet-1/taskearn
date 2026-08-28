import { cn } from "@/lib/utils";

/** Shared wrapper for policy and long-form content pages. */
export function Prose({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "prose-sm max-w-none space-y-5 text-sm leading-relaxed text-muted-foreground",
        "[&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground",
        "[&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5",
        "[&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_a]:font-medium [&_a]:text-primary hover:[&_a]:underline",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageIntro({ eyebrow, title, description }: { eyebrow?: string; title: string; description: string }) {
  return (
    <div className="border-b bg-card">
      <div className="container max-w-3xl py-14">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
