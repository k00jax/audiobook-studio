# Audiobook Studio

Turn your manuscript chapters into natural audiobooks — **free** with Microsoft Edge TTS, running entirely on your computer. Optional OpenAI or ElevenLabs voices via API keys in Settings (coming soon).

Manuscripts and MP3s live in **your** folder (ideally OneDrive or Google Drive so audio syncs to your phone). Metadata is stored in a local SQLite database beside the app.

## Quick start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Python](https://www.python.org/) 3.10+ (for Edge TTS)
- [ffmpeg](https://ffmpeg.org/) on PATH (compile + long chapters)
- Internet (Edge TTS uses Microsoft's free neural voices)

### 2. Install

```bash
git clone https://github.com/k00jax/audiobook-studio.git
cd audiobook-studio
npm install
npm run setup:edge
```

### 3. Create your library folder

Pick a folder — **prefer a cloud-synced path** (OneDrive, Google Drive):

```bash
npm run scaffold:library -- "C:\Users\You\OneDrive\My Audiobooks"
```

This creates `CLAUDE.md`, a sample book, and `AUDIO/` / `Notes/` folders.

### 4. Configure

```bash
copy .env.example .env
```

Edit `.env`:

- Set `WATCH_FOLDER` to your library path
- Set `INGEST_API_KEY` to any long random string
- Keep `TTS_PROVIDER=edge` for free speech

### 5. Run

Two terminals:

```bash
npm run dev
npm run dev:watcher
```

Or use `launchers\Start-Audiobook-Studio.bat` (pass repo path and library path as arguments if needed).

Open **http://127.0.0.1:3001**

## Manuscript format

```markdown
## Section title

Prose for this section.

---

## Next section

More prose after the delimiter line.
```

- Sections are split only by `---` on its own line
- Name chapters `ch01_...`, `ch02_...`, etc.
- See `packages/author-kit/templates/CLAUDE.md` for AI assistant instructions

## Project layout

| Path | Role |
|------|------|
| `apps/web` | Next.js UI |
| `apps/watcher` | Watches `WATCH_FOLDER` and ingests changes |
| `apps/desktop` | Electron shell (planned) |
| `packages/core` | Section parser + part grouping |
| `packages/author-kit` | Library scaffold templates |
| `data/library.db` | Local SQLite (created on first run) |

## Library folder layout

```
WATCH_FOLDER/
  CLAUDE.md
  My Novel/
    ch01_opening.md
    AUDIO/           ← dictated MP3s
    Notes/           ← bookmarks
    AUDIO/compiled/  ← merged audiobooks
```

## Environment

| Variable | Purpose |
|----------|---------|
| `WATCH_FOLDER` | Library root — each subfolder is a book |
| `TTS_PROVIDER` | `edge` (default), `openai`, or `piper` |
| `EDGE_VOICE` | e.g. `en-US-AndrewNeural` |
| `INGEST_API_KEY` | Protects ingest API from the watcher |

See `.env.example` for all options.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Web app |
| `npm run dev:watcher` | Folder watcher |
| `npm run setup:edge` | Install Python `edge-tts` |
| `npm run scaffold:library -- <path>` | Create author library tree |
| `npm run edge:test` | Test Edge TTS |

## Roadmap

- [ ] First-run setup wizard in the app
- [ ] Electron desktop shell
- [ ] Settings UI for API keys and voice choice
- [ ] ElevenLabs TTS provider

## License

MIT — see [LICENSE](LICENSE).
