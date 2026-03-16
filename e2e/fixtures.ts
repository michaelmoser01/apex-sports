import { test as base, type Page, expect } from "@playwright/test";

const API_URL =
  process.env.VITE_API_URL ?? "https://evtigd0qc3.execute-api.us-east-1.amazonaws.com";

let userCounter = 0;

function uniqueEmail(prefix: string): string {
  userCounter++;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${userCounter}-${rand}@test.local`;
}

/**
 * Signs up a new user via the Cognito Authenticator UI.
 * Requires the pre-sign-up Lambda (dev stage) so no email verification is needed.
 */
export async function signUpViaUI(
  page: Page,
  options: { email?: string; name?: string; password?: string } = {}
): Promise<{ email: string; password: string }> {
  const email = options.email ?? uniqueEmail("test");
  const password = options.password ?? "TestPass123!";
  const name = options.name ?? "Test User";

  await page.goto("/sign-up");

  await page.getByLabel("Email", { exact: false }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  await page.getByLabel("Name", { exact: false }).fill(name);
  await page.getByRole("button", { name: /create account|sign up/i }).click();

  // Should land on /welcome after auto-confirmed signup
  await expect(page.getByText("Welcome to Apex Sports")).toBeVisible({
    timeout: 15_000,
  });

  return { email, password };
}

/**
 * Signs in an existing user via the Cognito Authenticator UI.
 */
export async function signInViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/sign-in");

  await page.getByLabel("Email", { exact: false }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).not.toHaveURL(/sign-in/, { timeout: 15_000 });
}

/**
 * Deletes a test user from both the database and Cognito by email.
 * Calls the API directly (not through the browser).
 */
export async function cleanupUser(email: string): Promise<void> {
  if (!email) return;
  try {
    await fetch(
      `${API_URL}/auth/test-cleanup?email=${encodeURIComponent(email)}`,
      { method: "DELETE" }
    );
  } catch {
    // Best effort
  }
}

export { expect };
export const test = base;
