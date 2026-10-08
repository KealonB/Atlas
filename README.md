# ATLAS — Spatial Project Twin (Prototype v0.1)

A working, **local-first** PDF project viewer and field as-built prototype intended for electrical, low-voltage, ICT, and hospital project teams. Static website: no backend, no paid service, no account required. Start in a **six-floor sample building**, or make a new project and load your own PDF floor sheets.

## Features in v0.1

- Import local PDF sheets; assign multiple pages to individual building floors.
- Zoom/pan 2D plans with mouse, wheel, or touch. Click to add or move symbols.
- Interactive, orbitable **2.5D exploded stack of floor-plan images**: click a floor to navigate to it. This is NOT reconstructed 3D BIM geometry.
- Symbols for data, wireless APs, cameras, card readers, fiber/coax outlets, telecom rooms, sleeves, pull boxes and text.
- As-built, Design, and Redline toggles, color and label size editing, notes, status, telecom room, patch panel, port and cable ID.
- Draw cable paths, rectangles for revision areas, and dimension lines after per-floor scale calibration.
- Attach photos to individual field records.
- Search all records and navigate to a map pin. Clickable drop index with CSV import/export.
- Export all sheets into a **flattened high-resolution PDF** (not original vector PDF). Exports include visible markups and labels.
- Export/import a **complete project backup** (`.atlas.json`) including original PDFs and linked photos.
- Browser IndexedDB storage; automatic local saves, no server-side upload. Deep links resolve when the destination project is present locally.

## Publish to GitHub Pages, directly from your iPhone, Windows PC or Mac

1. Create a **new GitHub repository** (for example `atlas-twin`). Public GitHub Pages hosting serves the app code; your imported project files stay in browser storage.
2. Upload **all** the files from this repository, including `index.html`, `app.js`, `style.css`, `manifest.webmanifest`, `.nojekyll`, and `.github/workflows/deploy.yml` to the repository root.
3. In **Settings → Pages**, choose **GitHub Actions** under *Build and deployment* (the included workflow publishes automatically when you commit to `main`).
4. Open the Pages URL after the workflow is complete (typically `https://YOURUSERNAME.github.io/atlas-twin/`). Or, for manual publishing, choose deploy from the `main` branch root if GitHub offers it.

For a quick local test, serve the folder using `python3 -m http.server 8080`, then open `http://localhost:8080`. The six-floor demo runs without external libraries. **PDF import needs an internet connection to load Mozilla PDF.js from a CDN** when first used; original PDF files are not transmitted to that CDN. PDF.js is loaded as code, not with the content of your plans.

## Field usage

1. Select **Project → New empty project** to leave the demo. Click **Import PDFs**; choose which pages represent floors. For a PDF containing multiple sheets, name them individually.
2. Click a floor in the left navigator or switch to **Spatial 3D** and click a floor slab.
3. Select a symbol in the bottom toolbar and tap the drawing. Select the new symbol to edit its identifier, font/label size, color, TR, panel, port, status, and notes.
4. Use **Path** and tap multiple points, then Finish. For distances, calibrate the floor using two known endpoints, then use Measure.
5. Use **Project → Export as-built PDF**, **Export drop index CSV**, and **Export project backup** regularly.
6. For a backup on a new device, **Project → Restore project backup** and choose the `.atlas.json` file.

## Caveats and next versions

This prototype is a single-device, local database, not yet suitable as the sole system of record for critical installations. Browsers can remove stored data, private mode can block storage, and the location URL does not synchronize content. Daily backups are essential. Markup exports are rasterized. Real 3D model geometry, collision detection, user accounts, authentication, multi-user merges, CAD/Revit/IFC import, automatic floor alignment, native iOS/Android packaging, audit-grade revisions and permissions are future upgrades. Manual per-floor alignment offsets in the prototype are visual only. The browser session has access to files in memory; it is not cryptographically encrypted by ATLAS.

## Design / tech

- Framework-free HTML, CSS, and JavaScript (no build process required).
- Local IndexedDB storage.
- HTML Canvas viewer and drawing coordinate system normalized to each PDF page.
- CSS 3D layered floor assembly with mouse orbit, zoom, touch controls.
- PDF.js from a CDN, only on PDF import.
- Native PDF 1.4 file writer: JPEG image XObjects + visible annotation layers flattened into output.
- GitHub Actions Pages deployment included.

The included sample project uses **synthetic demo plans** and is **not to be used for construction**.

### No-build single-file option

The separately supplied `ATLAS_Standalone_GitHub.html` has the full CSS and JavaScript embedded. Rename it `index.html`, upload it to the root of a GitHub repository, and use **Settings → Pages → Deploy from a branch → main / (root)** when available. It runs on GitHub Pages without a build step. You still need internet the first time you import a PDF to load PDF.js.
