"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseMoneyInput, toMajor, formatMoney } from "@/lib/money";
import { COUNTRIES } from "@/lib/countries";

type Values = {
  name: string;
  advertiser: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string;
  reward: string;
  requiredWatchSeconds: number;
  budget: string;
  dailyQuota: number;
  totalQuota: number;
  targetCountries: string[];
  startDate: string;
  endDate: string;
  status: string;
};

function isoDate(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 24 * 3600_000);
  return date.toISOString().slice(0, 10);
}

export function CampaignForm({
  defaultReward,
  campaign,
}: {
  defaultReward: number;
  campaign?: Partial<Values> & { id: string };
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      name: campaign?.name ?? "",
      advertiser: campaign?.advertiser ?? "",
      description: campaign?.description ?? "",
      videoUrl: campaign?.videoUrl ?? "",
      thumbnailUrl: campaign?.thumbnailUrl ?? "",
      reward: campaign?.reward ?? String(toMajor(defaultReward)),
      requiredWatchSeconds: campaign?.requiredWatchSeconds ?? 60,
      budget: campaign?.budget ?? "5000",
      dailyQuota: campaign?.dailyQuota ?? 50,
      totalQuota: campaign?.totalQuota ?? 500,
      targetCountries: campaign?.targetCountries ?? [],
      startDate: campaign?.startDate ?? isoDate(0),
      endDate: campaign?.endDate ?? isoDate(30),
      status: campaign?.status ?? "DRAFT",
    },
  });

  const reward = parseMoneyInput(watch("reward") || "");
  const budget = parseMoneyInput(watch("budget") || "");
  const affordable = reward && budget && reward > 0 ? Math.floor(budget / reward) : null;

  async function onSubmit(values: Values) {
    const rewardMinor = parseMoneyInput(values.reward);
    const budgetMinor = parseMoneyInput(values.budget);

    if (rewardMinor === null || budgetMinor === null) {
      toast.error("Reward and budget must be amounts like 15 or 15.50.");
      return;
    }

    const payload = {
      name: values.name,
      advertiser: values.advertiser,
      description: values.description,
      videoUrl: values.videoUrl,
      thumbnailUrl: values.thumbnailUrl || undefined,
      rewardAmount: rewardMinor,
      requiredWatchSeconds: Number(values.requiredWatchSeconds),
      totalBudget: budgetMinor,
      dailyQuota: Number(values.dailyQuota),
      totalQuota: Number(values.totalQuota),
      targetCountries: values.targetCountries ?? [],
      startDate: values.startDate,
      endDate: values.endDate,
      status: values.status,
    };

    const result = campaign
      ? await api(`/api/admin/campaigns/${campaign.id}`, { method: "PATCH", json: payload })
      : await api<{ id: string }>("/api/admin/campaigns", { json: payload });

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(campaign ? "Campaign updated" : "Campaign created");
    router.push("/admin/campaigns");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Campaign name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...register("name", { required: "Name the campaign." })} />
        </Field>
        <Field label="Advertiser" htmlFor="advertiser" error={errors.advertiser?.message}>
          <Input id="advertiser" {...register("advertiser", { required: "Name the advertiser." })} />
        </Field>
      </div>

      <Field
        label="What should the viewer do?"
        htmlFor="description"
        error={errors.description?.message}
        hint="Shown on the task page. Be specific about what to watch for."
      >
        <Textarea id="description" rows={4} {...register("description", { required: "Describe the task." })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Video URL" htmlFor="videoUrl" error={errors.videoUrl?.message}>
          <Input id="videoUrl" type="url" {...register("videoUrl", { required: "Add the video URL." })} />
        </Field>
        <Field label="Thumbnail URL" htmlFor="thumbnailUrl" hint="Optional.">
          <Input id="thumbnailUrl" type="url" {...register("thumbnailUrl")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Reward per completion" htmlFor="reward" hint="In PKR.">
          <Input id="reward" inputMode="decimal" {...register("reward", { required: true })} />
        </Field>
        <Field label="Required watch time" htmlFor="requiredWatchSeconds" hint="Seconds.">
          <Input id="requiredWatchSeconds" type="number" min={5} max={3600} {...register("requiredWatchSeconds")} />
        </Field>
        <Field label="Total budget" htmlFor="budget" hint="In PKR.">
          <Input id="budget" inputMode="decimal" {...register("budget", { required: true })} />
        </Field>
      </div>

      {affordable !== null ? (
        <Alert variant="info">
          <AlertDescription>
            At {formatMoney(reward ?? 0)} per completion, this budget covers <strong>{affordable}</strong> completions.
            The total quota cannot exceed that.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Daily quota" htmlFor="dailyQuota">
          <Input id="dailyQuota" type="number" min={1} {...register("dailyQuota")} />
        </Field>
        <Field label="Total quota" htmlFor="totalQuota">
          <Input id="totalQuota" type="number" min={1} {...register("totalQuota")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" htmlFor="startDate">
          <Input id="startDate" type="date" {...register("startDate")} />
        </Field>
        <Field label="Ends" htmlFor="endDate">
          <Input id="endDate" type="date" {...register("endDate")} />
        </Field>
      </div>

      <Field
        label="Target countries"
        htmlFor="targetCountries"
        hint="Leave nothing selected to open the campaign to everyone."
      >
        <select
          id="targetCountries"
          multiple
          className="h-40 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...register("targetCountries")}
        >
          {COUNTRIES.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Status" htmlFor="status">
        <Select id="status" {...register("status")}>
          <option value="DRAFT">Draft — not visible to members</option>
          <option value="PENDING_REVIEW">Pending review</option>
          <option value="ACTIVE">Active — accepting completions</option>
          <option value="PAUSED">Paused</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      </Field>

      <Alert variant="warning">
        <AlertTitle>Before you set this live</AlertTitle>
        <AlertDescription>
          Campaigns must respect the terms of the platform hosting the video. Nothing that asks members to inflate
          views, watch time or engagement metrics belongs here.
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : campaign ? "Save changes" : "Create campaign"}
      </Button>
    </form>
  );
}
