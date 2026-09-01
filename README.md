# TRMNL Slow Cinema

**A global movie, frame by frame**

Slow Cinema broadcasts one shared film to every viewer. The film is sampled at
one image per movie-second. Each sampled image remains on TRMNL for a fixed
global slot, initially 15 minutes. People who install the plugin later join the
screening already in progress.

## Current foundation

- Stateless global broadcast clock
- Fixed UTC screening schedule
- Stable OG and X image endpoints
- Cloudflare Worker and R2 architecture
- FFmpeg/Pillow preparation pipeline
- Tests for synchronization, late joining, boundaries and object keys

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/api/now` | Current film, frame and slot metadata |
| `/api/schedule` | Published screening schedule |
| `/current/og.png` | Current 800×480 OG image |
| `/current/x.png` | Current 1872×1404 X image |
| `/health` | Service health |

During local development, set `ALLOW_TIME_OVERRIDE=true` and append
`?at=<ISO timestamp>` to preview a specific broadcast time. Production ignores
this parameter unless the override is deliberately enabled.

## Prepare a film

The source film is deliberately excluded from Git. Install FFmpeg and the
Python dependency, then generate one-second samples:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r processor/requirements.txt
python processor/prepare_film.py movie.webm \
  --slug a-trip-to-the-moon \
  --output frames
```

Output:

```text
frames/films/a-trip-to-the-moon/
├── manifest.json
├── og/000000.png
└── x/000000.png
```

OG frames are converted to dithered monochrome. X frames are reduced to 16
grayscale levels. Both use letterboxing rather than cropping.

## Develop

```bash
npm install
npm test
npm run dev
```

Create the R2 buckets named in `wrangler.jsonc`, upload the generated frame
directories with the same object keys, approve the date by enabling its entry
in `src/schedule.js`, then deploy with `npm run deploy`.

## Scheduling model

For a screening with a 15-minute slot:

```text
frame = floor((current UTC time - screening start) / 15 minutes)
```

The same formula runs for every request. There is no personal playback state,
database or installation timestamp.

## Film rights

Only source editions with verified worldwide reuse rights should be processed.
Modern restorations, colourisation, intertitles and soundtracks require their
own review even when the underlying silent film is public domain.

The first planned screening is Georges Méliès' *A Trip to the Moon* (1902),
using a source edition explicitly marked as public domain.
