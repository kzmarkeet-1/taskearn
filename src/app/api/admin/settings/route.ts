import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { settingsUpdateSchema } from "@/lib/validation";
import { getSettings, updateSetting, SETTING_DEFINITIONS } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = handler(async () => {
  await requireAdmin();
  return ok({ settings: await getSettings(), definitions: SETTING_DEFINITIONS });
});

export const PATCH = handler(async (request) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await parseBody(request, settingsUpdateSchema);
  const before = await getSettings();

  for (const update of body.updates) {
    try {
      await updateSetting(update.key, update.value);
    } catch (error) {
      throw Err.invalid(error instanceof Error ? error.message : "That setting could not be saved.");
    }
  }

  const after = await getSettings();
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "admin.settings.update",
    entityType: "SystemSetting",
    before,
    after,
  });

  return ok({ settings: after });
});
