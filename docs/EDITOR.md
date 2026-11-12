# News Post Studio: operation and verification

## Architecture

Static ES modules and CSS run directly on GitHub Pages, without a build or backend. `images.js` owns header validation, EXIF-oriented decode, original image lifetimes and lossless inference inputs. `geometry.js` defines canonical 1080×1350 coordinates. `masks.js` keeps Float32 working alpha with a bounded one-operation undo. `render.js` uses the same transformations/layer order for preview and export. `mask-editor.js` edits only alpha. `segmentation.js` owns one cancellable worker. `app.js` coordinates source revisions and UI state.

Original RGB → background → circle + white border → optional original-RGB circle cutout → subtract background alpha from the entire inset layer → export. No player RGB is synthesized, recolored or substituted by inference. Subject-area selection only changes inference input, never the chosen photo layout. The existing MODNet consensus method is **not** automatically run or generalized from a single photograph.

## Image and mask contract

Input: JPEG, PNG, non-animated WebP; up to 25 MiB and 16 MP, checked before decode. Original files/bitmaps remain available for final rendering. Lossless inference inputs have a maximum 1600-pixel long side; working masks have a maximum 2048-pixel long side. Canvas maps them back through the exact original image transform. Browser color conversion and interpolation still occur; this is not an archival ICC workflow. Model alpha starts at the precision the provider returns; Float32 editing does not recreate lost model precision.

For a background or circle imported mask, select a PNG and sidecar JSON. Use **Get source metadata** for the exact loaded source. The contract is:

```json
{
  "version": 1,
  "coordinates": "oriented-full-source",
  "orientation": "browser-exif-normalized",
  "encoding": "gray8",
  "sourceSha256": "SHA256_OF_EXACT_UPLOADED_FILE",
  "sourceWidth": 707,
  "sourceHeight": 1000
}
```

The PNG dimensions must match the oriented full-resolution source. `gray8` is opaque grayscale (white foreground); `alpha8` uses transparency. The producer must truthfully supply metadata; a same-size dishonest transform cannot be inferred from the pixels. Legacy transparent cutout import checks dimensions and actual transparency, but has no authenticated source identity: inspect alignment. A changing source invalidates pending masks, while failed uploads retain the previous usable photo.

## Performance / limitations

The editor keeps only the current decoded photos, masks and one undo per mask. Preview uses a 540×675 canvas with canonical geometry. Exports draw originals at 1080×1350 or 2160×2700. Scratch canvases are released after export. Optional ISNet runs in a worker, one model at a time; cancellation and completion terminate the worker to release the runtime. Cached downloads may be reused by the browser. There is no claim that Compact inference fits every 4 GB device. Import/manual workflows avoid model memory entirely.

ISNet's general foreground segmentation can include spectators or lose hands. Keep person is connected-component selection, not a semantic identity detector. It may remove disconnected hands. Subject area and brush correction are explicit human controls, not a claimed automatic accuracy improvement. Soft original edge pixels may retain background contamination; no invented decontaminated RGB is generated. Mobile file sharing depends on browser capability; download is the fallback.

## Reproduce focused verification

No production dependency installation or build is needed. Node 22+: `node --test tests/core.test.mjs`. Syntax: `node --check docs/js/app.js` (and the other modules).

For browser tests, use an existing Playwright installation or install it as an **optional development tool** (`npm install --no-save playwright@1.64.1`, then `npx playwright install chromium`). Run `node tests/browser.mjs`. This starts an ephemeral loopback test server and a headless browser, then closes both. It does not start Final Whistle or run model inference. Test outputs stay in ignored `.test-output/`.

Optional environment variables `STUDIO_PHOTO`, `STUDIO_MASK`, `STUDIO_META` point to authorized local photo/mask fixtures; these files are not copied into Git. `STUDIO_PROBE=1` verifies the actual pinned library import in a worker, without inference. `STUDIO_BASE_URL` runs the same browser checks against a deployed site. A deterministic test worker verifies cancellation/stale results; this is explicitly **not** a real segmentation benchmark.

Checks cover default-off toggles, EXIF orientation, actual PNG downloads at both sizes, JPEG download, isolated/combined layer behavior, zero changes outside circle/border, original RGB under opaque masks, left/right layouts, manual correction, invalid metadata, stale decode/inference, mobile layout and no third-party requests during manual editing. The Pages workflow runs core tests before uploading the site. Full model quality and physical iOS/Android testing remain separate checks; do not infer them from Canvas tests.
