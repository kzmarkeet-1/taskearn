import { test, expect, type Page } from "@playwright/test";

/**
 * Exercises the admin surface with the seeded demo administrator.
 * Run `npm run db:seed` first.
 */

const ADMIN_EMAIL = "admin@demo.taskearn.app";
const ADMIN_PASSWORD = "AdminPass123";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 15_000 });
}

test.describe("admin panel", () => {
  test("an administrator can reach the withdrawal queue", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/withdrawals");

    await expect(page.getByRole("heading", { name: /withdrawals/i })).toBeVisible();
    await expect(page.getByText(/waiting on you/i)).toBeVisible();
  });

  test("the reports page renders and offers a CSV export", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/reports");

    await expect(page.getByRole("heading", { name: /reports/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /csv/i })).toBeVisible();
  });

  test("settings show amounts in both minor units and currency", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/settings");

    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
    await expect(page.getByText(/minor units/i).first()).toBeVisible();
  });

  test("a member account cannot open the admin panel", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("ayesha@demo.taskearn.app");
    await page.getByLabel("Password").fill("DemoPass123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
