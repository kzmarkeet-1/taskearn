"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useRouter } from "next/navigation";

const REPORTS = [
  { value: "summary", label: "Summary" },
  { value: "daily", label: "Daily revenue" },
  { value: "campaigns", label: "Campaigns" },
  { value: "surveys", label: "Surveys" },
  { value: "withdrawals", label: "Withdrawals" },
  { value: "fraud", label: "Risk signals" },
];

export function ExportButtons({ days }: { days: number }) {
  const router = useRouter();
  const from = new Date(Date.now() - days * 24 * 3600_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={String(days)}
        onChange={(event) => router.push(`/admin/reports?days=${event.target.value}`)}
        aria-label="Period"
        className="h-9 w-auto text-sm"
      >
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
      </Select>

      <Select
        defaultValue="summary"
        onChange={(event) => {
          window.location.href = `/api/admin/reports?format=csv&report=${event.target.value}&from=${from}&to=${to}`;
        }}
        aria-label="Export a report as CSV"
        className="h-9 w-auto text-sm"
      >
        {REPORTS.map((report) => (
          <option key={report.value} value={report.value}>
            Export: {report.label}
          </option>
        ))}
      </Select>

      <Button variant="outline" asChild>
        <Link href={`/api/admin/reports?format=csv&report=summary&from=${from}&to=${to}`}>
          <Download className="size-4" />
          CSV
        </Link>
      </Button>
    </div>
  );
}
