"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function UserFilters({ defaultQuery, defaultStatus }: { defaultQuery: string; defaultStatus: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [status, setStatus] = useState(defaultStatus);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status !== "ALL") params.set("status", status);
    router.push(`/admin/users?${params.toString()}`);
  }

  return (
    <form onSubmit={apply} className="flex flex-col gap-3 sm:flex-row">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Name, email, phone or referral code"
        aria-label="Search users"
        className="sm:flex-1"
      />
      <Select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        aria-label="Filter by status"
        className="sm:w-48"
      >
        <option value="ALL">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="UNDER_REVIEW">Under review</option>
        <option value="SUSPENDED">Suspended</option>
        <option value="BANNED">Banned</option>
      </Select>
      <Button type="submit">
        <Search className="size-4" />
        Search
      </Button>
    </form>
  );
}
