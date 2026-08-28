import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        neutral: "border-transparent bg-muted text-muted-foreground",
        success: "border-transparent bg-success/15 text-success",
        // Was text-amber-700, which is a light-theme colour and vanished on a
        // dark surface. The token follows the theme; a raw palette step does not.
        warning: "border-transparent bg-warning/15 text-warning",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        outline: "border-border text-foreground",
        // Tier badges. The metal reference is earned here — these are the
        // literal names of the memberships — and used nowhere else.
        silver: "border-transparent tier-silver",
        gold: "border-transparent tier-gold",
        diamond: "border-transparent tier-diamond",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
