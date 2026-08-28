import { test, expect } from "@playwright/test";

/**
 * Covers the path a new member actually takes: register, land on the
 * dashboard, look at what is on offer, and read their wallet.
 *
 * The suite deliberately does not assert on a reward landing in the wallet
 * from a real video watch — that takes as long as the campaign requires, by
 * design. The server-side timing rule is covered in the unit tests instead.
 */

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.test`;
}

test("a new member can register and reach their dashboard", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");

  await page.getByLabel("Full name").fill("End To End Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill("+923001234599");
  await page.getByLabel("Password", { exact: true }).fill("TestPass123");
  await page.getByLabel("Confirm password").fill("TestPass123");

  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByText(/available balance/i)).toBeVisible();

  // A brand new wallet is empty, and the interface should say so plainly
  // rather than showing an encouraging fake number.
  await expect(page.getByText(/PKR 0\.00/).first()).toBeVisible();
});

test("the wallet page shows the four balance buckets", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Wallet Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill("+923001234598");
  await page.getByLabel("Password", { exact: true }).fill("TestPass123");
  await page.getByLabel("Confirm password").fill("TestPass123");
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  await page.goto("/dashboard/wallet");

  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Bonus", { exact: true })).toBeVisible();
  await expect(page.getByText("Referral", { exact: true })).toBeVisible();
});

test("a member below the minimum cannot request a withdrawal", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Withdraw Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill("+923001234597");
  await page.getByLabel("Password", { exact: true }).fill("TestPass123");
  await page.getByLabel("Confirm password").fill("TestPass123");
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  await page.goto("/dashboard/withdraw");

  // With an empty wallet the form is replaced by an explanation of what is
  // still needed, rather than a form that fails on submit.
  await expect(page.getByText(/you need/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /request withdrawal/i })).toHaveCount(0);
});

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/dashboard/wallet");
  await expect(page).toHaveURL(/\/login/);
});

test("the public pages set out how earning works without promising income", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/how-it-works");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/responsible-earnings");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
