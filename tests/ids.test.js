// Run: node tests/ids.test.js  — exercises ids.js with the same snapshot/undo model as app.js
const assert = require("assert");
let state, editHistory = [];
const uid = (() => { let n = 0; return () => "u" + ++n; })();
const shortName = (f) => f?.name?.split(" · ")[0] || "Floor";
const snapshot = () => editHistory.push(JSON.stringify(state));
const undo = () => (state = JSON.parse(editHistory.pop()));
const save = () => {}, renderSidebar = () => {}, renderInspector = () => {}, requestPaint = () => {};
eval(require("fs").readFileSync(__dirname + "/../atlas-ids.js", "utf8"));
const reset = () => { state = { marks: [], floors: [{ id: "f1", level: 2, name: "Level 02 · Surgery" }] }; editHistory = []; };
const f = () => state.floors[0];
const place = () => { snapshot(); const c = placeCtx(), g = nextId("data", f(), c);
  const m = { id: uid(), kind: "data", floorId: "f1", label: g.label, tr: c.tr, panel: g.panel, port: g.port, cables: g.cables, x: .5, y: .5, createdAt: Date.now() };
  state.marks.push(m); return m; };
const del = (m) => { snapshot(); voidMark(m); state.marks = state.marks.filter((x) => x.id !== m.id); };
let t = 0; const test = (name, fn) => { reset(); fn(); console.log("✓", name); t++; };

test("panel letters A→B, Z→AA, AZ→BA, ZZ→AAA", () =>
  assert.deepStrictEqual(["A", "Z", "AZ", "ZZ"].map(nextPanelLetter), ["B", "AA", "BA", "AAA"]));
test("default template TR-PANEL-PORT rolls TR1-A-48 → TR1-B-01", () => {
  Object.assign(placeCtx(), { tr: "TR1", panel: "A", port: 48 });
  assert.strictEqual(place().label, "TR1-A-48"); assert.strictEqual(place().label, "TR1-B-01");
});
test("Z-48 rolls to AA-01", () => {
  Object.assign(placeCtx(), { tr: "TR1", panel: "Z", port: 48 });
  place(); assert.strictEqual(place().label, "TR1-AA-01");
});
test("deleted port is NOT reused; void entry recorded", () => {
  Object.assign(placeCtx(), { tr: "TR1", panel: "A", port: 1 });
  const a = place(); place(); del(a);
  assert.strictEqual(place().label, "TR1-A-03");
  assert.strictEqual(state.voidIds.length, 1);
  assert.deepStrictEqual([state.voidIds[0].id, state.voidIds[0].panel, state.voidIds[0].port], ["TR1-A-01", "A", 1]);
  assert.strictEqual(voidRows()[0].status, "Spare / no cable");
});
test("void ID is reserved even if counters reset (e.g. after resequence)", () => {
  Object.assign(placeCtx(), { tr: "TR1", panel: "A", port: 1 });
  del(place()); state.idCounters = {}; Object.assign(placeCtx(), { panel: "A", port: 1 });
  assert.notStrictEqual(place().label, "TR1-A-01");
  assert.ok(isDuplicateId("tr1-a-01"));
});
test("undo of delete removes the void entry and restores the drop", () => {
  Object.assign(placeCtx(), { tr: "TR1", panel: "A", port: 1 });
  const a = place(); del(a); undo();
  assert.strictEqual((state.voidIds || []).length, 0);
  assert.ok(state.marks.some((m) => m.label === "TR1-A-01"));
});
test("multi-cable drop voids each cable/port; voids never become marks (list-only)", () => {
  state.idSchemes = { data: { template: "{TR}-{FLOOR:00}-D{SEQ:000}", cables: 2 } };
  Object.assign(placeCtx(), { tr: "TR1", panel: "C", port: 48 });
  const a = place(); assert.deepStrictEqual(a.cables.map((c) => c.panel + c.port), ["C48", "D1"]);
  del(a);
  assert.deepStrictEqual(voidRows().map((v) => v.id), ["TR1-02-D001A", "TR1-02-D001B"]);
  assert.strictEqual(state.marks.length, 0);
});
test("restoreVoidId reuses a void ID manually, locks it, and undo brings the void back", () => {
  Object.assign(placeCtx(), { tr: "TR1", panel: "A", port: 1 });
  del(place()); const b = place();
  restoreVoidId(state.voidIds[0].vid, b);
  assert.deepStrictEqual([b.label, b.panel, b.port, b.idLocked, state.voidIds.length], ["TR1-A-01", "A", 1, true, 0]);
  undo(); assert.strictEqual(state.voidIds.length, 1);
});
test("resequence preview skips void + locked IDs", () => {
  state.idSchemes = { data: { template: "D{SEQ:000}", scope: "floor" } };
  const a = place(), b = place(), c = place(); del(a);
  const rows = previewResequence("data", "f1", "placed");
  assert.ok(!rows.some((r) => r.to === "D001"));
});
test("port-based resequence re-walks ports, skips voids, rolls panels", () => {
  Object.assign(placeCtx(), { tr: "TR1", panel: "A", port: 47, portsPerPanel: 48 });
  const a = place(), b = place(), c = place(); // A-47, A-48, B-01
  del(b);                                       // A-48 becomes void
  const rows = previewResequence("data", "f1", "placed", { panel: "A", port: 47 });
  assert.deepStrictEqual(rows.map((r) => r.to), ["TR1-A-47", "TR1-B-01"]);
  applyResequence(rows); assert.strictEqual(c.label, "TR1-B-01");
});
test("voids are list-only: plan render loop (state.marks) never sees them", () => {
  Object.assign(placeCtx(), { tr: "TR1", panel: "A", port: 1 });
  del(place());
  assert.ok(!state.marks.some((m) => m.label === "TR1-A-01") && state.voidIds.length === 1);
});
console.log(`${t} tests passed`);
