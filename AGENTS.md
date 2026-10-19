# KithMoot Vision

Independent MIT component for face detection, foreground matting, portable
inference and local model review/training. KithMoot is the first consumer.

- Rust lives in `runtime/`, browser hosting in `web/`, training in
  `kithmoot_vision/`, local tools in `lab/` and `workshop/`.
- Reuse `runtime/target`. Never create a per-task `CARGO_TARGET_DIR` or override
  `CARGO_INCREMENTAL`. Remove only the task's own scratch and processes.
- No raw footage, personal projects, downloaded data, model weights, secrets,
  environments or generated images in Git. Preserve ignored review handoffs.
- Sources, generated alpha and imported labels remain pending until reviewed.
  Do not describe pipeline tests or synthetic pilots as real-camera acceptance.
- The source and intended releasable weights are MIT. Training data and tools
  retain their own terms. Never import vendor weights, a vision SDK, telemetry
  or a mandatory hosted inference dependency through an incidental feature.
- Keep application permissions, publishing and call controls in the consumer.
- Run `npm ci --ignore-scripts`, install needed Playwright browsers, then
  `npm test`. Python checks are `python -m unittest discover -s tests -v` in an
  installed environment. CI also checks native/WASM parity and real browser
  capture/import/train/export with original synthetic fixtures.
