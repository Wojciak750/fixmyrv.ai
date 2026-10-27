import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { inspectPdf, InspectError, MAX_BYTES } from "../core/inspect.ts";
import { buildPlan, manualPlan, autoValue, initialValues, PROPERTY_QUESTION_RE, type RawMapping } from "../core/plan.ts";
import { fillForm } from "../core/fill.ts";
import { zipPdfs } from "../core/zip.ts";
import { importKey, encryptField, decryptField, b64encode } from "../core/crypto.ts";
import { maskLast4, last4, validateProfileValue, profileValues, isValidRouting } from "../core/profile.ts";
import { buildRequest, assertNoSensitive, mapForm, MappingFailed, MODEL } from "../core/claude.ts";
import { SAMPLE_PACKET_MAPPING, FLAT_FORM_MAPPING, FAKE_DATA } from "./mock-mapping.ts";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const PACKET = fixture("sample-packet.pdf");
const FLAT = fixture("flat-form.pdf");
const SIG = fixture("fake-signature.png");
const TEST_KEY = b64encode(new Uint8Array(32).map((_, i) => i * 7 + 3)); // test-only key

async function textOf(pdf: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: pdf.slice(), isEvalSupported: false }).promise;
  const pages: { str: string; x: number; y: number }[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.filter((it) => "str" in it).map((it: any) => ({ str: it.str, x: it.transform[4], y: it.transform[5] })));
  }
  return pages;
}

function valuesFor(plan: ReturnType<typeof buildPlan>, data = FAKE_DATA) {
  const v: Record<string, string> = {};
  for (const t of plan.targets) v[t.id] = autoValue(t, data);
  return v;
}

async function imageCount(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf);
  let n = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (dict?.get(PDFName.of("Subtype"))?.toString() === "/Image") n++;
  }
  return n;
}

describe("reading forms", () => {
  it("finds fields, types and positions in a fillable form", async () => {
    const s = await inspectPdf(PACKET);
    expect(s.pageCount).toBe(3);
    const byName = Object.fromEntries(s.fields.map((f) => [f.name, f]));
    expect(byName.LandlordName.type).toBe("text");
    expect(byName.LandlordSignature.type).toBe("signature");
    expect(byName.AcctType.type).toBe("radio");
    expect(byName.AcctType.options).toEqual(["Checking", "Savings"]);
    expect(byName.Routing.maxLength).toBe(9);
    expect(byName.LandlordName.widgets[0].page).toBe(0);
    expect(byName.BankName.widgets[0].page).toBe(1);
  });

  it("reads a flat form as having no fields", async () => {
    const s = await inspectPdf(FLAT);
    expect(s.fields).toHaveLength(0);
    expect(s.pages[0].width).toBe(612);
  });

  it.each([
    ["locked-user-password.pdf", "locked"],
    ["locked-owner-only.pdf", "locked"],
    ["too-many-pages.pdf", "too_many_pages"],
    ["not-a-pdf.pdf", "not_pdf"],
  ])("explains %s in plain English instead of failing silently", async (file, code) => {
    const err = await inspectPdf(fixture(file)).catch((e) => e);
    expect(err).toBeInstanceOf(InspectError);
    expect(err.code).toBe(code);
    expect(err.message.length).toBeGreaterThan(30);
    expect(err.message).not.toMatch(/\u2014/);
  });

  it("rejects files over the size limit before parsing", async () => {
    const big = new Uint8Array(MAX_BYTES + 1);
    big.set(new TextEncoder().encode("%PDF-1.7\n"));
    const err = await inspectPdf(big).catch((e) => e);
    expect(err.code).toBe("too_large");
  });
});

describe("field mapping", () => {
  it("keeps Claude's confident answers and fills them from local data", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const t = (id: string) => plan.targets.find((x) => x.id === id)!;
    expect(t("f1").state).toBe("auto");
    expect(autoValue(t("f1"), FAKE_DATA)).toBe("Sample Holdings LLC");
    expect(t("f1").label).toBe("Landlord or company name");
  });

  it("leaves unsure answers blank and highlighted as a suggestion", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const notice = plan.targets.find((x) => x.id === "f13")!;
    expect(notice.state).toBe("suggest");
    expect(autoValue(notice, FAKE_DATA)).toBe("");
  });

  it("never answers questions about the property, even if the mapping tries to", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    for (const id of ["f14", "f15", "f16", "f17"]) {
      const t = plan.targets.find((x) => x.id === id)!;
      expect(t.state).toBe("property");
      expect(t.key).toBe("manual");
      expect(autoValue(t, FAKE_DATA)).toBe("");
    }
    const flat = buildPlan(await inspectPdf(FLAT), FLAT_FORM_MAPPING);
    expect(flat.targets.find((x) => /liens/i.test(x.label))!.state).toBe("property");
    for (const q of ["Is there a mortgage?", "Any liens on the home", "Property in foreclosure", "Are property taxes current?", "Is the owner in bankruptcy"])
      expect(PROPERTY_QUESTION_RE.test(q)).toBe(true);
  });

  it("treats unknown keys and missing fields as needing Mike", async () => {
    const s = await inspectPdf(PACKET);
    const raw: RawMapping = {
      ...SAMPLE_PACKET_MAPPING,
      fields: SAMPLE_PACKET_MAPPING.fields
        .filter((f) => f.field_id !== "f2")
        .map((f) => (f.field_id === "f3" ? { ...f, key: "profile.made_up_key" } : f)),
    };
    const plan = buildPlan(s, raw);
    expect(plan.targets.find((x) => x.id === "f2")!.state).toBe("manual");
    expect(plan.targets.find((x) => x.id === "f3")!.key).toBe("manual");
  });

  it("drops overlay blanks that sit on a real field and clamps them to the page", async () => {
    const s = await inspectPdf(PACKET);
    const raw: RawMapping = {
      ...SAMPLE_PACKET_MAPPING,
      blanks: [
        { ...SAMPLE_PACKET_MAPPING.blanks[0], page: 0, x: 200, y: 690, width: 340, height: 16 },
        { ...SAMPLE_PACKET_MAPPING.blanks[0], page: 2, x: 900, y: -5 },
        { ...SAMPLE_PACKET_MAPPING.blanks[0], page: 9 },
      ],
    };
    const overlays = buildPlan(s, raw).targets.filter((t) => t.origin === "overlay");
    expect(overlays).toHaveLength(1);
    expect(overlays[0].rect[0] + overlays[0].rect[2]).toBeLessThanOrEqual(612);
    expect(overlays[0].rect[1]).toBeGreaterThanOrEqual(0);
  });

  it("copies money, dates and numbers exactly, never rounding or reformatting", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const data = { ...FAKE_DATA, "quote.monthly_rent": "4000.00", "quote.security_deposit": "0.10", "agreement.start_date": "2026-11-04" };
    expect(autoValue(plan.targets.find((x) => x.id === "f10")!, data)).toBe("4000.00");
    expect(autoValue(plan.targets.find((x) => x.id === "f11")!, data)).toBe("0.10");
    expect(autoValue(plan.targets.find((x) => x.id === "f12")!, data)).toBe("2026-11-04");
  });

  it("checks the right box and picks the right radio option", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const llc = plan.targets.find((x) => x.label === "LLC box")!;
    const ccorp = plan.targets.find((x) => x.label === "C corporation box")!;
    expect(autoValue(llc, FAKE_DATA)).toBe("Yes");
    expect(autoValue(ccorp, FAKE_DATA)).toBe("Off");
    expect(autoValue(plan.targets.find((x) => x.id === "f27")!, { ...FAKE_DATA, "profile.bank_account_type": "Savings" })).toBe("Savings");
  });

  it("does not copy sensitive values into saved versions", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const saved = JSON.stringify(initialValues(plan, FAKE_DATA));
    for (const v of [FAKE_DATA["profile.ein"], FAKE_DATA["profile.routing_number"], FAKE_DATA["profile.account_number"]]) expect(saved).not.toContain(v);
  });

  it("builds an empty plan for filling by hand when the reader fails", async () => {
    const plan = manualPlan(await inspectPdf(PACKET));
    expect(plan.targets).toHaveLength(29);
    expect(plan.targets.every((t) => t.state === "manual" || t.state === "property")).toBe(true);
  });
});

describe("encryption and masking", () => {
  it("encrypts EIN and bank numbers so the stored text never contains them", async () => {
    const key = await importKey(TEST_KEY);
    for (const [col, v] of [["ein", "00-0000001"], ["routing_number", "000000013"], ["account_number", "000123456789"]]) {
      const enc = await encryptField(key, col, v);
      expect(enc).not.toContain(v);
      expect(enc).not.toContain(v.replace(/\D/g, ""));
      expect(enc.startsWith("v1.")).toBe(true);
      expect(await decryptField(key, col, enc)).toBe(v);
      expect(await encryptField(key, col, v)).not.toBe(enc); // fresh IV every time
    }
  });

  it("refuses to decrypt with the wrong key or in the wrong column", async () => {
    const key = await importKey(TEST_KEY);
    const enc = await encryptField(key, "ein", "00-0000001");
    await expect(decryptField(key, "account_number", enc)).rejects.toThrow();
    const other = await importKey(b64encode(new Uint8Array(32).fill(9)));
    await expect(decryptField(other, "ein", enc)).rejects.toThrow();
    await expect(importKey("")).rejects.toThrow();
    await expect(importKey(b64encode(new Uint8Array(16)))).rejects.toThrow();
  });

  it("shows only the last 4 digits", () => {
    expect(maskLast4(last4("000123456789"))).toBe("•••• 6789");
    expect(maskLast4(last4("00-0000001"))).toBe("•••• 0001");
    expect(maskLast4("")).toBe("");
  });

  it("validates EIN, routing and account numbers with plain messages", () => {
    expect(validateProfileValue("ein", "12-3456789")).toBeNull();
    expect(validateProfileValue("ein", "1234")).toMatch(/9 digits/);
    expect(isValidRouting("000000013")).toBe(true);
    expect(validateProfileValue("routing_number", "000000014")).toMatch(/bank check/);
    expect(validateProfileValue("account_number", "12")).toMatch(/4 to 17/);
    expect(validateProfileValue("ein", "")).toBeNull();
  });

  it("splits the EIN for two-box forms and builds address lines", () => {
    const v = profileValues({ mailing_street: "1 A St", mailing_city: "Town", mailing_state: "FL", mailing_zip: "00000" }, { ein: "001234567" });
    expect(v["profile.ein"]).toBe("00-1234567");
    expect(v["profile.ein_prefix"]).toBe("00");
    expect(v["profile.ein_suffix"]).toBe("1234567");
    expect(v["profile.mailing_address_full"]).toBe("1 A St, Town, FL 00000");
  });
});

describe("what is sent to the Claude API", () => {
  const SENSITIVE = [FAKE_DATA["profile.ein"], FAKE_DATA["profile.routing_number"], FAKE_DATA["profile.account_number"]];

  it("contains only the blank form and its structure, with no stored values", async () => {
    const s = await inspectPdf(PACKET);
    const req = buildRequest(s, PACKET);
    const text = JSON.stringify(req);
    // Choice words like "Checking" or "LLC" are option names in the key list, not stored data.
    const choiceWords = new Set(["Checking", "LLC", "P", "Owner"]);
    for (const v of Object.values(FAKE_DATA)) if (v.length > 3 && !choiceWords.has(v)) expect(text).not.toContain(v);
    expect(req.model).toBe(MODEL);
    const doc = req.messages[0].content[0] as { source: { data: string } };
    expect(doc.source.data).toBe(b64encode(PACKET));
  });

  it("refuses to send a request that contains a sensitive value", () => {
    expect(() => assertNoSensitive({ a: "ein is 00-0000001" }, SENSITIVE)).toThrow(MappingFailed);
    expect(() => assertNoSensitive({ a: "acct 000123456789" }, SENSITIVE)).toThrow(MappingFailed);
    expect(() => assertNoSensitive({ a: "routing 000-000-013".replace(/-/g, "") }, SENSITIVE)).toThrow(MappingFailed);
    expect(() => assertNoSensitive({ a: "nothing here" }, SENSITIVE)).not.toThrow();
  });

  it("sends exactly one request with the original blank form and parses the answer", async () => {
    const s = await inspectPdf(PACKET);
    const sent: unknown[] = [];
    const fake = {
      beta: {
        messages: {
          stream(req: unknown) {
            sent.push(req);
            return {
              finalMessage: async () => ({
                stop_reason: "end_turn",
                content: [{ type: "text", text: JSON.stringify(SAMPLE_PACKET_MAPPING) }],
              }),
            };
          },
        },
      },
    };
    const raw = await mapForm(fake as never, s, PACKET, SENSITIVE);
    expect(raw.fields).toHaveLength(29);
    expect(sent).toHaveLength(1);
    const body = JSON.stringify(sent[0]);
    for (const v of SENSITIVE) expect(body).not.toContain(v);
  });

  it("reports a refusal or bad answer as a failure so Mike can fill by hand", async () => {
    const s = await inspectPdf(FLAT);
    const make = (msg: object) => ({ beta: { messages: { stream: () => ({ finalMessage: async () => msg }) } } });
    await expect(mapForm(make({ stop_reason: "refusal", content: [] }) as never, s, FLAT, [])).rejects.toThrow(MappingFailed);
    await expect(mapForm(make({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }) as never, s, FLAT, [])).rejects.toThrow(MappingFailed);
  });
});

describe("filling and flattening", () => {
  it("fills fillable fields and returns a flattened PDF with no form fields left", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const { bytes, problems } = await fillForm(PACKET, plan, { values: { ...valuesFor(plan), f6: FAKE_DATA["profile.ein"], f25: FAKE_DATA["profile.routing_number"], f26: FAKE_DATA["profile.account_number"] } });
    expect(problems).toEqual([]);
    const out = await PDFDocument.load(bytes);
    expect(out.getForm().getFields()).toHaveLength(0);
    for (const p of out.getPages()) expect(p.node.Annots()?.size() ?? 0).toBe(0);
    const text = (await textOf(bytes)).flat().map((t) => t.str).join(" | ");
    expect(text).toContain("Sample Holdings LLC");
    expect(text).toContain("4000.00");
    expect(text).toContain("1250.50");
    expect(text).toContain("000123456789");
  });

  it("overlays text at the right spots on a flat form", async () => {
    const plan = buildPlan(await inspectPdf(FLAT), FLAT_FORM_MAPPING);
    const { bytes, problems } = await fillForm(FLAT, plan, { values: valuesFor(plan) });
    expect(problems).toEqual([]);
    const items = (await textOf(bytes))[0];
    const placed = (s: string) => items.find((i) => i.str === s)!;
    const name = placed("Sample Holdings LLC");
    expect(name.x).toBeGreaterThan(130);
    expect(name.y).toBeGreaterThan(698);
    expect(name.y).toBeLessThan(713);
    expect(placed("CLM-0000-TEST").y).toBeGreaterThan(638);
    expect(placed("4000.00").x).toBeGreaterThan(120);
    // The lien question stays blank.
    expect(items.filter((i) => i.y > 578 && i.y < 592 && i.x > 230 && i.x < 270 && i.str.trim())).toHaveLength(0);
  });

  it("uses moved positions when Mike drags a box", async () => {
    const plan = buildPlan(await inspectPdf(FLAT), FLAT_FORM_MAPPING);
    const id = plan.targets.find((t) => t.label === "Phone")!.id;
    const { bytes } = await fillForm(FLAT, plan, { values: valuesFor(plan), positions: { [id]: [300, 400, 150, 14] } });
    const phone = (await textOf(bytes))[0].find((i) => i.str === FAKE_DATA["profile.phone"])!;
    expect(phone.x).toBeGreaterThan(299);
    expect(phone.y).toBeGreaterThan(399);
    expect(phone.y).toBeLessThan(415);
  });

  it("places no signature or date unless a signature is passed in", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const values = { ...valuesFor(plan), f19: "10/27/2026", f29: "10/27/2026", o13: "10/27/2026" };
    const unsigned = await fillForm(PACKET, plan, { values });
    expect(await imageCount(unsigned.bytes)).toBe(0);
    expect((await textOf(unsigned.bytes)).flat().some((t) => t.str.includes("10/27/2026"))).toBe(false);
    const signed = await fillForm(PACKET, plan, { values, signature: { png: SIG, date: "10/27/2026" } });
    expect(await imageCount(signed.bytes)).toBeGreaterThan(0);
    expect((await textOf(signed.bytes)).flat().filter((t) => t.str.includes("10/27/2026")).length).toBe(3);
  });

  it("flags text that is too long instead of cutting it off", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const { problems } = await fillForm(PACKET, plan, { values: { ...valuesFor(plan), f25: "0000000130000" } });
    expect(problems.find((p) => p.targetId === "f25")?.message).toMatch(/fits 9 characters/);
  });

  it("flags characters the form font cannot print", async () => {
    const plan = buildPlan(await inspectPdf(PACKET), SAMPLE_PACKET_MAPPING);
    const { problems } = await fillForm(PACKET, plan, { values: { ...valuesFor(plan), f2: "Pat Łukasz" } });
    expect(problems.find((p) => p.targetId === "f2")).toBeTruthy();
  });
});

describe("download all", () => {
  it("zips every form with unique, safe names", async () => {
    const zip = zipPdfs([
      { name: "Sedgwick: W-9.pdf", bytes: PACKET },
      { name: "Sedgwick: W-9.pdf", bytes: FLAT },
      { name: "../../etc/passwd", bytes: FLAT },
    ]);
    const files = unzipSync(zip);
    const names = Object.keys(files).sort();
    expect(names).toEqual(["Sedgwick W-9 (2).pdf", "Sedgwick W-9.pdf", "etc passwd.pdf"].sort());
    expect(files["Sedgwick W-9.pdf"]).toEqual(PACKET);
  });
});
