// Turns the dashboard's own rows (qa_customers, qa_documents) into form values.
// Money is written exactly the way the quote itself shows it ($3,850 or $3,850.50), dates exactly as stored
// (2026-11-04). Nothing is rounded: line amounts are computed in whole cents.
import type { SourceValues } from "./types.ts";

export interface CustomerRow {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  placement_street?: string | null;
  placement_city?: string | null;
  placement_state?: string | null;
  placement_zip?: string | null;
  mailing_same_as_placement?: boolean | null;
  mailing_street?: string | null;
  mailing_city?: string | null;
  mailing_state?: string | null;
  mailing_zip?: string | null;
  household_adults?: number | null;
  household_children?: number | null;
  insurance_carrier?: string | null;
  policy_number?: string | null;
  claim_number?: string | null;
  adjuster_name?: string | null;
  adjuster_phone?: string | null;
  adjuster_email?: string | null;
  agency_name?: string | null;
}

interface Line {
  id: string;
  description?: string;
  per_unit?: boolean;
  qty?: number;
  unit_price?: number;
}

export interface DocumentRow {
  id: string;
  kind: "quote" | "agreement" | "extension";
  stage: string;
  archived?: boolean | null;
  term_start?: string | null;
  term_end?: string | null;
  minimum_term_days?: number | null;
  units?: number | null;
  updated_at?: string | null;
  content?: {
    fields?: { start_date?: string; end_date?: string; units?: number; minimum_term_days?: number | null };
    charges?: { key: string; label?: string; lines: Line[] }[];
  } | null;
}

// The same rule as formatMoney in src/lib/quotes/format.ts, which prints every amount on a quote:
// "$9,430" when whole, "$9,430.50" otherwise.
const moneyWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatQuoteMoney(cents: number): string {
  return cents % 100 === 0 ? moneyWhole.format(cents / 100) : moneyCents.format(cents / 100);
}

function cents(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100); // unit prices are stored to the cent; this only removes float noise
}

function lineCents(line: Line, units: number): number | null {
  const unit = cents(line.unit_price);
  if (unit === null) return null;
  const qty = line.per_unit ? units : Number(line.qty ?? 1);
  return Number.isFinite(qty) ? unit * qty : null;
}

const t = (s: string | null | undefined) => (s ?? "").trim();

export function formatAddress(street?: string | null, city?: string | null, state?: string | null, zip?: string | null): string {
  const tail = [state, zip].map(t).filter(Boolean).join(" ");
  return [street, city, tail].map(t).filter(Boolean).join(", ");
}

export function renterName(c: CustomerRow): string {
  const full = [c.first_name, c.last_name].map(t).filter(Boolean).join(" ");
  return full || t(c.display_name);
}

const QUOTE_STAGE_RANK: Record<string, number> = { converted: 5, approved: 4, waiting_on_approval: 3, quoted: 2, draft_ready: 1, lost: 0 };
const AGREEMENT_STAGE_RANK: Record<string, number> = { signed: 4, viewed: 3, sent: 2, draft: 1 };

// The quote and agreement a form should be filled from: not archived, furthest along, then newest.
export function pickDocument(docs: DocumentRow[], kind: "quote" | "agreement"): DocumentRow | null {
  const rank = kind === "quote" ? QUOTE_STAGE_RANK : AGREEMENT_STAGE_RANK;
  const list = docs.filter((d) => d.kind === kind && !d.archived && (kind !== "quote" || d.stage !== "lost"));
  list.sort((a, b) => (rank[b.stage] ?? 0) - (rank[a.stage] ?? 0) || String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  return list[0] ?? null;
}

function docValues(prefix: "quote" | "agreement", d: DocumentRow | null, out: SourceValues) {
  if (!d) return;
  const f = d.content?.fields ?? {};
  const start = t(f.start_date) || t(d.term_start);
  const end = t(f.end_date) || t(d.term_end);
  out[`${prefix}.start_date`] = start;
  out[`${prefix}.end_date`] = end;
  if (prefix === "agreement") {
    out["agreement.term"] = start && end ? `${start} to ${end}` : "";
    const min = f.minimum_term_days ?? d.minimum_term_days;
    if (min) out["agreement.minimum_term"] = `${min} days`;
  }
  if (prefix !== "quote") return;
  const units = Math.max(1, Number(f.units ?? d.units ?? 1) || 1);
  const groups = d.content?.charges ?? [];
  const all = groups.flatMap((g) => g.lines.map((l) => ({ g: g.key, l })));
  const byId = (id: string) => all.find((x) => x.l.id === id);
  const put = (key: string, c: number | null) => {
    if (c !== null) out[key] = formatQuoteMoney(c);
  };
  const rent = byId("rent") ?? all.find((x) => x.g === "recurring");
  if (rent) put("quote.monthly_rent", lineCents(rent.l, units));
  const deposit = byId("deposit");
  if (deposit) put("quote.security_deposit", lineCents(deposit.l, units));
  const delivery = byId("delivery");
  if (delivery) put("quote.delivery_fee", lineCents(delivery.l, units));
  const oneTime = all.filter((x) => x.g === "one_time" && x.l.id !== "deposit");
  if (oneTime.length) put("quote.one_time_fees_total", oneTime.reduce((s, x) => s + (lineCents(x.l, units) ?? 0), 0));
  const total = all.reduce<number | null>((s, x) => (s === null ? null : (() => { const c = lineCents(x.l, units); return c === null ? null : s + c; })()), 0);
  put("quote.total", total);
}

export function buildSources(customer: CustomerRow, docs: DocumentRow[]): SourceValues {
  const placement = formatAddress(customer.placement_street, customer.placement_city, customer.placement_state, customer.placement_zip);
  const mailing = customer.mailing_same_as_placement === false
    ? formatAddress(customer.mailing_street, customer.mailing_city, customer.mailing_state, customer.mailing_zip)
    : placement;
  const adults = customer.household_adults ?? null;
  const kids = customer.household_children ?? null;
  const out: SourceValues = {
    "customer.tenant_name": renterName(customer),
    "customer.tenant_phone": t(customer.phone),
    "customer.tenant_email": t(customer.email),
    "customer.property_address": placement,
    "customer.loss_address": mailing,
    "customer.insurance_carrier": t(customer.insurance_carrier),
    "customer.claim_number": t(customer.claim_number),
    "customer.policy_number": t(customer.policy_number),
    "customer.adjuster_company": t(customer.agency_name),
    "customer.adjuster_name": t(customer.adjuster_name),
    "customer.adjuster_phone": t(customer.adjuster_phone),
    "customer.adjuster_email": t(customer.adjuster_email),
    "customer.household_size": adults === null && kids === null ? "" : String((adults ?? 0) + (kids ?? 0)),
  };
  docValues("quote", pickDocument(docs, "quote"), out);
  docValues("agreement", pickDocument(docs, "agreement"), out);
  for (const k of Object.keys(out)) if (out[k] === "") delete out[k];
  return out;
}
