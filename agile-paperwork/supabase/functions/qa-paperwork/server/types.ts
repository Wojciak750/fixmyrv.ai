import type { FormStructure } from "../core/inspect.ts";
import type { FormPlan, FieldValue, Target } from "../core/plan.ts";

export interface ProfileRow {
  plain: Record<string, string>;
  ein_enc: string | null;
  routing_number_enc: string | null;
  account_number_enc: string | null;
  ein_last4: string | null;
  routing_number_last4: string | null;
  account_number_last4: string | null;
  signature_enc: string | null;
  signature_updated_at: string | null;
  updated_at: string | null;
}

export type PaperworkStatus = "reading" | "ready" | "manual" | "unreadable";

export interface PaperworkRow {
  id: string;
  customer_id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  page_count: number | null;
  status: PaperworkStatus;
  status_message: string | null;
  title: string | null;
  structure: FormStructure | null;
  plan: FormPlan | null;
  created_at: string;
  updated_at: string;
}

export interface DraftState {
  values: Record<string, FieldValue>;
  // Encrypted JSON of edited values for sensitive fields. Never stored in plain text.
  sensitive_enc: string | null;
  positions: Record<string, [number, number, number, number]>;
  extra_targets: Target[];
  preview_hash: string | null;
  signed_at: string | null;
  signed_date: string | null;
  signed_hash: string | null;
}

export interface DraftRow extends DraftState {
  paperwork_id: string;
  updated_at: string;
}

export interface VersionRow extends DraftState {
  id: string;
  paperwork_id: string;
  version_no: number;
  created_at: string;
}

// Customer, quote and agreement values, already flattened to data keys.
// Every value is a string exactly as stored, never parsed into a number or date.
export type SourceValues = Record<string, string>;

export interface Store {
  getProfile(): Promise<ProfileRow | null>;
  saveProfile(patch: Partial<Omit<ProfileRow, "plain">> & { plain?: Record<string, string> }): Promise<void>;
  customerExists(customerId: string): Promise<boolean>;
  customerName(customerId: string): Promise<string>;
  loadSources(customerId: string): Promise<SourceValues>;
  listPaperwork(customerId: string): Promise<PaperworkRow[]>;
  getPaperwork(id: string): Promise<PaperworkRow | null>;
  insertPaperwork(row: Omit<PaperworkRow, "created_at" | "updated_at">): Promise<PaperworkRow>;
  updatePaperwork(id: string, patch: Partial<PaperworkRow>): Promise<void>;
  deletePaperwork(id: string): Promise<void>;
  getDraft(paperworkId: string): Promise<DraftRow | null>;
  saveDraft(paperworkId: string, draft: DraftState): Promise<DraftRow>;
  insertVersion(paperworkId: string, draft: DraftState): Promise<VersionRow>;
  listVersions(paperworkId: string): Promise<VersionRow[]>;
  getVersion(id: string): Promise<VersionRow | null>;
}

export interface FileStore {
  put(path: string, bytes: Uint8Array): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  remove(path: string): Promise<void>;
}

export interface Admin {
  userId: string;
}
