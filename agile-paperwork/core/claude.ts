// Reads a blank form with Claude and returns which data key belongs in each field.
// What goes to the API: the original uploaded PDF, its field list and page layout,
// and the list of data key NAMES. Never any stored value from the profile,
// customer file, quote or agreement.
import Anthropic from "@anthropic-ai/sdk";
import type { FormStructure, TextItem } from "./inspect.ts";
import { ALL_MAPPING_KEYS, DATA_KEYS } from "./keys.ts";
import type { RawMapping } from "./plan.ts";
import { b64encode } from "./crypto.ts";

export const MODEL = "claude-opus-5-5";

const KEY_ENUM = ALL_MAPPING_KEYS;

export const MAPPING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["form_title", "form_kind", "fields", "blanks"],
  properties: {
    form_title: { type: "string" },
    form_kind: { type: "string", enum: ["w9", "ach", "landlord_contact", "lease_addendum", "combined", "other"] },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field_id", "label", "key", "match", "choices", "confidence", "is_property_question", "reason"],
        properties: {
          field_id: { type: "string" },
          label: { type: "string" },
          key: { type: "string", enum: KEY_ENUM },
          match: { type: ["string", "null"] },
          choices: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["when", "choose"],
              properties: { when: { type: "string" }, choose: { type: "string" } },
            },
          },
          confidence: { type: "number" },
          is_property_question: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
    blanks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "x", "y", "width", "height", "label", "input_type", "key", "match", "confidence", "is_property_question", "reason"],
        properties: {
          page: { type: "integer" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          label: { type: "string" },
          input_type: { type: "string", enum: ["text", "checkbox", "signature", "date"] },
          key: { type: "string", enum: KEY_ENUM },
          match: { type: ["string", "null"] },
          confidence: { type: "number" },
          is_property_question: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You map blank landlord paperwork to data keys for Agile RV Housing, a company that rents RVs as temporary housing to families whose homes were damaged. Insurance adjusters (Sedgwick, ALE Solutions, Alacrity, CRS and others) send the landlord forms such as W-9s, ACH or direct deposit forms, landlord contact forms and lease addendums. Agile RV Housing is the landlord. The insured family is the tenant.

You receive one PDF form plus a JSON description of its structure. You never receive the values that will go into the form. Your only job is to say which data key belongs in each blank. Software fills in the real values afterward.

How to answer:
1. For every entry in "fields" (real PDF form fields), return exactly one item in "fields" with the same field_id.
2. For blanks the landlord should fill that have NO form field (flat or scanned pages, or a fillable form with some blanks left out), return an item in "blanks" with its position. Never add a blank where a form field already exists.
3. Use only keys from the key list. Use "manual" when the right answer is not in the key list. Use "none" when the landlord should leave it empty: sections for the adjuster, the insurance company, the tenant or the insured, office-use boxes, and anything the tenant signs.
4. Questions about the property or the owner's finances must never be answered: mortgage, liens, foreclosure, bankruptcy, taxes owed, lawsuits, financial standing, and any yes or no question about the property. Set is_property_question to true and key to "manual".
5. Signatures: only the landlord, owner, payee or vendor signature gets "signature.image", and the date beside that signature gets "signature.date". Printed name next to the landlord signature is "profile.contact_name"; a title is "profile.contact_title".
6. Checkboxes: give the key and set "match" to the value that should check the box. Examples: an "LLC" box gets key "profile.entity_type" with match "LLC"; a "Checking" box gets key "profile.bank_account_type" with match "Checking". Radio groups and dropdowns: fill "choices" with pairs that turn a data value ("when") into one of the field's options ("choose"), using the exact option strings given. Otherwise use an empty list.
7. If a form splits the EIN into two boxes, use "profile.ein_prefix" and "profile.ein_suffix". The W-9 "Name" line is "profile.legal_name"; the W-9 "Business name/disregarded entity name" line is "profile.trade_name". On a W-9 the LLC tax classification letter box is "profile.tax_classification".
8. "Landlord" or "payee" name on contact and ACH forms usually means "profile.legal_name" unless the form asks for a contact person. A "lessor", "property owner" or "vendor" is the landlord.
9. Confidence is your honest probability, from 0 to 1, that the key is right. Use a value below 0.7 when you are guessing.
10. Positions for blanks use PDF points with the origin at the bottom left of the page, matching the page sizes given. "x" and "y" are the bottom left corner of the area where the answer should be written; "height" is roughly one line (10 to 14 points) for a single line. Use the text_items positions to line answers up with labels and underlines: an answer usually starts just right of its label, or sits on the line below it.
11. "label" is a short plain-English name for the blank as a person would describe it, for example "Tax ID number" or "Bank routing number". "reason" is one short sentence.`;

function keyCatalog(): string {
  return DATA_KEYS.map((k) => `- ${k.key}: ${k.label}${k.hint ? ` (${k.hint})` : ""}`).join("\n") +
    `\n- manual: Mike must answer this himself\n- none: leave blank on purpose`;
}

function compactText(items: TextItem[] | undefined, pageCount: number): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  if (!items) return out;
  const perPage = Math.max(150, Math.floor(4000 / Math.max(1, pageCount)));
  for (const it of items) {
    const list = (out[it.page] ??= []);
    if (list.length < perPage) list.push(`${it.text} @(${it.x},${it.y},w${it.width},h${it.height})`);
  }
  return out;
}

export function structurePayload(s: FormStructure): string {
  return JSON.stringify({
    pages: s.pages.map((p) => ({ page: p.index, width: p.width, height: p.height, rotation: p.rotation })),
    fields: s.fields.map((f) => ({
      field_id: f.id,
      name: f.name,
      type: f.type,
      tooltip: f.tooltip,
      options: f.options,
      max_length: f.maxLength,
      read_only: f.readOnly || undefined,
      widgets: f.widgets.map((w) => ({ page: w.page, rect: w.rect, on_value: w.onValue })),
    })),
    text_items: compactText(s.textItems, s.pageCount),
  });
}

export function buildRequest(structure: FormStructure, blankPdf: Uint8Array) {
  return {
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    output_config: {
      effort: "high" as const,
      format: { type: "json_schema" as const, schema: MAPPING_SCHEMA as unknown as Record<string, unknown> },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: b64encode(blankPdf) } },
          {
            type: "text" as const,
            text: `Key list:\n${keyCatalog()}\n\nForm structure (JSON):\n${structurePayload(structure)}\n\nMap every field and every landlord blank.`,
          },
        ],
      },
    ],
  };
}

export class MappingFailed extends Error {}

// Last line of defense: refuses to send anything that contains a stored sensitive value.
export function assertNoSensitive(payload: unknown, sensitiveValues: string[]): void {
  const text = JSON.stringify(payload);
  for (const v of sensitiveValues) {
    const trimmed = (v ?? "").trim();
    if (trimmed.length < 4) continue;
    const digits = trimmed.replace(/\D/g, "");
    if (text.includes(trimmed) || (digits.length >= 6 && text.includes(digits))) {
      throw new MappingFailed("Refused to send: the request contained a protected value");
    }
  }
}

export async function mapForm(
  client: Anthropic,
  structure: FormStructure,
  blankPdf: Uint8Array,
  sensitiveValues: string[],
): Promise<RawMapping> {
  const request = buildRequest(structure, blankPdf);
  assertNoSensitive(request, sensitiveValues);
  let message;
  try {
    message = await client.beta.messages.stream(request as never).finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new MappingFailed("The form reader is busy right now");
    if (e instanceof Anthropic.APIError) throw new MappingFailed(`The form reader returned an error (${e.status ?? "network"})`);
    throw new MappingFailed("Could not reach the form reader");
  }
  if (message.stop_reason === "refusal") throw new MappingFailed("The form reader declined to read this form");
  if (message.stop_reason === "max_tokens") throw new MappingFailed("The form is too long for the form reader");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const parsed = JSON.parse(text) as RawMapping;
    if (!Array.isArray(parsed.fields) || !Array.isArray(parsed.blanks)) throw new Error("bad shape");
    return parsed;
  } catch {
    throw new MappingFailed("The form reader's answer could not be read");
  }
}
