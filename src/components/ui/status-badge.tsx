import { Badge, type BadgeProps } from "./badge";
import { titleCase } from "@/lib/utils";

/** One place that decides which colour a status gets, so the whole app agrees. */
const TONE: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "success",
  COMPLETED: "success",
  APPROVED: "success",
  QUALIFIED: "success",
  REWARDED: "success",
  RESOLVED: "success",

  PENDING: "warning",
  PENDING_REVIEW: "warning",
  UNDER_REVIEW: "warning",
  PROCESSING: "warning",
  STARTED: "warning",
  SUBMITTED: "warning",
  WAITING_FOR_USER: "warning",
  IN_PROGRESS: "warning",
  MEDIUM: "warning",

  REJECTED: "destructive",
  BANNED: "destructive",
  SUSPENDED: "destructive",
  CRITICAL: "destructive",
  HIGH: "destructive",
  REVERSED: "destructive",
  DISQUALIFIED: "destructive",

  DRAFT: "neutral",
  PAUSED: "neutral",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
  CLOSED: "neutral",
  ABANDONED: "neutral",
  LOW: "neutral",
  OPEN: "default",
  SCREENED_OUT: "neutral",
  NORMAL: "neutral",
  FAILED: "destructive",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={TONE[status] ?? "neutral"} className={className}>
      {titleCase(status)}
    </Badge>
  );
}
