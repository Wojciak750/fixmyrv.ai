// Builds test PDFs with FAKE content only. Run: npx tsx scripts/make-fixtures.ts
// The layout imitates a typical adjuster packet (landlord contact form, ACH form, W-9 style page)
// so the filler can be tested without any real form or real data.
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFArray, PDFDict, type PDFPage, type PDFFont } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = new URL("../test/fixtures/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function label(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 9) {
  page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
}

function line(page: PDFPage, x: number, y: number, w: number) {
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.6, color: rgb(0, 0, 0) });
}

function box(page: PDFPage, x: number, y: number, s = 9) {
  page.drawRectangle({ x, y, width: s, height: s, borderWidth: 0.7, borderColor: rgb(0, 0, 0) });
}

function addSignatureField(doc: PDFDocument, page: PDFPage, name: string, rect: [number, number, number, number]) {
  const form = doc.getForm();
  const widget = doc.context.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    T: PDFString.of(name),
    Rect: [rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]],
    F: 4,
    P: page.ref,
  }) as PDFDict;
  const ref = doc.context.register(widget);
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
  form.acroForm.addField(ref);
}

async function packet() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  // Page 1: landlord contact form, fillable
  const p1 = doc.addPage([612, 792]);
  label(p1, bold, "SAMPLE ADJUSTING CO. LANDLORD CONTACT FORM", 150, 740, 12);
  const rows: [string, string, number][] = [
    ["Landlord / Company Name", "LandlordName", 690],
    ["Contact Person", "ContactName", 665],
    ["Phone", "LLPhone", 640],
    ["Email", "LLEmail", 615],
    ["Mailing Address", "LLAddress", 590],
    ["Tax ID (EIN)", "TaxID", 565],
    ["Insured Name", "InsuredName", 530],
    ["Claim Number", "ClaimNo", 505],
    ["Rental Property Address", "RentalAddress", 480],
    ["Monthly Rent $", "MonthlyRent", 455],
    ["Security Deposit $", "Deposit", 430],
    ["Lease Start Date", "LeaseStart", 405],
    ["Notice to Vacate", "NoticeToVacate", 380],
  ];
  for (const [text, name, y] of rows) {
    label(p1, font, text, 50, y + 4);
    const f = form.createTextField(name);
    f.addToPage(p1, { x: 200, y, width: 340, height: 16, font, borderWidth: 0.5 });
  }
  label(p1, font, "Is there a mortgage on the property?", 50, 345);
  label(p1, font, "Yes", 330, 345);
  form.createCheckBox("MortgageYes").addToPage(p1, { x: 350, y: 343, width: 10, height: 10 });
  label(p1, font, "No", 380, 345);
  form.createCheckBox("MortgageNo").addToPage(p1, { x: 395, y: 343, width: 10, height: 10 });
  label(p1, font, "Is the property in foreclosure?", 50, 320);
  label(p1, font, "Yes", 330, 320);
  form.createCheckBox("ForeclosureYes").addToPage(p1, { x: 350, y: 318, width: 10, height: 10 });
  label(p1, font, "No", 380, 320);
  form.createCheckBox("ForeclosureNo").addToPage(p1, { x: 395, y: 318, width: 10, height: 10 });
  label(p1, font, "Landlord Signature", 50, 270);
  addSignatureField(doc, p1, "LandlordSignature", [200, 262, 200, 24]);
  label(p1, font, "Date", 420, 270);
  form.createTextField("SignDate").addToPage(p1, { x: 450, y: 266, width: 90, height: 16, font, borderWidth: 0.5 });
  label(p1, font, "FOR ADJUSTER USE ONLY", 50, 200);
  form.createTextField("AdjusterNotes").addToPage(p1, { x: 50, y: 150, width: 490, height: 40, font, borderWidth: 0.5 });

  // Page 2: ACH form, fillable
  const p2 = doc.addPage([612, 792]);
  label(p2, bold, "ACH / DIRECT DEPOSIT AUTHORIZATION", 180, 740, 12);
  const ach: [string, string, number][] = [
    ["Payee Name", "PayeeName", 690],
    ["Bank Name", "BankName", 665],
    ["Name on Account", "AcctName", 640],
    ["Bank Address", "BankAddress", 615],
    ["Routing Number", "Routing", 590],
    ["Account Number", "Account", 565],
  ];
  for (const [text, name, y] of ach) {
    label(p2, font, text, 50, y + 4);
    const f = form.createTextField(name);
    if (name === "Routing") f.setMaxLength(9);
    f.addToPage(p2, { x: 200, y, width: 340, height: 16, font, borderWidth: 0.5 });
  }
  label(p2, font, "Account Type:", 50, 540);
  const rg = form.createRadioGroup("AcctType");
  label(p2, font, "Checking", 220, 540);
  rg.addOptionToPage("Checking", p2, { x: 200, y: 538, width: 10, height: 10 });
  label(p2, font, "Savings", 300, 540);
  rg.addOptionToPage("Savings", p2, { x: 280, y: 538, width: 10, height: 10 });
  label(p2, font, "Authorized Signature", 50, 490);
  form.createTextField("ACHSignature").addToPage(p2, { x: 200, y: 482, width: 200, height: 20, font, borderWidth: 0.5 });
  label(p2, font, "Date", 420, 490);
  form.createTextField("ACHDate").addToPage(p2, { x: 450, y: 486, width: 90, height: 16, font, borderWidth: 0.5 });

  // Page 3: flat W-9 style page, no fields at all
  const p3 = doc.addPage([612, 792]);
  label(p3, bold, "Request for Taxpayer Identification Number (SAMPLE, NOT AN IRS FORM)", 80, 740, 11);
  label(p3, font, "1 Name (as shown on your income tax return)", 50, 705);
  line(p3, 50, 688, 500);
  label(p3, font, "2 Business name/disregarded entity name, if different from above", 50, 672);
  line(p3, 50, 655, 500);
  label(p3, font, "3 Check appropriate box for federal tax classification:", 50, 638);
  const boxes: [string, number][] = [
    ["Individual/sole proprietor", 60],
    ["C corporation", 200],
    ["S corporation", 290],
    ["Partnership", 380],
  ];
  for (const [t, x] of boxes) {
    box(p3, x, 620);
    label(p3, font, t, x + 13, 621, 8);
  }
  box(p3, 60, 602);
  label(p3, font, "Limited liability company. Enter the tax classification (C, S, P)", 73, 603, 8);
  line(p3, 340, 601, 30);
  label(p3, font, "5 Address (number, street, and apt. or suite no.)", 50, 580);
  line(p3, 50, 563, 500);
  label(p3, font, "6 City, state, and ZIP code", 50, 548);
  line(p3, 50, 531, 500);
  label(p3, font, "Employer identification number", 380, 505);
  line(p3, 380, 485, 160);
  label(p3, font, "Signature of U.S. person", 50, 430);
  line(p3, 160, 428, 220);
  label(p3, font, "Date", 400, 430);
  line(p3, 425, 428, 110);

  writeFileSync(OUT + "sample-packet.pdf", await doc.save());
}

async function flatScan() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([612, 792]);
  label(p, font, "LANDLORD INFORMATION (SAMPLE)", 200, 740, 12);
  label(p, font, "Landlord name:", 50, 700);
  line(p, 130, 698, 300);
  label(p, font, "Phone:", 50, 670);
  line(p, 90, 668, 200);
  label(p, font, "Claim #:", 50, 640);
  line(p, 95, 638, 200);
  label(p, font, "Monthly rent:", 50, 610);
  line(p, 120, 608, 120);
  label(p, font, "Are there any liens on the property?  Yes ___  No ___", 50, 580);
  writeFileSync(OUT + "flat-form.pdf", await doc.save());
}

async function manyPages() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 41; i++) doc.addPage([612, 792]);
  writeFileSync(OUT + "too-many-pages.pdf", await doc.save());
}

async function main() {
  await packet();
  await flatScan();
  await manyPages();
  writeFileSync(OUT + "not-a-pdf.pdf", "This is a text file pretending to be a PDF.\n");
  // Password-protected copies, made with pypdf (fake content only).
  const py = `
import sys
from pypdf import PdfReader, PdfWriter
src = sys.argv[1]
for name, user, owner in [("locked-user-password.pdf", "secret", "owner"), ("locked-owner-only.pdf", "", "owner")]:
    w = PdfWriter(clone_from=PdfReader(src))
    w.encrypt(user_password=user, owner_password=owner, algorithm="RC4-128")
    with open(sys.argv[2] + name, "wb") as f:
        w.write(f)
`;
  execFileSync("python3", ["-I", "-c", py, OUT + "flat-form.pdf", OUT]);
  console.log("fixtures written to", OUT);
}

main();
