// Dev check: fills the sample packet with fake data and writes it out. npx tsx scripts/smoke-fill.ts <outdir>
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { inspectPdf } from "../core/inspect.ts";
import { buildPlan, initialValues } from "../core/plan.ts";
import { fillForm } from "../core/fill.ts";
import { SAMPLE_PACKET_MAPPING, FAKE_DATA } from "../test/mock-mapping.ts";

const out = process.argv[2] ?? ".";
const blank = new Uint8Array(readFileSync(new URL("../test/fixtures/sample-packet.pdf", import.meta.url)));
const structure = await inspectPdf(blank);
const plan = buildPlan(structure, SAMPLE_PACKET_MAPPING);
const vals = initialValues(plan, FAKE_DATA);
const values: Record<string, string> = {};
for (const t of plan.targets) values[t.id] = vals[t.id]?.value ?? FAKE_DATA[t.key] ?? "";
// fake signature image
const sd = await PDFDocument.create(); void sd;
const png = readFileSync(new URL("../test/fixtures/fake-signature.png", import.meta.url));
const r = await fillForm(blank, plan, { values, signature: { png: new Uint8Array(png), date: "10/27/2026" } });
writeFileSync(out + "/filled.pdf", r.bytes);
console.log(JSON.stringify(r.problems), plan.targets.map(t => `${t.id}:${t.state}`).join(" "));
