/* ---- Drop / cable ID engine (drop-in for app.js) ---- */
const ID_DEFAULTS = {
  data:   { template: "{TR}-{PANEL}-{PORT:00}", start: 1, step: 1, scope: "tr",    cables: 1, suffixes: "ABCD" },
  _other: { template: "{KIND}-{SEQ:00}", start: 1, step: 1, scope: "floor", cables: 1, suffixes: "ABCD" },
};
function idScheme(kind) {
  state.idSchemes ||= {};
  return { ...(ID_DEFAULTS[kind] || ID_DEFAULTS._other), ...state.idSchemes[kind] };
}
// Context the user sets once while marking up (sticky "placement bar"): TR, room, panel, next port.
function placeCtx() {
  return (state.placeCtx ||= { tr: "", room: "", panel: "A", port: 1, portStep: 1, portsPerPanel: 48 });
}
// Panel letters: A..Z, then AA, AB.. AZ, BA.. (spreadsheet-column style). "" stays "".
function nextPanelLetter(p) {
  if (!/^[A-Z]+$/i.test(p || "")) return p || "A";
  const chars = p.toUpperCase().split("");
  let i = chars.length - 1;
  while (i >= 0 && chars[i] === "Z") chars[i--] = "A";
  if (i < 0) chars.unshift("A"); else chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
  return chars.join("");
}
// Advance panel/port by n ports with rollover: TR1-A-48 -> TR1-B-01, Z-48 -> AA-01.
function advancePort(ctx, n = 1) {
  const per = Number(ctx.portsPerPanel) || 48, step = Number(ctx.portStep) || 1;
  let port = Number(ctx.port) || 1, panel = ctx.panel;
  for (let i = 0; i < n; i++) {
    port += step;
    if (port > per) { port = 1; panel = nextPanelLetter(panel); }
  }
  ctx.port = port; ctx.panel = panel;
}
function formatId(tpl, t) {
  return tpl
    .replace(/\{(\w+)(?::(0+))?\}/g, (_, k, pad) => {
      const v = t[k.toUpperCase()];
      if (v == null || v === "") return "";
      return pad && /^\d+$/.test(String(v)) ? String(v).padStart(pad.length, "0") : String(v);
    })
    .replace(/--+/g, "-").replace(/^-|-$/g, ""); // tidy when a token (e.g. {TR}) is blank
}
function idScopeKey(kind, s, f, ctx) {
  return kind + "|" + (s.scope === "project" ? "*" : s.scope === "tr" ? ctx.tr || "-" : f.id);
}
function usedIds(exceptId) {
  const set = new Set();
  for (const m of state.marks) {
    if (m.id === exceptId) continue;
    if (m.label) set.add(m.label.trim().toUpperCase());
    for (const c of m.cables || []) if (c.id) set.add(c.id.trim().toUpperCase());
  }
  for (const v of state.voidIds || []) set.add(v.id.trim().toUpperCase()); // deleted IDs stay reserved
  return set;
}
function tokensFor(kind, f, ctx, seq) {
  return { SEQ: seq, FLOOR: f.level, LEVEL: f.level, SHEET: shortName(f), TR: ctx.tr, IDF: ctx.tr,
           ROOM: ctx.room, PANEL: ctx.panel, PORT: ctx.port, KIND: kind.toUpperCase() };
}
// Returns the next free ID and advances counters. Call AFTER snapshot() so Undo also rewinds counters.
function nextId(kind, f, ctxIn = placeCtx(), { peek = false } = {}) {
  const s = idScheme(kind);
  state.idCounters ||= {};
  const ctx = peek ? { ...ctxIn } : ctxIn; // peek walks a copy so the preview never moves the real counters
  const key = idScopeKey(kind, s, f, ctx);
  const used = usedIds();
  const byPort = /\{PORT/i.test(s.template) && !/\{SEQ/i.test(s.template);
  let seq = state.idCounters[key] ?? s.start, label, guard = 0;
  // On a collision (live, locked or spare/void ID) skip forward: by port/panel if the ID is port-based, else by SEQ.
  do {
    label = formatId(s.template, tokensFor(kind, f, ctx, seq));
    if (!used.has(label.toUpperCase())) break;
    if (byPort) advancePort(ctx); else seq += s.step;
  } while (++guard < 10000);
  if (guard >= 10000) return { label: null, seq, cables: [], panel: ctx.panel, port: ctx.port };
  // Each cable of a multi-cable drop takes its own port (and can roll to the next panel).
  const start = { panel: ctx.panel, port: ctx.port }, walk = { ...ctx }, cables = [];
  if (s.cables > 1)
    for (let i = 0; i < s.cables; i++) {
      cables.push({ id: label + (s.suffixes[i] || i + 1), panel: walk.panel, port: walk.port, status: "planned" });
      advancePort(walk);
    }
  if (!peek) state.idCounters[key] = seq + s.step;
  if (!peek && kind === "data" && ctx.port !== "" && !isNaN(ctx.port)) advancePort(ctx, Math.max(1, s.cables));
  return { label, seq, cables, panel: start.panel, port: start.port };
}
function isDuplicateId(label, exceptId) {
  return !!label && usedIds(exceptId).has(label.trim().toUpperCase());
}
// Renumber: returns a preview list; apply only after the user confirms it.
// SEQ templates renumber from opts.start; port-based templates re-walk ports from opts.panel/opts.port (A-01 by default).
function previewResequence(kind, floorId, order = "placed", opts = {}) {
  const f = state.floors.find((x) => x.id === floorId);
  const s = { ...idScheme(kind), ...opts };
  const byPort = /\{PORT/i.test(s.template) && !/\{SEQ/i.test(s.template);
  const list = state.marks.filter((m) => m.kind === kind && m.floorId === floorId && !m.idLocked);
  const band = 0.04; // reading order: rows top-to-bottom, then left-to-right
  list.sort(order === "placed" ? (a, b) => a.createdAt - b.createdAt
    : (a, b) => Math.round((a.y ?? 9) / band) - Math.round((b.y ?? 9) / band) || (a.x ?? 9) - (b.x ?? 9));
  const reserved = new Set([...state.marks.filter((m) => !list.includes(m)).map((m) => m.label),
                            ...(state.voidIds || []).map((v) => v.id)].filter(Boolean).map((x) => x.toUpperCase()));
  const walk = { ...placeCtx(), panel: opts.panel || "A", port: opts.port || 1 };
  let seq = s.start;
  return list.map((m) => {
    let to, panel = m.panel, port = m.port, guard = 0, cablePorts = [];
    do {
      cablePorts = [];
      if (byPort) { panel = walk.panel; port = walk.port; for (let i = 0; i < Math.max(1, m.cables?.length || 1); i++) { cablePorts.push({ panel: walk.panel, port: walk.port }); advancePort(walk); } }
      to = formatId(s.template, tokensFor(kind, f, { tr: m.tr, room: m.room, panel, port }, seq));
      if (!byPort) seq += s.step;
    } while (reserved.has(to.toUpperCase()) && ++guard < 10000);
    reserved.add(to.toUpperCase());
    return { id: m.id, from: m.label, to, panel, port, cablePorts };
  });
}
function applyResequence(rows) {
  snapshot();
  for (const r of rows) {
    const m = state.marks.find((x) => x.id === r.id);
    if (!m) continue;
    const old = m.label;
    m.label = r.to; m.panel = r.panel; m.port = r.port;
    m.cables = (m.cables || []).map((c, i) => ({ ...c, id: c.id.startsWith(old) ? r.to + c.id.slice(old.length) : c.id, ...(r.cablePorts?.[i] || {}) }));
    m.updatedAt = Date.now();
  }
  state.idCounters = {}; // counters re-derive via the duplicate skip
  save(); renderSidebar(); renderInspector(); requestPaint();
}

/* ---- Void (reserved) IDs: deleted drops keep their ID/port documented as "Spare / no cable" ---- */
// Call inside deleteSelected() AFTER snapshot() and BEFORE removing the mark, so Undo also removes the void entry.
function voidMark(m, note = "No cable - drop deleted") {
  state.voidIds ||= [];
  const base = { tr: m.tr || "", floorId: m.floorId, kind: m.kind, deletedAt: Date.now(), note };
  const entries = m.cables?.length
    ? m.cables.map((c) => ({ ...base, id: c.id, drop: m.label, panel: c.panel ?? m.panel ?? "", port: c.port ?? m.port ?? "" }))
    : m.label ? [{ ...base, id: m.label, drop: m.label, panel: m.panel || "", port: m.port || "" }] : [];
  state.voidIds.push(...entries.map((e) => ({ ...e, vid: uid() })));
  return entries.length;
}
// Manually reuse a void ID: removes the reservation and returns its data to apply to a mark.
function restoreVoidId(vid, targetMark) {
  const v = (state.voidIds || []).find((x) => x.vid === vid);
  if (!v) return null;
  snapshot();
  state.voidIds = state.voidIds.filter((x) => x.vid !== vid);
  if (targetMark) {
    Object.assign(targetMark, { label: v.drop || v.id, tr: v.tr, panel: v.panel, port: v.port, idLocked: true, updatedAt: Date.now() });
    targetMark.cables = (targetMark.cables || []).filter((c) => c.id !== v.id);
    if (v.drop && v.drop !== v.id) targetMark.cables.push({ id: v.id, panel: v.panel, port: v.port, status: "planned" });
  }
  save(); renderSidebar(); renderInspector(); requestPaint();
  return v;
}
// Rows for the Drop Index table and the export (Drop Index + Cable Schedule pages).
function voidRows() {
  return (state.voidIds || []).map((v) => ({
    vid: v.vid, id: v.id, drop: v.drop, tr: v.tr, panel: v.panel, port: v.port, kind: v.kind,
    sheet: shortName(state.floors.find((f) => f.id === v.floorId)), status: "Spare / no cable", note: v.note, deletedAt: v.deletedAt,
  }));
}
