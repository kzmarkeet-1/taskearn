"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

const STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ALL", label: "All" },
];

export function WithdrawalFilters({ current }: { current: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUSES.map((status) => (
        <Button
          key={status.value}
          variant={current === status.value ? "default" : "outline"}
          size="sm"
          asChild
        >
          <Link href={`/admin/withdrawals?status=${status.value}`}>{status.label}</Link>
        </Button>
      ))}
    </div>
  );
}
