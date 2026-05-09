# Bass Lake

A top-down fly fishing game built in p5.js. Paddle a kayak around a procedural multi-basin lake, watch the wildlife, and fly fish for bluegill, pumpkinseed, crappie, and largemouth bass.

[**Play it → perkinscole.github.io/bass-lake**](https://perkinscole.github.io/bass-lake/)

## Controls

| Input | Action |
| --- | --- |
| **W / S** | Paddle forward / back |
| **A / D** | Turn the kayak |
| **mouse hold** | False-cast — fly line whips back and forth, growing further with each cycle |
| **mouse release** | Deliver the fly to the cursor |
| **click** (with fish on the line) | Reel in |
| **1 / 2 / 3** | Switch fly: Dry Fly · Nymph · Wooly Bugger |
| **scroll** | Zoom in / out |

## Flies and what they catch

- **Dry Fly** — bluegill, pumpkinseed
- **Nymph** — crappie
- **Wooly Bugger** — largemouth bass

Cast the wrong fly at a fish and it'll ignore you.

## Technical notes

- Pure p5.js, Canvas2D, no build step
- Lake shape generated via marching squares over a 2D noise field with three basin centers connected by meandering river paths
- Static world (forest, trees, lake polygon, surface patches, shore) baked once into a downscaled image at startup; per-frame rendering is just a sub-region blit + animated layers
- Boids flocking with a spatial hash for the panfish; bass run a state machine (lurk → strike)
- Fly line uses a quadratic bezier with an animated control point so it loads/unloads visibly during false casts

## Run locally

```sh
python3 -m http.server 5173
```

Open http://localhost:5173.
