import { expect, test, type Page } from "@playwright/test";

const hasStagingConfig = Boolean(
  process.env.E2E_BASE_URL &&
    process.env.E2E_ADMIN_EMAIL &&
    process.env.E2E_ADMIN_PASSWORD &&
    process.env.E2E_PRESENTER_EMAIL &&
    process.env.E2E_PRESENTER_PASSWORD &&
    process.env.E2E_PARTICIPANT_EMAIL &&
    process.env.E2E_PARTICIPANT_PASSWORD
);

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test.describe("phase 5 staging smoke", () => {
  test.skip(!hasStagingConfig, "Set E2E_BASE_URL and role credentials to run hosted Supabase smoke tests.");

  test("admin login and user management route", async ({ page }) => {
    await signIn(page, process.env.E2E_ADMIN_EMAIL ?? "", process.env.E2E_ADMIN_PASSWORD ?? "");
    await expect(page).toHaveURL(/\/admin\/users|\/dashboard/);
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: /user management/i })).toBeVisible();
  });

  test("admin can create a participant user", async ({ page }) => {
    const createEmail = process.env.E2E_CREATE_USER_EMAIL ?? `e2e-${Date.now()}@example.com`;
    const createPassword = process.env.E2E_CREATE_USER_PASSWORD ?? "TempPass2026";

    await signIn(page, process.env.E2E_ADMIN_EMAIL ?? "", process.env.E2E_ADMIN_PASSWORD ?? "");
    await page.goto("/admin/users");
    await page.getByLabel(/email/i).fill(createEmail);
    await page.getByLabel(/^password$/i).fill(createPassword);
    await page.getByLabel(/full name/i).fill("E2E Participant");
    await page.getByRole("combobox").selectOption("participant");
    await page.getByRole("button", { name: /create user/i }).click();
    await expect(page.getByText(/created|already registered|user issue/i)).toBeVisible();
  });

  test("presenter login and create meeting route", async ({ page }) => {
    await signIn(page, process.env.E2E_PRESENTER_EMAIL ?? "", process.env.E2E_PRESENTER_PASSWORD ?? "");
    await expect(page).toHaveURL(/\/presenter\/meetings|\/dashboard/);
    await page.goto("/presenter/meetings/new");
    await expect(page.getByRole("heading", { name: /new meeting/i })).toBeVisible();
  });

  test("presenter can create a meeting", async ({ page }) => {
    await signIn(page, process.env.E2E_PRESENTER_EMAIL ?? "", process.env.E2E_PRESENTER_PASSWORD ?? "");
    await page.goto("/presenter/meetings/new");
    await page.getByLabel(/title/i).fill(`E2E Meeting ${Date.now()}`);
    await page.getByLabel(/description/i).fill("Created by Playwright smoke test.");
    await page.getByRole("button", { name: /create meeting/i }).click();
    await expect(page).toHaveURL(/\/presenter\/meetings/);
  });

  test("participant login and join route", async ({ page }) => {
    await signIn(page, process.env.E2E_PARTICIPANT_EMAIL ?? "", process.env.E2E_PARTICIPANT_PASSWORD ?? "");
    await expect(page).toHaveURL(/\/join|\/dashboard/);
    await page.goto("/join");
    await expect(page.getByRole("button", { name: /join meeting/i })).toBeVisible();
  });

  test("participant can join by meeting code", async ({ page }) => {
    const meetingCode = process.env.E2E_MEETING_CODE;
    test.skip(!meetingCode, "Set E2E_MEETING_CODE for participant join smoke checks.");

    await signIn(page, process.env.E2E_PARTICIPANT_EMAIL ?? "", process.env.E2E_PARTICIPANT_PASSWORD ?? "");
    await page.goto("/join");
    await page.getByLabel(/meeting code/i).fill(meetingCode ?? "");
    await page.getByRole("button", { name: /join meeting/i }).click();
    await expect(page).toHaveURL(/\/meetings\/.+\/room/);
  });

  test("annotation workflow surface is available", async ({ page }) => {
    const meetingId = process.env.E2E_ANNOTATION_READY_MEETING_ID;
    test.skip(!meetingId, "Set E2E_ANNOTATION_READY_MEETING_ID for annotation workflow smoke checks.");

    await signIn(page, process.env.E2E_PARTICIPANT_EMAIL ?? "", process.env.E2E_PARTICIPANT_PASSWORD ?? "");
    await page.goto(`/meetings/${meetingId}/room`);
    await expect(page.getByText(/shared annotation workspace/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /pen/i })).toBeVisible();
  });

  test("participant room hides presenter-only screen controls", async ({ page }) => {
    const meetingId = process.env.E2E_MEETING_ID;
    test.skip(!meetingId, "Set E2E_MEETING_ID for room-level smoke checks.");

    await signIn(page, process.env.E2E_PARTICIPANT_EMAIL ?? "", process.env.E2E_PARTICIPANT_PASSWORD ?? "");
    await page.goto(`/meetings/${meetingId}/room`);
    await expect(page.getByRole("button", { name: /start screen/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /pause/i })).toHaveCount(0);
  });

  test("export page access renders export controls when allowed", async ({ page }) => {
    const meetingId = process.env.E2E_MEETING_ID;
    test.skip(!meetingId, "Set E2E_MEETING_ID for export page smoke checks.");

    await signIn(page, process.env.E2E_PRESENTER_EMAIL ?? "", process.env.E2E_PRESENTER_PASSWORD ?? "");
    await page.goto(`/meetings/${meetingId}/exports`);
    await expect(page.getByRole("heading", { name: /exports and archive/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /generate archive zip/i })).toBeVisible();
  });
});
