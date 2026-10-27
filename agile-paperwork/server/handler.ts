// The paperwork API. Runs as one Supabase Edge Function behind the dashboard's existing admin login.
// Written against small interfaces so the same code runs in tests and in Deno.
import { inspectPdf, InspectError, sanitizeTextItems, MAX_BYTES, INSPECT_MESSAGES, type FormStructure } from "../core/inspect.ts";
import { buildPlan, manualPlan, autoValue, displayStatus, type FormPlan, type Target, type FieldValue, type RawMapping } from "../core/plan.ts";
import { fillForm } from "../core/fill.ts";
import { zipPdfs, safeFileName } from "../core/zip.ts";
import { encryptField, decryptField, b64encode, b64decode } from "../core/crypto.ts";
import { KEY_INDEX, SENSITIVE_KEYS } from "../core/keys.ts";
import {
  PROFILE_FIELDS,
  PLAIN_PROFILE_FIELDS,
  SENSITIVE_PROFILE_FIELDS,
  isSensitiveField,
  validateProfileValue,
  profileValues,
  last4,
  maskLast4,
  normalizeEin,
  type SensitiveProfileField,
} from "../core/profile.ts";
import type { Admin, DraftState, FileStore, PaperworkRow, Store } from "./types.ts";

export interface Deps {
  // Reuses the dashboard's existing admin login. Returns null when the caller is not an admin.
  authenticate(req: Request): Promise<Admin | null>;
  store: Store;
  files: FileStore;
  encryptionKey(): Promise<CryptoKey>;
  // Null when no Claude API key is configured; uploads then go straight to filling by hand.
  mapper: ((structure: FormStructure, blankPdf: Uint8Array, sensitiveValues: string[]) => Promise<RawMapping>) | null;
  background(task: Promise<unknown>): void;
  newId(): string;
  now(): Date;
  // Event names and ids only. Never values.
  log(event: string, meta?: Record<string, string | number | boolean>): void;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_SIGNATURE_BYTES = 400 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const UUIDISH = /^[0-9a-zA-Z-]{6,64}$/;
const STALE_READING_MS = 6 * 60 * 1000;

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}

function str(v: unknown, field: string, max = 2000): string {
  if (typeof v !== "string") throw new HttpError(400, `Missing ${field}.`);
  if (v.length > max) throw new HttpError(400, `${field} is too long.`);
  return v;
}

function id(v: unknown, field = "id"): string {
  const s = str(v, field, 64);
  if (!UUIDISH.test(s)) throw new HttpError(400, `Bad ${field}.`);
  return s;
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_MAGIC.every((b, i) => bytes[i] === b);
}

function emptyDraft(): DraftState {
  return { values: {}, sensitive_enc: null, positions: {}, extra_targets: [], preview_hash: null, signed_at: null, signed_date: null, signed_hash: null };
}

export function createHandler(deps: Deps) {
  const { store, files } = deps;

  async function decryptedProfile() {
    const row = await store.getProfile();
    const key = await deps.encryptionKey();
    const sensitive: Partial<Record<SensitiveProfileField, string>> = {};
    for (const f of SENSITIVE_PROFILE_FIELDS) sensitive[f] = await decryptField(key, f, row?.[`${f}_enc`]);
    return { row, sensitive, data: profileValues(row?.plain ?? {}, sensitive) };
  }

  async function sensitiveValueList(): Promise<string[]> {
    const { sensitive } = await decryptedProfile();
    return Object.values(sensitive).filter((v): v is string => !!v);
  }

  async function profileView() {
    const row = await store.getProfile();
    const plain: Record<string, string> = {};
    for (const f of PLAIN_PROFILE_FIELDS) plain[f] = row?.plain?.[f] ?? "";
    const masked: Record<string, string> = {};
    for (const f of SENSITIVE_PROFILE_FIELDS) masked[f] = maskLast4(row?.[`${f}_last4`]);
    return {
      fields: PROFILE_FIELDS,
      values: plain,
      masked,
      hasSignature: !!row?.signature_enc,
      signatureUpdatedAt: row?.signature_updated_at ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  }

  async function saveProfileValues(values: Record<string, unknown>) {
    const errors: Record<string, string> = {};
    const plainPatch: Record<string, string> = {};
    const patch: Record<string, string | null> = {};
    const key = await deps.encryptionKey();
    for (const [name, raw] of Object.entries(values)) {
      if (!PROFILE_FIELDS.some((f) => f.name === name)) continue;
      if (typeof raw !== "string") continue;
      const problem = validateProfileValue(name, raw);
      if (problem) {
        errors[name] = problem;
        continue;
      }
      const value = raw.trim();
      if (isSensitiveField(name)) {
        const stored = name === "ein" && value ? normalizeEin(value) : value;
        patch[`${name}_enc`] = stored ? await encryptField(key, name, stored) : null;
        patch[`${name}_last4`] = stored ? last4(stored) : null;
      } else {
        plainPatch[name] = value;
      }
    }
    if (Object.keys(errors).length) throw Object.assign(new HttpError(422, "Some values need fixing."), { errors });
    const current = (await store.getProfile())?.plain ?? {};
    await store.saveProfile({ ...patch, plain: { ...current, ...plainPatch }, updated_at: deps.now().toISOString() });
  }

  // ----- forms -----

  async function getPaper(paperId: string): Promise<PaperworkRow> {
    const p = await store.getPaperwork(paperId);
    if (!p) throw new HttpError(404, "That form was not found. It may have been deleted.");
    return settleStale(p);
  }

  // If a reading job died (timeout, restart), never leave the form stuck on "Reading".
  async function settleStale(p: PaperworkRow): Promise<PaperworkRow> {
    if (p.status !== "reading" || !p.structure) return p;
    if (deps.now().getTime() - Date.parse(p.updated_at) < STALE_READING_MS) return p;
    const patch = {
      status: "manual" as const,
      status_message: "Reading this form took too long, so the fields are blank. Your file is saved. Fill them in by hand, or tap Try reading again.",
      plan: manualPlan(p.structure, p.file_name.replace(/\.pdf$/i, "")),
    };
    await store.updatePaperwork(p.id, patch);
    return { ...p, ...patch };
  }

  function targetsOf(p: PaperworkRow, draft: DraftState): Target[] {
    return [...(p.plan?.targets ?? []), ...draft.extra_targets];
  }

  async function sensitiveEdits(draft: DraftState): Promise<Record<string, string>> {
    if (!draft.sensitive_enc) return {};
    const key = await deps.encryptionKey();
    return JSON.parse(await decryptField(key, "paperwork_sensitive", draft.sensitive_enc));
  }

  // Every value that will go into the PDF, by target id.
  async function resolve(p: PaperworkRow, draft: DraftState) {
    const { data: profile } = await decryptedProfile();
    const sources = await store.loadSources(p.customer_id);
    const data: Record<string, string> = { ...sources, ...profile };
    // Agreements keep the notice period in their template text, so the profile default stands in for it.
    if (!data["agreement.notice_to_vacate"] && profile["profile.default_notice_to_vacate"]) {
      data["agreement.notice_to_vacate"] = profile["profile.default_notice_to_vacate"];
    }
    const sens = await sensitiveEdits(draft);
    const values: Record<string, string> = {};
    for (const t of targetsOf(p, draft)) {
      if (KEY_INDEX[t.key]?.sensitive && t.id in sens) values[t.id] = sens[t.id];
      else if (draft.values[t.id]?.edited) values[t.id] = draft.values[t.id].value;
      else values[t.id] = autoValue(t, data);
    }
    return { values, data };
  }

  async function stateHash(p: PaperworkRow, draft: DraftState, values: Record<string, string>): Promise<string> {
    return sha256(JSON.stringify({ v: Object.entries(values).sort(), pos: Object.entries(draft.positions).sort(), extra: draft.extra_targets.map((t) => [t.id, t.rect, t.inputType]), plan: p.updated_at }));
  }

  async function signatureInput(draft: DraftState) {
    if (!draft.signed_at || !draft.signed_date) return null;
    const row = await store.getProfile();
    if (!row?.signature_enc) return null;
    const key = await deps.encryptionKey();
    const png = b64decode(await decryptField(key, "signature", row.signature_enc));
    return { png, date: draft.signed_date };
  }

  async function blankBytes(p: PaperworkRow): Promise<Uint8Array> {
    return files.get(p.storage_path);
  }

  function fullPlan(p: PaperworkRow, draft: DraftState): FormPlan {
    return { ...(p.plan ?? { title: p.title ?? p.file_name, kind: "other", source: "manual", targets: [] }), targets: targetsOf(p, draft) };
  }

  async function render(p: PaperworkRow, draft: DraftState) {
    const { values } = await resolve(p, draft);
    const hash = await stateHash(p, draft, values);
    let signatureRemoved = false;
    if (draft.signed_at && draft.signed_hash !== hash) {
      // The form changed after signing. Take the signature off so Mike checks it again.
      draft.signed_at = null;
      draft.signed_date = null;
      draft.signed_hash = null;
      signatureRemoved = true;
    }
    const result = await fillForm(await blankBytes(p), fullPlan(p, draft), {
      values,
      positions: draft.positions,
      signature: await signatureInput(draft),
    });
    return { ...result, hash, signatureRemoved, values };
  }

  // What the review screen shows. Sensitive values are masked unless revealed one at a time.
  async function reviewView(p: PaperworkRow, draft: DraftState) {
    const { values, data } = await resolve(p, draft);
    const targets = targetsOf(p, draft).map((t) => {
      const v = draft.values[t.id] as FieldValue | undefined;
      const sensitive = SENSITIVE_KEYS.has(t.key);
      const value = values[t.id] ?? "";
      return {
        ...t,
        sensitive,
        value: sensitive ? "" : value,
        masked: sensitive && value ? maskLast4(last4(value)) : "",
        hasValue: value !== "",
        edited: !!v?.edited,
        status: displayStatus(t, v, value),
        keyLabel: KEY_INDEX[t.key]?.label ?? null,
        // For unsure matches: what "Use it" would fill in. Protected values are never sent here.
        suggestion: t.state === "suggest" && !v?.edited ? (sensitive ? (autoValue({ ...t, state: "auto" }, data) ? "hidden" : "") : autoValue({ ...t, state: "auto" }, data)) : "",
        profileField: KEY_INDEX[t.key]?.profileField ?? null,
      };
    });
    return {
      paperwork: publicPaper(p),
      title: p.plan?.title ?? p.title ?? p.file_name,
      pages: p.structure?.pages ?? [],
      targets,
      positions: draft.positions,
      signed: !!draft.signed_at,
      signedDate: draft.signed_date,
      hasSignature: !!(await store.getProfile())?.signature_enc,
    };
  }

  function publicPaper(p: PaperworkRow) {
    return {
      id: p.id,
      customerId: p.customer_id,
      fileName: p.file_name,
      title: p.plan?.title ?? p.title ?? p.file_name,
      status: p.status,
      statusMessage: p.status_message,
      pageCount: p.page_count,
      sizeBytes: p.size_bytes,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }

  async function analyze(paperId: string) {
    const p = await getPaper(paperId);
    if (!p.structure) return;
    if (!deps.mapper) {
      await store.updatePaperwork(paperId, {
        status: "manual",
        status_message: "Automatic reading is not set up yet, so the fields are blank. You can fill them in by hand.",
        plan: manualPlan(p.structure, p.file_name.replace(/\.pdf$/i, "")),
      });
      return;
    }
    try {
      const blank = await blankBytes(p);
      const raw = await deps.mapper(p.structure, blank, await sensitiveValueList());
      const plan = buildPlan(p.structure, raw);
      await store.updatePaperwork(paperId, { status: "ready", status_message: null, plan, title: plan.title });
      deps.log("paperwork.analyzed", { paperId, targets: plan.targets.length });
    } catch (e) {
      deps.log("paperwork.analyze_failed", { paperId, kind: e instanceof Error ? e.constructor.name : "unknown" });
      const reason = e instanceof Error && e.constructor.name === "MappingFailed" ? `${e.message}. ` : "";
      await store.updatePaperwork(paperId, {
        status: "manual",
        status_message: `${reason}The form could not be read automatically. Your file is saved, and you can fill in the fields by hand.`,
        plan: manualPlan(p.structure, p.file_name.replace(/\.pdf$/i, "")),
      });
    }
  }

  async function loadDraft(paperId: string): Promise<DraftState> {
    const d = await store.getDraft(paperId);
    return d ? { ...emptyDraft(), ...d } : emptyDraft();
  }

  // Applies edits sent from the review screen to the draft.
  async function applyEdits(p: PaperworkRow, draft: DraftState, body: Record<string, unknown>) {
    const edits = (body.edits ?? {}) as Record<string, { value?: unknown; reset?: unknown; accept?: unknown }>;
    const extras = Array.isArray(body.extraTargets) ? (body.extraTargets as unknown[]) : null;
    if (extras) draft.extra_targets = sanitizeExtras(extras, p);
    const targets = new Map(targetsOf(p, draft).map((t) => [t.id, t]));
    const sens = await sensitiveEdits(draft);
    let sensChanged = false;
    for (const [tid, e] of Object.entries(edits)) {
      const t = targets.get(tid);
      if (!t || t.state === "signature" || t.key.startsWith("signature.")) continue;
      if (e?.reset === true) {
        delete draft.values[tid];
        if (tid in sens) {
          delete sens[tid];
          sensChanged = true;
        }
        continue;
      }
      if (e?.accept === true) {
        // "Use it" on an unsure match: take the suggested value from Mike's own records.
        const { data } = await resolve(p, draft);
        const v = autoValue({ ...t, state: "auto" }, data);
        if (!v) continue;
        e.value = v;
      }
      if (typeof e?.value !== "string" || e.value.length > 1000) continue;
      if (SENSITIVE_KEYS.has(t.key)) {
        sens[tid] = e.value;
        sensChanged = true;
        draft.values[tid] = { value: "", edited: true };
      } else draft.values[tid] = { value: e.value, edited: true };
    }
    for (const tid of Object.keys(draft.values)) if (!targets.has(tid)) delete draft.values[tid];
    if (sensChanged) {
      const key = await deps.encryptionKey();
      draft.sensitive_enc = Object.keys(sens).length ? await encryptField(key, "paperwork_sensitive", JSON.stringify(sens)) : null;
    }
    if (body.positions && typeof body.positions === "object") {
      const pos: Record<string, [number, number, number, number]> = {};
      for (const [tid, r] of Object.entries(body.positions as Record<string, unknown>)) {
        const t = targets.get(tid);
        if (!t || t.origin !== "overlay" || !Array.isArray(r) || r.length !== 4) continue;
        const page = p.structure?.pages[t.page];
        const n = r.map(Number);
        if (!page || n.some((x) => !Number.isFinite(x))) continue;
        const w = Math.min(Math.max(n[2], 4), page.width);
        const h = Math.min(Math.max(n[3], 4), page.height);
        pos[tid] = [Math.min(Math.max(n[0], 0), page.width - w), Math.min(Math.max(n[1], 0), page.height - h), w, h];
      }
      draft.positions = pos;
    }
  }

  function sanitizeExtras(list: unknown[], p: PaperworkRow): Target[] {
    const out: Target[] = [];
    for (const raw of list.slice(0, 200)) {
      const t = raw as Record<string, unknown>;
      const tid = String(t.id ?? "");
      if (!/^x\d{1,6}$/.test(tid)) continue;
      const page = Math.trunc(Number(t.page));
      const pg = p.structure?.pages[page];
      const r = Array.isArray(t.rect) ? (t.rect as unknown[]).map(Number) : [];
      if (!pg || r.length !== 4 || r.some((x) => !Number.isFinite(x))) continue;
      const inputType = t.inputType === "checkbox" ? "checkbox" : "text";
      out.push({
        id: tid,
        origin: "overlay",
        page,
        rect: [r[0], r[1], Math.max(4, r[2]), Math.max(4, r[3])],
        label: String(t.label ?? "Added text").slice(0, 80) || "Added text",
        inputType,
        key: "manual",
        match: null,
        choices: [],
        confidence: 1,
        reason: "Added by hand",
        state: "manual",
      });
    }
    return out;
  }

  async function downloadOne(p: PaperworkRow) {
    const draft = await loadDraft(p.id);
    const r = await render(p, draft);
    const saved = await store.saveDraft(p.id, draft);
    await store.insertVersion(p.id, { ...saved, values: snapshotValues(p, draft, r.values) });
    return r;
  }

  // Versions keep non-sensitive values as they were downloaded. Sensitive values stay encrypted or by reference.
  function snapshotValues(p: PaperworkRow, draft: DraftState, values: Record<string, string>): Record<string, FieldValue> {
    const out: Record<string, FieldValue> = {};
    for (const t of targetsOf(p, draft)) {
      if (SENSITIVE_KEYS.has(t.key)) {
        if (draft.values[t.id]?.edited) out[t.id] = { value: "", edited: true };
        continue;
      }
      out[t.id] = { value: values[t.id] ?? "", edited: !!draft.values[t.id]?.edited };
    }
    return out;
  }

  async function fileNameFor(p: PaperworkRow, ext = "pdf") {
    const who = await store.customerName(p.customer_id);
    return `${safeFileName(`${who} - ${p.plan?.title ?? p.title ?? p.file_name.replace(/\.pdf$/i, "")}`)}.${ext}`;
  }

  // ----- request handling -----

  async function handleUpload(req: Request) {
    const form = await req.formData();
    const customerId = id(form.get("customerId"), "customerId");
    if (!(await store.customerExists(customerId))) throw new HttpError(404, "That customer file was not found.");
    const file = form.get("file");
    if (!file || typeof file === "string") throw new HttpError(400, "Choose a PDF to upload.");
    const name = safeFileName((file as File).name || "form.pdf");
    if ((file as File).size > MAX_BYTES) {
      return json({ error: INSPECT_MESSAGES.too_large, code: "too_large" }, 422);
    }
    const bytes = new Uint8Array(await (file as File).arrayBuffer());
    let textItems: unknown = [];
    try {
      textItems = JSON.parse(String(form.get("textItems") ?? "[]"));
    } catch {
      textItems = [];
    }
    let structure: FormStructure | null = null;
    let status: PaperworkRow["status"] = "reading";
    let message: string | null = null;
    try {
      structure = await inspectPdf(bytes);
      structure.textItems = sanitizeTextItems(textItems, structure.pageCount);
    } catch (e) {
      if (!(e instanceof InspectError)) throw e;
      if (e.code === "not_pdf" || e.code === "too_large") return json({ error: e.message, code: e.code }, 422);
      status = "unreadable";
      message = e.message;
    }
    const paperId = deps.newId();
    const path = `${customerId}/${paperId}/${name.toLowerCase().endsWith(".pdf") ? name : name + ".pdf"}`;
    await files.put(path, bytes);
    const row = await store.insertPaperwork({
      id: paperId,
      customer_id: customerId,
      file_name: name,
      storage_path: path,
      size_bytes: bytes.length,
      page_count: structure?.pageCount ?? null,
      status,
      status_message: message,
      title: null,
      structure,
      plan: null,
    });
    deps.log("paperwork.uploaded", { paperId, status });
    if (status === "reading") deps.background(analyze(paperId));
    return json({ paperwork: publicPaper(row) }, 201);
  }

  async function handleAction(body: Record<string, unknown>): Promise<Response> {
    const action = str(body.action, "action", 40);
    switch (action) {
      case "profile.get":
        return json(await profileView());
      case "profile.save": {
        await saveProfileValues((body.values ?? {}) as Record<string, unknown>);
        deps.log("profile.saved", { fields: Object.keys((body.values ?? {}) as object).length });
        return json(await profileView());
      }
      case "profile.reveal": {
        const field = str(body.field, "field", 40);
        if (!isSensitiveField(field)) throw new HttpError(400, "That field is not protected.");
        const { sensitive } = await decryptedProfile();
        deps.log("profile.revealed", { field });
        return json({ value: sensitive[field] ?? "" });
      }
      case "signature.get": {
        const row = await store.getProfile();
        if (!row?.signature_enc) return json({ png: null });
        const key = await deps.encryptionKey();
        return json({ png: `data:image/png;base64,${await decryptField(key, "signature", row.signature_enc)}` });
      }
      case "signature.save": {
        const dataUrl = str(body.png, "signature", MAX_SIGNATURE_BYTES * 2);
        const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
        if (!m) throw new HttpError(400, "The signature must be a PNG image.");
        const bytes = b64decode(m[1]);
        if (!isPng(bytes) || bytes.length > MAX_SIGNATURE_BYTES) throw new HttpError(400, "The signature image is not valid. Please draw it again.");
        const key = await deps.encryptionKey();
        await store.saveProfile({ signature_enc: await encryptField(key, "signature", m[1]), signature_updated_at: deps.now().toISOString() });
        deps.log("signature.saved");
        return json(await profileView());
      }
      case "signature.delete":
        await store.saveProfile({ signature_enc: null, signature_updated_at: deps.now().toISOString() });
        return json(await profileView());
      case "paperwork.list": {
        const customerId = id(body.customerId, "customerId");
        const rows = await Promise.all((await store.listPaperwork(customerId)).map(settleStale));
        const items = await Promise.all(
          rows.map(async (r) => {
            const versions = await store.listVersions(r.id);
            const draft = await store.getDraft(r.id);
            return { ...publicPaper(r), versions: versions.length, lastDownloadAt: versions[0]?.created_at ?? null, signed: !!draft?.signed_at };
          }),
        );
        return json({ items });
      }
      case "paperwork.get": {
        const p = await getPaper(id(body.id));
        if (p.status === "reading" || p.status === "unreadable") return json({ paperwork: publicPaper(p) });
        return json(await reviewView(p, await loadDraft(p.id)));
      }
      case "paperwork.retry": {
        const p = await getPaper(id(body.id));
        if (!p.structure) throw new HttpError(400, "This file cannot be read.");
        await store.updatePaperwork(p.id, { status: "reading", status_message: null });
        deps.background(analyze(p.id));
        return json({ paperwork: publicPaper({ ...p, status: "reading" }) });
      }
      case "paperwork.preview": {
        // Saves the edits, builds the filled PDF and remembers exactly what Mike was shown.
        const p = await getPaper(id(body.id));
        const draft = await loadDraft(p.id);
        await applyEdits(p, draft, body);
        const r = await render(p, draft);
        draft.preview_hash = r.hash;
        await store.saveDraft(p.id, draft);
        return json({
          pdf: b64encode(r.bytes),
          previewHash: r.hash,
          problems: r.problems,
          signed: !!draft.signed_at,
          signatureRemoved: r.signatureRemoved,
          review: await reviewView(p, draft),
        });
      }
      case "paperwork.sign": {
        const p = await getPaper(id(body.id));
        const draft = await loadDraft(p.id);
        const shown = str(body.previewHash, "previewHash", 128);
        const date = str(body.date, "date", 20);
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) throw new HttpError(400, "Bad date.");
        if (!(await store.getProfile())?.signature_enc) throw new HttpError(409, "Draw your signature on the Business profile page first.");
        const { values } = await resolve(p, draft);
        const current = await stateHash(p, draft, values);
        // The signature goes on only if Mike saw a preview of exactly this version of the form.
        if (!draft.preview_hash || draft.preview_hash !== shown || current !== shown) {
          throw new HttpError(409, "The form changed since the preview. Check the new preview, then add your signature.");
        }
        draft.signed_at = deps.now().toISOString();
        draft.signed_date = date;
        draft.signed_hash = current;
        await store.saveDraft(p.id, draft);
        deps.log("paperwork.signed", { paperId: p.id });
        return json({ ok: true });
      }
      case "paperwork.unsign": {
        const p = await getPaper(id(body.id));
        const draft = await loadDraft(p.id);
        draft.signed_at = draft.signed_date = draft.signed_hash = null;
        await store.saveDraft(p.id, draft);
        return json({ ok: true });
      }
      case "paperwork.reveal": {
        const p = await getPaper(id(body.id));
        const draft = await loadDraft(p.id);
        const tid = str(body.targetId, "targetId", 20);
        const t = targetsOf(p, draft).find((x) => x.id === tid);
        if (!t || !SENSITIVE_KEYS.has(t.key)) throw new HttpError(400, "That field is not protected.");
        const { values } = await resolve(p, draft);
        deps.log("paperwork.revealed", { paperId: p.id });
        return json({ value: values[tid] ?? "" });
      }
      case "paperwork.versions": {
        const p = await getPaper(id(body.id));
        const versions = await store.listVersions(p.id);
        return json({ versions: versions.map((v) => ({ id: v.id, versionNo: v.version_no, createdAt: v.created_at, signed: !!v.signed_at })) });
      }
      case "paperwork.restore": {
        const p = await getPaper(id(body.id));
        const v = await store.getVersion(id(body.versionId, "versionId"));
        if (!v || v.paperwork_id !== p.id) throw new HttpError(404, "That version was not found.");
        const edited: Record<string, FieldValue> = {};
        for (const [k, fv] of Object.entries(v.values)) if (fv.edited) edited[k] = fv;
        await store.saveDraft(p.id, {
          ...emptyDraft(),
          values: edited,
          sensitive_enc: v.sensitive_enc,
          positions: v.positions,
          extra_targets: v.extra_targets,
        });
        return json(await reviewView(p, await loadDraft(p.id)));
      }
      case "paperwork.delete": {
        const p = await getPaper(id(body.id));
        await store.deletePaperwork(p.id);
        await files.remove(p.storage_path).catch(() => undefined);
        deps.log("paperwork.deleted", { paperId: p.id });
        return json({ ok: true });
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  }

  // Downloads come back as base64 inside JSON so they use the same signed-in call as every other action.
  async function download(body: Record<string, unknown>): Promise<Response> {
    if (body.action === "paperwork.downloadAll") {
      const customerId = id(body.customerId, "customerId");
      const rows = (await store.listPaperwork(customerId)).filter((r) => r.status === "ready" || r.status === "manual");
      if (!rows.length) throw new HttpError(404, "There are no filled forms to download yet.");
      const out: { name: string; bytes: Uint8Array }[] = [];
      for (const r of rows) out.push({ name: await fileNameFor(r), bytes: (await downloadOne(r)).bytes });
      const who = await store.customerName(customerId);
      deps.log("paperwork.download_all", { customerId, count: out.length });
      return json({ fileName: `${safeFileName(`${who} - landlord forms`)}.zip`, type: "application/zip", data: b64encode(zipPdfs(out)) });
    }
    const p = await getPaper(id(body.id));
    if (p.status !== "ready" && p.status !== "manual") throw new HttpError(409, "This form is not ready to download.");
    const r = await downloadOne(p);
    deps.log("paperwork.downloaded", { paperId: p.id });
    return json({ fileName: await fileNameFor(p), type: "application/pdf", data: b64encode(r.bytes), problems: r.problems, signed: !!(await store.getDraft(p.id))?.signed_at });
  }

  return async function handle(req: Request): Promise<Response> {
    try {
      const admin = await deps.authenticate(req);
      if (!admin) throw new HttpError(401, "Please sign in to the dashboard again.");
      if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
      const type = req.headers.get("content-type") ?? "";
      if (type.startsWith("multipart/form-data")) return await handleUpload(req);
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, "Bad request.");
      }
      if (body.action === "paperwork.download" || body.action === "paperwork.downloadAll") return await download(body);
      return await handleAction(body);
    } catch (e) {
      if (e instanceof HttpError) {
        const extra = (e as HttpError & { errors?: Record<string, string> }).errors;
        return json({ error: e.message, ...(extra ? { errors: extra } : {}) }, e.status);
      }
      // Log the kind of failure only; messages could echo user input.
      deps.log("paperwork.error", { kind: e instanceof Error ? e.constructor.name : "unknown" });
      return json({ error: "Something went wrong on our side. Your work is saved. Please try again." }, 500);
    }
  };
}
