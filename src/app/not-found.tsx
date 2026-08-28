import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">That page does not exist</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The link may be out of date. Head back to the homepage, or open your dashboard to pick up where you left off.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/">Go to homepage</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
