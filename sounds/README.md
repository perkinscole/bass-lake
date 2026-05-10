# Sounds

Drop `.mp3` files here with these exact names. Missing files are skipped silently — the game still runs, you just don't hear that effect.

| File | When it plays | Notes |
|---|---|---|
| `cast_start.mp3` | Mouse / cast button pressed to begin a cast | Short whoosh |
| `cast_release.mp3` | Line shoots forward on release | Sharper whoosh |
| `splash.mp3` | Fly lands on the water | Short, gentle |
| `bite.mp3` | Fish takes the fly | Subtle gulp / pluck |
| `hookset.mp3` | Line goes tight, fight begins | Quick zip |
| `reel_loop.mp3` | Looping clicks while the player is reeling | ~1s seamless loop |
| `catch.mp3` | Fish landed | Short triumphant tone |
| `snap.mp3` | Line breaks under tension | Sharp crack |
| `paddle.mp3` | Each paddle stroke when moving | Short water plunk; rate varies slightly |
| `buy.mp3` | Tackle shop purchase | Cha-ching / soft confirm |
| `ambient.mp3` | Looping background atmosphere | Long seamless loop (~30-60s) |

## Tips
- Keep effects under 1 second except `reel_loop` and `ambient`
- Master volume is already lowered to 70%, so produce sounds at a normal level
- The mute toggle (🔊 button bottom-left) saves to localStorage
- All sounds use `audio.cloneNode()` so multiple instances can overlap

## Free sources
- [freesound.org](https://freesound.org) (CC0 / CC-BY)
- [zapsplat.com](https://www.zapsplat.com) (free with account)
- [opengameart.org](https://opengameart.org) (CC0 / CC-BY)
- [pixabay.com/sound-effects](https://pixabay.com/sound-effects) (CC0)
