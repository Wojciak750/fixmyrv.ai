import { zipSync } from "npm:fflate@0.8.3";

// Safe, unique file names for the "Download all" zip.
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "form";
}

export function zipPdfs(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const used = new Set<string>();
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    const base = safeFileName(f.name.replace(/\.pdf$/i, ""));
    let name = `${base}.pdf`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i}).pdf`;
    used.add(name.toLowerCase());
    entries[name] = f.bytes;
  }
  // PDFs are already compressed; store them as is.
  return zipSync(entries, { level: 0 });
}
