# News Post Studio: operation and verification

## Architecture

Multi-circle state lives in `state.js`: stable session IDs, ordered circle records, active circle and explicit selected-ID set. The shared background/mask is separate. The existing single inspector accesses the active circle through state accessors, preserving one-circle controls without duplicating panels. `circle-list.js` keeps only 40px thumbnail canvases and updates them when their source changes. Selecting an item from Background mode returns to Move circle so the inspector shows that circle's own focal/zoom controls.

Circles render in array order, back to front; the UI list displays front first. Each layer independently receives its original-RGB Pop-out, then optional shared background-mask subtraction, then composites over prior layers. An unmasked lower circle can remain visible through an occluded upper circle: Smart Foreground removes only enabled circles, not unrelated layers. Two reusable scratch canvases serve every circle. Editor selection outlines are drawn afterward only on the preview, never by the exporter.

One cancellable worker processes missing masks sequentially. Multiple requests for the background share the resulting mask. Each circle's source revision guards its own result even if selection changes. Deletion invalidates the revision and closes its bitmap/mask. Explicit reprocessing replaces only that source's mask. If processing fails or is cancelled, previous usable state is retained and export reports any missing mask rather than silently omitting enabled effects.

There is no three-circle limit. Admission uses an estimated photo/mask working-set budget of 128–384 MiB (256 MiB when device memory is unknown), plus the existing per-image 25 MiB / 16 MP validation. Budget checks happen before decoding and reserve pending uploads. This estimate is not a guarantee of available system RAM or model memory; the browser does not expose a portable free-RAM API. Photos are never silently reduced to admit more circles. Remove an unused circle or choose a smaller original if admission fails. An empty upload slot remains when the last circle is removed.

Legacy tags are available for zero/one loaded circle only. With multiple photographs, circle-tag copying and combined-tag copying are disabled with an explanation. The background tag can still be copied independently. The unchanged Telegram/n8n workflow is not presented as supporting multi-circle masks.

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

`STUDIO_EXTRA_PHOTOS` may supply two semicolon-separated authorized local image paths for the multi-circle visual exports. Multi-circle checks exercise five-circle editing, selective/bulk effects, queue reuse, layer order, deletion cleanup and disabled legacy tags. The browser test compares all four one-circle effect combinations pixel-for-pixel against the original renderer at commit `8d8244850ec2639e94dc3579d0aeacb95f8bf4ba`; use a checkout containing that historical commit when running browser tests (production has no Git dependency). Real inference is not performed in this test suite; worker fixtures count processing calls separately from model asset downloads.

Checks cover default-off toggles, EXIF orientation, actual PNG downloads at both sizes, JPEG download, isolated/combined layer behavior, zero changes outside circle/border, original RGB under opaque masks, left/right layouts, manual correction, invalid metadata, stale decode/inference, mobile layout and no third-party requests during manual editing. The Pages workflow runs core tests before uploading the site. Full model quality and physical iOS/Android testing remain separate checks; do not infer them from Canvas tests.
