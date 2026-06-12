# Audiobook Project Instructions

## How the filesystem works
- The root folder contains one or more book projects, each in its own subfolder
- Each project subfolder contains chapter files as `.md` or `.txt`
- Within each chapter file, major sections are separated by `---` on its own line
- Audio output goes to `{project}/AUDIO/` — do not edit MP3s by hand; the Book Reader app syncs this folder automatically

## How to write and edit chapters
- Use `## Section Title` for section headers within chapters
- Use `---` (three dashes, on its own line) to mark major section breaks
- The Book Reader app uses these `---` delimiters to chunk audio, so preserve them — do not remove or replace them with other separators
- Chapter files should follow a consistent naming pattern: `ch01_...`, `ch02_...`, etc.

## How to add a new book project
- Create a new subfolder in the root directory
- Add your chapter `.md` files following the naming and formatting conventions above
- Create an empty `AUDIO/` subfolder — the app will populate it
- Add a `CLAUDE.md` file to the root (optional) describing your project, writing style, and preferences.
