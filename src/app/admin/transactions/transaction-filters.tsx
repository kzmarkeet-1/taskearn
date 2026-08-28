"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const TYPES = [
  "ALL",
  "VIDEO_REWARD",
  "SURVEY_REWARD",
  "REFERRAL_REWARD",
  "BONUS",
  "WITHDRAWAL",
  "WITHDRAWAL_FEE",
  "REVERSAL",
  "ADMIN_ADJUSTMENT",
];

export function TransactionFilters({ defaultType, defaultQuery }: { defaultType: string; defaultQuery: string }) {
  const router = useRouter();
  const [type, setType] = useState(defaultType);
  const [query, setQuery] = useState(defaultQuery);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (type !== "ALL") params.set("type", type);
    if (query) params.set("q", query);
    router.push(`/admin/transactions?${params.toString()}`);
  }

  return (
    <form onSubmit={apply} className="flex flex-col gap-3 sm:flex-row">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Member name, email or reference"
        aria-label="Search transactions"
        className="sm:flex-1"
      />
      <Select value={type} onChange={(event) => setType(event.target.value)} aria-label="Type" className="sm:w-56">
        {TYPES.map((value) => (
          <option key={value} value={value}>
            {value === "ALL" ? "All types" : value.replace(/_/g, " ").toLowerCase()}
          </option>
        ))}
      </Select>
      <Button type="submit">
        <Search className="size-4" />
        Filter
      </Button>
    </form>
  );
}
