// Live check against the real Claude API with a real blank form, using FAKE values only.
//   ANTHROPIC_API_KEY=... npx tsx scripts/live-check.ts "/path/to/LL Contact Form, ACH Form & W9.pdf" ./out
// Prints what Claude mapped each blank to, and writes a filled copy (fake data) so the placement can be eyeballed.
// It never reads the business profile or any real customer data.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { inspectPdf, sanitizeTextItems, type TextItem } from "../core/inspect.ts";
import { mapForm } from "../core/claude.ts";
import { buildPlan, autoValue } from "../core/plan.ts";
import { fillForm } from "../core/fill.ts";
import { FAKE_DATA } from "../test/mock-mapping.ts";

const [file, outDir = "./live-check-out"] = process.argv.slice(2);
if (!file) throw new Error("Pass the path of a blank PDF form");
mkdirSync(outDir, { recursive: true });
const bytes = new Uint8Array(readFileSync(file));
const structure = await inspectPdf(bytes);

const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
const items: TextItem[] = [];
for (let p = 1; p <= doc.numPages; p++) {
  for (const it of (await (await doc.getPage(p)).getTextContent()).items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const t = it.transform as number[];
    items.push({ page: p - 1, text: it.str, x: t[4], y: t[5], width: it.width, height: Math.abs(t[3] || it.height) });
  }
}
structure.textItems = sanitizeTextItems(items, structure.pageCount);
console.log(`${path.basename(file)}: ${structure.pageCount} pages, ${structure.fields.length} fillable fields, ${structure.textItems.length} text items`);

const started = Date.now();
const raw = await mapForm(new Anthropic(), structure, bytes, []);
console.log(`Claude answered in ${((Date.now() - started) / 1000).toFixed(1)} s: "${raw.form_title}" (${raw.form_kind})`);
const plan = buildPlan(structure, raw);
const rows = plan.targets.map((t) => `${String(t.page + 1).padStart(2)}  ${t.state.padEnd(9)} ${t.key.padEnd(34)} ${(t.confidence * 100).toFixed(0).padStart(3)}%  ${t.label}`);
console.log("page state     key                                conf  label\n" + rows.join("\n"));
const counts = plan.targets.reduce<Record<string, number>>((c, t) => ((c[t.state] = (c[t.state] ?? 0) + 1), c), {});
console.log("Totals:", JSON.stringify(counts));

const values: Record<string, string> = {};
for (const t of plan.targets) values[t.id] = autoValue(t, FAKE_DATA);
const filled = await fillForm(bytes, plan, { values });
writeFileSync(path.join(outDir, "filled-with-fake-data.pdf"), filled.bytes);
writeFileSync(path.join(outDir, "mapping.json"), JSON.stringify({ raw, plan }, null, 2));
console.log(`Problems: ${JSON.stringify(filled.problems)}\nWrote ${outDir}/filled-with-fake-data.pdf and mapping.json`);
