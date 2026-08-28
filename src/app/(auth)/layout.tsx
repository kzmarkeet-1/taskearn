import Link from "next/link";
import { Wallet, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-10 sm:px-10">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" />
          </span>
          TaskEarn
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <p className="text-xs text-muted-foreground">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            privacy policy
          </Link>
          .
        </p>
      </div>

      <aside className="relative hidden bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 grid-backdrop opacity-[0.07]" aria-hidden />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-background/20 px-3 py-1 text-xs">
            <ShieldCheck className="size-3.5" />
            Free to join · no deposits
          </p>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">Complete tasks. Earn rewards.</h2>
          <p className="mt-4 text-background/70">
            Sponsored video campaigns and qualifying surveys, with a wallet where every reward, fee and reversal is a
            line you can read for yourself.
          </p>
        </div>
        <p className="relative text-xs text-background/50">
          Rewards depend on availability. Earnings are not guaranteed and this is not an investment.
        </p>
      </aside>
    </div>
  );
}
