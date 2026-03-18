/**
 * End-to-end test: signup → add OpenAI API key → verify in Supabase
 *
 * Test credentials:
 *   Username : testadmin
 *   Email    : testadmin@llmmanager.dev
 *   Password : LLMAdmin123!
 */

import puppeteer from "puppeteer-core";

const CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL    = "http://localhost:3000";
const OPENAI_KEY  = process.env.OPENAI_KEY ?? "";

const USER = {
  username: "testadmin",
  email:    "testadmin@llmmanager.dev",
  password: "LLMAdmin123!",
};

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless:       false,   // visible so you can watch it
  defaultViewport: { width: 1280, height: 800 },
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();

// ── Step 1: Sign up ───────────────────────────────────────────────────────────
console.log("\n[1/4] Navigating to signup page…");
await page.goto(`${BASE_URL}/auth/signup`, { waitUntil: "networkidle0" });
await wait(500);

console.log("[1/4] Filling in signup form…");
await page.type('input[placeholder="your_username"]', USER.username, { delay: 60 });
await page.type('input[placeholder="you@example.com"]', USER.email,   { delay: 60 });
await page.type('input[placeholder="Min. 6 characters"]', USER.password, { delay: 60 });

console.log("[1/4] Submitting signup…");
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
  page.click('button[type="submit"]'),
]);

const afterSignup = page.url();
console.log(`[1/4] After signup URL: ${afterSignup}`);

if (afterSignup.includes("/auth")) {
  // Check for error message on page
  const err = await page.$eval("p", el => el?.textContent).catch(() => "");
  console.error(`Signup may have failed. Page message: "${err}"`);
  console.log("Trying to log in instead (user may already exist)…");

  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]',    USER.email,    { delay: 60 });
  await page.type('input[type="password"]', USER.password, { delay: 60 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log(`After login URL: ${page.url()}`);
}

if (page.url().includes("/auth")) {
  console.error("Authentication failed — stopping test.");
  await browser.close();
  process.exit(1);
}

console.log("✓ Authenticated! Now on the main app.");
await wait(1500);

// ── Step 2: Open the model selector ──────────────────────────────────────────
console.log("\n[2/4] Opening model selector…");

// Find and click the model selector button (looks for the Models button in the toolbar)
const modelBtn = await page.$("button, [role='button']");
// Try clicking the model/GPT display in the header
await page.evaluate(() => {
  // Find any button that contains "model" text or the active model name
  const buttons = Array.from(document.querySelectorAll("button"));
  const target = buttons.find(b =>
    b.textContent?.toLowerCase().includes("model") ||
    b.textContent?.includes("gpt") ||
    b.textContent?.includes("claude")
  );
  target?.click();
});
await wait(1000);

// If model panel didn't open, try clicking via keyboard or different selector
const panelVisible = await page.$('[class*="Panel"], [style*="300px"]');
if (!panelVisible) {
  console.log("  Model panel not found, trying toolbar buttons…");
  // Click the first toolbar button that might open models
  await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll("button"));
    // Find button near the model name display
    for (const btn of allButtons) {
      if (btn.textContent?.match(/models|gpt|claude|openai/i)) {
        btn.click();
        return;
      }
    }
  });
  await wait(800);
}

// ── Step 3: Find and click the OpenAI "+ Key" button ─────────────────────────
console.log("[3/4] Looking for OpenAI '+ Key' button…");

// Take a screenshot to see what's on screen
await page.screenshot({ path: "scripts/screenshot-before-key.png" });
console.log("      Screenshot saved: scripts/screenshot-before-key.png");

// Try to find the "+ Key" button next to OPENAI provider
const keyButtonFound = await page.evaluate(() => {
  const allButtons = Array.from(document.querySelectorAll("button"));
  // Look for button with text "+ Key" or "Edit key" near "OPENAI" text
  for (const btn of allButtons) {
    const text = btn.textContent?.trim();
    if (text === "+ Key" || text === "Edit key") {
      // Check if it's near OpenAI text
      const section = btn.closest("section");
      if (section?.textContent?.toLowerCase().includes("openai")) {
        btn.click();
        return true;
      }
    }
  }
  // If not found in sections, click any first "+ Key" button
  const anyKeyBtn = allButtons.find(b => b.textContent?.trim() === "+ Key");
  if (anyKeyBtn) { anyKeyBtn.click(); return true; }
  return false;
});

if (!keyButtonFound) {
  console.log("  Could not find + Key button. Taking screenshot…");
  await page.screenshot({ path: "scripts/screenshot-no-key-btn.png" });
  console.log("  Screenshot: scripts/screenshot-no-key-btn.png");
}

await wait(800);

// ── Step 4: Enter the OpenAI API key ─────────────────────────────────────────
console.log("[4/4] Entering OpenAI API key…");
await page.screenshot({ path: "scripts/screenshot-key-panel.png" });

const passwordInput = await page.$('input[type="password"]');
if (passwordInput) {
  await passwordInput.click({ clickCount: 3 });
  await passwordInput.type(OPENAI_KEY, { delay: 10 });
  await wait(300);

  // Click "Save & unlock models"
  const saved = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const saveBtn = btns.find(b =>
      b.textContent?.includes("Save") || b.textContent?.includes("Update key")
    );
    if (saveBtn && !saveBtn.disabled) { saveBtn.click(); return true; }
    return false;
  });

  if (saved) {
    console.log("  Save button clicked. Waiting for response…");
    await wait(3000);
    await page.screenshot({ path: "scripts/screenshot-after-save.png" });
    console.log("  Screenshot: scripts/screenshot-after-save.png");
    console.log("\n✅ Done! Check your Supabase dashboard → Table Editor → api_keys");
    console.log("   You should see a new row for user:", USER.email);
    console.log("   Provider: openai | encrypted_key: [bytea data]");
  } else {
    console.log("  Save button not found or disabled.");
    await page.screenshot({ path: "scripts/screenshot-save-fail.png" });
  }
} else {
  console.log("  Password input not found on key panel.");
  await page.screenshot({ path: "scripts/screenshot-no-password-input.png" });
}

console.log("\nLeaving browser open for 10 seconds so you can review…");
await wait(10000);
await browser.close();
