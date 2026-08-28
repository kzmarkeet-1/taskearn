"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      // Sonner ships its own light palette and would otherwise drop a white
      // card onto a dark page. `theme` switches its internals; the classNames
      // pull the surface back onto our own tokens.
      theme="dark"
      toastOptions={{
        classNames: {
          toast: "rounded-lg border border-border bg-popover text-foreground shadow-lift",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
          error: "border-l-2 border-l-destructive",
          success: "border-l-2 border-l-success",
        },
      }}
    />
  );
}
