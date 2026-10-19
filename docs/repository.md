# Repository and consumer boundary

This repository owns the original model architecture, data import, source and
annotation review, training and evaluation, model export, Rust native/WASM
runtime, JavaScript host and local Camera Lab/Model Workshop. The first target
is KithMoot face privacy and background removal, including hands and objects
shown to a camera. It is an experimental library; no capable real-camera
model has been established by the extraction.

KithMoot owns its call pipeline, camera/microphone permissions, UI, app
qualification and website publication. It consumes `vision/` as a Git
submodule pinned to an exact commit, so model development can proceed here
without silently changing a shipped call or preview. Updating the dependency
requires a KithMoot change and its integration checks. The lab's own build
manifest records this repository's revision; the KithMoot publisher separately
records and verifies both its host revision and the pinned vision revision.

The initial history was extracted with `git subtree split --prefix=vision`
from KithMoot commit `8ea4824eb5a9cb11eb7a12ec4e30ed23c365cc89` on
19 October 2026. Its extracted tip is
`39868898a9e8948e02b568739769bed76b834958`. Original commits, authorship,
MIT copyright notices, experiment records and Rust standard-library notices
are retained. The Camera Lab's original shield artwork is copied from the
same MIT KithMoot source; its provenance accompanies the SVG. No raw training
footage, downloaded image, private capture, weight file or environment is
part of the extraction.

For browser consumers:

```js
import { CameraVisionRuntime } from '@forgesworn/kithmoot-vision'

// Supply locally bundled and hash-checked bytes. Run this in a Worker.
const engine = await CameraVisionRuntime.create(wasmBytes, modelBytes)
const result = engine.run({ rgb, width: 160, height: 96, tasks: 'both' })
// Copy result arrays before the next run if they must be retained.
engine.close()
```

Native consumers use the [C header](../runtime/include/kithmoot_vision.h)
or the Rust crate. Mobile JNI packaging and physical-device qualification
remain separate work. Building portable code does not prove latency or visual
quality on an iPhone, Android handset or desktop camera.
