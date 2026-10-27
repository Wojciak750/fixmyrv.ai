// Turns Claude's raw mapping into a checked fill plan, and resolves the plan
// against real values locally. Claude never sees the values.
import type { FormStructure, FieldType } from "./inspect.ts";
import { ALL_MAPPING_KEYS, KEY_INDEX, MANUAL_KEY, NONE_KEY, isSignatureKey } from "./keys.ts";

export const CONFIDENCE_THRESHOLD = 0.7;

// Questions about the property or the owner's finances are never answered automatically.
export const PROPERTY_QUESTION_RE =
  /mortgag|lien|foreclos|bankrupt|default|delinquen|judg(e)?ment|encumb|financial|solven|insolven|tax(es)? (owed|due|current)|property tax|lawsuit|litigation|garnish|levy|repossess|owner of record|own the property|title (to|of) the property|in good standing/i;

export type TargetState =
  | "auto" // filled from data with good confidence
  | "suggest" // Claude was unsure, value not filled, suggestion shown
  | "manual" // Mike must answer
  | "property" // yes/no or financial question about the property, never guessed
  | "signature" // filled only after "Add my signature"
  | "none"; // left blank on purpose

export type InputType = "text" | "checkbox" | "radio" | "dropdown" | "signature" | "date";

export interface Choice {
  when: string;
  choose: string;
}

export interface Target {
  id: string;
  origin: "field" | "overlay";
  fieldName?: string;
  page: number;
  rect: [number, number, number, number];
  // Extra widget rectangles (radio buttons, repeated fields) for highlighting.
  rects?: { page: number; rect: [number, number, number, number]; onValue?: string }[];
  label: string;
  inputType: InputType;
  options?: string[];
  maxLength?: number;
  multiline?: boolean;
  key: string;
  match: string | null;
  choices: Choice[];
  confidence: number;
  reason: string;
  state: TargetState;
}

export interface FormPlan {
  title: string;
  kind: string;
  targets: Target[];
  source: "claude" | "manual";
}

export interface RawFieldMapping {
  field_id: string;
  label: string;
  key: string;
  match: string | null;
  choices: Choice[];
  confidence: number;
  is_property_question: boolean;
  reason: string;
}

export interface RawBlank {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  input_type: "text" | "checkbox" | "signature" | "date";
  key: string;
  match: string | null;
  confidence: number;
  is_property_question: boolean;
  reason: string;
}

export interface RawMapping {
  form_title: string;
  form_kind: string;
  fields: RawFieldMapping[];
  blanks: RawBlank[];
}

function fieldInputType(t: FieldType): InputType {
  switch (t) {
    case "checkbox":
      return "checkbox";
    case "radio":
      return "radio";
    case "dropdown":
    case "list":
      return "dropdown";
    case "signature":
      return "signature";
    default:
      return "text";
  }
}

function stateFor(key: string, confidence: number, propertyQuestion: boolean): TargetState {
  if (propertyQuestion) return "property";
  if (key === NONE_KEY) return "none";
  if (key === MANUAL_KEY) return "manual";
  if (isSignatureKey(key)) return "signature";
  if (!(confidence >= CONFIDENCE_THRESHOLD)) return "suggest";
  return "auto";
}

function clampNum(n: unknown, lo: number, hi: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function overlapRatio(a: [number, number, number, number], b: [number, number, number, number]): number {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const area = Math.max(1, a[2] * a[3]);
  return (x * y) / area;
}

function cleanLabel(s: unknown, fallback: string): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return t || fallback;
}

// A plan with every field present but nothing filled. Used when the Claude call fails,
// so Mike can still fill the form by hand on the same review screen.
export function manualPlan(structure: FormStructure, title = "Uploaded form"): FormPlan {
  return {
    title,
    kind: "other",
    source: "manual",
    targets: structure.fields.map((f) => fieldTarget(f, null)),
  };
}

function fieldTarget(f: FormStructure["fields"][number], m: RawFieldMapping | null): Target {
  const w0 = f.widgets[0];
  const textForCheck = [f.name, f.tooltip, m?.label].filter(Boolean).join(" ");
  let key = m && ALL_MAPPING_KEYS.includes(m.key) ? m.key : MANUAL_KEY;
  const propertyQuestion = !!m?.is_property_question || PROPERTY_QUESTION_RE.test(textForCheck);
  if (propertyQuestion) key = MANUAL_KEY;
  if (f.readOnly) key = NONE_KEY;
  const confidence = m ? clampNum(m.confidence, 0, 1) : 0;
  const inputType = fieldInputType(f.type);
  let state = m ? stateFor(key, confidence, propertyQuestion) : propertyQuestion ? "property" : "manual";
  // Checkboxes and radios with a data key need something to compare against.
  if (state === "auto" && inputType === "checkbox" && !m?.match) state = "suggest";
  if (state === "auto" && (inputType === "radio" || inputType === "dropdown") && !(m?.choices?.length) && !f.options?.length) state = "suggest";
  return {
    id: f.id,
    origin: "field",
    fieldName: f.name,
    page: w0.page,
    rect: w0.rect,
    rects: f.widgets.map((w) => ({ page: w.page, rect: w.rect, onValue: w.onValue })),
    label: cleanLabel(m?.label ?? f.tooltip, f.name),
    inputType,
    options: f.options,
    maxLength: f.maxLength,
    multiline: f.multiline,
    key,
    match: m?.match ?? null,
    choices: Array.isArray(m?.choices) ? m!.choices.filter((c) => c && typeof c.when === "string" && typeof c.choose === "string").slice(0, 30) : [],
    confidence,
    reason: cleanLabel(m?.reason, ""),
    state,
  };
}

export function buildPlan(structure: FormStructure, raw: RawMapping): FormPlan {
  const byId = new Map<string, RawFieldMapping>();
  for (const m of raw.fields ?? []) if (m && typeof m.field_id === "string") byId.set(m.field_id, m);

  const targets: Target[] = structure.fields.map((f) => fieldTarget(f, byId.get(f.id) ?? null));

  let n = 0;
  for (const b of raw.blanks ?? []) {
    const page = Math.trunc(Number(b.page));
    const pageInfo = structure.pages[page];
    if (!pageInfo) continue;
    const width = clampNum(b.width, 4, pageInfo.width);
    const height = clampNum(b.height, 4, Math.min(120, pageInfo.height));
    const x = clampNum(b.x, 0, pageInfo.width - width);
    const y = clampNum(b.y, 0, pageInfo.height - height);
    const rect: [number, number, number, number] = [x, y, width, height];
    // Skip blanks that sit on top of a real form field; the field already covers them.
    const dup = structure.fields.some((f) => f.widgets.some((w) => w.page === page && overlapRatio(rect, w.rect) > 0.5));
    if (dup) continue;
    let key = ALL_MAPPING_KEYS.includes(b.key) ? b.key : MANUAL_KEY;
    const propertyQuestion = !!b.is_property_question || PROPERTY_QUESTION_RE.test(String(b.label ?? ""));
    if (propertyQuestion) key = MANUAL_KEY;
    const confidence = clampNum(b.confidence, 0, 1);
    const inputType: InputType = ["text", "checkbox", "signature", "date"].includes(b.input_type) ? b.input_type : "text";
    let state = stateFor(key, confidence, propertyQuestion);
    if (state === "auto" && inputType === "checkbox" && !b.match) state = "suggest";
    targets.push({
      id: `o${++n}`,
      origin: "overlay",
      page,
      rect,
      label: cleanLabel(b.label, `Blank on page ${page + 1}`),
      inputType,
      key,
      match: b.match ?? null,
      choices: [],
      confidence,
      reason: cleanLabel(b.reason, ""),
      state,
    });
  }

  targets.sort((a, b) => a.page - b.page || b.rect[1] + b.rect[3] - (a.rect[1] + a.rect[3]) || a.rect[0] - b.rect[0]);

  return {
    title: cleanLabel(raw.form_title, "Uploaded form"),
    kind: cleanLabel(raw.form_kind, "other"),
    source: "claude",
    targets,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Value for one target from the data, or "" when there is nothing to put there.
export function autoValue(t: Target, data: Record<string, string>): string {
  if (t.state !== "auto") return "";
  const raw = data[t.key] ?? "";
  if (raw === "") return "";
  if (t.inputType === "checkbox") {
    return t.match && norm(raw) === norm(t.match) ? "Yes" : "Off";
  }
  if (t.inputType === "radio" || t.inputType === "dropdown") {
    for (const c of t.choices) if (norm(c.when) === norm(raw) && (t.options ?? []).includes(c.choose)) return c.choose;
    for (const o of t.options ?? []) if (norm(o) === norm(raw)) return o;
    return "";
  }
  // Text, copied exactly as stored. Never rounded or reformatted.
  return raw;
}

export interface FieldValue {
  value: string;
  edited: boolean;
}

// Initial values for a fresh version. Sensitive values are not copied in;
// they are stored as references and resolved again each time the PDF is built.
export function initialValues(plan: FormPlan, data: Record<string, string>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const t of plan.targets) {
    if (KEY_INDEX[t.key]?.sensitive) continue;
    out[t.id] = { value: autoValue(t, data), edited: false };
  }
  return out;
}

export type DisplayStatus = "auto" | "edited" | "blank" | "signature" | "none";

export function displayStatus(t: Target, v: FieldValue | undefined, effectiveValue: string): DisplayStatus {
  if (v?.edited) return "edited";
  if (t.state === "signature") return "signature";
  if (t.state === "none") return "none";
  if (t.state === "auto" && effectiveValue !== "") return "auto";
  return "blank";
}
