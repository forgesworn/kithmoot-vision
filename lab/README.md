# Camera Lab

Test the owned Rust/WASM face detector and foreground model on camera frames,
local images or clips. This is a separate development preview; the released
desktop and native Android call settings keep their existing qualification
gates. No Google face SDK, hosted inference or frame upload is used.

## iPhone, iPad and other phones

Open **https://kithmoot.forgesworn.dev/camera-lab/** in Safari on your iPhone.
Choose Front or Rear, optionally tick **Include microphone level test**, then
press **Start camera** and allow the requested devices. The microphone only
drives a local level meter: it is not recorded, played back, exported or sent.
Stop input, Clear lab, switching input and leaving the page stop both devices.
Putting this test page in the background also stops capture; explicitly start
it again when you return.

This page downloads our software, original drawing examples and unqualified
drawing weights over HTTPS. Inference runs on the phone in Rust/WASM. Local
models loaded through the file picker stay in that browser tab. Exported
reviewed pictures can be saved to Files and transferred to your own computer
for training; no server training or personal-model upload is provided.

For a normal video/audio call, open **https://kithmoot.app/** and enter the
room code in **Join a room**. The existing join screen asks for any password
words and admission. Join the call and turn on your microphone/camera there.
The lab is a separate experiment and cannot join or mask a live call.

`http://localhost:4388` below means the computer running the local server;
it cannot reach that computer from an iPhone. Remote camera access needs
HTTPS. The hosted page provides that without a tunnel or local certificate.

## Run on your computer

From the repository root, with Node 24, Python training dependencies installed
as described in [Vision](../README.md), and the Rust WASM target installed:

```sh
npm run vision:lab -- --prepare
```

On Apple Silicon, append `--device mps` for the initial drawing-model training.
Preparation reuses `runtime/target`, creates original procedural drawings
under `runs/lab-drawings-v1`, and trains/exports a small smoke model under
`runs/lab-model-1000-v1` (1,000 bounded training steps). It downloads no images or weights. Existing model
experiments are reused, never overwritten. Later starts need only
`npm run vision:lab`. Open **http://localhost:4388**; Ctrl-C stops the server.

The default weights were trained on drawings. They demonstrate the pipeline,
not real-face accuracy. Load your own local `.kvm` export and matching `.json`
card to test a personal model. The card's SHA-256 must match the weights.

## What to exercise

- Live front/rear camera, an image or a short local video up to 32 MiB.
  Microphone access is off by default; explicitly select the optional level
  test before starting the camera. Stop input ends camera and microphone capture.
- Face-only, foreground-only and combined inference; face boxes, opaque masks,
  replacement background, blur and a separate predicted-matte view.
- Optional empty-room reference and previous predicted matte. Changing the
  input clears reference and temporal evidence. Portrait and ultrawide inputs
  retain their edges through letterboxing.
- Multiple people, turning faces, movement, dark/light backgrounds and held
  books, mugs or phones. Compare the raw input and prediction carefully.
- Worker inference time, end-to-end processing time, processed fps and model
  workspace. One inference frame is in flight; its result paints only that
  captured frame. Source/model/reference changes invalidate stale results.

This exposes per-frame learned detections, not identity recognition. A model
can miss a face confidently; this preview cannot establish safe anonymity.
Camera access starts only after Start camera and browser permission.

## Personal capture → training → test

Choose a split before starting each input. Capture a frame, draw every face
box and paint a foreground label that includes hands and held objects. Mark
held-object regions separately for recall measurements. A predicted matte can
be used as a draft, followed by human review. Drawing examples have optional
known labels so the complete workflow can be tried without personal footage.

Add samples only after checking the three review declarations. Stop the input
before choosing the next split and recording a separate take. Up to 32 samples
stay in memory per export. Export all three takes together, or export several
files and list them in the importer. From the repository root:

```sh
python3 -m kithmoot_vision.capture ~/Downloads/kithmoot-vision-*.json --output data/personal-test
python3 -m kithmoot_vision.train data/personal-test/manifest.jsonl runs/personal-test --personal --steps 1000 --device cpu
python3 -m kithmoot_vision.evaluate runs/personal-test/experimental.pt data/personal-test/manifest.jsonl
python3 -m kithmoot_vision.export runs/personal-test/experimental.pt runs/personal-test/experimental.kvm
```

Load the resulting `experimental.kvm` and `experimental.json` into the lab.
Choose fresh data/model directory names for each experiment; existing captures
and checkpoints are never overwritten. Import either one combined export or
non-overlapping exports from separate takes.
This trains both heads from scratch as a private experiment. The bounded
`MatteAdapter` remains a separate experiment.

Personal data cannot enter the default general-training path. Local permission
does not grant commercial/public MIT model-release rights. The importer
validates review declarations, PNG sizes, face boxes and retained object
labels; shared takes or identical pictures across splits are refused. A
personal experiment can share its people/room across independent takes: those
scores measure that context, not generalisation to other people or rooms.
Declarations still need an actual human permission and label review.

Captures and loaded personal models stay in this tab; the server has no upload
endpoint. Clear lab stops the camera and releases captures, personal model,
reference and labels. Closing the tab also ends the session. Exports/imported
data and checkpoints are separate local files; delete those separately.
`data/` and `runs/` are ignored by Git. Never add personal exports
or footage to source control.

## Android browser testing

The same WASM lab can run in an Android browser. With USB debugging already
enabled and your device selected, forward only this local service:

```sh
adb -s YOUR_DEVICE_SERIAL reverse tcp:4388 tcp:4388
```

Open `http://localhost:4388` in the phone browser. The server stays bound to
desktop loopback. When finished, stop the lab and remove the forwarding:

```sh
adb -s YOUR_DEVICE_SERIAL reverse --remove tcp:4388
```

This tests the shared WASM model on that browser/camera. A native Kotlin/JNI
camera bridge, real-call integration and device performance qualification
remain separate work.

## Verification

```sh
python3 -m unittest discover -s tests -v
cd ..
node --test lab/core.test.mjs
node --test lab/browser.test.mjs
```

Browser checks require prepared assets and the installed Playwright Chromium.
Set `VISION_LAB_WEBKIT=1` with an installed Playwright WebKit for the phone
engine check; CI requires it. Checks use a synthetic camera/microphone, real
Rust/WASM inference and real local training:
matched-frame background rendering, camera/source replacement, reviewed export,
private training/evaluation, model reload, mobile layout and clear/reset.
They also check microphone opt-in, measured audio, track/context shutdown,
late permissions, hosted subdirectory assets and refusal to publish private
models. They do not access a physical iPhone or prove real-face/held-object accuracy.

## Publish the separate read-only preview

After preparing the drawing assets, build into a fresh directory:

```sh
npm run vision:lab:build -- --output runs/hosted-preview-NEW
```

Only original synthetic data and general MIT drawing exports with matching
hashes can enter this bundle. Personal models and unlisted files are refused.
The static manifest records this library's source revision and every asset
hash. This repository has no website deployment credentials or publisher.
KithMoot owns the public preview and its deployment: initialise its pinned
`vision/` submodule and use `npm run vision:lab:build` from the KithMoot
checkout to record both the application and component revision. Its publisher
validates the pin before publication and preserves call/download assets.
See the consumer's [phone publisher](https://github.com/forgesworn/kithmoot/blob/main/deploy/phone-access.py).
