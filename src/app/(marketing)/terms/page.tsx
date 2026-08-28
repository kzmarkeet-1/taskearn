import type { Metadata } from "next";
import { Prose, PageIntro } from "@/components/site/prose";

export const metadata: Metadata = {
  title: "Terms & conditions",
  description: "The agreement between TaskEarn and its members.",
};

export default function TermsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Legal"
        title="Terms & conditions"
        description="These terms are a starting template written for this product. Have a qualified lawyer in your jurisdiction review and adapt them before you launch."
      />
      <div className="container max-w-3xl py-12">
        <Prose>
          <p className="text-xs uppercase tracking-wide">Last updated: on deployment</p>

          <h2>1. What TaskEarn is</h2>
          <p>
            TaskEarn is a task-and-rewards platform. Members complete sponsored video tasks and qualifying third-party
            surveys and receive rewards funded by advertisers and research panels. TaskEarn is not a bank, an
            investment service, a securities product or a money transmitter, and it does not offer any financial
            product.
          </p>

          <h2>2. No deposits, ever</h2>
          <p>
            Members are never required to deposit money to participate and TaskEarn provides no mechanism to do so. Any
            person or site asking you to pay TaskEarn is not acting for us. Report it through support.
          </p>

          <h2>3. Eligibility</h2>
          <ul>
            <li>You must be at least 18 years old and legally able to enter this agreement.</li>
            <li>One account per person. Duplicate accounts may be suspended and their balances withheld pending review.</li>
            <li>You must give accurate registration details and keep your payout details current and your own.</li>
          </ul>

          <h2>4. Rewards are not guaranteed income</h2>
          <p>
            Rewards depend on task and survey availability, which fluctuates with advertiser and panel demand. Survey
            eligibility is decided by the panel, not by TaskEarn. Nothing on this platform is a promise of any level of
            earnings, and no employment relationship is created.
          </p>

          <h2>5. Pending rewards and verification</h2>
          <p>
            Rewards enter a pending balance and clear to the available balance after a verification hold. A reward may
            be reduced or reversed if the funding advertiser or panel reverses the underlying completion, or if the
            completion is found to breach these terms. Reversals are recorded in your transaction history with a
            reason.
          </p>

          <h2>6. Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use bots, scripts, emulators, automation or any tool that simulates activity you did not perform.</li>
            <li>Generate artificial views, watch time or engagement, or interfere with any platform&apos;s fraud controls.</li>
            <li>Operate more than one account, or sell, share or transfer an account.</li>
            <li>Give false answers in surveys, or complete a survey you were not eligible for.</li>
            <li>Use payout details belonging to another person, or route payouts through third parties.</li>
          </ul>
          <p>
            Breaching this section can result in rejection of completions, reversal of rewards, suspension, or a
            permanent ban with forfeiture of unpaid balances.
          </p>

          <h2>7. Withdrawals</h2>
          <p>
            Withdrawals are subject to the published minimum, maximum, fee and daily limit, which may change. Requests
            are reviewed before processing and may be declined where fraud is suspected or where payout details cannot
            be verified. Declined requests return the full amount, including the fee, to your wallet.
          </p>

          <h2>8. Third-party services</h2>
          <p>
            Surveys are operated by third-party panels and videos are hosted by third-party platforms. Their own terms
            and privacy policies apply to your use of them. TaskEarn is not responsible for their content, screening
            decisions or availability.
          </p>

          <h2>9. Suspension and closure</h2>
          <p>
            We may suspend or close an account that breaches these terms, that the risk engine flags as high risk
            pending review, or where we are required to by law. You may close your account at any time through support;
            balances below the withdrawal minimum cannot be paid out.
          </p>

          <h2>10. Changes</h2>
          <p>
            We may update these terms. Material changes will be notified in the platform. Continued use after a change
            means you accept the updated terms.
          </p>

          <h2>11. Liability</h2>
          <p>
            TaskEarn is provided as-is. To the extent permitted by law, our liability is limited to the value of
            rewards correctly earned and unpaid on your account.
          </p>

          <h2>12. No regulatory claims</h2>
          <p>
            TaskEarn makes no claim of licensing, registration or approval by any financial or regulatory authority.
            Do not state or imply otherwise unless and until such approval has actually been obtained and verified.
          </p>
        </Prose>
      </div>
    </>
  );
}
