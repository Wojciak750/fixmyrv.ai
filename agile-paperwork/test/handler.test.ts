import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createHandler, type Deps } from "../server/handler.ts";
import { importKey, b64encode, b64decode } from "../core/crypto.ts";
import type { FormStructure } from "../core/inspect.ts";
import { MemoryStore, MemoryFiles } from "./memory-store.ts";
import { SAMPLE_PACKET_MAPPING, FLAT_FORM_MAPPING } from "./mock-mapping.ts";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const PACKET = fixture("sample-packet.pdf");
const FLAT = fixture("flat-form.pdf");
const SIG_PNG = fixture("fake-signature.png");
const KEY = b64encode(new Uint8Array(32).map((_, i) => 255 - i)); // test-only key
const CUSTOMER = "cust-0001-test";

// Fake values only.
const EIN = "00-0000001";
const ROUTING = "000000013";
const ACCOUNT = "000123456789";

function setup(opts: { mapper?: Deps["mapper"] | "fail"; admin?: boolean } = {}) {
  const store = new MemoryStore();
  const files = new MemoryFiles();
  store.customers.set(CUSTOMER, {
    name: "Jordan Testcase",
    sources: {
      "customer.tenant_name": "Jordan Testcase",
      "customer.claim_number": "CLM-0000-TEST",
      "customer.property_address": "200 Sample Road, Testville, FL 00000",
      "quote.monthly_rent": "4000.00",
      "quote.security_deposit": "1250.50",
      "agreement.start_date": "2026-11-04",
      "agreement.notice_to_vacate": "7 days",
    },
  });
  const logs: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  const mapperCalls: { structure: FormStructure; pdf: Uint8Array; sensitive: string[] }[] = [];
  const defaultMapper: Deps["mapper"] = async (structure, pdf, sensitive) => {
    mapperCalls.push({ structure, pdf, sensitive });
    return structure.fields.length ? SAMPLE_PACKET_MAPPING : FLAT_FORM_MAPPING;
  };
  let n = 0;
  const handle = createHandler({
    authenticate: async (req) => (opts.admin === false || req.headers.get("authorization") !== "Bearer admin" ? null : { userId: "admin-1" }),
    store,
    files,
    encryptionKey: () => importKey(KEY),
    mapper:
      opts.mapper === "fail"
        ? async () => {
            throw new Error("network down");
          }
        : opts.mapper === undefined
          ? defaultMapper
          : opts.mapper,
    background: (p) => void pending.push(p),
    newId: () => `paper-${++n}-0000`,
    now: () => new Date("2026-10-27T15:00:00Z"),
    log: (event, meta) => void logs.push({ event, meta }),
  });

  const call = async (body: Record<string, unknown>, auth = "Bearer admin") => {
    const res = await handle(new Request("https://x/functions/v1/paperwork", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  const upload = async (bytes: Uint8Array, name = "packet.pdf") => {
    const fd = new FormData();
    fd.set("customerId", CUSTOMER);
    fd.set("file", new File([bytes as BlobPart], name, { type: "application/pdf" }));
    const res = await handle(new Request("https://x/functions/v1/paperwork", { method: "POST", headers: { authorization: "Bearer admin" }, body: fd }));
    await Promise.all(pending);
    return { status: res.status, body: await res.json() };
  };
  // Returns the file as a Response-like object so tests read the same way a browser download would.
  const download = async (query: string) => {
    const [k, v] = query.split("=");
    const r = await call(k === "all" ? { action: "paperwork.downloadAll", customerId: v } : { action: "paperwork.download", id: v });
    const bytes = r.body.data ? b64decode(r.body.data) : new Uint8Array();
    return {
      status: r.status,
      body: r.body,
      headers: new Map([["content-type", r.body.type], ["content-disposition", `attachment; filename="${r.body.fileName}"`]]),
      arrayBuffer: async () => bytes.buffer,
    };
  };
  return { handle, store, files, logs, mapperCalls, call, upload, download };
}

async function fillProfile(call: ReturnType<typeof setup>["call"]) {
  const r = await call({
    action: "profile.save",
    values: {
      legal_name: "Sample Holdings LLC",
      trade_name: "Sample RV Rentals",
      entity_type: "LLC",
      tax_classification: "P",
      ein: EIN,
      mailing_street: "100 Example Street",
      mailing_city: "Testville",
      mailing_state: "FL",
      mailing_zip: "00000",
      phone: "(555) 010-0000",
      email: "owner@example.com",
      contact_name: "Pat Example",
      bank_name: "Example Bank",
      bank_account_name: "Sample Holdings LLC",
      bank_account_type: "Checking",
      routing_number: ROUTING,
      account_number: ACCOUNT,
    },
  });
  expect(r.status).toBe(200);
  return r;
}

async function pdfText(b64OrBytes: string | Uint8Array) {
  const data = typeof b64OrBytes === "string" ? b64decode(b64OrBytes) : b64OrBytes;
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map((it: any) => it.str).join(" ") + "\n";
  return out;
}

afterEach(() => vi.restoreAllMocks());

describe("login", () => {
  it("rejects anyone who is not signed in as the dashboard admin", async () => {
    const { call } = setup();
    const r = await call({ action: "profile.get" }, "Bearer someone-else");
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/sign in/i);
  });
});

describe("business profile", () => {
  it("starts empty", async () => {
    const { call } = setup();
    const r = await call({ action: "profile.get" });
    expect(Object.values(r.body.values).every((v) => v === "")).toBe(true);
    expect(r.body.masked).toEqual({ ein: "", routing_number: "", account_number: "" });
    expect(r.body.hasSignature).toBe(false);
  });

  it("stores EIN and bank numbers encrypted and only returns the last 4 digits", async () => {
    const { call, store } = setup();
    const r = await fillProfile(call);
    expect(r.body.masked).toEqual({ ein: "•••• 0001", routing_number: "•••• 0013", account_number: "•••• 6789" });
    const responseText = JSON.stringify(r.body);
    for (const v of [EIN, "000000001", ROUTING, ACCOUNT]) expect(responseText).not.toContain(v);
    const stored = JSON.stringify(store.profile);
    for (const v of [EIN, "000000001", ROUTING, ACCOUNT]) expect(stored).not.toContain(v);
    expect(store.profile!.ein_enc!.startsWith("v1.")).toBe(true);
  });

  it("reveals one protected value only when asked", async () => {
    const { call, logs } = setup();
    await fillProfile(call);
    expect((await call({ action: "profile.reveal", field: "account_number" })).body.value).toBe(ACCOUNT);
    expect((await call({ action: "profile.reveal", field: "legal_name" })).status).toBe(400);
    expect(JSON.stringify(logs)).not.toContain(ACCOUNT);
  });

  it("keeps a sensitive value when other fields are saved, and clears it when emptied", async () => {
    const { call } = setup();
    await fillProfile(call);
    await call({ action: "profile.save", values: { phone: "(555) 010-9999" } });
    expect((await call({ action: "profile.reveal", field: "ein" })).body.value).toBe(EIN);
    const r = await call({ action: "profile.save", values: { routing_number: "" } });
    expect(r.body.masked.routing_number).toBe("");
  });

  it("explains bad values in plain English and saves nothing", async () => {
    const { call } = setup();
    const r = await call({ action: "profile.save", values: { ein: "12", phone: "(555) 010-0000" } });
    expect(r.status).toBe(422);
    expect(r.body.errors.ein).toMatch(/9 digits/);
    expect((await call({ action: "profile.get" })).body.values.phone).toBe("");
  });

  it("stores the signature encrypted and rejects anything that is not a PNG", async () => {
    const { call, store } = setup();
    const png = `data:image/png;base64,${b64encode(SIG_PNG)}`;
    expect((await call({ action: "signature.save", png })).body.hasSignature).toBe(true);
    expect(JSON.stringify(store.profile)).not.toContain(b64encode(SIG_PNG).slice(0, 40));
    expect((await call({ action: "signature.get" })).body.png).toBe(png);
    expect((await call({ action: "signature.save", png: "data:image/png;base64,aGVsbG8=" })).status).toBe(400);
  });
});

describe("upload and read", () => {
  it("stores the PDF in the customer file and maps it without sending stored values", async () => {
    const { call, upload, files, mapperCalls } = setup();
    await fillProfile(call);
    const r = await upload(PACKET);
    expect(r.status).toBe(201);
    expect([...files.files.keys()][0].startsWith(`${CUSTOMER}/`)).toBe(true);
    expect(mapperCalls).toHaveLength(1);
    // The mapper gets the original blank form, byte for byte.
    expect(mapperCalls[0].pdf).toEqual(PACKET);
    const structureText = JSON.stringify(mapperCalls[0].structure);
    for (const v of [EIN, ROUTING, ACCOUNT, "Sample Holdings LLC", "Jordan Testcase", "4000.00"]) expect(structureText).not.toContain(v);
    // It is handed the sensitive values only so it can refuse to send them.
    expect(mapperCalls[0].sensitive.sort()).toEqual([EIN, ROUTING, ACCOUNT].sort());
    const list = await call({ action: "paperwork.list", customerId: CUSTOMER });
    expect(list.body.items[0].status).toBe("ready");
    expect(list.body.items[0].title).toBe("Landlord Contact Form, ACH Form and W-9");
  });

  it.each([
    ["locked-user-password.pdf", 201, /password/],
    ["not-a-pdf.pdf", 422, /not a PDF/],
    ["too-many-pages.pdf", 201, /40 pages/],
  ])("shows a plain message for %s", async (file, status, msg) => {
    const { upload, call } = setup();
    const r = await upload(fixture(file), file);
    expect(r.status).toBe(status);
    if (status === 422) expect(r.body.error).toMatch(msg);
    else {
      expect(r.body.paperwork.status).toBe("unreadable");
      expect(r.body.paperwork.statusMessage).toMatch(msg);
      expect((await call({ action: "paperwork.list", customerId: CUSTOMER })).body.items).toHaveLength(1);
    }
  });

  it("keeps the file and opens the same review screen for filling by hand when the API fails", async () => {
    const { upload, call, files } = setup({ mapper: "fail" });
    const r = await upload(PACKET);
    expect(files.files.size).toBe(1);
    const got = await call({ action: "paperwork.get", id: r.body.paperwork.id });
    expect(got.body.paperwork.status).toBe("manual");
    expect(got.body.paperwork.statusMessage).toMatch(/fill in the fields by hand/);
    expect(got.body.targets).toHaveLength(29);
    const prev = await call({ action: "paperwork.preview", id: r.body.paperwork.id, edits: { f1: { value: "Typed By Hand LLC" } } });
    expect(await pdfText(prev.body.pdf)).toContain("Typed By Hand LLC");
  });

  it("lets Mike add text boxes by hand on a flat form", async () => {
    const { upload, call } = setup({ mapper: "fail" });
    const r = await upload(FLAT, "flat.pdf");
    const pid = r.body.paperwork.id;
    const prev = await call({
      action: "paperwork.preview",
      id: pid,
      extraTargets: [{ id: "x1", page: 0, rect: [140, 700, 200, 13], inputType: "text", label: "Landlord name" }],
      edits: { x1: { value: "Added By Hand" } },
    });
    expect(prev.status).toBe(200);
    expect(await pdfText(prev.body.pdf)).toContain("Added By Hand");
  });
});

describe("review screen", () => {
  it("marks what was filled, what is blank, and keeps the property questions blank", async () => {
    const { upload, call } = setup();
    await fillProfile(call);
    const pid = (await upload(PACKET)).body.paperwork.id;
    const r = await call({ action: "paperwork.get", id: pid });
    const t = (id: string) => r.body.targets.find((x: { id: string }) => x.id === id);
    expect(t("f1").status).toBe("auto");
    expect(t("f1").value).toBe("Sample Holdings LLC");
    expect(t("f10").value).toBe("4000.00");
    expect(t("f13").status).toBe("blank");
    expect(t("f14").state).toBe("property");
    expect(t("f14").status).toBe("blank");
    expect(t("f18").status).toBe("signature");
    expect(t("f20").status).toBe("none");
    // Sensitive values are masked in the list.
    expect(t("f26").value).toBe("");
    expect(t("f26").masked).toBe("•••• 6789");
    expect(JSON.stringify(r.body)).not.toContain(ACCOUNT);
    expect(t("f22").profileField).toBe("bank_name");
  });

  it("marks edits, applies them to the preview, and can reset them", async () => {
    const { upload, call } = setup();
    await fillProfile(call);
    const pid = (await upload(PACKET)).body.paperwork.id;
    const p = await call({ action: "paperwork.preview", id: pid, edits: { f3: { value: "(555) 010-2222" }, f14: { value: "Off" } } });
    expect(await pdfText(p.body.pdf)).toContain("(555) 010-2222");
    const f3 = p.body.review.targets.find((x: { id: string }) => x.id === "f3");
    expect(f3.status).toBe("edited");
    const back = await call({ action: "paperwork.preview", id: pid, edits: { f3: { reset: true } } });
    expect(await pdfText(back.body.pdf)).toContain("(555) 010-0000");
  });

  it("fills an unsure match only when Mike taps Use it", async () => {
    const { upload, call } = setup();
    await fillProfile(call);
    await call({ action: "profile.save", values: { default_notice_to_vacate: "7 days written notice" } });
    const pid = (await upload(PACKET)).body.paperwork.id;
    const before = (await call({ action: "paperwork.get", id: pid })).body.targets.find((x: { id: string }) => x.id === "f13");
    expect(before.status).toBe("blank");
    expect(before.suggestion).toBe("7 days");
    const p = await call({ action: "paperwork.preview", id: pid, edits: { f13: { accept: true } } });
    const after = p.body.review.targets.find((x: { id: string }) => x.id === "f13");
    expect(after.value).toBe("7 days");
    expect(after.status).toBe("edited");
  });

  it("uses the profile's default notice to vacate when the agreement has none", async () => {
    const { upload, call, store } = setup();
    delete store.customers.get(CUSTOMER)!.sources["agreement.notice_to_vacate"];
    await fillProfile(call);
    await call({ action: "profile.save", values: { default_notice_to_vacate: "7 days written notice" } });
    const pid = (await upload(PACKET)).body.paperwork.id;
    const t = (await call({ action: "paperwork.get", id: pid })).body.targets.find((x: { id: string }) => x.id === "f13");
    expect(t.suggestion).toBe("7 days written notice");
  });

  it("keeps an edited bank number encrypted in the saved draft", async () => {
    const { upload, call, store } = setup();
    await fillProfile(call);
    const pid = (await upload(PACKET)).body.paperwork.id;
    const p = await call({ action: "paperwork.preview", id: pid, edits: { f26: { value: "999888777666" } } });
    expect(await pdfText(p.body.pdf)).toContain("999888777666");
    expect(JSON.stringify(store.drafts.get(pid))).not.toContain("999888777666");
    expect(JSON.stringify(p.body.review)).not.toContain("999888777666");
    expect((await call({ action: "paperwork.reveal", id: pid, targetId: "f26" })).body.value).toBe("999888777666");
  });

  it("a profile edit can be saved back to the profile", async () => {
    const { call } = setup();
    await fillProfile(call);
    await call({ action: "profile.save", values: { phone: "(555) 010-3333" } });
    expect((await call({ action: "profile.get" })).body.values.phone).toBe("(555) 010-3333");
  });
});

describe("signature only after preview", () => {
  async function ready() {
    const s = setup();
    await fillProfile(s.call);
    await s.call({ action: "signature.save", png: `data:image/png;base64,${b64encode(SIG_PNG)}` });
    const pid = (await s.upload(PACKET)).body.paperwork.id;
    return { ...s, pid };
  }

  it("never places the signature or date on a fresh form", async () => {
    const { call, pid, download } = await ready();
    const prev = await call({ action: "paperwork.preview", id: pid });
    expect(prev.body.signed).toBe(false);
    expect(await pdfText(prev.body.pdf)).not.toContain("10/27/2026");
    const bytes = new Uint8Array(await (await download(`id=${pid}`)).arrayBuffer());
    expect(await pdfText(bytes)).not.toContain("10/27/2026");
  });

  it("refuses to sign without a preview of the current form", async () => {
    const { call, pid } = await ready();
    const r = await call({ action: "paperwork.sign", id: pid, previewHash: "made-up", date: "10/27/2026" });
    expect(r.status).toBe(409);
    const prev = await call({ action: "paperwork.preview", id: pid });
    await call({ action: "paperwork.preview", id: pid, edits: { f3: { value: "(555) 010-4444" } } });
    // The old preview no longer matches what would be signed.
    expect((await call({ action: "paperwork.sign", id: pid, previewHash: prev.body.previewHash, date: "10/27/2026" })).status).toBe(409);
  });

  it("adds the signature and date after Mike previews and clicks Add my signature", async () => {
    const { call, pid } = await ready();
    const prev = await call({ action: "paperwork.preview", id: pid });
    const s = await call({ action: "paperwork.sign", id: pid, previewHash: prev.body.previewHash, date: "10/27/2026" });
    expect(s.status).toBe(200);
    const after = await call({ action: "paperwork.preview", id: pid });
    expect(after.body.signed).toBe(true);
    expect((await pdfText(after.body.pdf)).match(/10\/27\/2026/g)).toHaveLength(3);
  });

  it("takes the signature off if the form changes after signing", async () => {
    const { call, pid } = await ready();
    const prev = await call({ action: "paperwork.preview", id: pid });
    await call({ action: "paperwork.sign", id: pid, previewHash: prev.body.previewHash, date: "10/27/2026" });
    const changed = await call({ action: "paperwork.preview", id: pid, edits: { f2: { value: "Someone Else" } } });
    expect(changed.body.signatureRemoved).toBe(true);
    expect(changed.body.signed).toBe(false);
    expect(await pdfText(changed.body.pdf)).not.toContain("10/27/2026");
  });

  it("asks for a drawn signature first", async () => {
    const s = setup();
    await fillProfile(s.call);
    const pid = (await s.upload(PACKET)).body.paperwork.id;
    const prev = await s.call({ action: "paperwork.preview", id: pid });
    const r = await s.call({ action: "paperwork.sign", id: pid, previewHash: prev.body.previewHash, date: "10/27/2026" });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Business profile/);
  });
});

describe("download", () => {
  it("downloads one flattened PDF and keeps a version", async () => {
    const { upload, call, download } = setup();
    await fillProfile(call);
    const pid = (await upload(PACKET)).body.paperwork.id;
    const res = await download(`id=${pid}`);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("Jordan Testcase - Landlord Contact Form, ACH Form and W-9.pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getForm().getFields()).toHaveLength(0);
    const text = await pdfText(bytes);
    for (const v of ["Sample Holdings LLC", "4000.00", "1250.50", EIN, ROUTING, ACCOUNT, "CLM-0000-TEST"]) expect(text).toContain(v);
    const v = await call({ action: "paperwork.versions", id: pid });
    expect(v.body.versions).toHaveLength(1);
  });

  it("reopens an old version to edit it again", async () => {
    const { upload, call, download } = setup();
    await fillProfile(call);
    const pid = (await upload(PACKET)).body.paperwork.id;
    await call({ action: "paperwork.preview", id: pid, edits: { f2: { value: "Version One Name" } } });
    await download(`id=${pid}`);
    await call({ action: "paperwork.preview", id: pid, edits: { f2: { value: "Version Two Name" } } });
    const versions = (await call({ action: "paperwork.versions", id: pid })).body.versions;
    const restored = await call({ action: "paperwork.restore", id: pid, versionId: versions[0].id });
    expect(restored.body.targets.find((t: { id: string }) => t.id === "f2").value).toBe("Version One Name");
  });

  it("downloads every form for the customer as one zip", async () => {
    const { upload, call, download } = setup();
    await fillProfile(call);
    await upload(PACKET);
    await upload(FLAT, "flat.pdf");
    await upload(fixture("locked-user-password.pdf"), "locked.pdf");
    const res = await download(`all=${CUSTOMER}`);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(zip)).toHaveLength(2);
    for (const bytes of Object.values(zip)) expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(0);
  });
});

describe("never logs sensitive values", () => {
  it("keeps EIN, bank numbers and signature out of every log line and console output", async () => {
    const consoleLines: string[] = [];
    for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void consoleLines.push(a.map(String).join(" ")));
    const { upload, call, download, logs } = setup();
    await fillProfile(call);
    await call({ action: "signature.save", png: `data:image/png;base64,${b64encode(SIG_PNG)}` });
    await call({ action: "profile.reveal", field: "ein" });
    const pid = (await upload(PACKET)).body.paperwork.id;
    await call({ action: "paperwork.preview", id: pid, edits: { f25: { value: "000000026" } } });
    await call({ action: "paperwork.reveal", id: pid, targetId: "f25" });
    await download(`id=${pid}`);
    await call({ action: "profile.save", values: { ein: "bad" } });
    const all = JSON.stringify(logs) + consoleLines.join("\n");
    for (const v of [EIN, "000000001", ROUTING, ACCOUNT, "000000026", b64encode(SIG_PNG).slice(0, 30)]) expect(all).not.toContain(v);
    expect(logs.length).toBeGreaterThan(3);
  });
});
