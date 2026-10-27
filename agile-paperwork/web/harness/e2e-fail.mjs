// Browser check when the form reader is down: the file is kept and Mike fills it by hand on the same screen.
// Usage: node e2e-fail.mjs <baseUrl> <phone|desktop> <screenshotDir>   (harness started with HARNESS_MAPPER=fail)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const [base, mode = "desktop", shots = "."] = process.argv.slice(2);
const FIX = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../test/fixtures");
const phone = mode === "phone";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${mode} reader down] ${name}${detail ? `: ${detail}` : ""}`);
};
const browser = await chromium.launch();
const ctx = await browser.newContext(phone ? devices["iPhone 13"] : { viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
try {
  await page.goto(`${base}/quotes/customers/cust-0001-test`);
  await page.getByTestId("paperwork-file").setInputFiles(path.join(FIX, "sample-packet.pdf"));
  await page.getByText("Fill by hand", { exact: true }).waitFor({ timeout: 20000 });
  check("the upload is kept and marked Fill by hand", true);
  await page.getByRole("link", { name: "sample-packet" }).click();
  await page.getByText("could not be read automatically").waitFor();
  check("the review screen explains it in plain English", true);
  await page.locator("#pf-f1").fill("Typed By Hand LLC");
  await page.getByText("Preview up to date").waitFor({ timeout: 20000 });
  check("Mike can fill fields by hand and the preview updates", (await page.locator("#pf-f1").inputValue()) === "Typed By Hand LLC");
  check("Try reading again is offered", (await page.getByRole("button", { name: "Try reading again" }).count()) === 1);
  await page.screenshot({ path: path.join(shots, `${mode}-reader-down.png`) });
} catch (e) {
  check("flow completed", false, String(e).slice(0, 300));
} finally {
  await browser.close();
  writeFileSync(path.join(shots, `${mode}-fail-results.json`), JSON.stringify(results, null, 2));
  process.exitCode = results.every((r) => r.ok) ? 0 : 1;
}
