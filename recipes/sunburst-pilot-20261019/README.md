# Sunburst source pilot

These original prompts generated two fictional adult cutouts and two empty
room plates with explicitly selected gpt-image-2.5-sunburst, high quality,
1024 x 1024 PNG. Only prompts, hashes and observations are in Git; images
and draft masks remain local, pending source/terms and annotation review.
The existing configured Sunburst skill performed generation; this library
does not require an API account or a hosted service to train or infer.

Both returned people have alpha range 0 to 254, including interior pixels.
Do not infer perfect opaque objects or physical edge correctness from an
alpha channel. The first composites are review material, not approved
training data. Keep connected people/backgrounds in one split and evaluate
any resulting model on independent real-camera footage.

See experiments/2026-10-19-sunburst-pilot.json for source, prompt and
derivative hashes, parameters and the pending status. Review output
ownership and the competing-model restriction in the applicable OpenAI
Services Agreement before approving distributed MIT vision weights:
https://openai.com/policies/services-agreement/ . Generated output is not CC0.
