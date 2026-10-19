"""MIT: reproduce a pending local review batch from the retained source pilots.

Annotation preparation only: no pretrained detector, tracking model or training.
Requires Pillow, NumPy and OpenCV in the local preparation environment.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def preview(rgb, alpha, boxes):
    width = 640
    height = round(rgb.height * width / rgb.width)
    image = rgb.resize((width, height), Image.Resampling.LANCZOS)
    mask = alpha.resize((width, height), Image.Resampling.LANCZOS)
    yy, xx = np.indices((height, width))
    pattern = np.where(((xx // 16 + yy // 16) % 2)[..., None], 190, 230)
    checker = Image.fromarray(np.repeat(pattern, 3, axis=2).astype(np.uint8))
    cutout = Image.composite(image, checker, mask)
    result = Image.new("RGB", (1328, height + 80), "#102531")
    result.paste(image, (16, 48)); result.paste(cutout, (672, 48))
    draw = ImageDraw.Draw(result)
    draw.text((16, 16), f"Face/head boxes: {len(boxes)}", fill="white")
    draw.text((672, 16), "Foreground draft: keep people, hands and held objects", fill="white")
    scale = width / rgb.width
    for x, y, w, h in boxes:
        draw.rectangle((16 + x * scale, 48 + y * scale, 16 + (x + w) * scale, 48 + (y + h) * scale), outline="#ffae32", width=3)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("data"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data, output = args.data.resolve(), args.output.resolve()
    if output.exists():
        raise FileExistsError(f"Refusing to replace {output}")
    clip = data / "source-review-20261019/commons-sample.webm"
    clip_hash = "f724f9b6be18d0f66f56e81a3f934c6b3cb1fe379705b129044f494725d4a75a"
    if digest(clip) != clip_hash:
        raise ValueError("The retained clip has changed")
    pilot_root = data / "sunburst-review-20261019"
    pilot = json.loads((pilot_root / "pilot.json").read_text())
    for source in [*pilot["sources"].values(), *pilot["composites"]]:
        if digest(pilot_root / source["filename"]) != source["sha256"]:
            raise ValueError("A retained synthetic source has changed")
        if "alpha_filename" in source and digest(pilot_root / source["alpha_filename"]) != source["alpha_sha256"]:
            raise ValueError("A retained draft alpha has changed")
    seed = json.loads((data / "annotation-review-20261019/commons-sample-t000002-ccde7c1a/draft-labels.json").read_text())
    output.mkdir(parents=True)
    items, records = [], []

    def add(name, title, rgb, alpha, boxes, source_hash, provenance, instructions, context, method, group, time=0):
        folder = output / name
        folder.mkdir()
        rgb = rgb.convert("RGB"); alpha = alpha.convert("L")
        if rgb.size != alpha.size:
            raise ValueError("Frame and alpha dimensions differ")
        rgb.save(folder / "frame.png"); alpha.save(folder / "foreground-draft.png")
        preview(rgb, alpha, boxes).save(folder / "preview.png")
        record = {
            "format": "kithmoot-pending-label-draft-v1", "source_sha256": source_hash or digest(folder / "frame.png"),
            "requested_time_seconds": time,
            "frame": {"file": "frame.png", "sha256": digest(folder / "frame.png"), "width": rgb.width, "height": rgb.height},
            "foreground": {"file": "foreground-draft.png", "sha256": digest(folder / "foreground-draft.png"),
                           "kind": "binary-segmentation-draft" if np.isin(np.asarray(alpha), [0, 255]).all() else "synthetic-alpha-draft"},
            "face_boxes_xywh_pixels": boxes, "source_rights_status": "pending", "label_review_status": "pending",
            "eligible_for_training": False, "method": method, "provenance": provenance,
            "connected_split_group": group,
            "limitations": ["Pending human label review; not a verified physical hair matte.", "No source-use grant or training eligibility is created by this recipe."],
        }
        write_json(folder / "draft-labels.json", record)
        items.append({"title": title, "instructions": instructions, "context": context,
                      "draft": f"{name}/draft-labels.json", "preview": f"{name}/preview.png"})
        records.append({"name": name, "frame_sha256": record["frame"]["sha256"], "mask_sha256": record["foreground"]["sha256"],
                        "preview_sha256": digest(folder / "preview.png"), "connected_split_group": group})

    cv2.setNumThreads(1)
    cap = cv2.VideoCapture(str(clip))
    try:
        for seconds, box in [(10, [342, 82, 192, 305]), (25, [340, 85, 189, 300]), (60, [337, 85, 189, 294])]:
            cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
            ok, bgr = cap.read()
            if not ok:
                raise ValueError(f"Cannot decode {seconds}s")
            polygon = np.array(seed["foreground_seed_polygon_xy"], np.int32)
            inside = np.zeros(bgr.shape[:2], np.uint8)
            cv2.fillPoly(inside, [polygon], 255)
            labels = np.full(inside.shape, cv2.GC_BGD, np.uint8)
            labels[cv2.dilate(inside, np.ones((31, 31), np.uint8)) > 0] = cv2.GC_PR_FGD
            labels[cv2.erode(inside, np.ones((21, 21), np.uint8)) > 0] = cv2.GC_FGD
            cv2.setRNGSeed(19)
            cv2.grabCut(bgr, labels, None, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 5, cv2.GC_INIT_WITH_MASK)
            mask = np.isin(labels, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8)
            count, components, stats, _ = cv2.connectedComponentsWithStats(mask)
            if count < 2:
                raise ValueError("No foreground component")
            mask = np.where(components == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
            add(f"video-{seconds:02d}s", f"Speaking to camera — {seconds} seconds", Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)), Image.fromarray(mask), [box], clip_hash,
                [{"file": clip.name, "sha256": clip_hash, "time_seconds": seconds}],
                "Check the whole head, ears, beard and shoulders. Remove the wall and the cast shadow; this binary mask does not supply soft hair edges.",
                "Real video draft; source-use review pending. Same person, room and take as the first accepted frame: one split only.",
                "Assistant-positioned head box and retained polygon seed, refined with classical GrabCut; no trained model.", "commons-sample-connected", seconds)
    finally:
        cap.release()

    raw_boxes = {"person-mug": [285, 65, 500, 510], "person-book": [405, 40, 355, 425]}
    for entry in pilot["composites"]:
        person, background = entry["person"], entry["background"]
        rgb = Image.open(pilot_root / entry["filename"])
        alpha = Image.open(pilot_root / entry["alpha_filename"])
        box = [round(v * rgb.width / 1024, 2) for v in raw_boxes[person]]
        add(person + "-" + background, ("Mug" if person == "person-mug" else "Book") + " — " + background.removeprefix("background-"), rgb, alpha, [box], entry["sha256"],
            [{"file": entry["filename"], "sha256": entry["sha256"]}, {"file": entry["alpha_filename"], "sha256": entry["alpha_sha256"]}],
            "Check the head box, hair and hands. The held object must stay in the cutout; inspect clear gaps and any coloured fringe around hair or clothing.",
            "Synthetic draft alpha, not verified matting truth. Source terms pending. All pilot people and rooms share one connected split group.",
            "Existing Sunburst composite and draft alpha; assistant-positioned head box. No learned detector.", "sunburst-pilot-connected")

    foreground = Image.new("RGBA", (960, 640))
    boxes, provenance = [], []
    for name, offset in [("person-mug", (0, 128)), ("person-book", (448, 128))]:
        person = Image.open(pilot_root / (name + ".png")).convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
        foreground.alpha_composite(person, offset)
        x, y, w, h = raw_boxes[name]
        boxes.append([x / 2 + offset[0], y / 2 + offset[1], w / 2, h / 2])
        provenance.append({"file": name + ".png", "sha256": pilot["sources"][name]["sha256"], "resized_to": [512, 512], "offset": list(offset)})
    background = Image.open(pilot_root / "background-study.png").convert("RGBA").resize((960, 640), Image.Resampling.LANCZOS)
    background.alpha_composite(foreground)
    provenance.append({"file": "background-study.png", "sha256": pilot["sources"]["background-study"]["sha256"]})
    # The new composite is its own source; its exact PNG hash is recorded by add.
    add("two-people", "Two people — mug and book", background, foreground.getchannel("A"), boxes, None, provenance,
        "There must be two head boxes. Keep both people, their hands, the mug and the book. Check the overlapping clothing and gaps around the objects.",
        "Synthetic composition made from the existing pilot cutouts. Source terms pending. Reused people and room stay in the pilot's single split group.",
        "Deterministic two-layer alpha composite with transformed manual head boxes; no trained model.", "sunburst-pilot-connected")

    for name in ("background-study", "background-kitchen"):
        rgb = Image.open(pilot_root / (name + ".png")).resize((960, 960), Image.Resampling.LANCZOS)
        source_hash = pilot["sources"][name]["sha256"]
        add(name + "-empty", "Empty " + name.removeprefix("background-"), rgb, Image.new("L", rgb.size, 0), [], source_hash,
            [{"file": name + ".png", "sha256": source_hash}],
            "There should be no head boxes and no foreground. The right panel should be entirely checkerboard: furniture belongs to the background.",
            "Synthetic empty-room negative. Source terms pending. Reuses a pilot room, so it remains in the same connected split group.",
            "Empty room with a zero foreground label, pending visual verification; no trained model.", "sunburst-pilot-connected")

    write_json(output / "batch.json", {"format": "kithmoot-pending-label-batch-v1", "title": "Faces, objects and backgrounds — batch 2", "items": items})
    write_json(output / "preparation.json", {"format": "kithmoot-pending-batch-preparation-v1", "recipe_sha256": digest(Path(__file__)),
               "opencv_version": cv2.__version__, "numpy_version": np.__version__, "pillow_version": Image.__version__,
               "items": records, "training_performed": False, "eligible_for_training": False,
               "split_policy": "Two connected groups only; this batch cannot supply three independent splits."})
    print(json.dumps({"output": str(output), "examples": len(items), "eligible_for_training": False}))


if __name__ == "__main__":
    main()
