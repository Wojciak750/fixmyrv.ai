// Reads a PDF's structure: pages, form fields and where each field sits.
// This structure (never any stored values) is what gets sent to Claude.
import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFHexString,
  PDFArray,
  PDFRef,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
  PDFButton,
  type PDFField,
} from "pdf-lib";

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 40;

export type FieldType = "text" | "checkbox" | "radio" | "dropdown" | "list" | "signature" | "button";

export interface WidgetInfo {
  page: number; // 0-based
  rect: [number, number, number, number]; // x, y, width, height in PDF points, origin bottom-left
  onValue?: string; // checkbox or radio export value for this widget
}

export interface FieldInfo {
  id: string;
  name: string;
  type: FieldType;
  tooltip?: string;
  options?: string[];
  maxLength?: number;
  multiline?: boolean;
  readOnly?: boolean;
  widgets: WidgetInfo[];
}

export interface PageInfo {
  index: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextItem {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FormStructure {
  pageCount: number;
  pages: PageInfo[];
  fields: FieldInfo[];
  // Text with positions, extracted by pdf.js in the browser. Helps place text on flat forms.
  textItems?: TextItem[];
  hadXfa: boolean;
}

export type InspectErrorCode = "not_pdf" | "locked" | "too_large" | "too_many_pages" | "damaged" | "xfa_only" | "empty";

export class InspectError extends Error {
  constructor(public code: InspectErrorCode, message: string) {
    super(message);
  }
}

export const INSPECT_MESSAGES: Record<InspectErrorCode, string> = {
  not_pdf: "This file is not a PDF. Please upload the form as a PDF file.",
  locked:
    "This PDF is locked with a password or protected against changes, so it cannot be filled here. Ask the adjuster for an unlocked copy. Or open it on your computer, choose Print, pick Save as PDF, and upload that new copy.",
  too_large: "This PDF is too big. The limit is 20 MB. Ask the adjuster for a smaller copy, or upload only the pages with the landlord forms.",
  too_many_pages: "This PDF has more than 40 pages. Upload only the pages with the landlord forms.",
  damaged: "This PDF looks damaged and could not be opened. Try downloading it again from the adjuster's email, then upload it again.",
  xfa_only:
    "This form was made in an older Adobe format that only Adobe Reader can fill. Open it in Adobe Reader, choose Print, pick Save as PDF, then upload the new copy.",
  empty: "This PDF has no pages.",
};

function fail(code: InspectErrorCode): never {
  throw new InspectError(code, INSPECT_MESSAGES[code]);
}

export function isPdfHeader(bytes: Uint8Array): boolean {
  // %PDF- may follow a little junk; search the first 1 KB like most readers do.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  if (bytes.length > MAX_BYTES) fail("too_large");
  if (!isPdfHeader(bytes)) fail("not_pdf");
  let doc: PDFDocument;
  try {
    // Load with ignoreEncryption so a locked file is reported as locked, not as damaged.
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch {
    fail("damaged");
  }
  if (doc.isEncrypted) fail("locked");
  const count = doc.getPageCount();
  if (count === 0) fail("empty");
  if (count > MAX_PAGES) fail("too_many_pages");
  return doc;
}

function decodeText(obj: unknown): string | undefined {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
  return undefined;
}

function fieldType(f: PDFField): FieldType {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "checkbox";
  if (f instanceof PDFRadioGroup) return "radio";
  if (f instanceof PDFDropdown) return "dropdown";
  if (f instanceof PDFOptionList) return "list";
  if (f instanceof PDFSignature) return "signature";
  if (f instanceof PDFButton) return "button";
  return "text";
}

// Maps each annotation object to the page it sits on.
export function annotationPageIndex(doc: PDFDocument): Map<string, number> {
  const map = new Map<string, number>();
  doc.getPages().forEach((page, i) => {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) return;
    for (let j = 0; j < annots.size(); j++) {
      const ref = annots.get(j);
      if (ref instanceof PDFRef) map.set(ref.toString(), i);
    }
  });
  return map;
}

export function widgetOnValue(widget: { getOnValue(): PDFName | undefined }): string | undefined {
  const on = widget.getOnValue();
  return on ? on.decodeText() : undefined;
}

export function hasXfa(doc: PDFDocument): boolean {
  const form = doc.catalog.getAcroForm();
  return !!form && form.dict.has(PDFName.of("XFA"));
}

export function getFields(doc: PDFDocument): { field: PDFField; info: FieldInfo }[] {
  const pageOf = annotationPageIndex(doc);
  const form = doc.getForm();
  const result: { field: PDFField; info: FieldInfo }[] = [];
  form.getFields().forEach((field, index) => {
    const type = fieldType(field);
    const widgets: WidgetInfo[] = [];
    for (const w of field.acroField.getWidgets()) {
      const ref = doc.context.getObjectRef(w.dict);
      let page = ref ? pageOf.get(ref.toString()) : undefined;
      if (page === undefined) {
        const p = w.P();
        if (p) page = doc.getPages().findIndex((pg) => pg.ref === p);
      }
      if (page === undefined || page < 0) continue;
      const r = w.getRectangle();
      widgets.push({
        page,
        rect: [round2(r.x), round2(r.y), round2(r.width), round2(r.height)],
        onValue: type === "checkbox" || type === "radio" ? widgetOnValue(w) : undefined,
      });
    }
    const info: FieldInfo = {
      id: `f${index + 1}`,
      name: field.getName(),
      type,
      tooltip: decodeText(field.acroField.dict.lookup(PDFName.of("TU"))),
      readOnly: field.isReadOnly(),
      widgets,
    };
    if (field instanceof PDFTextField) {
      info.maxLength = field.getMaxLength();
      info.multiline = field.isMultiline();
    }
    if (field instanceof PDFRadioGroup) info.options = field.getOptions();
    if (field instanceof PDFDropdown || field instanceof PDFOptionList) info.options = field.getOptions();
    if (field instanceof PDFCheckBox) info.options = widgets.map((w) => w.onValue ?? "Yes");
    result.push({ field, info });
  });
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function inspectPdf(bytes: Uint8Array): Promise<FormStructure> {
  const doc = await loadPdf(bytes);
  const xfa = hasXfa(doc);
  const fields = getFields(doc)
    .map((f) => f.info)
    .filter((f) => f.widgets.length > 0 && f.type !== "button");
  const pages: PageInfo[] = doc.getPages().map((p, index) => {
    const { width, height } = p.getSize();
    return { index, width: round2(width), height: round2(height), rotation: p.getRotation().angle % 360 };
  });
  // A pure XFA form has no usable AcroForm fields and renders as a "please wait" page everywhere but Adobe.
  if (xfa && fields.length === 0) fail("xfa_only");
  return { pageCount: pages.length, pages, fields, hadXfa: xfa };
}

// Keeps browser-supplied text hints sane before they go anywhere.
export function sanitizeTextItems(items: unknown, pageCount: number): TextItem[] {
  if (!Array.isArray(items)) return [];
  const out: TextItem[] = [];
  for (const it of items.slice(0, 6000)) {
    if (!it || typeof it !== "object") continue;
    const t = it as Record<string, unknown>;
    const nums = ["page", "x", "y", "width", "height"].map((k) => Number(t[k]));
    if (nums.some((n) => !Number.isFinite(n))) continue;
    const text = String(t.text ?? "").slice(0, 300).trim();
    if (!text || nums[0] < 0 || nums[0] >= pageCount) continue;
    out.push({ page: Math.trunc(nums[0]), text, x: round2(nums[1]), y: round2(nums[2]), width: round2(nums[3]), height: round2(nums[4]) });
  }
  return out;
}
