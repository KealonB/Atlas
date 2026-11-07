const { PDFDocument } = require("pdf-lib");
(async () => { const d = await PDFDocument.load(require("fs").readFileSync(process.argv[2])); console.log(JSON.stringify({ pages: d.getPages().map((p) => ({ w: Math.round(p.getWidth()), h: Math.round(p.getHeight()), rot: p.getRotation().angle })) })); })();
