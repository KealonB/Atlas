// Synthetic rotated multi-page test print (generated locally, git-ignored)
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");
(async () => {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (const rot of [90, 0, 270]) {
    const W = 2160, H = 3024, p = doc.addPage([W, H]); p.setRotation(degrees(rot));
    for (let x = 0; x <= W; x += 72) p.drawLine({ start: { x, y: 0 }, end: { x, y: H }, thickness: x % 720 ? 0.25 : 1, color: rgb(0.6, 0.6, 0.7) });
    for (let y = 0; y <= H; y += 72) p.drawLine({ start: { x: 0, y }, end: { x: W, y }, thickness: y % 720 ? 0.25 : 1, color: rgb(0.6, 0.6, 0.7) });
    p.drawText(`SYNTHETIC SHEET  /Rotate ${rot}`, { x: 100, y: H - 160, size: 60, font });
    p.drawText("ORIGIN (user-space 0,0)", { x: 20, y: 20, size: 30, font, color: rgb(0.8, 0, 0) });
    for (let i = 0; i < 400; i++) p.drawText(`tiny 4pt note ${i}`, { x: 100 + (i % 20) * 96, y: 300 + Math.floor(i / 20) * 40, size: 4, font });
  }
  require("fs").writeFileSync(__dirname + "/synth-rotated.pdf", await doc.save());
  console.log("ok");
})();
