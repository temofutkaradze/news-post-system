# Browser editor licenses and sources

News Post Studio browser editor in `docs/`: Copyright (C) 2026 temofutkaradze, AGPL-3.0-or-later. Modified from the owner's public crop picker, revision ba036b7c1ead0ebe75049b60a26c0f4926edae55. The original crop picker is retained for compatibility. The unrelated n8n workflow and launcher are unchanged; this notice does not invent licenses for third-party photographs or assets.

The complete preferred-form source and deployment instructions are available at https://github.com/temofutkaradze/news-post-system . Browser modules are shipped unminified, with no private build tools or dependencies needed to reproduce the site. See `AGPL-3.0.md` for license and warranty terms.

## Optional automatic masking (loaded on request)

- `@imgly/background-removal` **1.5.5**, IMG.LY GmbH, AGPL-3.0: https://www.npmjs.com/package/@imgly/background-removal/v/1.5.5 . Source: https://github.com/imgly/background-removal-js . Exact published license: https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/LICENSE.md . The full license is included here.
- The publisher's matching model/runtime distribution is `@imgly/background-removal-data/1.5.5`, loaded from https://staticimgly.com/@imgly/background-removal-data/1.5.5/dist/ . Its own published license at https://staticimgly.com/@imgly/background-removal-data/1.5.5/LICENSE.md is GNU AGPL v3. We use the publisher's own `isnet_quint8` and `isnet_fp16` assets through its API; no separately converted weights or models are redistributed in this repository.
- Exact publisher notices are preserved in `IMG-LY-ThirdPartyLicenses.json`. They identify ONNX Runtime Web, lodash, ndarray and zod as MIT and ISNET as MIT, linking to https://github.com/xuebinqin/DIS . These are publisher declarations, not independent relicensing of model weights. Upstream DIS code/model license notices differ; do not extract or redistribute converted weights independently based only on this summary. Consult upstream and publisher source when changing models or redistributing assets.
- No MODNet weights, runtime or inference code are shipped. Imported externally generated masks are user data. This release makes no new MODNet deployment license claim.

The browser downloads static assets, not cloud inference. Users can operate without that package using mask imports and local correction. Photographs are not sent to a CDN.
