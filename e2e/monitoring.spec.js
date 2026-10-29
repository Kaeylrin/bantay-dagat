import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const firebaseMock = await readFile(new URL("./fixtures/firebase.js", import.meta.url), "utf8");
const NOW = Date.now();
const valid = { timestamp: NOW, waterTemp: 28, pH: 8.1, turbidity: 10, airTemp: 29, humidity: 75, status: "GO", sensorAlert: "NONE" };

async function setup(page, { signedIn = true, role = "ranger", latest = valid, readings } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((fixture) => { window.__fixture = fixture; }, {
    signedIn,
    data: {
      ".info": { connected: true },
      users: {
        "test-user": { role, displayName: "Test Ranger", email: "ranger@example.test", isActive: true },
        "other-ranger": { role: "ranger", displayName: "Second Ranger", email: "other@example.test", isActive: true },
      },
      bantaydagat: {
        latest,
        readings: readings ?? {
          a: { ...valid, timestamp: NOW - 900_000 },
          b: { ...valid, timestamp: NOW - 600_000, waterTemp: 32, status: "GO (CAUTION)" },
          c: { ...valid, timestamp: NOW - 300_000, turbidity: 60, status: "NO-GO (DANGER)" },
          d: { ...valid, timestamp: NOW - 150_000, waterTemp: -127, sensorAlert: "WTMP ERR" },
        },
      },
    },
  });
  await page.route(/\/client\/lib\/firebase\.js(?:\?.*)?$/, (route) => route.fulfill({ contentType: "application/javascript", body: firebaseMock }));
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ json: {
    current: { temperature_2m: 29, relative_humidity_2m: 75, apparent_temperature: 30, rain: 0, wind_speed_10m: 5, wind_direction_10m: 90, weather_code: 1 },
    daily: { time: ["2026-10-29"], weather_code: [1], temperature_2m_max: [31], temperature_2m_min: [25], precipitation_sum: [0] },
  } }));
  return errors;
}

const setLatest = (page, values) => page.evaluate((next) => window.__stationTest.set("bantaydagat/latest", next), values);

test("paper threshold table and source removal; dashboard toggles and details", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/dashboard");
  await expect(page.getByText("Live Sea Signal Active")).toBeVisible();
  await page.getByRole("button", { name: "Assessment Guide", exact: true }).click();
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows.nth(1)).toContainText("25.00–32.00");
  await expect(rows.nth(2)).toContainText("26.00–31.00");
  await expect(rows.nth(3)).toContainText("65.00–85.00");
  await expect(rows.nth(4)).toContainText("7.80–8.30");
  await expect(rows.nth(5)).toContainText("0.00–25.00 NTU");
  await expect(page.getByRole("heading", { name: "Sources", exact: true })).toHaveCount(0);
  await expect(page.locator('a[href*="eaza"], a[href*="emb.gov"], a[href*="pagasa"], a[href*="fondriest"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Hide Assessment Guide", exact: true }).click();
  const details = page.getByTitle("Threshold ranges").first();
  await details.click();
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await details.click();
  await page.getByRole("button", { name: "Hide Decision Support", exact: true }).click();
  await expect(page.getByRole("button", { name: "Decision Support", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("working → faulty → offline → recovered stays consistent across dashboard and layout", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/dashboard");
  await expect(page.getByText("All 5 probes working", { exact: false })).toBeVisible();
  await setLatest(page, { ...valid, sensorAlert: "WTMP pH ERR", turbidity: 60 });
  await expect(page.getByText("Sensor Probe Fault", { exact: true })).toBeVisible();
  await expect(page.getByText("HOLD: WATER SENSOR FAULT", { exact: true })).toBeVisible();
  await expect(page.getByText("3 of 5 probes working", { exact: false })).toBeVisible();
  await page.evaluate(() => window.__stationTest.set(".info/connected", false));
  await expect(page.getByText("Signal Disconnected", { exact: false })).toBeVisible();
  await expect(page.getByText("NO DECISION: STATION OFFLINE", { exact: true })).toBeVisible();
  await page.evaluate(() => window.__stationTest.set(".info/connected", true));
  await setLatest(page, valid);
  await expect(page.getByText("Live Sea Signal Active", { exact: true })).toBeVisible();
  await expect(page.getByText("GO: SAFE TO RELEASE", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("silence ages out without another Firebase event", async ({ page }) => {
  await page.clock.install({ time: new Date(NOW) });
  await setup(page);
  await page.goto("/dashboard");
  await expect(page.getByText("Live Sea Signal Active")).toBeVisible();
  await page.clock.fastForward(65_000);
  await expect(page.getByText("NO DECISION: STATION OFFLINE", { exact: true })).toBeVisible();
  await setLatest(page, { ...valid, timestamp: NOW + 65_000 });
  await expect(page.getByText("Live Sea Signal Active")).toBeVisible();
});

test("empty packets and permission failures never show a live decision", async ({ page }) => {
  const errors = await setup(page, { latest: null, readings: {} });
  await page.goto("/dashboard");
  await expect(page.getByText("No packet ever received", { exact: true })).toBeVisible();
  await page.evaluate(() => window.__stationTest.fail("bantaydagat/latest", "Permission denied"));
  await expect(page.getByText("Database unreachable", { exact: true })).toBeVisible();
  await expect(page.getByText("GO: SAFE TO RELEASE", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("D/T/A/E shortcuts navigate, but do not hijack typing, modifiers or dialogs", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/dashboard");
  for (const [key, path] of [["t", "/trends"], ["a", "/alerts"], ["e", "/environment"], ["d", "/dashboard"]]) {
    await page.keyboard.press(key);
    await expect(page).toHaveURL(new RegExp(path + "$"));
  }
  await page.keyboard.press("a");
  await page.getByPlaceholder("Search timestamps or values…").fill("date");
  await expect(page).toHaveURL(/\/alerts$/);
  await page.getByRole("heading", { name: "Alert Logs", exact: true }).click();
  await page.keyboard.press("Alt+d");
  await expect(page).toHaveURL(/\/alerts$/);
  await page.getByRole("button", { name: "Log Out", exact: true }).first().click();
  await page.keyboard.press("d");
  await expect(page).toHaveURL(/\/alerts$/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("alerts filter/search/reset/sort and CSV/PDF exports", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/alerts");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(4);
  await page.getByRole("button", { name: "Sensor Fault", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("HOLD");
  await page.getByRole("button", { name: /All Logs/ }).click();
  await page.getByRole("button", { name: "Caution Only", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("GO (CAUTION)");
  await page.getByRole("button", { name: /All Logs/ }).click();
  await page.getByPlaceholder("Search timestamps or values…").fill("not-present");
  await page.getByRole("button", { name: "Reset Filters & Search" }).click();
  await expect(rows).toHaveCount(4);
  await page.getByRole("button", { name: "Timestamp", exact: true }).click();
  await expect(rows.first()).toContainText("GO");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/alert-logs.*\.csv$/);
  const popupEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const popup = await popupEvent;
  await expect(popup.getByRole("table")).toBeVisible();
  await popup.close();
  expect(errors).toEqual([]);
});

test("history chart modes, time ranges, analytics and exports", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/trends");
  await expect(page.getByText("GO-Readiness Score", { exact: true })).toBeVisible();
  for (const name of ["Area Chart", "Bar Chart", "Line Chart", "Last 7 Days", "Last 30 Days", "Last 24 Hours"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  const analytics = page.getByRole("button", { name: /Data Analytics/ });
  await analytics.click();
  await expect(page.getByText("GO-Readiness Score", { exact: true })).toHaveCount(0);
  await analytics.click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/trends.*\.csv$/);
  const popupEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const popup = await popupEvent;
  await expect(popup.getByRole("table")).toBeVisible();
  await popup.close();
  expect(errors).toEqual([]);
});

test("weather refresh and failed request feedback", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/environment");
  await expect(page.getByRole("heading", { name: "Current Weather Conditions" })).toBeVisible();
  await expect(page.getByText("Mainly Clear", { exact: true }).first()).toBeVisible();
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Failed to fetch weather data: HTTP 503")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile navigation, sidebar persistence, account menu and logout", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/dashboard");
  await page.getByTitle("Collapse Sidebar").click();
  await page.reload();
  await expect(page.getByTitle("Expand Sidebar")).toBeVisible();
  await page.getByTitle("Expand Sidebar").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Alert Logs", exact: true }).last().click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.getByRole("button", { name: "Close navigation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Log Out", exact: true }).last().click();
  await page.getByRole("dialog").getByRole("button", { name: "Log Out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test("unauthenticated routes and ranger login", async ({ page }) => {
  const errors = await setup(page, { signedIn: false });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByPlaceholder("ranger@gmail.com").fill("ranger@example.test");
  await page.locator("#password").fill("TestPassword1!");
  await page.getByRole("button", { name: "Sign In as Ranger" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(errors).toEqual([]);
});

test("admin account list, rename and enable/disable use simulated data", async ({ page }) => {
  const errors = await setup(page, { role: "admin" });
  await page.goto("/admin");
  await expect(page.getByText("Second Ranger", { exact: true })).toBeVisible();
  await page.getByTitle("Edit name").first().click();
  const row = page.locator("li").filter({ has: page.getByTitle("Save", { exact: true }) });
  await row.locator("input").fill("Renamed Ranger");
  await row.getByTitle("Save", { exact: true }).click();
  await expect(page.getByText("Renamed Ranger", { exact: true })).toBeVisible();
  await page.getByTitle("Disable account").first().click();
  await expect(page.getByTitle("Enable account").first()).toBeVisible();
  await page.getByTitle("Enable account").first().click();
  expect(errors).toEqual([]);
});

test("history includes a month of readings beyond the previous 500-row cap", async ({ page }) => {
  const readings = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [String(index), { ...valid, timestamp: NOW - (index + 1) * 3_600_000 }]));
  const errors = await setup(page, { readings });
  await page.goto("/trends");
  await page.getByRole("button", { name: "Last 30 Days", exact: true }).click();
  await expect(page.getByText("600 readings", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Last 24 Hours", exact: true }).click();
  await expect(page.getByText("600 readings", { exact: false })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("admin creation, password reset failure and delete confirmation", async ({ page }) => {
  const errors = await setup(page, { role: "admin" });
  await page.route("**/api/admin/send-reset-email", (route) => route.fulfill({ status: 503, json: { error: "Email service unavailable" } }));
  await page.route("**/api/admin/delete-user?*", async (route) => {
    const uid = new URL(route.request().url()).searchParams.get("uid");
    await page.evaluate((id) => window.__stationTest.set("users/" + id, null), uid);
    await route.fulfill({ json: { success: true } });
  });
  await page.goto("/admin");
  await page.getByPlaceholder("Juan dela Cruz").fill("Created Ranger");
  await page.getByPlaceholder("ranger.name@gmail.com").fill("created.ranger@gmail.com");
  const passwords = page.getByPlaceholder("••••••••");
  await passwords.nth(0).fill("TestPassword1!");
  await passwords.nth(1).fill("TestPassword1!");
  await page.getByRole("button", { name: /Create Ranger/ }).click();
  await expect(page.getByText('Ranger "Created Ranger" created successfully.')).toBeVisible();
  const created = page.locator("li").filter({ hasText: "Created Ranger" });
  await created.getByTitle("Send password reset email").click();
  await expect(created.getByText("Email service unavailable")).toBeVisible();
  await created.getByTitle("Delete account").click();
  await created.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(created).toBeVisible();
  await created.getByTitle("Delete account").click();
  await created.getByRole("button", { name: /Delete/ }).click();
  await expect(page.getByText("Created Ranger", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("disabled account is logged out and invalid reset URL is handled", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/dashboard");
  await expect(page.getByText("Live Sea Signal Active")).toBeVisible();
  await page.evaluate(() => window.__stationTest.set("users/test-user/isActive", false));
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/reset-password");
  await expect(page.getByText(/invalid|missing/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});
