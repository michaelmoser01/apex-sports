import { test, expect, signUpViaUI, cleanupUser } from "./fixtures";

test.describe("New user signup", () => {
  let createdEmails: string[] = [];

  test.afterEach(async () => {
    for (const email of createdEmails) {
      await cleanupUser(email);
    }
    createdEmails = [];
  });

  test("signs up and picks Coach", async ({ page }) => {
    const { email } = await signUpViaUI(page, { name: "Coach Test" });
    createdEmails.push(email);

    // Welcome page should show role picker
    await expect(page.getByText("How do you want to use Apex Sports?")).toBeVisible();

    // Pick coach
    await page.getByRole("button", { name: "I'm a Coach" }).click();

    // Should land on coach onboarding
    await expect(page).toHaveURL(/\/coach\/onboarding\/basic/, { timeout: 10_000 });
  });

  test("signs up and picks Athlete", async ({ page }) => {
    const { email } = await signUpViaUI(page, { name: "Athlete Test" });
    createdEmails.push(email);

    // Welcome page should show role picker
    await expect(page.getByText("How do you want to use Apex Sports?")).toBeVisible();

    // Pick athlete
    await page.getByRole("button", { name: "I'm an Athlete" }).click();

    // Should land on athlete onboarding
    await expect(page).toHaveURL(/\/athlete\/onboarding/, { timeout: 10_000 });
  });
});
