// Fills a form locally and returns a flattened PDF. Runs on our own server only.
import {
  PDFName,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
  type PDFField,
  type PDFDocument,
  PDFArray,
  PDFDict,
  PDFRef,
} from "npm:pdf-lib@1.17.1";
import { loadPdf, getFields, annotationPageIndex } from "./inspect.ts";
import type { FormPlan, Target } from "./plan.ts";

export interface SignatureInput {
  png: Uint8Array;
  date: string; // already formatted, for example 10/27/2026
}

export interface FillProblem {
  targetId: string;
  message: string;
}

export interface FillOptions {
  // Values by target id. Checkbox: "Yes" checks, anything else unchecks.
  values: Record<string, string>;
  // Only present after Mike clicked "Add my signature".
  signature?: SignatureInput | null;
  // Moved overlay boxes, by target id.
  positions?: Record<string, [number, number, number, number]>;
  flatten?: boolean;
}

export interface FillResult {
  bytes: Uint8Array;
  problems: FillProblem[];
}

const INK = rgb(0.05, 0.1, 0.35);
const MIN_SIZE = 6;
const MAX_SIZE = 11;

export function canEncode(font: PDFFont, text: string): string | null {
  for (const ch of text) {
    try {
      font.encodeText(ch);
    } catch {
      return ch;
    }
  }
  return null;
}

function fitSize(font: PDFFont, text: string, width: number, height: number): number {
  let size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, height * 0.72));
  while (size > MIN_SIZE && font.widthOfTextAtSize(text, size) > width - 2) size -= 0.25;
  return size;
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width - 2 || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function drawTextInBox(page: PDFPage, font: PDFFont, text: string, rect: [number, number, number, number]): boolean {
  const [x, y, w, h] = rect;
  const single = fitSize(font, text, w, h);
  const fitsOneLine = font.widthOfTextAtSize(text, single) <= w - 2 && !text.includes("\n");
  if (fitsOneLine || h < 22) {
    const size = single;
    const baseline = y + Math.max(1, (h - size * 0.72) / 2);
    page.drawText(text, { x: x + 1, y: baseline, size, font, color: INK });
    return fitsOneLine;
  }
  // Tall box: wrap into lines.
  let size = Math.min(MAX_SIZE, 10);
  let lines = wrap(font, text, size, w);
  while (size > MIN_SIZE && lines.length * size * 1.15 > h) {
    size -= 0.5;
    lines = wrap(font, text, size, w);
  }
  let cursor = y + h - size;
  for (const line of lines) {
    page.drawText(line, { x: x + 1, y: cursor, size, font, color: INK });
    cursor -= size * 1.15;
  }
  return lines.length * size * 1.15 <= h + 0.5;
}

export function drawCheck(page: PDFPage, font: PDFFont, rect: [number, number, number, number]) {
  const [x, y, w, h] = rect;
  const size = Math.max(6, Math.min(w, h) * 0.9);
  const tw = font.widthOfTextAtSize("X", size);
  page.drawText("X", { x: x + (w - tw) / 2, y: y + (h - size * 0.72) / 2, size, font, color: INK });
}

export function drawSignature(page: PDFPage, image: PDFImage, rect: [number, number, number, number]) {
  const [x, y, w, h] = rect;
  const pad = Math.min(2, h * 0.1);
  // Signatures sit on the line and may rise a little above a short box, like ink does.
  const maxH = Math.max(h, 14) * 1.5;
  const scale = Math.min((w - pad * 2) / image.width, maxH / image.height);
  page.drawImage(image, { x: x + pad, y: y + pad * 0.5, width: image.width * scale, height: image.height * scale });
}

export async function fillForm(blankPdf: Uint8Array, plan: FormPlan, opts: FillOptions): Promise<FillResult> {
  const doc = await loadPdf(blankPdf);
  const problems: FillProblem[] = [];
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const sigImage = opts.signature ? await doc.embedPng(opts.signature.png) : null;
  const form = doc.getForm();
  const fieldsById = new Map(getFields(doc).map((f) => [f.info.id, f.field]));

  const valueFor = (t: Target): string => {
    if (t.key === "signature.date") return opts.signature ? opts.signature.date : "";
    if (t.key === "signature.image") return "";
    return opts.values[t.id] ?? "";
  };

  for (const t of plan.targets) {
    const value = valueFor(t);
    if (t.origin === "field") {
      const field = fieldsById.get(t.id);
      if (!field) continue;
      try {
        if (t.key === "signature.image") {
          if (field instanceof PDFTextField) field.setText("");
          if (sigImage) for (const r of t.rects ?? [{ page: t.page, rect: t.rect }]) drawSignature(pages[r.page], sigImage, r.rect);
          continue;
        }
        if (field instanceof PDFTextField) {
          const bad = value ? canEncode(font, value) : null;
          if (bad) {
            problems.push({ targetId: t.id, message: `This form cannot print the character "${bad}". Please retype it.` });
            continue;
          }
          const max = field.getMaxLength();
          if (max !== undefined && value.length > max) {
            problems.push({ targetId: t.id, message: `Too long for this box. It fits ${max} characters.` });
            continue;
          }
          field.setText(value || undefined);
        } else if (field instanceof PDFCheckBox) {
          if (value === "Yes" || value === "On") field.check();
          else if (value && t.options?.includes(value) && value !== "Off") {
            field.acroField.setValue(PDFName.of(value));
          } else field.uncheck();
        } else if (field instanceof PDFRadioGroup) {
          if (value && field.getOptions().includes(value)) field.select(value);
          else if (!value) field.clear();
          else problems.push({ targetId: t.id, message: `"${value}" is not one of this form's choices.` });
        } else if (field instanceof PDFDropdown) {
          if (value) field.select(value, field.isEditable());
          else field.clear();
        } else if (field instanceof PDFOptionList) {
          if (value) field.select(value);
          else field.clear();
        }
      } catch {
        problems.push({ targetId: t.id, message: "This value could not be placed in the form field. Please check it." });
      }
    } else {
      const page = pages[t.page];
      if (!page) continue;
      const rect = opts.positions?.[t.id] ?? t.rect;
      if (t.key === "signature.image" || t.inputType === "signature") {
        if (sigImage && t.key === "signature.image") drawSignature(page, sigImage, rect);
        continue;
      }
      if (!value) continue;
      if (t.inputType === "checkbox") {
        if (value === "Yes") drawCheck(page, font, rect);
        continue;
      }
      const bad = canEncode(font, value);
      if (bad) {
        problems.push({ targetId: t.id, message: `This form cannot print the character "${bad}". Please retype it.` });
        continue;
      }
      if (!drawTextInBox(page, font, value, rect)) {
        problems.push({ targetId: t.id, message: "This text is longer than the space on the form. Shorten it or move the box." });
      }
    }
  }

  if (opts.flatten !== false) {
    const idOf = new Map<PDFField, string>();
    for (const [id, field] of fieldsById) idOf.set(field, id);
    const targetsById = new Map(plan.targets.map((t) => [t.id, t]));
    // Fields we cannot flatten the normal way are drawn by hand from their value.
    const drawByHand = (field: PDFField) => {
      const t = targetsById.get(idOf.get(field) ?? "");
      if (t && t.key !== "signature.image" && !(field instanceof PDFSignature)) {
        const value = valueFor(t);
        for (const w of field.acroField.getWidgets()) {
          const r = w.getRectangle();
          const rect: [number, number, number, number] = [r.x, r.y, r.width, r.height];
          const page = pages[pageIndexOfWidget(doc, w) ?? t.page];
          if (!page || !value) continue;
          if (t.inputType === "checkbox") {
            if (value === "Yes" || value === w.getOnValue()?.decodeText()) drawCheck(page, font, rect);
          } else if (t.inputType === "radio") {
            if (w.getOnValue()?.decodeText() === value) drawCheck(page, font, rect);
          } else if (!canEncode(font, value)) drawTextInBox(page, font, value, rect);
        }
      }
      detachField(doc, field);
    };
    for (const f of form.getFields()) {
      if (f instanceof PDFSignature || !hasAppearances(f)) drawByHand(f);
    }
    try {
      form.deleteXFA();
    } catch {
      // no XFA
    }
    try {
      form.updateFieldAppearances(font);
      form.flatten({ updateFieldAppearances: false });
    } catch {
      for (const f of form.getFields()) drawByHand(f);
    }
    removeWidgetAnnotations(doc);
  }

  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, problems };
}

function hasAppearances(field: PDFField): boolean {
  return field.acroField.getWidgets().every((w) => {
    try {
      return !!w.getNormalAppearance();
    } catch {
      return false;
    }
  });
}

function pageIndexOfWidget(doc: PDFDocument, widget: { dict: PDFDict }): number | undefined {
  const ref = doc.context.getObjectRef(widget.dict);
  return ref ? annotationPageIndex(doc).get(ref.toString()) : undefined;
}

// Removes a field and its widgets without needing an appearance stream.
export function detachField(doc: PDFDocument, field: PDFField) {
  const refs: PDFRef[] = [field.ref];
  for (const w of field.acroField.getWidgets()) {
    const ref = doc.context.getObjectRef(w.dict);
    if (ref) refs.push(ref);
  }
  for (const page of doc.getPages()) for (const ref of refs) page.node.removeAnnot(ref);
  try {
    doc.getForm().acroForm.removeField(field.acroField);
  } catch {
    // already gone
  }
}

// After flattening nothing should stay interactive. Drop any leftover widget annotations.
export function removeWidgetAnnotations(doc: PDFDocument) {
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const a = annots.lookup(i);
      // Missing objects are widgets the flattener already deleted; drop the dangling reference too.
      if (!(a instanceof PDFDict) || a.get(PDFName.of("Subtype"))?.toString() === "/Widget") annots.remove(i);
    }
  }
}
