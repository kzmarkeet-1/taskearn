import type { Metadata } from "next";
import { Prose, PageIntro } from "@/components/site/prose";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What TaskEarn collects, why, how long it is kept and what it is never used for.",
};

export default function PrivacyPage() {
  return (
    <>
      <PageIntro
        eyebrow="Legal"
        title="Privacy policy"
        description="A starting template describing the data this platform actually handles. Have it reviewed against the law that applies to you before launch."
      />
      <div className="container max-w-3xl py-12">
        <Prose>
          <p className="text-xs uppercase tracking-wide">Last updated: on deployment</p>

          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Account details</strong> — name, email, mobile number, country and the referral code you arrived
              with. Passwords are stored only as a bcrypt hash and can never be read back.
            </li>
            <li>
              <strong>Activity</strong> — the tasks and surveys you start and complete, timings for those sessions, and
              every wallet movement.
            </li>
            <li>
              <strong>Payout details</strong> — the account name and number you ask us to pay, needed to send money.
            </li>
            <li>
              <strong>Security signals</strong> — a hashed form of your IP address and browser user-agent for each
              session. We store the hash, not the raw value.
            </li>
          </ul>

          <h2>What we do not do</h2>
          <p>
            We do not fingerprint your device, track you across other sites, read your location in the background,
            install tracking on your machine, or sell your personal data. The risk engine works only on data the
            service already needs to function, which is listed above. If that ever changes, this page changes first.
          </p>

          <h2>Why we hold it</h2>
          <ul>
            <li>To run your account and pay you correctly.</li>
            <li>To detect duplicate accounts, automated completions and payout fraud.</li>
            <li>To meet record-keeping obligations and answer support tickets.</li>
          </ul>

          <h2>Who else sees it</h2>
          <p>
            Survey panels receive an opaque identifier for you and the survey outcome — never your name, email or
            phone number. Payout providers receive the payout details you supply so that the transfer can be made.
            Infrastructure providers process data on our instructions.
          </p>

          <h2>How long we keep it</h2>
          <p>
            Account and transaction records are retained while your account is open and for as long afterwards as
            record-keeping requires. Wallet transactions are append-only and are never edited or deleted, because an
            auditable money trail is the point of them.
          </p>

          <h2>Your choices</h2>
          <ul>
            <li>Request a copy of your data, or a correction, through support.</li>
            <li>Ask us to close your account. Records required for financial audit are kept.</li>
            <li>Opt out of marketing messages without affecting service notifications.</li>
          </ul>

          <h2>Cookies</h2>
          <p>
            One httpOnly session cookie keeps you signed in. It is not used for advertising or analytics profiling.
          </p>

          <h2>Contact</h2>
          <p>Reach the team through the contact page or a support ticket in your dashboard.</p>
        </Prose>
      </div>
    </>
  );
}
