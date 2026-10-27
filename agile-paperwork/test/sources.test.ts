import { describe, it, expect } from "vitest";
import { buildSources, pickDocument, type DocumentRow } from "../server/sources.ts";

const quote = (over: Partial<DocumentRow> = {}): DocumentRow => ({
  id: "q1",
  kind: "quote",
  stage: "approved",
  archived: false,
  updated_at: "2026-10-20T00:00:00Z",
  content: {
    fields: { start_date: "2026-11-04", end_date: "2026-12-03", units: 2 },
    charges: [
      { key: "recurring", lines: [{ id: "rent", per_unit: true, qty: 2, unit_price: 3850 }] },
      { key: "one_time", lines: [
        { id: "delivery", per_unit: true, qty: 2, unit_price: 3200 },
        { id: "deposit", per_unit: true, qty: 2, unit_price: 1000.1 },
        { id: "custom_1", per_unit: false, qty: 1, unit_price: 0.07 },
      ] },
    ],
  },
  ...over,
});

describe("values from the customer file, quote and agreement", () => {
  it("fills customer fields and joins addresses the way the dashboard does", () => {
    const s = buildSources({ first_name: "Jordan", last_name: "Testcase", placement_street: "200 Sample Rd", placement_city: "Testville", placement_state: "FL", placement_zip: "00000", claim_number: " CLM-1 ", adjuster_name: "Sam Adjuster", household_adults: 2, household_children: 1 }, []);
    expect(s["customer.tenant_name"]).toBe("Jordan Testcase");
    expect(s["customer.property_address"]).toBe("200 Sample Rd, Testville, FL 00000");
    expect(s["customer.claim_number"]).toBe("CLM-1");
    expect(s["customer.household_size"]).toBe("3");
    expect(s["customer.policy_number"]).toBeUndefined();
  });

  it("writes money exactly as the quote shows it ($9,430 or $9,430.50), in whole cents, with no rounding", () => {
    const s = buildSources({}, [quote()]);
    expect(s["quote.monthly_rent"]).toBe("$7,700");
    expect(s["quote.security_deposit"]).toBe("$2,000.20");
    expect(s["quote.delivery_fee"]).toBe("$6,400");
    expect(s["quote.one_time_fees_total"]).toBe("$6,400.07");
    expect(s["quote.total"]).toBe("$16,100.27");
  });

  it("copies dates exactly as stored", () => {
    const s = buildSources({}, [quote(), { id: "a1", kind: "agreement", stage: "signed", content: { fields: { start_date: "2026-11-04", end_date: "2026-12-03" } } }]);
    expect(s["quote.start_date"]).toBe("2026-11-04");
    expect(s["agreement.start_date"]).toBe("2026-11-04");
    expect(s["agreement.term"]).toBe("2026-11-04 to 2026-12-03");
  });

  it("uses the live quote: skips archived and lost ones, prefers the furthest along", () => {
    const docs = [quote({ id: "old", stage: "quoted", updated_at: "2026-10-01T00:00:00Z" }), quote({ id: "lost", stage: "lost", updated_at: "2026-10-25T00:00:00Z" }), quote({ id: "arch", archived: true, stage: "converted" }), quote({ id: "good" })];
    expect(pickDocument(docs, "quote")!.id).toBe("good");
  });
});
