# Continue model development on the M4

Work in this independent `kithmoot-vision` repository. KithMoot consumes the
library; application permissions and call controls belong in that application.
The code and intended releasable weights are MIT. Keep inference local and
portable across Rust/native/WASM. Do not introduce vendor pretrained weights,
Google vision SDKs, telemetry or mandatory hosted inference.

## Current evidence

The review/import/train/evaluate/export pipeline and Rust/WASM parity have
synthetic-fixture checks. No useful real-camera model, qualified weights or
new application runtime is delivered by this review-tooling change. The current
training graph is still 160 × 96; useful accuracy needs data and architecture
work, followed by measurements on actual devices.

The first real-video frame has a retained human label acceptance. That verdict
does not approve source use. A second local batch contains ten pending examples:

- Three later frames from the same video, with manual head boxes and
  polygon-seeded classical GrabCut foreground drafts.
- Four existing synthetic composites showing a mug or book in two rooms.
- One deterministic two-person composite using those same cutouts.
- Two empty-room negatives with zero face boxes and zero foreground.

The generated alpha is a draft, not verified physical matting truth. Inspect
hair, ears, hands, held objects, transparent gaps, fringes and opaque interiors.
The video masks are binary and cannot establish soft hair-matting quality.

The local `data/` directory is ignored and is transferred separately from Git.
It contains source notes, hashes, labels, previews and retained feedback. Its
root `README.txt` and `label-batch-20261019/README.txt` explain the local files;
`label-batch-20261019/source-readiness.md` records published source evidence and
the decisions still missing. No source in this batch has entered training.

## First action on the M4

From this repository, open the prepared standalone page:

```sh
open -a Safari data/label-batch-20261019/review.html
```

No server or dependency installation is needed to review this page. Use
**Looks good** or **Needs changes** for each example, add correction notes and
choose **Next**. **Save all reviews** downloads the completed decisions and
lists unfinished examples. Retain that JSON with the batch. Browser storage is
helpful, but a saved file is the portable review record. Do not click verdicts
on the human's behalf or turn label feedback into source approval.

The MIT recipe and generator can reproduce the pending batch from retained
inputs; see [the recipe](../recipes/review-batch-20261019/README.md) and
[Model Workshop](../workshop/README.md). Existing output directories are
preserved unless an explicit supported overwrite option is supplied.

## Then work towards the first real-data baseline

1. Retain human feedback and correct rejected labels. Record the applicable
   source-use basis before admitting examples for training or MIT weights.
   Keep the Sunburst output assessment distinct from a CC0 declaration.
2. Acquire independently sourced people and scenes for validation and held-out
   testing. The entire video is one connected group. All synthetic pilot
   derivatives are another connected group. Two groups cannot supply three
   independent splits. New frames, crops or backgrounds from connected inputs
   do not become independent test data.
3. Use Model Workshop to approve sources and selected labels, assign groups
   and export reviewed training data. Its Python importer repeats rights,
   dimensions and split-leakage checks. Batch-feedback JSON is not a training
   export and must not bypass that importer.
4. Train an experimental baseline locally with Apple Metal/MPS using the
   commands in Model Workshop's README. Reuse a suitable existing Python
   environment where possible. Keep checkpoints, data and environments out
   of Git, and do not overwrite runs.
5. Measure held-out face misses/false positives, foreground leakage, boundary
   quality, held-object retention and temporal flicker. Compare model capacity
   and resolution before calling the model capable. Then qualify exported
   Rust/WASM inference and latency on laptop, iPhone and Android cameras.

Review tooling has local Chromium coverage for per-example decisions,
partial exports, disabled storage, revised labels and permission-flag isolation.
CI additionally enables WebKit and the complete synthetic training/parity
round-trip. These checks are pipeline evidence, not real-camera acceptance.

Do not start a training run merely to demonstrate activity while approved data
or independent evaluation is missing. Preserve unrelated work, reuse
`runtime/target`, and remove only scratch, dependencies and processes created
by the current task. Keep the ignored review handover until its retention
decision is recorded.
