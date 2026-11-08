/* ATLAS Pro extensions (local build) — loaded after app.js + atlas-ids.js.
   Overrides a few app.js functions by name (classic scripts share globals) and then calls boot(). */
"use strict";
const DEVICE_KINDS = ["data", "wap", "camera", "reader", "fiber", "coax", "idf", "sleeve", "pullbox"];
const CABLE_KINDS = ["data", "wap", "camera", "reader", "fiber", "coax"];
const MEDIA = ["Cat6", "Cat6A", "Cat5e", "OM3", "OM4", "OS2", "RG6", "Other"];
const MAC_TYPES = { add: ["A", "#62eace", "Add"], move: ["M", "#ffca7a", "Move"], change: ["C", "#a896ff", "Change"], remove: ["R", "#ff788b", "Remove"] };
const MAC_STATUS = ["open", "in-progress", "complete", "verified"];
let spaceDown = false;
const snapOnce = new WeakSet();
const once = (el) => { if (!el || snapOnce.has(el)) return; snapshot(); snapOnce.add(el); };

/* ---------- Stage 1: drop / cable IDs ---------- */
function freshCables(m, gen, ctx) {
  if (gen.cables.length) return gen.cables.map((c) => ({ ...c, media: ctx.media || "Cat6" }));
  if (!CABLE_KINDS.includes(m.kind)) return [];
  return [{ id: m.label, panel: m.panel, port: m.port, media: ctx.media || "Cat6", status: "planned" }];
}
addPointMark = function (kind, pt) {
  const f = byFloor();
  if (!f) return;
  if (kind === "note") return openNoteComposer(null, pt);
  snapshot();
  const ctx = placeCtx(), isData = kind === "data";
  const gen = nextId(kind, f, ctx);
  if (!gen.label) { editHistory.pop(); updateUndoButtons(); return notify("No free ID for this template. Adjust TR / panel / port.", true); }
  const m = { id: uid(), floorId: f.id, kind, x: pt.x, y: pt.y, label: gen.label, size: 21, color: COLORS[currentLayer], layer: currentLayer,
    status: "planned", tr: ctx.tr || "", room: ctx.room || "", panel: isData ? gen.panel || "" : "", port: isData ? String(gen.port ?? "") : "",
    cableId: "", notes: "", createdAt: Date.now() };
  m.cables = freshCables(m, gen, ctx);
  if (ctx.macMode) m.mac = newMac("add", m);
  state.marks.push(m);
  selectedId = m.id;
  renderInspector(); renderSidebar(); requestPaint(); save(); updatePlaceBar();
  notify(`${KIND_NAME[kind] || "Symbol"} placed · ${m.label}`);
};
const _changeSelectedField = changeSelectedField;
changeSelectedField = function (el) {
  const m = state.marks.find((o) => o.id === selectedId);
  if (!m) return;
  const key = el.dataset.field, old = m.label;
  once(el); // undoable field edits (one snapshot per field focus)
  if (key === "label" && el.value && isDuplicateId(el.value, m.id)) notify(`⚠ ${el.value} is already used or reserved as a spare`, true);
  if (["label", "panel", "port"].includes(key)) m.idLocked = true; // manual override survives Renumber
  _changeSelectedField(el);
  if (key === "label" && m.cables?.length)
    m.cables.forEach((c) => { if (c.id === old || c.id.startsWith(old)) c.id = m.label + c.id.slice(old.length); });
  if ((key === "panel" || key === "port") && m.cables?.length === 1) m.cables[0][key] = m[key];
};
duplicateSelected = function () {
  const m = state.marks.find((x) => x.id === selectedId);
  if (!m) return;
  snapshot();
  const n = structuredClone(m);
  n.id = uid(); n.createdAt = Date.now(); delete n.mac; delete n.idLocked;
  if (DEVICE_KINDS.includes(n.kind)) {
    const f = state.floors.find((x) => x.id === n.floorId), ctx = placeCtx(), gen = nextId(n.kind, f, ctx);
    Object.assign(n, { label: gen.label, tr: ctx.tr || n.tr, panel: n.kind === "data" ? gen.panel : n.panel, port: n.kind === "data" ? String(gen.port ?? "") : n.port });
    n.cables = freshCables(n, gen, ctx);
  } else n.label = (n.label || "") + " (copy)";
  if (isPoint(n)) { n.x = clamp(n.x + 0.016, 0, 1); n.y = clamp(n.y + 0.016, 0, 1); }
  else if (n.points) n.points = n.points.map((p) => ({ x: clamp(p.x + 0.02, 0, 1), y: clamp(p.y + 0.02, 0, 1) }));
  state.marks.push(n); selectedId = n.id;
  renderInspector(); renderSidebar(); requestPaint(); save(); updatePlaceBar();
};
deleteSelected = function () {
  const m = state.marks.find((x) => x.id === selectedId);
  if (!m) return;
  snapshot(); // void entry + MAC archive live inside this snapshot → Undo removes them
  const voided = DEVICE_KINDS.includes(m.kind) ? voidMark(m) : 0;
  if (m.mac) (state.macArchive ||= []).push({ ...m.mac, label: m.label, floorId: m.floorId, kind: m.kind, deleted: true });
  state.marks = state.marks.filter((x) => x.id !== m.id);
  selectedId = null;
  renderInspector(); renderSidebar(); requestPaint(); save(); updatePlaceBar();
  if (mode === "index") renderIndex();
  notify(voided ? `Deleted · ${m.label} kept as Spare / no cable in the Drop Index` : "Markup deleted");
};

/* Placement bar: sticky TR / room / panel / next port / cables per drop + live next-ID preview */
// Phone toolbar: a compact row of common tools plus a "More" toggle that opens the full tray.
// Pure UI: no project data is touched. Desktop/tablet hide the More button via CSS.
const PHONE_DOCK_MQ = "(max-width:720px),(max-height:500px) and (orientation:landscape)";
const PRIMARY_TOOLS = ["select", "pan", "data", "note", "measure"];
function syncDockMore(on) {
  const b = $("#dockMore"); if (!b) return;
  b.setAttribute("aria-expanded", String(on));
  b.querySelector(".sym").textContent = on ? "✕" : "⋯";
  b.querySelector(".lbl").textContent = on ? "Less" : "More";
}
const _renderTools = renderTools;
renderTools = function () {
  _renderTools();
  document.querySelectorAll("#toolDock .tool[data-tool]").forEach((b) => {
    b.classList.toggle("primary", PRIMARY_TOOLS.includes(b.dataset.tool));
    b.setAttribute("aria-label", b.title || b.dataset.tool);
    b.classList.toggle("active", typeof tool !== "undefined" && b.dataset.tool === tool);
  });
  const dock = $("#toolDock");
  if (dock && !$("#dockMore")) {
    dock.insertAdjacentHTML("beforeend", `<button class="tool dock-more" id="dockMore" type="button" aria-controls="toolDock" aria-expanded="false" aria-label="All tools"><span class="sym">⋯</span><span class="lbl">More</span></button>`);
    syncDockMore(dock.classList.contains("expanded"));
    // Inspector opening on a phone closes the tool tray so the two overlays never stack over the plan.
    const insp = $("#inspector");
    if (insp && !insp.dataset.trayWatch) {
      insp.dataset.trayWatch = "1";
      new MutationObserver(() => {
        if (!insp.classList.contains("hide-mobile") && !insp.classList.contains("hidden") && dock.classList.contains("expanded") && matchMedia(PHONE_DOCK_MQ).matches) { dock.classList.remove("expanded"); syncDockMore(false); }
      }).observe(insp, { attributes: true, attributeFilter: ["class"] });
    }
  }
};
const _template = template;
template = function () {
  const bar = `<div class="place-bar" id="placeBar">
  <span class="pb-title">NEXT ID</span><b id="pbNext">—</b>
  <label>TR/IDF<input data-pctx="tr" placeholder="TR1"></label>
  <label>Room<input data-pctx="room" placeholder="214"></label>
  <label>Panel<input data-pctx="panel" maxlength="3" placeholder="A"></label>
  <label>Next port<input data-pctx="port" type="number" min="1" inputmode="numeric"></label>
  <label>Ports/panel<input data-pctx="portsPerPanel" type="number" min="1" inputmode="numeric"></label>
  <label>Cables/drop<select data-scheme="cables"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
  <label>Media<select data-pctx="media">${MEDIA.map((x) => `<option>${x}</option>`).join("")}</select></label>
  <label class="pb-tpl">ID template<input data-scheme="template" placeholder="{TR}-{PANEL}-{PORT:00}"></label>
  <label class="pb-check"><input type="checkbox" data-pctx="macMode"> Log as MAC add</label>
  <button class="btn" id="pbRenumber" type="button">⇅ Renumber…</button>
  <button class="btn ghost pb-toggle" id="pbToggle" type="button" aria-label="Show ID settings" aria-expanded="false" aria-controls="placeBar">⚙</button></div>`;
  return _template().replace('<div class="tool-dock"', bar + '<div class="tool-dock"');
};
function updatePlaceBar() {
  const bar = $("#placeBar");
  if (!bar || !state) return;
  bar.classList.toggle("hidden", mode !== "2d");
  const ctx = placeCtx(), s = idScheme("data");
  for (const el of $$("[data-pctx]", bar)) if (document.activeElement !== el) {
    const v = ctx[el.dataset.pctx];
    if (el.type === "checkbox") el.checked = !!v; else el.value = v ?? (el.dataset.pctx === "media" ? "Cat6" : "");
  }
  for (const el of $$("[data-scheme]", bar)) if (document.activeElement !== el) el.value = s[el.dataset.scheme];
  const f = byFloor();
  const g = f ? nextId("data", f, ctx, { peek: true }) : null;
  $("#pbNext").textContent = g?.label ? g.label + (g.cables.length ? ` (${g.cables.map((c) => c.id.slice(g.label.length)).join("/")})` : "") : "—";
}
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.matches?.("[data-pctx]")) {
    const k = t.dataset.pctx, ctx = placeCtx();
    ctx[k] = t.type === "checkbox" ? t.checked : k === "panel" ? t.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : ["port", "portsPerPanel"].includes(k) ? (t.value === "" ? "" : Number(t.value)) : t.value;
    if (k === "panel") t.value = ctx.panel;
    save(); updatePlaceBar();
  } else if (t.matches?.("[data-scheme]")) {
    state.idSchemes ||= {};
    const cur = (state.idSchemes.data ||= {});
    cur[t.dataset.scheme] = t.dataset.scheme === "cables" ? Number(t.value) : t.value || undefined;
    save(); updatePlaceBar();
  }
});
document.addEventListener("change", (e) => { if (e.target.matches?.("[data-pctx],[data-scheme]")) e.target.dispatchEvent(new Event("input", { bubbles: true })); });

/* Renumber with preview */
function openRenumber() {
  const f = byFloor();
  if (!f) return notify("Open a floor first", true);
  const ctx = placeCtx();
  openModal("Renumber drops", `<p>Renumber unlocked <b>${KIND_NAME.data}</b> IDs on <b>${esc(f.name)}</b>. Locked IDs (edited by hand) and spare IDs are skipped. Nothing changes until you choose Apply.</p>
  <div class="two-fields"><div class="field"><label>KIND</label><select id="rnKind">${DEVICE_KINDS.map((k) => `<option value="${k}">${esc(KIND_NAME[k])}</option>`).join("")}</select></div>
  <div class="field"><label>ORDER</label><select id="rnOrder"><option value="placed">Placement order</option><option value="spatial">Reading order (rows, left→right)</option></select></div></div>
  <div class="two-fields"><div class="field"><label>START PANEL (port IDs)</label><input id="rnPanel" value="A"></div><div class="field"><label>START PORT / NUMBER</label><input id="rnStart" type="number" min="0" value="1"></div></div>
  <button class="btn" id="rnPreview" type="button">Preview</button><div id="rnTable" class="rn-table"></div>`,
  [{ label: "Cancel", fn: closeModal }, { label: "Apply renumber", primary: true, fn: () => {
    const rows = rnRows(); if (!rows.length) return notify("Nothing to renumber", true);
    applyResequence(rows); closeModal(); if (mode === "index") renderIndex(); updatePlaceBar(); notify(`Renumbered ${rows.length} IDs`);
  } }], true);
  const rnRows = () => previewResequence($("#rnKind").value, f.id, $("#rnOrder").value,
    { panel: $("#rnPanel").value.toUpperCase() || "A", port: Number($("#rnStart").value) || 1, start: Number($("#rnStart").value) || 1 }).filter((r) => r.to !== r.from);
  const show = () => { const rows = rnRows(); $("#rnTable").innerHTML = rows.length ? `<table class="data-table"><thead><tr><th>FROM</th><th></th><th>TO</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.from)}</td><td>→</td><td><b>${esc(r.to)}</b></td></tr>`).join("")}</tbody></table>` : '<p class="notice">Already in order. Nothing would change.</p>'; };
  $("#rnPreview").onclick = show; $("#rnKind").onchange = show; $("#rnOrder").onchange = show;
  show();
}

/* ---------- Quick fixes ---------- */
hitMark = function (x, y, img) {
  return markFloor(selectedFloorId).filter(isVisible).filter((m) => {
    if (m.kind === "cloud" && m.points?.length === 2) { // clouds are rectangles: hit inside the box
      const b = markBounds(m, img.width, img.height);
      return x >= b.l && x <= b.l + b.w && y >= b.t && y <= b.t + b.h;
    }
    if (isPoint(m)) return Math.hypot((m.x - x) * img.width, (m.y - y) * img.height) < Math.max(26, (m.size || 21) * 1.4) / Math.max(zoom, 0.5);
    return !!m.points && markBounds(m, img.width, img.height) && pointNearLine(m, { x, y }, img);
  }).at(-1);
};
const _pointerStart = pointerStart;
pointerStart = function (e) {
  if (spaceDown && mode === "2d" && e.pointerType === "mouse") {
    const p = getPosition(e);
    $("#planCanvas").setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, p);
    drag = { type: "pan", sx: p.x, sy: p.y, px: panX, py: panY, moved: false };
    return;
  }
  return _pointerStart(e);
};
addEventListener("keydown", (e) => { if (e.code === "Space" && !e.target.closest?.("input,textarea,select,button")) { spaceDown = true; e.preventDefault(); } });
addEventListener("keyup", (e) => { if (e.code === "Space") spaceDown = false; });
afterHistory = function () { // don't throw away rendered PDF sheets on every undo
  if (!state.floors.some((f) => f.id === selectedFloorId)) selectedFloorId = state.floors[0]?.id ?? null;
  selectedId = null; thumbs.clear(); renderAll(); save();
};

/* ---------- Lengths, calibration per PDF unit ---------- */
// Calibration is stored per PDF point (f.ftPerPt) so it no longer depends on render resolution.
// ftPerPixel is kept in sync (per base-raster pixel) because app.js still checks it before measuring.
physicalDistance = function (a, b, W, H, f) {
  if (f?.ftPerPt && f.pdfW) return Math.hypot((b.x - a.x) * f.pdfW, (b.y - a.y) * f.pdfH) * f.ftPerPt;
  return f?.ftPerPixel != null ? Math.hypot((b.x - a.x) * W, (b.y - a.y) * H) * f.ftPerPixel : null;
};
function polyLengthFt(m, f, W, H) {
  if (!(m.points?.length > 1)) return null;
  let s = 0;
  for (let i = 1; i < m.points.length; i++) { const d = physicalDistance(m.points[i - 1], m.points[i], W, H, f); if (d == null) return null; s += d; }
  return s;
}
function floorRaster(f) { // dims of the base raster used for W/H (matches getFloorImage)
  if (f?.kind === "demo") return { W: 1600, H: 1040 };
  if (f?.pdfW) { const k = Math.min(2.5, 2350 / Math.max(f.pdfW, f.pdfH)); return { W: Math.ceil(f.pdfW * k), H: Math.ceil(f.pdfH * k) }; }
  return { W: 1, H: 1 };
}
function pathLen(m) { const f = state.floors.find((x) => x.id === m.floorId), r = floorRaster(f); return polyLengthFt(m, f, r.W, r.H); }
const _getFloorImage = getFloorImage;
getFloorImage = async function (f) {
  if (f?.kind === "pdf" && !f.pdfW) {
    try {
      const vp = (await (await getPdfDoc(f.assetKey)).getPage(f.pageIndex)).getViewport({ scale: 1 });
      f.pdfW = vp.width; f.pdfH = vp.height;
      if (f.ftPerPixel && !f.ftPerPt) f.ftPerPt = f.ftPerPixel * Math.min(2.5, 2350 / Math.max(vp.width, vp.height)); // migrate old calibration
      save();
    } catch (e) { /* the original call reports the error */ }
  }
  return _getFloorImage(f);
};
const SCALES = { "": "Custom: two points + known distance", "1/16": '1/16" = 1\'-0"', "3/32": '3/32" = 1\'-0"', "1/8": '1/8" = 1\'-0"', "3/16": '3/16" = 1\'-0"', "1/4": '1/4" = 1\'-0"', "1/2": '1/2" = 1\'-0"', "1:100": "1:100 (metric)", "1:50": "1:50 (metric)" };
function scaleToFtPerPt(k) {
  if (k.includes(":")) return Number(k.split(":")[1]) / 72 / 12; // 1 pt = 1/72 in on paper → n in real
  const [a, b] = k.split("/").map(Number); return 1 / (a / b) / 72; // 1 in paper = (b/a) ft
}
function setCalibration(f, ftPerPt, ftPerRasterPx) {
  const r = floorRaster(f);
  if (f.pdfW && ftPerPt) { f.ftPerPt = ftPerPt; f.ftPerPixel = ftPerPt * (f.pdfW / r.W); }
  else { f.ftPerPixel = ftPerRasterPx; delete f.ftPerPt; }
}
openCalibration = function (points, img) {
  const f = byFloor(), pixels = Math.hypot((points[1].x - points[0].x) * img.width, (points[1].y - points[0].y) * img.height);
  const pts = f.pdfW ? Math.hypot((points[1].x - points[0].x) * f.pdfW, (points[1].y - points[0].y) * f.pdfH) : null;
  openModal("Scale calibration", `<p>Enter the real distance between the two points, or pick the sheet's printed scale.</p>
  <div class="field"><label>PRINTED SCALE</label><select id="calScale">${Object.entries(SCALES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
  <div class="two-fields"><div class="field"><label>KNOWN DISTANCE</label><input id="calibrationInput" type="number" min="0.01" step="any" value="20"></div>
  <div class="field"><label>UNITS</label><select id="calUnit"><option value="1">feet</option><option value="0.0833333">inches</option><option value="3.28084">meters</option></select></div></div>
  <div class="notice">Calibration is per sheet and stored in PDF units, so it stays correct at any zoom or export resolution.${f.pdfW ? "" : " (Demo sheet: stored per pixel.)"}</div>`,
  [{ label: "Cancel", fn: closeModal }, { label: "Apply calibration", primary: true, fn: () => {
    const sc = $("#calScale").value;
    snapshot();
    if (sc && f.pdfW) setCalibration(f, scaleToFtPerPt(sc));
    else {
      const ft = Number($("#calibrationInput").value) * Number($("#calUnit").value);
      if (!Number.isFinite(ft) || ft <= 0) return notify("Enter a distance greater than zero", true);
      setCalibration(f, pts ? ft / pts : null, ft / pixels);
    }
    f.calibrationPts = points; save(); renderHeader(); closeModal(); setActiveTool("measure"); requestPaint();
    notify("Scale calibrated. Measure or draw paths on this floor.");
  } }]);
};
const _renderHeader = renderHeader;
renderHeader = function () {
  _renderHeader();
  const f = byFloor();
  if (f?.ftPerPt && $("#scaleText")) $("#scaleText").textContent = `SCALE · 1 in = ${(f.ftPerPt * 72).toFixed(2)} ft`;
};

/* ---------- Drawing: uniform line widths, path lengths, MAC overlays ---------- */
drawMark = function (ctx, m, W, H, selected = false) {
  const col = m.color || COLORS[m.layer] || COLORS.asbuilt;
  const sz = clamp(Number(m.size) || 21, 10, 75);
  const f = state.floors.find((fl) => fl.id === m.floorId);
  ctx.save();
  ctx.globalAlpha = selected ? 1 : 0.96;
  const px = (p) => [p.x * W, p.y * H]; // draw lines in raster-pixel space so widths are uniform
  if (["path", "measure"].includes(m.kind)) {
    if ((m.points || []).length < 2) { ctx.restore(); return; }
    ctx.save(); ctx.scale(1 / W, 1 / H);
    ctx.beginPath(); m.points.forEach((p, i) => (i ? ctx.lineTo(...px(p)) : ctx.moveTo(...px(p))));
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.setLineDash(m.dashed ? [13, 9] : []); ctx.stroke(); ctx.setLineDash([]);
    if (m.kind === "measure") for (const p of [m.points[0], m.points.at(-1)]) { ctx.beginPath(); ctx.arc(...px(p), 4, 0, TWO_PI); ctx.fillStyle = col; ctx.fill(); }
    ctx.restore();
    const len = polyLengthFt(m, f, W, H);
    if (m.kind === "measure") {
      const a = m.points[0], b = m.points.at(-1);
      drawLabel(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2 - 22 / H, len == null ? "UNCALIBRATED" : `${len.toFixed(1)} ft`, sz, W, H, col, true);
    } else {
      const ids = (m.cableIds || []).length ? ` · ${m.cableIds.length} cable${m.cableIds.length > 1 ? "s" : ""}` : "";
      const text = (m.label || "") + (len != null ? ` · ${len.toFixed(1)} ft` : "") + ids;
      if (text) drawLabel(ctx, m.points[0].x, m.points[0].y - 20 / H, text, sz, W, H, col, true);
    }
  } else if (m.kind === "cloud") {
    const [a, b] = m.points || [];
    if (a && b) { ctx.save(); ctx.scale(1 / W, 1 / H); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
      ctx.strokeRect(Math.min(a.x, b.x) * W, Math.min(a.y, b.y) * H, Math.abs(b.x - a.x) * W, Math.abs(b.y - a.y) * H); ctx.restore(); }
  } else if (isPoint(m)) {
    const rad = Math.max(9, sz * 0.65);
    const mac = m.mac && MAC_TYPES[m.mac.type];
    if (mac && m.mac.type === "move" && m.mac.before?.floorId === m.floorId && m.mac.before.x != null) { // ghost of old location + arrow
      ctx.save(); ctx.scale(1 / W, 1 / H);
      const [bx, by] = [m.mac.before.x * W, m.mac.before.y * H], [ax, ay] = [m.x * W, m.y * H];
      ctx.globalAlpha = 0.55; ctx.strokeStyle = mac[1]; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.strokeRect(bx - rad, by - rad, rad * 2, rad * 2);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke(); ctx.setLineDash([]);
      const ang = Math.atan2(ay - by, ax - bx), hx = ax - Math.cos(ang) * (rad + 3), hy = ay - Math.sin(ang) * (rad + 3);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - 10 * Math.cos(ang - 0.4), hy - 10 * Math.sin(ang - 0.4)); ctx.lineTo(hx - 10 * Math.cos(ang + 0.4), hy - 10 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fillStyle = mac[1]; ctx.globalAlpha = 0.9; ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.translate(m.x, m.y); ctx.scale(1 / W, 1 / H);
    drawSymbol(ctx, m, 0, 0, rad);
    if (mac) {
      if (m.mac.type === "remove") { ctx.strokeStyle = mac[1]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-rad * 1.2, -rad * 1.2); ctx.lineTo(rad * 1.2, rad * 1.2); ctx.moveTo(rad * 1.2, -rad * 1.2); ctx.lineTo(-rad * 1.2, rad * 1.2); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(rad * 1.05, -rad * 1.05, 7.5, 0, TWO_PI); ctx.fillStyle = mac[1]; ctx.fill();
      ctx.fillStyle = "#07121c"; ctx.font = "700 10px 'Space Grotesk',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(mac[0], rad * 1.05, -rad * 1.05 + 0.5);
    }
    ctx.restore();
    if (m.label) drawLabel(ctx, m.x, m.y + (rad + 8) / H, m.label, sz, W, H, col, m.kind === "note", m);
  }
  if (selected) {
    const box = markBounds(m, W, H);
    if (box) { ctx.save(); ctx.scale(1 / W, 1 / H); ctx.strokeStyle = "#f4fff5"; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]); ctx.strokeRect(box.l * W, box.t * H, box.w * W, box.h * H); ctx.restore(); }
  }
  ctx.restore();
};

/* ---------- Stage 2: cable records + MAC tracking ---------- */
function newMac(type, m) {
  state.macSeq = (state.macSeq || 0) + 1;
  return { no: "MAC-" + String(state.macSeq).padStart(4, "0"), type, status: "open", ticket: "", requestedBy: "", at: Date.now(),
    before: type === "move" ? { floorId: m.floorId, x: m.x, y: m.y, text: `${m.label} @ ${shortName(state.floors.find((f) => f.id === m.floorId))}` }
      : type === "add" ? { text: "—" } : { text: [m.label, m.panel && `${m.panel}-${m.port}`].filter(Boolean).join(" ") },
    after: { text: type === "remove" ? "Removed" : "" } };
}
function cableLength(m, c) { // length from any path that carries this cable (or the whole drop), + slack
  let best = null;
  for (const p of state.marks) if (p.kind === "path" && p.floorId === m.floorId && (p.cableIds || []).some((id) => id === c.id || id === m.label)) {
    const l = pathLen(p); if (l != null) best = (best || 0) + l + (Number(p.slackFt) || 0);
  }
  return best;
}
function cableRows() {
  const rows = [];
  for (const m of state.marks) {
    if (!DEVICE_KINDS.includes(m.kind)) continue;
    const f = state.floors.find((x) => x.id === m.floorId);
    const cables = m.cables?.length ? m.cables : m.cableId ? [{ id: m.cableId, status: m.status }] : [];
    for (const c of cables) {
      const auto = cableLength(m, c);
      rows.push({ id: c.id, from: [m.tr, c.panel ?? m.panel, c.port ?? m.port].filter((v) => v !== "" && v != null).join("-"), to: m.label,
        media: c.media || "", length: c.lengthFt ? Number(c.lengthFt).toFixed(0) : auto != null ? auto.toFixed(0) : "", test: c.test || "", status: c.status || m.status, sheet: shortName(f), spare: false });
    }
  }
  for (const v of voidRows()) rows.push({ id: v.id, from: [v.tr, v.panel, v.port].filter((x) => x !== "" && x != null).join("-"), to: "—", media: "", length: "", test: "", status: v.status, sheet: v.sheet, spare: true });
  return rows.sort((a, b) => String(a.from).localeCompare(String(b.from), undefined, { numeric: true }));
}
function macRows() {
  const live = state.marks.filter((m) => m.mac).map((m) => ({ ...m.mac, label: m.label, sheet: shortName(state.floors.find((f) => f.id === m.floorId)), kind: m.kind, id: m.id }));
  const gone = (state.macArchive || []).map((x) => ({ ...x, sheet: shortName(state.floors.find((f) => f.id === x.floorId)), status: x.status + " (drop deleted)" }));
  return [...live, ...gone].sort((a, b) => String(a.no).localeCompare(String(b.no)));
}
const _renderInspector = renderInspector;
renderInspector = function () {
  _renderInspector();
  const m = state.marks.find((o) => o.id === selectedId), box = $("#inspectorContent");
  if (!m || !box) return;
  const anchor = box.querySelector(".field textarea[data-field='notes']")?.closest(".field");
  let html = "";
  if (DEVICE_KINDS.includes(m.kind)) {
    html += `<div class="section-label">ID ${m.idLocked ? '<span class="pill">locked</span> <button class="btn ghost mini" data-unlock>unlock</button>' : '<span style="color:#7891a6">auto</span>'}</div>
    <div class="two-fields"><div class="field"><label>ROOM</label><input data-xfield="room" value="${esc(m.room || "")}"></div><div class="field"><label>PANEL / PORT</label><div style="display:flex;gap:6px"><input data-field="panel" value="${esc(m.panel || "")}" style="width:50%"><input data-field="port" value="${esc(m.port || "")}" style="width:50%"></div></div></div>`;
    html += `<div class="section-label">CABLES (${(m.cables || []).length})</div>${(m.cables || []).map((c, i) => {
      const auto = cableLength(m, c);
      return `<div class="cable-card"><div class="two-fields"><div class="field"><label>CABLE ID</label><input data-cable="${i}:id" value="${esc(c.id)}"></div><div class="field"><label>MEDIA</label><select data-cable="${i}:media">${MEDIA.map((x) => `<option ${c.media === x ? "selected" : ""}>${x}</option>`).join("")}</select></div></div>
      <div class="two-fields"><div class="field"><label>PANEL-PORT</label><div style="display:flex;gap:6px"><input data-cable="${i}:panel" value="${esc(c.panel ?? "")}" style="width:45%"><input data-cable="${i}:port" value="${esc(c.port ?? "")}" style="width:55%"></div></div><div class="field"><label>LENGTH FT ${auto != null ? `<small>(path ${auto.toFixed(0)})</small>` : ""}</label><input data-cable="${i}:lengthFt" type="number" inputmode="decimal" value="${esc(c.lengthFt ?? "")}" placeholder="${auto != null ? auto.toFixed(0) : "auto from path"}"></div></div>
      <div class="two-fields"><div class="field"><label>TEST</label><select data-cable="${i}:test">${["", "pass", "fail", "retest"].map((x) => `<option value="${x}" ${c.test === x ? "selected" : ""}>${x || "—"}</option>`).join("")}</select></div><div class="field"><label>STATUS</label><select data-cable="${i}:status">${STATUSES.map((x) => `<option ${c.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></div></div>
      <button class="btn ghost mini" data-cable-del="${i}">✕ remove cable</button></div>`; }).join("")}<button class="btn mini" data-cable-add>＋ Add cable</button>`;
    const mac = m.mac;
    html += `<div class="section-label">MAC (MOVE / ADD / CHANGE)</div><div class="two-fields"><div class="field"><label>TYPE</label><select data-mac="type"><option value="">None</option>${Object.entries(MAC_TYPES).map(([k, v]) => `<option value="${k}" ${mac?.type === k ? "selected" : ""}>${v[2]}</option>`).join("")}</select></div>
    ${mac ? `<div class="field"><label>STATUS · ${esc(mac.no)}</label><select data-mac="status">${MAC_STATUS.map((x) => `<option ${mac.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></div></div>
    <div class="two-fields"><div class="field"><label>TICKET / WORK ORDER</label><input data-mac="ticket" value="${esc(mac.ticket)}"></div><div class="field"><label>REQUESTED BY</label><input data-mac="requestedBy" value="${esc(mac.requestedBy)}"></div></div>
    <div class="field"><label>BEFORE</label><input data-mac="before.text" value="${esc(mac.before?.text || "")}"></div><div class="field"><label>AFTER</label><input data-mac="after.text" value="${esc(mac.after?.text || "")}" placeholder="${mac.type === "move" ? "Drag the marker to its new spot" : ""}"></div>` : "</div>"}`;
  } else if (m.kind === "path") {
    const len = pathLen(m);
    html += `<div class="section-label">PATHWAY</div><div class="field"><label>LENGTH</label><div>${len != null ? `<b>${len.toFixed(1)} ft</b> along ${m.points.length - 1} segment(s)` : "Calibrate this sheet to get a length"}</div></div>
    <div class="field"><label>CABLES / CIRCUITS CARRIED (comma separated)</label><input data-xpath="cableIds" value="${esc((m.cableIds || []).join(", "))}" placeholder="TR1-A-01, TR1-A-02"></div>
    <div class="two-fields"><div class="field"><label>SLACK / SERVICE LOOP FT</label><input data-xpath="slackFt" type="number" inputmode="decimal" value="${esc(m.slackFt ?? "")}"></div><div class="field"><label>PATHWAY TYPE</label><select data-xpath="pathType">${["", "J-hook", "Cable tray", "Conduit", "Ladder rack", "Innerduct", "Open ceiling"].map((x) => `<option ${m.pathType === x ? "selected" : ""}>${x}</option>`).join("")}</select></div></div>`;
  }
  if (!html) return;
  const div = document.createElement("div"); div.className = "pro-fields"; div.innerHTML = html;
  anchor ? anchor.before(div) : box.prepend(div);
};
function selMark() { return state.marks.find((o) => o.id === selectedId); }
document.addEventListener("change", (e) => {
  const t = e.target, m = selMark();
  if (!m) return;
  if (t.matches("[data-cable]")) {
    once(t); const [i, k] = t.dataset.cable.split(":"), c = m.cables[Number(i)];
    if (k === "id" && isDuplicateId(t.value, null) && t.value !== c.id) notify(`⚠ ${t.value} is already used or reserved`, true);
    c[k] = k === "lengthFt" ? (t.value === "" ? undefined : Number(t.value)) : t.value; m.updatedAt = Date.now(); save();
  } else if (t.matches("[data-mac]")) {
    once(t); const k = t.dataset.mac;
    if (k === "type") { if (!t.value) delete m.mac; else if (!m.mac) m.mac = newMac(t.value, m); else { const keep = m.mac.no; m.mac = { ...newMac(t.value, m), no: keep }; state.macSeq--; } renderInspector(); }
    else if (k.includes(".")) { const [a, b] = k.split("."); (m.mac[a] ||= {})[b] = t.value; }
    else m.mac[k] = t.value;
    m.updatedAt = Date.now(); save(); requestPaint();
  } else if (t.matches("[data-xpath]")) {
    once(t); const k = t.dataset.xpath;
    m[k] = k === "cableIds" ? t.value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean) : k === "slackFt" ? Number(t.value) || 0 : t.value;
    save(); requestPaint(); renderInspector();
  } else if (t.matches("[data-xfield]")) { once(t); m[t.dataset.xfield] = t.value; save(); }
});
document.addEventListener("click", (e) => {
  const t = e.target, m = selMark();
  if (t.closest("#pbRenumber,#idxRenumber")) return openRenumber();
  if (t.closest("#pbToggle")) { const on = $("#placeBar").classList.toggle("expanded"); t.closest("#pbToggle").setAttribute("aria-expanded", String(on)); return; }
  if (t.closest("#dockMore")) { const on = $("#toolDock").classList.toggle("expanded"); syncDockMore(on); return; }
  if (t.closest(".tool[data-tool]") && $("#toolDock")?.classList.contains("expanded") && matchMedia(PHONE_DOCK_MQ).matches) { $("#toolDock").classList.remove("expanded"); syncDockMore(false); }
  const rv = t.closest("[data-restore-void]");
  if (rv) {
    const target = state.marks.find((x) => x.id === selectedId && DEVICE_KINDS.includes(x.kind));
    const v = restoreVoidId(rv.dataset.restoreVoid, target || null);
    if (v) notify(target ? `${v.id} reused on the selected drop` : `${v.id} released; it can now be assigned again`);
    renderIndex(); updatePlaceBar(); return;
  }
  if (!m) return;
  if (t.closest("[data-unlock]")) { snapshot(); delete m.idLocked; save(); return renderInspector(); }
  if (t.closest("[data-cable-add]")) {
    snapshot(); m.cables ||= [];
    const suffix = idScheme("data").suffixes[m.cables.length] || m.cables.length + 1;
    if (m.cables.length === 1 && m.cables[0].id === m.label) m.cables[0].id = m.label + idScheme("data").suffixes[0];
    m.cables.push({ id: m.label + suffix, panel: m.panel, port: "", media: placeCtx().media || "Cat6", status: "planned" });
    save(); return renderInspector();
  }
  const del = t.closest("[data-cable-del]");
  if (del) { snapshot(); const c = m.cables.splice(Number(del.dataset.cableDel), 1)[0];
    if (c) (state.voidIds ||= []).push({ vid: uid(), id: c.id, drop: m.label, tr: m.tr, panel: c.panel, port: c.port, floorId: m.floorId, kind: m.kind, deletedAt: Date.now(), note: "No cable - cable removed" });
    save(); return renderInspector(); }
});
// Moving a marker with a "move" MAC fills in the After text automatically
const _pointerEnd = pointerEnd;
pointerEnd = async function (e) {
  const id = drag?.type === "mark" ? drag.hitId : null;
  await _pointerEnd(e);
  const m = id && state.marks.find((x) => x.id === id);
  if (m?.mac?.type === "move" && (m.x !== m.mac.before?.x || m.y !== m.mac.before?.y) && !m.mac.after?.text) {
    m.mac.after = { text: `${m.label} @ ${shortName(state.floors.find((f) => f.id === m.floorId))} (moved)` }; save(); renderInspector();
  }
};

/* ---------- Drop Index: spares (list-only), cables, MAC ---------- */
renderIndex = function () {
  const div = $("#indexView");
  if (!div) return;
  const term = searchText.toLowerCase(), view = statusFilter;
  const sheet = (id) => shortName(state.floors.find((f) => f.id === id));
  const devices = state.marks.filter((m) => !["path", "cloud", "measure"].includes(m.kind)).filter((m) =>
    (view === "all" || m.status === view || (view === "mac" && m.mac)) && view !== "void" &&
    `${m.label} ${m.tr || ""} ${m.panel || ""} ${m.port || ""} ${m.room || ""} ${m.kind} ${(m.cables || []).map((c) => c.id).join(" ")} ${sheet(m.floorId)}`.toLowerCase().includes(term));
  const voids = ["all", "void"].includes(view) ? voidRows().filter((v) => `${v.id} ${v.tr} ${v.panel} ${v.port}`.toLowerCase().includes(term)) : [];
  const opts = [["all", "All statuses"], ...STATUSES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]), ["mac", "MAC items only"], ["void", "Spare / no cable"]];
  div.innerHTML = `<div class="index-title"><div><div class="eyebrow">ASSET DATABASE / TIA-606 FRIENDLY</div><h2>Drop & Device Index</h2><p>Search identifiers, cables and MACs. Spare IDs are listed here only; they're never drawn on the plan.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="idxRenumber">⇅ Renumber…</button><button class="btn primary" id="exportCSVFromIndex">↓ Export CSV</button></div></div>
  <div class="metric-grid idx-metrics"><div class="metric"><strong>${devices.length + voids.length}</strong><small>Shown records</small></div><div class="metric"><strong>${cableRows().filter((c) => !c.spare).length}</strong><small>Cables</small></div><div class="metric"><strong style="color:#80eac3">${state.marks.filter((m) => m.status === "tested").length}</strong><small>Tested records</small></div><div class="metric"><strong>${(state.voidIds || []).length}</strong><small>Spare / no cable</small></div><div class="metric"><strong>${macRows().filter((x) => !/complete|verified/.test(x.status)).length}</strong><small>Open MACs</small></div></div>
  <div class="index-controls"><input class="text-search" id="indexSearch" placeholder="⌕  Search all records…" value="${esc(searchText)}"><select id="statusFilter" class="text-search" style="width:170px">${opts.map(([v, l]) => `<option value="${v}" ${view === v ? "selected" : ""}>${l}</option>`).join("")}</select><button class="btn" id="importCSVFromIndex">↑ Import CSV</button></div>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>ASSET IDENTIFIER</th><th>FLOOR</th><th>TYPE</th><th>TR / IDF</th><th>PANEL / PORT</th><th>CABLES</th><th>MAC</th><th>STATUS</th><th>LOCATION</th></tr></thead><tbody>${devices.map((m) =>
    `<tr data-jump="${esc(m.id)}"><td><span class="table-code">${esc(m.label || "UNLABELED")}</span>${m.idLocked ? ' <small title="ID set by hand">🔒</small>' : ""}</td><td>${esc(sheet(m.floorId))}</td><td>${esc(KIND_NAME[m.kind] || m.kind)}</td><td>${esc(m.tr || "—")}</td><td>${esc(m.panel || "—")} / ${esc(m.port || "—")}</td><td>${(m.cables || []).length > 1 ? esc(m.cables.map((c) => c.id.slice((m.label || "").length) || c.id).join("/")) : (m.cables || []).length}</td><td>${m.mac ? `<span class="pill mac-${m.mac.type}">${esc(m.mac.no)} ${esc(MAC_TYPES[m.mac.type][2])}</span>` : "—"}</td><td><span class="pill ${m.status}">${esc(m.status || "planned")}</span></td><td style="color:${isPoint(m) ? "#6eebd1" : "#f0bc74"}">${isPoint(m) ? "⌖ View on plan" : "○ Unplaced"}</td></tr>`).join("")}
  ${voids.map((v) => `<tr class="void-row"><td><span class="table-code">${esc(v.id)}</span></td><td>${esc(v.sheet)}</td><td>Spare</td><td>${esc(v.tr || "—")}</td><td>${esc(v.panel || "—")} / ${esc(v.port || "—")}</td><td>0</td><td>—</td><td><span class="pill void">Spare / no cable</span></td><td><button class="btn ghost mini" data-restore-void="${esc(v.vid)}" title="Reuse this ID on the selected drop, or release it">↺ Reuse</button></td></tr>`).join("")}</tbody></table>${devices.length + voids.length ? "" : '<div class="empty"><strong>No matching records</strong>Import CSV or place symbols on a floor plan.</div>'}</div>
  <p style="color:#7996a9;font-size:11px;margin:13px 0">CSV columns: floor, label, type, tr, patch_panel, port, cable_id, status, layer, x, y, notes, room, cables, mac. Spare rows export with type "spare" and are skipped on import.</p>`;
};
getCSV = function () {
  const cols = ["floor", "label", "type", "tr", "patch_panel", "port", "cable_id", "status", "layer", "x", "y", "notes", "room", "cables", "mac"];
  const rows = state.marks.filter((m) => !["path", "cloud", "measure"].includes(m.kind)).map((m) => [state.floors.find((f) => f.id === m.floorId)?.name, m.label, m.kind, m.tr, m.panel, m.port, m.cableId, m.status, m.layer, m.x, m.y, m.notes, m.room, (m.cables || []).map((c) => c.id).join(" "), m.mac ? `${m.mac.no} ${m.mac.type} ${m.mac.status}` : ""]);
  const spares = voidRows().map((v) => [state.floors.find((f) => f.id === state.voidIds.find((x) => x.vid === v.vid)?.floorId)?.name, v.id, "spare", v.tr, v.panel, v.port, "", "spare", "", "", "", v.note, "", "", ""]);
  return [cols.join(","), ...[...rows, ...spares].map((r) => r.map(csvEscape).join(","))].join("\r\n");
};
const _importCSV = importCSV;
importCSV = async function (file) { // skip spare rows and IDs that already exist (re-importing no longer duplicates)
  const rows = csvParse(await file.text());
  if (rows.length < 2) return _importCSV(file);
  const head = rows[0].map((k) => k.trim().toLowerCase()), li = head.indexOf("label"), ti = head.indexOf("type");
  const used = usedIds(); let skipped = 0;
  const keep = rows.slice(1).filter((r) => { if (ti >= 0 && r[ti] === "spare") return false; if (li >= 0 && used.has(String(r[li]).trim().toUpperCase())) { skipped++; return false; } return true; });
  await _importCSV({ text: async () => [rows[0], ...keep].map((r) => r.map(csvEscape).join(",")).join("\n") });
  if (skipped) setTimeout(() => notify(`Skipped ${skipped} rows whose ID already exists (no duplicates created).`, true), 1200);
};

/* ---------- Sharper zoom: re-render just the visible part of the PDF at screen resolution ---------- */
// The base raster is capped at 2350 px (about 65 dpi on a 36x24 sheet). When zoomed past that, pdf.js renders the
// visible region at device resolution into one tile (capped for iOS canvas limits) and drawPlan paints it on top.
let hiTile = null, hiTask = null, hiTimer = 0;
const TILE_MAX_PX = 12e6, TILE_MAX_SIDE = 6000;
function scheduleHiTile(f, img, r) {
  clearTimeout(hiTimer);
  if (window.ATLAS_NO_TILES || f.kind !== "pdf") return;
  const need = (r.w * dpr) / img.width;
  if (need < 1.15) { hiTile = null; return; }
  const key = [f.id, Math.round(r.l), Math.round(r.t), Math.round(r.w), stageW, stageH, dpr].join("|");
  if (hiTile?.key === key) return;
  hiTimer = setTimeout(async () => {
    try {
      hiTask?.cancel?.();
      const pg = await (await getPdfDoc(f.assetKey)).getPage(f.pageIndex), vp1 = pg.getViewport({ scale: 1 });
      const vx0 = Math.max(r.l, 0), vy0 = Math.max(r.t, 0), vx1 = Math.min(r.l + r.w, stageW), vy1 = Math.min(r.t + r.h, stageH);
      if (vx1 <= vx0 || vy1 <= vy0) return;
      let s = (r.w * dpr) / vp1.width, tw = (vx1 - vx0) * dpr, th = (vy1 - vy0) * dpr;
      const k = Math.min(1, Math.sqrt(TILE_MAX_PX / (tw * th)), TILE_MAX_SIDE / Math.max(tw, th));
      s *= k; tw = Math.ceil(tw * k); th = Math.ceil(th * k);
      const n = { x0: (vx0 - r.l) / r.w, y0: (vy0 - r.t) / r.h, x1: (vx1 - r.l) / r.w, y1: (vy1 - r.t) / r.h };
      const c = document.createElement("canvas"); c.width = tw; c.height = th;
      const cx = c.getContext("2d", { alpha: false }); cx.fillStyle = "#fff"; cx.fillRect(0, 0, tw, th);
      const view = pg.getViewport({ scale: s });
      hiTask = pg.render({ canvasContext: cx, viewport: view, transform: [1, 0, 0, 1, -n.x0 * view.width, -n.y0 * view.height] });
      await hiTask.promise; hiTask = null;
      if (selectedFloorId !== f.id) return;
      if (hiTile?.canvas) { hiTile.canvas.width = hiTile.canvas.height = 0; } // free GPU memory promptly (iOS)
      hiTile = { key, floorId: f.id, n, canvas: c, scale: s };
      requestPaint();
    } catch (e) { if (e?.name !== "RenderingCancelledException") console.warn("hi-res tile", e); }
  }, 160);
}
drawPlan = function () {
  const c = $("#planCanvas");
  if (!c || mode !== "2d") return;
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, stageW, stageH);
  const f = byFloor();
  if (!f) return drawEmpty(ctx);
  const imgPromise = floorImages.get(f.id);
  if (!imgPromise) { getFloorImage(f).then(requestPaint).catch(() => drawEmpty(ctx)); return; }
  Promise.resolve(imgPromise).then((img) => {
    if (f.id !== selectedFloorId || mode !== "2d") return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, stageW, stageH);
    const r = drawingRect(img);
    ctx.shadowColor = "#000a"; ctx.shadowBlur = 25; ctx.fillStyle = "#ffffff"; ctx.fillRect(r.l - 2, r.t - 2, r.w + 4, r.h + 4); ctx.shadowBlur = 0;
    ctx.drawImage(img, r.l, r.t, r.w, r.h);
    const t = hiTile?.floorId === f.id && hiTile.n;
    if (t) ctx.drawImage(hiTile.canvas, r.l + t.x0 * r.w, r.t + t.y0 * r.h, (t.x1 - t.x0) * r.w, (t.y1 - t.y0) * r.h);
    scheduleHiTile(f, img, r);
    ctx.save(); ctx.translate(r.l, r.t); ctx.scale(r.w, r.h);
    for (const m of markFloor(f.id)) if (isVisible(m)) drawMark(ctx, m, img.width, img.height, m.id === selectedId);
    drawDraft(ctx, img.width, img.height);
    ctx.restore();
    $("#zoomPct").textContent = Math.round(zoom * 100) + "%";
  }).catch((e) => console.error(e));
};

/* ---------- Shell wiring ---------- */
const _renderAll = renderAll;
renderAll = function () { _renderAll(); updatePlaceBar(); };
const _setMode = setMode;
setMode = function (next) { _setMode(next); updatePlaceBar(); };
const _selectFloor = selectFloor;
selectFloor = function (id) { _selectFloor(id); updatePlaceBar(); };
// Prefer vendored pdf.js (works offline), fall back to the CDNs app.js already knows.
const _ensurePdfJs = ensurePdfJs;
ensurePdfJs = async function () {
  if (window.pdfjsLib) return window.pdfjsLib;
  try {
    await loadScript("./vendor/pdf.min.js");
    if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.js"; return window.pdfjsLib; }
  } catch (e) { console.warn("Local pdf.js missing, using CDN", e); }
  return _ensurePdfJs();
};
// rotating a tablet / resizing into the narrow layout hides the inspector drawer instead of leaving it over the plan
let _wasNarrow = innerWidth <= 1050;
window.addEventListener("resize", () => { const n = innerWidth <= 1050; if (n && !_wasNarrow) $("#inspector")?.classList.add("hide-mobile"); _wasNarrow = n; });
window.ATLAS_PRO = { tile: () => hiTile && { scale: hiTile.scale, w: hiTile.canvas.width, h: hiTile.canvas.height }, nextId, placeCtx, voidRows, cableRows, macRows, previewResequence, pathLen }; // handy for tests/console
(async () => {
  try { // ask the browser to keep IndexedDB (iOS Safari otherwise may evict after ~7 days unused)
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch (e) { /* not supported */ }
  await boot();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)))
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Offline cache unavailable", e));
  updatePlaceBar();
})();
