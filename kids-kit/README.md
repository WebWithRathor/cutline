# Kids Edit Kit

Turns a raw talking-head recording into a kid-friendly explainer: best takes, colour grade, punch-ins,
gold-keyword captions, and sticker-style cutaways where a small cast of characters acts out each idea.
The presenter's recorded audio is never replaced, only cut between takes.

Storyboard and style guide: the "Kids Explainer Edit — Storyboard" doc in Claude.
To run it, ask Claude: "edit <video> with the kids edit kit".

## What's here

| Path | What it is |
| --- | --- |
| `characters.js` | The cast: `kiko()`, `sparky()`, `ohmie()`, `zip()` / `zipCrowd()`, `batt()`, `grandpaBulb()`, plus `face()` and `bubble()` |
| `props.js` | Backdrop and props: `paper()`, `tag()`, `bulb()`, `led()`, `battery9V()`, `cell()`, `resistor()`, `meter()`, `tick()`, `cross()`, `smoke()`… |
| `prims.js` | Sticker drawing primitives: `sticker()`, `chip()`, `txt()`, `sparkle()`, `cloud()`, `dashedPath()`, `windowBox()`… |
| `comp_template.html` | The composition engine. Copy it per video and write only the SHOT LIST; ready beats live in `BEAT` |
| `tools/transcribe.py` | Whisper Turbo + voice detection → `transcript.json` |
| `tools/assemble.py` | Chosen takes → `edit.json` + `voice.wav` (original audio, 12 ms fades) |
| `tools/words.py` | Word timings on the edited timeline → `words.json` |
| `tools/render.py` | Stills or the final MP4 from `comp.html` |
| `fonts/` | Bricolage Grotesque, Caveat, JetBrains Mono (OFL) |
| `examples/` | The C2226 LED edit: its composition, storyboard page, edit and word timings |

## Pipeline (one work folder per video)

1. Audio out of the source: `ffmpeg -i SRC -ac 1 -ar 16000 audio16k.wav` and `-ac 2 -ar 48000 audio48k.wav`.
2. `transcribe.py audio16k.wav en transcript.json` (models: `sherpa-onnx-whisper-turbo.tar.bz2` and `silero_vad.onnx`
   from the k2-fsa/sherpa-onnx GitHub release `asr-models`; set `WHISPER_DIR` and `VAD_MODEL`).
3. Pick the best take of each line → `plan.json` ranges (frame-aligned), then `assemble.py WORK` and `words.py WORK`.
4. Export the chosen ranges from the source at 1080p, concatenate, grade, and write frames to `WORK/frames/f_00001.jpg…`
   Grade used for Kokoon Labs footage:
   `eq=contrast=1.1:brightness=0.035:saturation=1.2:gamma=1.06,curves=all='0/0 0.3/0.28 0.7/0.74 1/1',colorbalance=rs=0.015:bs=-0.015:rm=0.01:bm=-0.01,unsharp=5:5:0.35`
5. Copy `comp_template.html` to `WORK/comp.html`, write the shot list with the beats (see the storyboard recipe).
6. `render.py KIT WORK stills 3 12 20` to check, then `render.py KIT WORK video out.mp4`.

Needs Python 3 with `playwright` (Chromium), `numpy`, `soundfile`, `sherpa-onnx`, and `ffmpeg`.
