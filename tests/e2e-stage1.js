const { chromium } = require("playwright-core");
const URL = process.env.ATLAS_URL || "http://127.0.0.1:8080/";
const PRINT = process.env.ATLAS_TEST_PDF; // any large single-page print, e.g. a 36x24 sheet
const SHOTS = __dirname + "/../shots/";
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("✓", m); };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(URL); await page.waitForSelector("#planCanvas"); await page.waitForTimeout(800);
  await page.evaluate(() => createNewProject("Drop ID test"));
  await page.waitForTimeout(500);
  await page.setInputFiles("#pdfInput", PRINT);
  await page.waitForSelector("[data-modal-action='1']", { timeout: 20000 });
  await page.click("[data-modal-action='1']");
  await page.waitForFunction(() => state.floors.length === 1 && floorImages.size > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const fl = await page.evaluate(() => ({ w: state.floors[0].pdfW, h: state.floors[0].pdfH }));
  assert(fl.w === 2592 && fl.h === 1728, `PDF page size read as ${fl.w}x${fl.h} pt (36x24 in)`);
  await page.fill("[data-pctx='tr']", "TR1"); await page.fill("[data-pctx='panel']", "A"); await page.fill("[data-pctx='port']", "1");
  await page.waitForTimeout(200);
  assert((await page.textContent("#pbNext")) === "TR1-A-01", "placement bar previews TR1-A-01");
  await page.screenshot({ path: SHOTS + "01-desktop-print-imported.png" });
  await page.click("[data-tool='data']");
  const box = await page.evaluate(() => { const c = $("#planCanvas").getBoundingClientRect(); return Promise.resolve(floorImages.get(byFloor().id)).then((img) => { const r = drawingRect(img); return { x: c.left + r.l, y: c.top + r.t, w: r.w, h: r.h }; }); });
  for (let i = 0; i < 50; i++) {
    const cx = box.x + box.w * (0.08 + (i % 10) * 0.09), cy = box.y + box.h * (0.12 + Math.floor(i / 10) * 0.17);
    await page.mouse.click(cx, cy); await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
  const labels = await page.evaluate(() => state.marks.filter((m) => m.kind === "data").map((m) => m.label));
  const expect = [...Array(48)].map((_, i) => "TR1-A-" + String(i + 1).padStart(2, "0")).concat(["TR1-B-01", "TR1-B-02"]);
  assert(JSON.stringify(labels) === JSON.stringify(expect), "50 drops: TR1-A-01..TR1-A-48 then TR1-B-01, TR1-B-02");
  assert((await page.textContent("#pbNext")) === "TR1-B-03", "next ID preview is TR1-B-03");
  await page.screenshot({ path: SHOTS + "02-desktop-50-drops.png" });
  // zoom sharpness view
  await page.evaluate(() => { changeZoom(6, { x: stageW * 0.3, y: stageH * 0.3 }); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS + "03-desktop-zoom6x.png" });
  await page.click("#fitBtn"); await page.waitForTimeout(400);
  // delete TR1-A-10 via the inspector
  await page.click("[data-tool='select']");
  await page.evaluate(() => { selectedId = state.marks.find((m) => m.label === "TR1-A-10").id; renderInspector(); requestPaint(); });
  await page.click("#deleteMark"); await page.waitForTimeout(300);
  let s = await page.evaluate(() => ({ marks: state.marks.map((m) => m.label), voids: state.voidIds }));
  assert(!s.marks.includes("TR1-A-10") && s.voids.length === 1 && s.voids[0].id === "TR1-A-10" && s.voids[0].panel === "A" && String(s.voids[0].port) === "10", "delete keeps TR1-A-10 as a spare entry (panel A, port 10)");
  assert(s.voids[0].note === "No cable - drop deleted", "spare note: 'No cable - drop deleted'");
  await page.click("[data-tool='data']");
  await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.93); await page.waitForTimeout(200);
  assert(await page.evaluate(() => state.marks.at(-1).label) === "TR1-B-03", "next placement is TR1-B-03 (deleted port not reused)");
  await page.click("#undoBtn"); await page.waitForTimeout(300);   // undo placement
  await page.click("#undoBtn"); await page.waitForTimeout(300);   // undo delete
  s = await page.evaluate(() => ({ marks: state.marks.map((m) => m.label), voids: state.voidIds || [] }));
  assert(s.marks.includes("TR1-A-10") && s.voids.length === 0, "undo of delete restores TR1-A-10 and removes the spare entry");
  await page.click("#redoBtn"); await page.waitForTimeout(300);
  assert(await page.evaluate(() => (state.voidIds || []).length === 1), "redo puts the spare entry back");
  // spare shows only in index, never as a mark on the plan
  assert(await page.evaluate(() => !state.marks.some((m) => m.label === "TR1-A-10")), "spare ID is not a plan mark (list-only)");
  await page.click("[data-mode='index']"); await page.waitForTimeout(300);
  const voidRow = await page.locator(".void-row").count();
  const rowText = await page.locator(".void-row").first().innerText();
  assert(voidRow === 1 && /TR1-A-10/.test(rowText) && /Spare \/ no cable/.test(rowText), "Drop Index shows greyed 'Spare / no cable' row for TR1-A-10");
  await page.screenshot({ path: SHOTS + "04-desktop-drop-index-spare.png" });
  await page.selectOption("#statusFilter", "void"); await page.waitForTimeout(200);
  await page.screenshot({ path: SHOTS + "05-desktop-index-spares-filter.png" });
  const csv = await page.evaluate(() => getCSV());
  assert(/"TR1-A-10","spare"/.test(csv), "CSV export includes the spare row");
  // duplicate warning + lock
  await page.click("[data-mode='2d']"); await page.click("[data-tool='select']");
  await page.evaluate(() => { selectedId = state.marks.find((m) => m.label === "TR1-A-11").id; renderInspector(); });
  await page.fill("[data-field='label']", "TR1-A-12"); await page.dispatchEvent("[data-field='label']", "change"); await page.waitForTimeout(200);
  const toast = await page.textContent("#toast");
  assert(/already used/.test(toast), "duplicate label warning shown: " + toast.trim());
  assert(await page.evaluate(() => state.marks.find((m) => m.label === "TR1-A-12" && m.idLocked) != null), "manually edited ID is locked");
  await page.click("#undoBtn"); await page.waitForTimeout(200);
  assert(await page.evaluate(() => state.marks.some((m) => m.label === "TR1-A-11")), "label edit is undoable");
  // renumber preview modal
  await page.evaluate(() => { const m = state.marks.find((x) => x.label === "TR1-A-01"); m.x = 0.93; m.y = 0.93; });
  await page.click("#pbRenumber"); await page.waitForTimeout(300);
  await page.selectOption("#rnOrder", "spatial"); await page.waitForTimeout(200);
  await page.screenshot({ path: SHOTS + "06-desktop-renumber-preview.png" });
  const rnRows = await page.locator("#rnTable tbody tr").count();
  console.log("  renumber preview rows (spatial order):", rnRows);
  await page.click("#modalClose");
  assert(rnRows > 0, "spatial renumber preview lists changes after moving TR1-A-01 to the bottom-right");
  assert(await page.evaluate(() => state.marks.some((m) => m.label === "TR1-A-11")), "closing preview changes nothing");
  // quick-fix checks
  const qf = await page.evaluate(async () => ({ persisted: await navigator.storage.persisted?.(), pathFn: typeof pathLen }));
  console.log("  storage.persisted():", qf.persisted, "(headless may deny; the request is made at startup)");
  // phone + tablet
  for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }], ["tablet-landscape", { width: 1180, height: 820 }]]) {
    await page.setViewportSize(vp); await page.waitForTimeout(500);
    await page.click("[data-mode='2d']").catch(() => {}); await page.waitForTimeout(400);
    await page.screenshot({ path: SHOTS + `07-${name}-plan.png` });
    const hidden = await page.evaluate(() => { const b = $("#addPdfBtn").getBoundingClientRect(); return b.right > innerWidth + 1; });
    assert(!hidden, `${name}: Import button fully on screen`);
    const offscreenTools = await page.evaluate(() => $$(".tool").filter((t) => { const r = t.getBoundingClientRect(); return r.right > innerWidth + 1 || r.width === 0; }).length);
    assert(offscreenTools === 0, `${name}: all ${await page.locator(".tool").count()} tools reachable without sideways scroll`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("[data-mode='index']"); await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + "08-phone-drop-index.png" });
  console.log("console errors:", errors.length ? errors : "none");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
