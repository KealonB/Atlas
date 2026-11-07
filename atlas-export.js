/* ATLAS as-built package (pdf-lib).
   - PDF sheets are copied page-for-page from the source, so vectors, text and true paper size are kept (36x24 stays 36x24).
   - Marks are drawn as vectors on top, positioned with pdf.js' viewport (handles /Rotate and CropBox).
   - Then Legend, Drop Index (incl. spares), Cable/Circuit Schedule (incl. spares) and MAC Log pages.
   - Spare/void IDs are list-only: they are never drawn on sheets. */
"use strict";
async function ensurePdfLib() {
  if (window.PDFLib) return window.PDFLib;
  try { await loadScript("./vendor/pdf-lib.min.js"); } catch (e) { /* offline copy missing */ }
  if (!window.PDFLib) await loadScript("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js");
  return window.PDFLib;
}
// Standard PDF fonts are WinAnsi only: replace anything they can't encode.
const winAnsi = (s) => String(s ?? "").replace(/[\u2013\u2014\u2212]/g, "-").replace(/[\u00b7\u2022]/g, "-").replace(/\u2192/g, "->")
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, "...").replace(/[^\x20-\x7e\xa0-\xff]/g, "");
const hexRgb = (h, R) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); const n = m ? parseInt(m[1], 16) : 0x3fbfa0; return R.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
const KIND_LETTER = { data: "D", wap: "W", camera: "C", reader: "R", fiber: "F", coax: "X", idf: "TR", sleeve: "S", pullbox: "P" };

async function drawSheetVectors(page, f, R, fonts) {
  const { degrees, rgb } = R;
  const vp = (await (await getPdfDoc(f.assetKey)).getPage(f.pageIndex)).getViewport({ scale: 1 });
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const U = (vx, vy) => { const [x, y] = vp.convertToPdfPoint(vx, vy); return { x, y }; }; // view pt -> PDF user space
  const N = (p) => U(p.x * vp.width, p.y * vp.height);
  const rs = Math.min(2.5, 2350 / Math.max(vp.width, vp.height)), u = 1 / rs; // 1 on-screen raster px in points
  const rect = (vx, vy, w, h, o) => { const a = U(vx, vy), b = U(vx + w, vy + h); page.drawRectangle({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), ...o }); };
  const line = (a, b, o) => page.drawLine({ start: U(a[0], a[1]), end: U(b[0], b[1]), ...o });
  const text = (s, vx, vy, size, o = {}) => { // vx,vy = left/baseline in view space; text stays upright on rotated sheets
    const font = o.font || fonts.bold, str = winAnsi(s), w = font.widthOfTextAtSize(str, size);
    const x0 = o.center ? vx - w / 2 : vx;
    if (o.pill) rect(x0 - 3 * u, vy - size * 0.95, w + 6 * u, size * 1.3, { color: rgb(1, 1, 1), opacity: 0.88, borderColor: o.color, borderWidth: 0.6 * u });
    const p = U(x0, vy); page.drawText(str, { x: p.x, y: p.y, size, font, color: o.color || rgb(0, 0, 0), rotate: degrees(rot) });
  };
  for (const m of markFloor(f.id).filter(isVisible)) {
    const color = hexRgb(m.color || COLORS[m.layer] || COLORS.asbuilt, R), sz = clamp(Number(m.size) || 21, 10, 75), fs = Math.max(6, sz * 0.5) * u;
    const V = (p) => [p.x * vp.width, p.y * vp.height];
    if (["path", "measure"].includes(m.kind) && m.points?.length > 1) {
      for (let i = 1; i < m.points.length; i++) line(V(m.points[i - 1]), V(m.points[i]), { thickness: 2.2 * u, color, dashArray: m.dashed ? [10 * u, 7 * u] : undefined });
      const len = pathLen(m), a = V(m.points[0]), b = V(m.points.at(-1));
      const t = m.kind === "measure" ? (len == null ? "UNCALIBRATED" : `${len.toFixed(1)} ft`)
        : [m.label, len != null && `${len.toFixed(1)} ft`, (m.cableIds || []).length && `${m.cableIds.length} cable${m.cableIds.length > 1 ? "s" : ""}`].filter(Boolean).join(" - ");
      if (t) text(t, m.kind === "measure" ? (a[0] + b[0]) / 2 : a[0], (m.kind === "measure" ? (a[1] + b[1]) / 2 : a[1]) - 8 * u, fs, { color, pill: true, center: m.kind === "measure" });
    } else if (m.kind === "cloud" && m.points?.length === 2) {
      const [a, b] = m.points.map(V);
      rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), { borderColor: color, borderWidth: 2.2 * u, borderDashArray: [9 * u, 5 * u] });
      if (m.label) text(m.label, Math.min(a[0], b[0]), Math.min(a[1], b[1]) - 4 * u, fs, { color, pill: true });
    } else if (isPoint(m)) {
      const [cx, cy] = V(m), r = Math.max(9, sz * 0.65) * u, mac = m.mac && MAC_TYPES[m.mac.type];
      if (mac && m.mac.type === "move" && m.mac.before?.floorId === m.floorId && m.mac.before.x != null) {
        const mc = hexRgb(mac[1], R), [bx, by] = V(m.mac.before);
        rect(bx - r, by - r, 2 * r, 2 * r, { borderColor: mc, borderWidth: 1.4 * u, borderDashArray: [5 * u, 4 * u], opacity: 0, borderOpacity: 0.7 });
        line([bx, by], [cx, cy], { thickness: 1.4 * u, color: mc, dashArray: [6 * u, 4 * u], opacity: 0.8 });
        const ang = Math.atan2(cy - by, cx - bx), hx = cx - Math.cos(ang) * (r + 2 * u), hy = cy - Math.sin(ang) * (r + 2 * u);
        for (const s of [-0.45, 0.45]) line([hx, hy], [hx - 9 * u * Math.cos(ang + s), hy - 9 * u * Math.sin(ang + s)], { thickness: 1.6 * u, color: mc });
      }
      if (m.kind === "note") {
        const c = U(cx, cy); page.drawCircle({ x: c.x, y: c.y, size: r * 0.55, color });
      } else {
        rect(cx - r, cy - r, 2 * r, 2 * r, { color: rgb(1, 1, 1), borderColor: color, borderWidth: 1.6 * u });
        const k = KIND_LETTER[m.kind] || "?", ks = r * (k.length > 1 ? 0.8 : 1.1);
        text(k, cx, cy + ks * 0.36, ks, { color, center: true });
      }
      if (mac) {
        const mc = hexRgb(mac[1], R);
        if (m.mac.type === "remove") { line([cx - r * 1.2, cy - r * 1.2], [cx + r * 1.2, cy + r * 1.2], { thickness: 2 * u, color: mc }); line([cx + r * 1.2, cy - r * 1.2], [cx - r * 1.2, cy + r * 1.2], { thickness: 2 * u, color: mc }); }
        const b = U(cx + r * 1.05, cy - r * 1.05); page.drawCircle({ x: b.x, y: b.y, size: 6 * u, color: mc });
        text(mac[0], cx + r * 1.05, cy - r * 1.05 + 3 * u, 8 * u, { color: rgb(0.03, 0.07, 0.11), center: true });
      }
      if (m.label) text(m.label, cx, cy + r + fs + 3 * u, fs, { color, pill: true, center: true });
    }
  }
}

function tablePages(doc, R, fonts, title, cols, rows, opt = {}) {
  const { rgb } = R, W = 1224, H = 792, M = 36, rowH = 15, fs = 8; // 17x11 landscape (ANSI B)
  const total = cols.reduce((s, c) => s + c[1], 0), widths = cols.map((c) => (c[1] / total) * (W - 2 * M));
  const fit = (s, w, font) => { s = winAnsi(s); while (s && font.widthOfTextAtSize(s, fs) > w - 6) s = s.slice(0, -2) + "~"; return s; };
  let page, y, n = 0;
  const head = () => {
    page = doc.addPage([W, H]); n++; y = H - M;
    page.drawText(winAnsi(`${state.name}  |  ${title}`), { x: M, y: y - 4, size: 15, font: fonts.bold });
    page.drawText(winAnsi(`${opt.subtitle || ""}   Generated ${new Date().toLocaleString()}   Sheet ${n}`), { x: M, y: y - 20, size: 8, font: fonts.reg, color: rgb(0.35, 0.35, 0.4) });
    y -= 40;
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: rowH, color: rgb(0.12, 0.16, 0.22) });
    let x = M; cols.forEach((c, i) => { page.drawText(winAnsi(c[0]), { x: x + 3, y, size: fs, font: fonts.bold, color: rgb(1, 1, 1) }); x += widths[i]; });
    y -= rowH;
  };
  head();
  if (!rows.length) page.drawText("No entries.", { x: M + 3, y, size: fs, font: fonts.reg, color: rgb(0.4, 0.4, 0.4) });
  rows.forEach((r, ri) => {
    if (y < M + rowH) head();
    const spare = r.spare;
    if (ri % 2) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: rowH, color: rgb(0.95, 0.96, 0.97) });
    let x = M;
    r.cells.forEach((v, i) => { page.drawText(fit(v, widths[i], spare ? fonts.ital : fonts.reg), { x: x + 3, y, size: fs, font: spare ? fonts.ital : fonts.reg, color: spare ? rgb(0.55, 0.55, 0.58) : rgb(0.08, 0.08, 0.1) }); x += widths[i]; });
    y -= rowH;
  });
  if (opt.footer) page.drawText(winAnsi(opt.footer), { x: M, y: M - 14, size: 7, font: fonts.reg, color: rgb(0.4, 0.4, 0.45) });
}

function legendPage(doc, R, fonts, floors) {
  const { rgb } = R, page = doc.addPage([1224, 792]), M = 36;
  let y = 792 - M - 4;
  const t = (s, x, size = 10, font = fonts.reg, color = rgb(0.1, 0.1, 0.12)) => page.drawText(winAnsi(s), { x, y, size, font, color });
  t(`${state.name}  |  LEGEND`, M, 15, fonts.bold); y -= 30;
  t("DEVICE SYMBOLS", M, 10, fonts.bold); y -= 18;
  const kinds = [...new Set(state.marks.filter((m) => isPoint(m) && m.kind !== "note").map((m) => m.kind))];
  for (const k of kinds.length ? kinds : ["data"]) {
    page.drawRectangle({ x: M, y: y - 3, width: 13, height: 13, borderColor: hexRgb(COLORS.asbuilt, R), borderWidth: 1.2, color: rgb(1, 1, 1) });
    page.drawText(KIND_LETTER[k] || "?", { x: M + 3, y: y, size: 8, font: fonts.bold, color: hexRgb(COLORS.asbuilt, R) });
    t(KIND_NAME[k] || k, M + 22); y -= 18;
  }
  y -= 8; t("LAYERS", M, 10, fonts.bold); y -= 18;
  for (const [k, c] of Object.entries(COLORS)) { page.drawRectangle({ x: M, y: y - 1, width: 24, height: 6, color: hexRgb(c, R) }); t({ design: "Design", asbuilt: "Field As-Built", redline: "Redline / Revisions" }[k] || k, M + 32); y -= 16; }
  y -= 8; t("MAC MARKERS (MOVES / ADDS / CHANGES)", M, 10, fonts.bold); y -= 18;
  for (const [, v] of Object.entries(MAC_TYPES)) { page.drawCircle({ x: M + 6, y: y + 3, size: 6, color: hexRgb(v[1], R) }); page.drawText(v[0], { x: M + 3, y, size: 8, font: fonts.bold }); t(v[2] + (v[2] === "Move" ? "  (dashed box + arrow = old location)" : v[2] === "Remove" ? "  (X through symbol)" : ""), M + 22); y -= 16; }
  y -= 8; t("PATHWAYS", M, 10, fonts.bold); y -= 18;
  page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + 30, y: y + 3 }, thickness: 2, color: hexRgb(COLORS.asbuilt, R) }); t("Cable path (label: ID - length - cable count)", M + 40); y -= 16;
  page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + 30, y: y + 3 }, thickness: 2, color: hexRgb(COLORS.asbuilt, R), dashArray: [6, 4] }); t("Dashed path / conduit", M + 40); y -= 26;
  t("SHEETS AND SCALE", M, 10, fonts.bold); y -= 18;
  for (const f of floors) {
    const sc = f.ftPerPt ? `1 in = ${(f.ftPerPt * 72).toFixed(2)} ft` : f.ftPerPixel ? "calibrated (legacy)" : "not calibrated";
    t(`${shortName(f)}  ${f.name}  ${f.pdfW ? `${(f.pdfW / 72).toFixed(1)} x ${(f.pdfH / 72).toFixed(1)} in` : ""}   ${sc}`, M); y -= 15;
    if (y < M) break;
  }
  y -= 10; t("Spare IDs (deleted drops, 'No cable') are listed in the Drop Index and Cable Schedule only; they are not drawn on sheets.", M, 9, fonts.ital, rgb(0.35, 0.35, 0.4));
}

// Some PDFs (e.g. Apple Markup annotations) hold "0 0 R" references; pdf-lib turns them into references to objects
// that don't exist, which makes strict readers complain about a broken xref. Drop those keys before saving.
function fixDanglingRefs(doc, R) {
  const ctx = doc.context, seen = new Set();
  const walk = (o) => {
    if (o instanceof R.PDFDict) { for (const [k, v] of o.entries()) { if (v instanceof R.PDFRef && !ctx.lookup(v)) o.delete(k); else walk(v); } }
    else if (o instanceof R.PDFArray) o.asArray().forEach((v, i) => { if (v instanceof R.PDFRef && !ctx.lookup(v)) o.set(i, R.PDFNull); else walk(v); });
  };
  for (const [ref, o] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.tag)) { seen.add(ref.tag); walk(o); }
}

async function buildAsBuiltPackage(floors, opts = {}) {
  const R = await ensurePdfLib(), { PDFDocument, StandardFonts } = R;
  const out = await PDFDocument.create();
  out.setTitle(winAnsi(`${state.name} As-Built`)); out.setProducer("ATLAS"); out.setCreator("ATLAS");
  const fonts = { reg: await out.embedFont(StandardFonts.Helvetica), bold: await out.embedFont(StandardFonts.HelveticaBold), ital: await out.embedFont(StandardFonts.HelveticaOblique) };
  const src = new Map();
  if (opts.drawings !== false) for (const f of floors) {
    if (f.kind === "pdf") {
      if (!src.has(f.assetKey)) { const file = await dbGet("files", f.assetKey); if (!file) throw Error(`Source PDF for ${f.name} isn't on this device`); src.set(f.assetKey, await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })); }
      const [page] = await out.copyPages(src.get(f.assetKey), [f.pageIndex - 1]);
      out.addPage(page);
      await drawSheetVectors(page, f, R, fonts);
    } else { // generated demo sheets: embed the rendered raster at 17" wide
      const canvas = await renderExportCanvas(f), jpg = await out.embedJpg(base64Bytes(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]));
      const W = 1224, H = (W * canvas.height) / canvas.width, page = out.addPage([W, H]);
      page.drawImage(jpg, { x: 0, y: 0, width: W, height: H });
    }
  }
  if (opts.reports !== false) {
    const ids = new Set(floors.map((f) => f.id)), onSheets = (r) => !r.floorId || ids.has(r.floorId);
    legendPage(out, R, fonts, floors);
    const sheetOf = (m) => shortName(state.floors.find((f) => f.id === m.floorId));
    const devices = state.marks.filter((m) => DEVICE_KINDS.includes(m.kind) && ids.has(m.floorId));
    const byId = (a, b) => String(a.cells[0]).localeCompare(String(b.cells[0]), undefined, { numeric: true });
    tablePages(out, R, fonts, "DROP INDEX", [["ID", 3], ["Sheet", 2], ["Type", 3], ["TR/IDF", 1.6], ["Room", 1.6], ["Panel-Port", 1.6], ["Cables", 3.5], ["Status", 2.2], ["MAC", 2]],
      [...devices.map((m) => ({ cells: [m.label, sheetOf(m), KIND_NAME[m.kind] || m.kind, m.tr, m.room, [m.panel, m.port].filter((v) => v !== "" && v != null).join("-"),
        (m.cables || []).map((c) => c.id).join(", "), m.status, m.mac ? `${m.mac.no} ${MAC_TYPES[m.mac.type]?.[2] || ""}` : ""] })),
       ...(state.voidIds || []).filter(onSheets).map((v) => ({ spare: true, cells: [v.id, shortName(state.floors.find((f) => f.id === v.floorId)), "Spare / no cable", v.tr, "", [v.panel, v.port].filter((x) => x !== "" && x != null).join("-"), "-", "Spare / no cable", v.note || ""] }))].sort(byId),
      { subtitle: `${devices.length} devices, ${(state.voidIds || []).length} spare IDs`, footer: "Grey italic rows are spare IDs kept reserved after a drop was deleted (no cable). They are not drawn on the sheets." });
    const cab = cableRows().filter((c) => c.spare ? true : devices.some((m) => m.label === c.to));
    tablePages(out, R, fonts, "CABLE / CIRCUIT SCHEDULE", [["Cable / Circuit ID", 3], ["From (TR-Panel-Port)", 3], ["To (Drop)", 2.6], ["Media", 1.6], ["Length ft", 1.4], ["Test", 1.6], ["Status", 2.2], ["Sheet", 1.6]],
      cab.map((c) => ({ spare: c.spare, cells: [c.id, c.from, c.to, c.media, c.length, c.test, c.status, c.sheet] })).sort(byId),
      { subtitle: `${cab.filter((c) => !c.spare).length} cables`, footer: "Lengths come from calibrated pathways carrying the cable (plus slack) unless entered by hand." });
    const macs = macRows();
    tablePages(out, R, fonts, "MAC LOG (MOVES / ADDS / CHANGES)", [["MAC #", 1.5], ["Type", 1.3], ["Item", 2.4], ["Sheet", 1.4], ["Before", 3.2], ["After", 3.2], ["Status", 1.8], ["Ticket", 1.6], ["Date", 1.8]],
      macs.map((x) => ({ cells: [x.no, MAC_TYPES[x.type]?.[2] || x.type, x.label, x.sheet, x.before?.text, x.after?.text, x.status, x.ticket, x.at ? new Date(x.at).toLocaleDateString() : ""] })),
      { subtitle: `${macs.length} MAC entries` });
  }
  await out.flush(); // embed fonts/pages first: their refs only resolve after this
  fixDanglingRefs(out, R);
  return out.save();
}

exportAsBuiltPdf = async function () {
  if (!state.floors.length) return notify("No floors available to export.", true);
  openModal("Export as-built PDF package", `<p>Your original sheets are kept as vector PDF pages at their true paper size. Markups are drawn on top as vectors, followed by report pages.</p>
  <div class="field"><label>SHEETS</label><select id="pdfScope"><option value="all">All floors (${state.floors.length})</option><option value="one">Current floor only</option></select></div>
  <div class="field"><label>INCLUDE</label><select id="pdfParts"><option value="both">Marked-up drawings + Legend, Drop Index, Cable Schedule, MAC Log</option><option value="drawings">Marked-up drawings only</option><option value="reports">Report pages only</option></select></div>
  <div class="notice">Spare IDs appear in the Drop Index and Cable Schedule only.</div>`,
  [{ label: "Cancel", fn: closeModal }, { label: "Export PDF", primary: true, fn: async () => {
    const fl = $("#pdfScope").value === "one" ? [byFloor()].filter(Boolean) : state.floors, parts = $("#pdfParts").value;
    closeModal(); notify("Building as-built package…");
    try {
      const bytes = await buildAsBuiltPackage(fl, { drawings: parts !== "reports", reports: parts !== "drawings" });
      downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${safeName(state.name)}_AS_BUILT.pdf`);
      notify("As-built package exported");
    } catch (e) { console.error(e); notify("PDF export failed: " + e.message, true); }
  } }]);
};
