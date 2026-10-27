// End-to-end check of the whole flow in a real browser, at phone and desktop widths.
// Usage: node e2e.mjs <baseUrl> <phone|desktop> <screenshotDir>
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const [base = "http://localhost:5174", mode = "desktop", shots = "./shots"] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const FIX = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../test/fixtures");
const phone = mode === "phone";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${mode}] ${name}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext(phone ? { ...devices["iPhone 13"], acceptDownloads: true } : { viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
let n = 0;
const shot = async (name) => page.screenshot({ path: path.join(shots, `${mode}-${String(++n).padStart(2, "0")}-${name}.png`), fullPage: false });

async function noHorizontalScroll(label) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`no sideways scrolling on ${label}`, w <= 1, `overflow ${w}px`);
}

// Draws a wavy signature with pointer events. On the phone run they are touch pointers, like a finger.
async function drawSignature() {
  const canvas = page.getByTestId("signature-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.evaluate(
    ({ box, touch }) => {
      const c = document.querySelector('[data-testid="signature-canvas"]');
      const fire = (type, x, y) =>
        c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: touch ? "touch" : "mouse", isPrimary: true, clientX: box.x + x, clientY: box.y + y, buttons: type === "pointerup" ? 0 : 1 }));
      fire("pointerdown", 20, box.height / 2);
      for (let i = 0; i <= 60; i++) fire("pointermove", 20 + i * ((box.width - 40) / 60), box.height / 2 + Math.sin(i / 5) * 25);
      fire("pointerup", box.width - 20, box.height / 2);
    },
    { box, touch: phone },
  );
}

try {
  // 1. Business profile
  await page.goto(`${base}/quotes/settings/business`);
  await page.getByRole("heading", { name: "Business profile" }).waitFor();
  await noHorizontalScroll("business profile");
  const fill = async (label, v) => page.getByLabel(label, { exact: true }).fill(v);
  await fill("Legal entity name", "Sample Holdings LLC");
  await fill("Trade name (DBA)", "Sample RV Rentals");
  await page.getByLabel("Entity type", { exact: true }).selectOption("LLC");
  await page.getByLabel("LLC tax classification", { exact: true }).selectOption("P");
  await page.locator("#bp-ein").fill("00-0000001");
  await fill("Mailing street address", "100 Example Street");
  await fill("City", "Testville");
  await fill("State", "FL");
  await fill("ZIP code", "00000");
  await fill("Business phone", "(555) 010-0000");
  await fill("Business email", "owner@example.com");
  await fill("Contact person", "Pat Example");
  await fill("Bank name", "Example Bank");
  await fill("Name on the account", "Sample Holdings LLC");
  await page.getByLabel("Account type", { exact: true }).selectOption("Checking");
  await page.locator("#bp-routing_number").fill("000000014");
  await page.locator("#bp-account_number").fill("000123456789");
  await fill("Default notice to vacate", "7 days written notice");
  await page.getByTestId("save-profile").click();
  await page.getByText("That routing number does not pass the bank check").waitFor();
  check("bad routing number gets a plain-English message and nothing saves", true);
  await page.locator("#bp-routing_number").fill("000000013");
  await page.getByTestId("save-profile").click();
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  const masked = await page.getByTestId("masked-ein").textContent();
  check("EIN is masked to the last 4 digits after saving", masked === "•••• 0001", masked);
  const pageText = await page.locator("body").innerText();
  check("full EIN and bank numbers are not on the page", !pageText.includes("00-0000001") && !pageText.includes("000123456789") && !pageText.includes("000000013"));
  await page.getByTestId("masked-account_number").locator("xpath=..").getByRole("button", { name: "Show" }).click();
  await page.getByTestId("masked-account_number").filter({ hasText: "000123456789" }).waitFor();
  check("Show reveals the account number on click", true);
  await page.getByTestId("masked-account_number").locator("xpath=..").getByRole("button", { name: "Hide" }).click();
  await shot("profile-saved");

  await page.getByRole("button", { name: "Draw my signature" }).click();
  await drawSignature();
  await shot("signature-drawn");
  await page.getByRole("button", { name: "Save signature" }).click();
  await page.getByAltText("Your saved signature").waitFor();
  await page.waitForFunction(() => document.querySelector('img[alt="Your saved signature"]')?.naturalWidth > 0);
  const sigW = await page.evaluate(() => document.querySelector('img[alt="Your saved signature"]').naturalWidth);
  check(`signature drawn with ${phone ? "a finger (touch)" : "a mouse"} and saved with its full stroke`, sigW > 150, `${sigW}px wide`);
  await shot("signature-saved");

  // 2. Upload on the customer file
  await page.goto(`${base}/quotes/customers/cust-0001-test`);
  await page.getByRole("heading", { name: "Adjuster paperwork" }).waitFor();
  await noHorizontalScroll("customer file");
  await page.getByTestId("paperwork-file").setInputFiles([path.join(FIX, "sample-packet.pdf"), path.join(FIX, "locked-user-password.pdf"), path.join(FIX, "not-a-pdf.pdf")]);
  await page.getByText("not-a-pdf.pdf:").waitFor({ timeout: 20000 });
  check("a file that is not a PDF shows a clear message", await page.getByText("is not a PDF").count() > 0 || await page.getByText("not a PDF").count() > 0);
  await page.getByText("Cannot be filled", { exact: true }).waitFor();
  check("a password-protected PDF shows a clear message", (await page.getByText("locked with a password").count()) > 0);
  await page.getByText("Ready to check", { exact: true }).waitFor({ timeout: 20000 });
  check("uploaded form is read and ready to check", true);
  await shot("customer-file-uploaded");

  // 3. Review
  await page.getByRole("link", { name: "Landlord Contact Form, ACH Form and W-9" }).click();
  await page.getByRole("heading", { name: "Landlord Contact Form, ACH Form and W-9" }).waitFor();
  await page.getByText("Preview up to date").waitFor({ timeout: 20000 });
  await noHorizontalScroll("review screen");
  const f1 = await page.locator("#pf-f1").inputValue();
  check("legal name filled automatically", f1 === "Sample Holdings LLC", f1);
  const rent = await page.locator("#pf-f10").inputValue();
  check("monthly rent copied exactly as the quote shows it", rent === "$3,850", rent);
  const dep = await page.locator("#pf-f11").inputValue();
  check("deposit copied exactly with cents", dep === "$1,000.50", dep);
  const mortgage = page.getByTestId("field-f14");
  check("mortgage question is blank and marked as needing Mike", (await mortgage.innerText()).includes("Needs you") && (await mortgage.innerText()).includes("never filled in for you"));
  const acct = await page.getByTestId("field-f26").innerText();
  check("bank account number is masked in the field list", acct.includes("•••• 6789") && !acct.includes("000123456789"));
  await shot("review-fields");

  if (phone) {
    await page.getByRole("tab", { name: "Preview" }).click();
  }
  await page.locator(".pw-page canvas").first().waitFor();
  await page.waitForTimeout(800);
  const painted = await page.evaluate(() => {
    const c = document.querySelector(".pw-page canvas");
    if (!c || !c.width) return false;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++;
    return dark > 500;
  });
  check("filled preview renders", painted);
  check("signature is not on the form before Mike adds it", (await page.getByText("Signed 1").count()) === 0 && (await page.getByTestId("add-signature").count()) === 1);
  await shot("review-preview");
  if (phone) await page.getByRole("tab", { name: /Fields/ }).click();

  // Edit a profile value on the form, live preview, save back to profile
  await page.locator("#pf-f3").fill("(555) 010-7777");
  await page.getByTestId("field-f3").getByText("Changed by you").waitFor();
  await page.getByText("Preview up to date").waitFor({ timeout: 20000 });
  check("an edit is marked as changed by Mike and the preview updates", true);
  await page.getByTestId("field-f3").getByRole("button", { name: "Save to my profile too" }).click();
  await page.getByTestId("field-f3").getByText("Saved to your profile.").waitFor();
  check("Save to my profile too works", true);
  // Unsure match: offered as a suggestion, filled only when Mike taps it
  check("unsure match is left blank", (await page.locator("#pf-f13").inputValue()) === "");
  await page.getByTestId("field-f13").getByRole("button", { name: 'Use "7 days written notice"' }).click();
  await page.getByTestId("field-f13").getByText("Changed by you").waitFor();
  check("Use it fills the suggestion and marks it as Mike's choice", (await page.locator("#pf-f13").inputValue()) === "7 days written notice");
  await page.locator("#pf-f14").check();
  await page.getByText("Preview up to date").waitFor({ timeout: 20000 });
  await shot("review-edited");

  // 4. Sign after preview
  if (phone) await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByTestId("add-signature").scrollIntoViewIfNeeded();
  await page.getByTestId("add-signature").click();
  await page.locator(".pw-signbar .q-chip-ok").waitFor({ timeout: 20000 });
  check("Add my signature puts the signature on after the preview", true);
  await page.waitForTimeout(600);
  await shot("review-signed");

  // 5. Download
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
  const file = path.join(shots, `${mode}-download.pdf`);
  await dl.saveAs(file);
  const bytes = readFileSync(file);
  check("download saves a PDF", bytes.subarray(0, 5).toString() === "%PDF-", dl.suggestedFilename());
  writeFileSync(path.join(shots, `${mode}-download-name.txt`), dl.suggestedFilename());

  // 6. Flat form: add text by hand on the preview
  await page.goto(`${base}/quotes/customers/cust-0001-test`);
  await page.getByTestId("paperwork-file").setInputFiles(path.join(FIX, "flat-form.pdf"));
  await page.getByRole("link", { name: "Landlord Information" }).waitFor({ timeout: 20000 });
  await page.getByRole("link", { name: "Landlord Information" }).click();
  await page.getByText("Preview up to date").waitFor({ timeout: 20000 });
  const flatName = await page.locator("#pf-o1").inputValue();
  check("flat form: text is placed from the overlay positions", flatName === "Sample Holdings LLC", flatName);
  if (phone) await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Add text on the form" }).click();
  await page.locator(".pw-page").first().scrollIntoViewIfNeeded();
  const pg = await page.locator(".pw-page").first().boundingBox();
  const tapY = Math.min(pg.y + pg.height * 0.5, (page.viewportSize()?.height ?? 800) - 120);
  if (phone) await page.touchscreen.tap(pg.x + pg.width * 0.3, tapY);
  else await page.mouse.click(pg.x + pg.width * 0.3, tapY);
  if (phone) await page.getByRole("tab", { name: /Fields/ }).click().catch(() => {});
  await page.locator("#pf-x1").fill("Added By Hand");
  await page.getByText("Preview up to date").waitFor({ timeout: 20000 });
  check("flat form: Mike can add text anywhere on the form", true);
  if (phone) await page.getByRole("tab", { name: "Preview" }).click();
  await page.waitForTimeout(800);
  await shot("flat-form-added-text");

  // 7. Download all
  await page.goto(`${base}/quotes/customers/cust-0001-test`);
  const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download all" }).click()]);
  const zipFile = path.join(shots, `${mode}-all.zip`);
  await zip.saveAs(zipFile);
  check("Download all saves one zip", readFileSync(zipFile).subarray(0, 2).toString() === "PK", zip.suggestedFilename());
  await shot("customer-file-final");
  check("no script errors in the page", errors.length === 0, errors.join(" | "));
} catch (e) {
  check("flow completed", false, String(e).slice(0, 400));
  await shot("failure").catch(() => {});
} finally {
  await browser.close();
  writeFileSync(path.join(shots, `${mode}-results.json`), JSON.stringify(results, null, 2));
  process.exitCode = results.every((r) => r.ok) ? 0 : 1;
}
