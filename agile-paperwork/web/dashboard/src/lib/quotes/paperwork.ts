// Adjuster paperwork: calls to the qa-paperwork edge function, react-query hooks and PDF helpers.
// Every call rides on Mike's existing dashboard sign-in (supabase.functions.invoke sends his session).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FN = "qa-paperwork";

export type FieldStatus = "auto" | "edited" | "blank" | "signature" | "none";
export type TargetState = "auto" | "suggest" | "manual" | "property" | "signature" | "none";
export type InputType = "text" | "checkbox" | "radio" | "dropdown" | "signature" | "date";
export type Rect = [number, number, number, number];

export interface ProfileFieldDef {
  name: string;
  label: string;
  group: "business" | "contact" | "bank" | "lease";
  kind: "text" | "email" | "tel" | "select" | "textarea";
  options?: string[];
  sensitive?: boolean;
  placeholder?: string;
  help?: string;
}

export interface ProfileView {
  fields: ProfileFieldDef[];
  values: Record<string, string>;
  masked: Record<string, string>;
  hasSignature: boolean;
  signatureUpdatedAt: string | null;
  updatedAt: string | null;
}

export type PaperStatus = "reading" | "ready" | "manual" | "unreadable";

export interface PaperworkItem {
  id: string;
  customerId: string;
  fileName: string;
  title: string;
  status: PaperStatus;
  statusMessage: string | null;
  pageCount: number | null;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  versions?: number;
  lastDownloadAt?: string | null;
  signed?: boolean;
}

export interface ReviewTarget {
  id: string;
  origin: "field" | "overlay";
  page: number;
  rect: Rect;
  rects?: { page: number; rect: Rect; onValue?: string }[];
  label: string;
  inputType: InputType;
  options?: string[];
  maxLength?: number;
  multiline?: boolean;
  key: string;
  state: TargetState;
  reason: string;
  sensitive: boolean;
  value: string;
  masked: string;
  hasValue: boolean;
  edited: boolean;
  status: FieldStatus;
  keyLabel: string | null;
  profileField: string | null;
}

export interface PageSize {
  index: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ReviewView {
  paperwork: PaperworkItem;
  title: string;
  pages: PageSize[];
  targets: ReviewTarget[];
  positions: Record<string, Rect>;
  signed: boolean;
  signedDate: string | null;
  hasSignature: boolean;
}

export interface PreviewResult {
  pdf: string;
  previewHash: string;
  problems: { targetId: string; message: string }[];
  signed: boolean;
  signatureRemoved: boolean;
  review: ReviewView;
}

export class PaperworkError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string> = {}, public status = 0) {
    super(message);
  }
}

const OFFLINE = "Could not reach the server. Check your connection and try again. Nothing was lost.";

async function toError(error: unknown): Promise<PaperworkError> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      return new PaperworkError(body?.error ?? "Something went wrong. Please try again.", body?.errors ?? {}, ctx.status);
    } catch {
      return new PaperworkError("Something went wrong. Please try again.", {}, ctx.status);
    }
  }
  return new PaperworkError(OFFLINE);
}

export async function paperworkCall<T>(body: Record<string, unknown> | FormData): Promise<T> {
  let res: { data: unknown; error: unknown };
  try {
    res = await supabase.functions.invoke(FN, { body });
  } catch (e) {
    throw await toError(e);
  }
  if (res.error) throw await toError(res.error);
  return res.data as T;
}

export const PAPERWORK_KEY = ["quotes", "paperwork"] as const;

export function useBusinessProfile() {
  return useQuery({
    queryKey: [...PAPERWORK_KEY, "profile"],
    queryFn: () => paperworkCall<ProfileView>({ action: "profile.get" }),
    staleTime: 30_000,
  });
}

export function usePaperworkList(customerId: string | undefined) {
  return useQuery({
    queryKey: [...PAPERWORK_KEY, "list", customerId],
    enabled: !!customerId,
    queryFn: () => paperworkCall<{ items: PaperworkItem[] }>({ action: "paperwork.list", customerId }).then((r) => r.items),
    // Keep checking while a form is being read.
    refetchInterval: (q) => ((q.state.data as PaperworkItem[] | undefined)?.some((i) => i.status === "reading") ? 3000 : false),
  });
}

export function useInvalidatePaperwork() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: PAPERWORK_KEY });
}

// ----- files -----

export function saveBase64File(base64: string, type: string, fileName: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function todayForForms(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

// ----- pdf.js, loaded only on the screens that need it -----

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
    return lib;
  });
  return pdfjsPromise;
}

export interface TextItem {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Reads the printed words and where they sit, so blanks on flat forms can be lined up with their labels.
// This runs on Mike's own device. Failure is fine: the server reports locked or damaged files itself.
export async function extractTextItems(bytes: Uint8Array): Promise<TextItem[]> {
  try {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const items: TextItem[] = [];
    const pages = Math.min(doc.numPages, 40);
    for (let p = 1; p <= pages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      for (const it of tc.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const [, , , d, e, f] = it.transform as number[];
        items.push({ page: p - 1, text: it.str, x: Math.round(e * 100) / 100, y: Math.round(f * 100) / 100, width: Math.round(it.width * 100) / 100, height: Math.round(Math.abs(d || it.height) * 100) / 100 });
      }
    }
    await doc.destroy();
    return items.slice(0, 6000);
  } catch {
    return [];
  }
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function uploadPaperwork(customerId: string, file: File): Promise<PaperworkItem> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PaperworkError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB. Ask the adjuster for a smaller copy, or upload only the pages with the landlord forms.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const textItems = await extractTextItems(bytes);
  const fd = new FormData();
  fd.set("customerId", customerId);
  fd.set("file", file, file.name);
  fd.set("textItems", JSON.stringify(textItems));
  const r = await paperworkCall<{ paperwork: PaperworkItem }>(fd);
  return r.paperwork;
}

export const STATUS_TEXT: Record<FieldStatus, string> = {
  auto: "Filled",
  edited: "Changed by you",
  blank: "Needs you",
  signature: "Signature",
  none: "Left blank",
};
