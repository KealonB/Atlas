# ATLAS v0.2 — Field Edition

Static, local-first spatial project twin for PDF floor plans and low-voltage field records. This update adds **multiple independent projects**, an **iPhone-friendly text note editor**, and a **Theme Studio** with preset and fully editable interface palettes.

## Important: update without losing your v0.1.1 work

1. **Before deploying**, open your CURRENT v0.1.1 ATLAS site in Safari or Chrome, choose **Project → Export project backup**, and save the `.atlas.json` file somewhere safe (Files/iCloud/Drive). Repeat for important jobs. Do not clear Safari website data.
2. **Use your existing GitHub repository and existing published URL.** Browser IndexedDB storage is scoped to the website origin. Moving to another domain or opening a local HTML preview will not show your existing projects automatically.
3. For a **single-file deployment**, rename `ATLAS_v0.2_Standalone.html` to `index.html` and replace your repository's old `index.html`. No other app files are needed for that deployment.
4. For a **multi-file deployment**, upload/replace `index.html`, `app.js`, `style.css`, and `manifest.webmanifest` from this ZIP at the root of your repository. Keep `.nojekyll` and the GitHub Actions workflow as included. The updated `index.html` uses `?v=0.2.0` cache-busting for CSS/JS.
5. Wait for GitHub Pages deployment, then reload your existing Pages site in **Safari**. ATLAS v0.2 automatically migrates the old active v0.1.1 project into its saved project library. This is a **one-time migration**; the previous `active` backup in IndexedDB is left intact for recovery.
6. Tap **Projects** to create a second job, return to the first job, and confirm the original six-floor demo or existing project records are present.
7. Tap **Theme** to open Theme Studio. Choose a preset or edit the 12 colors by swatch or six-digit hex code. Changes are a device-wide preference; the original PDF/symbol label colors are separate.
8. On any 2D floor, choose **Text**, tap the drawing, enter note text, adjust size/color and background, then choose **Place note**. With **Select** active, tap the note again to edit it. Notes can also be edited via the element properties button.

**Data safety:** ATLAS does not upload PDFs to GitHub. PDFs, markups, assets and project records remain in that browser's IndexedDB. Different devices will have different libraries. Export an `.atlas.json` backup for **each** project. To bring in a backup, use **Projects → Import backup**; this now creates a separate imported project, rather than replacing the current workspace.

## New in v0.2

- **Projects dashboard:** Create, list, open, and delete jobs without overwriting other saved work. Each job keeps independent floors, drawings, annotations and drop records. Deleting a job is permanent; export it first. Projects are selectable one at a time (not a split-screen multi-project view).
- **iPhone note editor:** A real textarea with a mobile keyboard, multiline text, text size, color, background plate and bold options. Save/cancel behavior keeps original notes safe. The note reopens by tapping it when Select is active.
- **Theme Studio:** Midnight, Blueprint, Stealth, Arctic, Sunset. Edit backgrounds, panels, surfaces, controls, borders, primary/secondary text, three accents, warning and error colors. All theme preferences saved locally and applied across projects. Your imported plan image and existing annotation colors are not silently changed.
- **Project-aware record links:** Copied links now include both project ID and annotation ID. They work on devices that have that same project ID locally.
- **Deployment improvement:** Cache-busted separate source assets and a standalone single-file site.

## Existing features retained

PDF upload with multiple pages, 2D pan/zoom and pins, exploded 2.5D floor stack, telecom/drop metadata, index/search, linework and clouds, CSV import/export, file/photo links, JSON project backups, and flattened as-built PDF output.

## Known limitations

- Not a true BIM model or Revit reader. The exploded view shows stacked 2D sheets.
- No multi-user accounts, live synchronization, cloud backups, automatic CAD object extraction, or actual team permissions. GitHub Pages serves public application code, **not** uploaded private project data.
- Browser local storage can be lost due to storage cleanup, changing domain, device reset or private browsing. Backups are crucial. If storage is blocked, a **SESSION-ONLY** warning appears.
- PDF.js is fetched from a CDN for PDF import on demand; this may require connectivity. The source PDF content remains local.
- The original 2D/3D viewer and as-built PDF export are prototype-quality; verify all dimensions and print fidelity before relying on an exported package for construction.
- Uploaded PDF pages have been tested in earlier v0.1.1; not every vendor PDF or iPhone/Safari combination has been tested in v0.2.
- Theme customization covers the application's semantic UI palette, not every intrinsic browser control, diagram icon or source drawing pixel.

## GitHub Pages (multi-file version)

Repository files:

- `index.html`: main entry
- `app.js`: no-build JavaScript application
- `style.css`: application and theme styling
- `manifest.webmanifest`: PWA manifest metadata
- `.nojekyll` and `.github/workflows/deploy.yml`: GitHub Pages GitHub Actions deployment

Settings → Pages → Source: GitHub Actions, then push to `main`. Alternatively select branch deploy / root if your repository uses it.

## Test coverage

Chromium browser tests verified demo start, dashboard, second-project creation/switching/deletion, isolation and preservation of note records between jobs, note editor edits and colors, five theme presets and custom color application, small-screen modal visibility, and a real touch-size canvas placement workflow. These tests were run in a browser context with **temporary session storage** because local browser navigation was restricted, so persistence on real GitHub Pages/Safari must still be confirmed on your device. Source checked with `node --check`. These are prototype checks, not exhaustive cross-device QA.
