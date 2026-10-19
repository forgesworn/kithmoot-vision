# Pending label-review batch

This original annotation recipe reuses the locally retained source pilots. It
creates three later video frames, four held-object composites, a two-person
composite and two empty-room negatives. No source imagery, masks or human review
records are distributed with the recipe. It does not download, approve or train.

With Pillow, NumPy and OpenCV already available in a preparation environment:

```sh
python3 recipes/review-batch-20261019/build.py --data data --output data/label-batch-20261019
npm run vision:batch-review -- --batch data/label-batch-20261019/batch.json --output data/label-batch-20261019/review.html
```

The recipe checks the retained source hashes and refuses to replace an existing
output directory. Face/head boxes are manually positioned. Video foregrounds
use polygon-seeded classical GrabCut; synthetic examples use the generated draft
alpha and deterministic compositing. These are pending labels, not predictions
from a KithMoot model or verified physical hair mattes. Review every example.

All frames from the video share one connected person/room/take group. All
synthetic examples share another group through reused people and rooms. The
batch therefore cannot provide three independent train/validation/test splits.
Source-use decisions remain pending; accepting labels creates no training grant.
