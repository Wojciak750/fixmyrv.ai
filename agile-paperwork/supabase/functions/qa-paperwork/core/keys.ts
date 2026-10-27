// The catalog of every value a landlord form can be filled from.
// Claude only ever sees these key names and labels, never the values behind them.

export type Source = "profile" | "customer" | "quote" | "agreement" | "signature" | "special";

export interface DataKey {
  key: string;
  label: string;
  source: Source;
  // Sensitive values are encrypted at rest, masked in the interface and never sent anywhere.
  sensitive?: boolean;
  // True when this key is stored on the business profile, so edits can be saved back to it.
  profileField?: string;
  hint?: string;
}

export const DATA_KEYS: DataKey[] = [
  // Business profile
  { key: "profile.legal_name", label: "Legal entity name", source: "profile", profileField: "legal_name", hint: "Name on the tax return, W-9 line 1" },
  { key: "profile.trade_name", label: "Trade name (DBA)", source: "profile", profileField: "trade_name", hint: "Business name or disregarded entity name, W-9 line 2" },
  { key: "profile.entity_type", label: "Entity type", source: "profile", profileField: "entity_type", hint: "One of: Individual or sole proprietor, C corporation, S corporation, Partnership, Trust or estate, LLC, Other" },
  { key: "profile.tax_classification", label: "LLC tax classification", source: "profile", profileField: "tax_classification", hint: "Single letter C, S or P for the W-9 LLC line" },
  { key: "profile.ein", label: "EIN (federal tax ID)", source: "profile", profileField: "ein", sensitive: true, hint: "Format 12-3456789" },
  { key: "profile.ein_prefix", label: "EIN first 2 digits", source: "profile", sensitive: true, hint: "For forms that split the EIN into two boxes" },
  { key: "profile.ein_suffix", label: "EIN last 7 digits", source: "profile", sensitive: true, hint: "For forms that split the EIN into two boxes" },
  { key: "profile.mailing_street", label: "Business street address", source: "profile", profileField: "mailing_street" },
  { key: "profile.mailing_city", label: "Business city", source: "profile", profileField: "mailing_city" },
  { key: "profile.mailing_state", label: "Business state", source: "profile", profileField: "mailing_state" },
  { key: "profile.mailing_zip", label: "Business ZIP code", source: "profile", profileField: "mailing_zip" },
  { key: "profile.mailing_city_state_zip", label: "Business city, state and ZIP", source: "profile" },
  { key: "profile.mailing_address_full", label: "Business mailing address, one line", source: "profile" },
  { key: "profile.phone", label: "Business phone", source: "profile", profileField: "phone" },
  { key: "profile.email", label: "Business email", source: "profile", profileField: "email" },
  { key: "profile.contact_name", label: "Contact person (signer name)", source: "profile", profileField: "contact_name" },
  { key: "profile.contact_title", label: "Contact person title", source: "profile", profileField: "contact_title" },
  { key: "profile.bank_name", label: "Bank name", source: "profile", profileField: "bank_name" },
  { key: "profile.bank_account_name", label: "Name on bank account", source: "profile", profileField: "bank_account_name" },
  { key: "profile.bank_account_type", label: "Bank account type", source: "profile", profileField: "bank_account_type", hint: "Checking or Savings" },
  { key: "profile.bank_address", label: "Bank address", source: "profile", profileField: "bank_address" },
  { key: "profile.routing_number", label: "Bank routing number", source: "profile", profileField: "routing_number", sensitive: true },
  { key: "profile.account_number", label: "Bank account number", source: "profile", profileField: "account_number", sensitive: true },
  { key: "profile.default_notice_to_vacate", label: "Default notice to vacate", source: "profile", profileField: "default_notice_to_vacate" },

  // Customer file
  { key: "customer.tenant_name", label: "Tenant (insured) name", source: "customer" },
  { key: "customer.tenant_phone", label: "Tenant phone", source: "customer" },
  { key: "customer.tenant_email", label: "Tenant email", source: "customer" },
  { key: "customer.property_address", label: "Rental property address (where the RV is placed)", source: "customer" },
  { key: "customer.loss_address", label: "Damaged home address (loss location)", source: "customer" },
  { key: "customer.insurance_carrier", label: "Insurance company", source: "customer" },
  { key: "customer.claim_number", label: "Claim number", source: "customer" },
  { key: "customer.policy_number", label: "Policy number", source: "customer" },
  { key: "customer.adjuster_company", label: "Adjuster company (Sedgwick, ALE Solutions, etc.)", source: "customer" },
  { key: "customer.adjuster_name", label: "Adjuster name", source: "customer" },
  { key: "customer.adjuster_phone", label: "Adjuster phone", source: "customer" },
  { key: "customer.adjuster_email", label: "Adjuster email", source: "customer" },
  { key: "customer.household_size", label: "Number of people in the household", source: "customer" },

  // Quote
  { key: "quote.monthly_rent", label: "Monthly rent", source: "quote" },
  { key: "quote.security_deposit", label: "Security deposit", source: "quote" },
  { key: "quote.delivery_fee", label: "Delivery and setup fee", source: "quote" },
  { key: "quote.pickup_fee", label: "Pickup fee", source: "quote" },
  { key: "quote.one_time_fees_total", label: "One-time fees total", source: "quote" },
  { key: "quote.total", label: "Quote total", source: "quote" },
  { key: "quote.start_date", label: "Rental start date", source: "quote" },
  { key: "quote.end_date", label: "Rental end date", source: "quote" },
  { key: "quote.rv_description", label: "RV description (year, make, model)", source: "quote" },

  // Rental agreement
  { key: "agreement.term", label: "Lease term", source: "agreement" },
  { key: "agreement.start_date", label: "Lease start date", source: "agreement" },
  { key: "agreement.end_date", label: "Lease end date", source: "agreement" },
  { key: "agreement.notice_to_vacate", label: "Notice to vacate", source: "agreement" },

  // Signature: only ever placed after Mike clicks "Add my signature".
  { key: "signature.image", label: "Signature", source: "signature" },
  { key: "signature.date", label: "Date signed", source: "signature" },
];

// Not data keys, but valid mapping targets.
export const MANUAL_KEY = "manual"; // Mike must answer this one himself
export const NONE_KEY = "none"; // Leave blank on purpose (office use only, adjuster section, etc.)

export const KEY_INDEX: Record<string, DataKey> = Object.fromEntries(DATA_KEYS.map((k) => [k.key, k]));
export const ALL_MAPPING_KEYS: string[] = [...DATA_KEYS.map((k) => k.key), MANUAL_KEY, NONE_KEY];

export const SENSITIVE_KEYS = new Set(DATA_KEYS.filter((k) => k.sensitive).map((k) => k.key));

export function isSignatureKey(key: string): boolean {
  return key === "signature.image" || key === "signature.date";
}
