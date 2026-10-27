// Business profile: field definitions, validation, masking and derived values.
// No real values live in code. Mike enters everything on the Business profile page.

export const SENSITIVE_PROFILE_FIELDS = ["ein", "routing_number", "account_number"] as const;
export type SensitiveProfileField = (typeof SENSITIVE_PROFILE_FIELDS)[number];

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

export const ENTITY_TYPES = [
  "Individual or sole proprietor",
  "C corporation",
  "S corporation",
  "Partnership",
  "Trust or estate",
  "LLC",
  "Other",
];

export const LLC_TAX_CLASSES = ["C", "S", "P", "Not applicable"];
export const ACCOUNT_TYPES = ["Checking", "Savings"];

export const PROFILE_FIELDS: ProfileFieldDef[] = [
  { name: "legal_name", label: "Legal entity name", group: "business", kind: "text", help: "Exactly as it appears on your IRS paperwork." },
  { name: "trade_name", label: "Trade name (DBA)", group: "business", kind: "text", help: "The name customers know you by." },
  { name: "entity_type", label: "Entity type", group: "business", kind: "select", options: ENTITY_TYPES },
  { name: "tax_classification", label: "LLC tax classification", group: "business", kind: "select", options: LLC_TAX_CLASSES, help: "The letter that goes on the W-9 LLC line. Ask your accountant if unsure." },
  { name: "ein", label: "EIN (federal tax ID)", group: "business", kind: "text", sensitive: true, placeholder: "12-3456789" },
  { name: "mailing_street", label: "Mailing street address", group: "business", kind: "text" },
  { name: "mailing_city", label: "City", group: "business", kind: "text" },
  { name: "mailing_state", label: "State", group: "business", kind: "text", placeholder: "FL" },
  { name: "mailing_zip", label: "ZIP code", group: "business", kind: "text" },
  { name: "phone", label: "Business phone", group: "contact", kind: "tel" },
  { name: "email", label: "Business email", group: "contact", kind: "email" },
  { name: "contact_name", label: "Contact person", group: "contact", kind: "text", help: "The name printed next to your signature." },
  { name: "contact_title", label: "Contact person title", group: "contact", kind: "text", placeholder: "Owner" },
  { name: "bank_name", label: "Bank name", group: "bank", kind: "text" },
  { name: "bank_account_name", label: "Name on the account", group: "bank", kind: "text" },
  { name: "bank_account_type", label: "Account type", group: "bank", kind: "select", options: ACCOUNT_TYPES },
  { name: "bank_address", label: "Bank address", group: "bank", kind: "text" },
  { name: "routing_number", label: "Routing number", group: "bank", kind: "text", sensitive: true },
  { name: "account_number", label: "Account number", group: "bank", kind: "text", sensitive: true },
  { name: "default_notice_to_vacate", label: "Default notice to vacate", group: "lease", kind: "text", placeholder: "Example: 7 days written notice" },
];

export const PLAIN_PROFILE_FIELDS = PROFILE_FIELDS.filter((f) => !f.sensitive).map((f) => f.name);

export function isSensitiveField(name: string): name is SensitiveProfileField {
  return (SENSITIVE_PROFILE_FIELDS as readonly string[]).includes(name);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function last4(value: string): string {
  const d = digitsOnly(value);
  return d.slice(-4);
}

// Masked display: only the last 4 digits are ever shown without a reveal click.
export function maskLast4(l4: string | null | undefined): string {
  if (!l4) return "";
  return "•••• " + l4;
}

// ABA routing number checksum.
export function isValidRouting(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 9) return false;
  const n = d.split("").map(Number);
  const sum = 3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}

export function normalizeEin(value: string): string {
  const d = digitsOnly(value);
  return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : value.trim();
}

// Returns a plain-English problem, or null when the value is fine. Empty is always allowed.
export function validateProfileValue(name: string, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (value.length > 500) return "That is too long. Keep it under 500 characters.";
  switch (name) {
    case "ein":
      return digitsOnly(value).length === 9 && /^[\d\s-]+$/.test(value)
        ? null
        : "An EIN has 9 digits, like 12-3456789.";
    case "routing_number":
      if (!/^[\d\s-]+$/.test(value) || digitsOnly(value).length !== 9) return "A routing number has exactly 9 digits.";
      return isValidRouting(value) ? null : "That routing number does not pass the bank check. Please compare it with a check or your bank's website.";
    case "account_number": {
      const d = digitsOnly(value);
      return /^[\d\s-]+$/.test(value) && d.length >= 4 && d.length <= 17 ? null : "An account number has 4 to 17 digits.";
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "That does not look like an email address.";
    case "phone":
      return digitsOnly(value).length >= 10 ? null : "Enter a 10 digit phone number.";
    case "entity_type":
      return ENTITY_TYPES.includes(value) ? null : "Pick one of the listed entity types.";
    case "tax_classification":
      return LLC_TAX_CLASSES.includes(value) ? null : "Pick C, S, P or Not applicable.";
    case "bank_account_type":
      return ACCOUNT_TYPES.includes(value) ? null : "Pick Checking or Savings.";
    default:
      return null;
  }
}

export type PlainProfile = Partial<Record<string, string>>;

// The full set of profile values the filler can use, keyed by data key.
// Called only inside the server after decrypting; the result never leaves the server
// except inside the PDF Mike asked for, or one field he clicked to reveal.
export function profileValues(plain: PlainProfile, sensitive: Partial<Record<SensitiveProfileField, string>>): Record<string, string> {
  const v = (k: string) => (plain[k] ?? "").trim();
  const out: Record<string, string> = {};
  for (const name of PLAIN_PROFILE_FIELDS) out[`profile.${name}`] = v(name);
  const taxClass = v("tax_classification");
  out["profile.tax_classification"] = taxClass === "Not applicable" ? "" : taxClass;
  const ein = (sensitive.ein ?? "").trim();
  out["profile.ein"] = ein ? normalizeEin(ein) : "";
  const einDigits = digitsOnly(ein);
  out["profile.ein_prefix"] = einDigits.length === 9 ? einDigits.slice(0, 2) : "";
  out["profile.ein_suffix"] = einDigits.length === 9 ? einDigits.slice(2) : "";
  out["profile.routing_number"] = (sensitive.routing_number ?? "").trim();
  out["profile.account_number"] = (sensitive.account_number ?? "").trim();
  const cityStateZip = [v("mailing_city"), [v("mailing_state"), v("mailing_zip")].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  out["profile.mailing_city_state_zip"] = cityStateZip;
  out["profile.mailing_address_full"] = [v("mailing_street"), cityStateZip].filter(Boolean).join(", ");
  return out;
}
