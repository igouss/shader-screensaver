---
name: screensaver
description: >
  Manage the user's GLSL shader screensaver (Omarchy): add pasted shader code to the
  collection under an invented name, say which shader was shown last, delete the last
  or a named shader, and write new original shaders (default 10, optionally on a theme
  the user gives). Use whenever the user pastes GLSL / Shadertoy / twigl / FragCoord
  code for the screensaver, asks "what was that screensaver", wants one removed, or asks
  Claude to generate, write or "express yourself" in screensaver shaders.
argument-hint: "[pasted GLSL | last | delete last|<name> | generate [n] [theme]]"
---

# Shader screensaver

The idle screensaver shows one shader per idle period from a git-tracked collection.
Never-shown shaders play first; after that the rotation picks at random from the half
of the collection shown longest ago, so nothing comes back soon after it played.

| What | Where |
|---|---|
| Repo (private, GitHub `igouss/shader-screensaver`) | `~/Projects/shader-screensaver` |
| Collection | `shaders/*.frag` in the repo (linked as `~/.config/shader-screensaver/shaders`) |
| Helper | `screensaver-shaders` (run with no arguments for usage) |
| Renderer | `~/.local/bin/shader-screensaver`; source `src/main.c`, rebuild with `src/build.sh` |
| Run log / history | `~/.local/state/shader-screensaver/log` |

`screensaver-shaders add` and `remove` commit to the repo themselves. After a change,
push: `git -C ~/Projects/shader-screensaver push`.

Don't preview new shaders on the user's screen unless they ask: they are meant to be a
surprise the next time the screensaver runs.

`screensaver-shaders add` handles naming: if the name you pass is missing or already
taken, it picks an unused random two-word name from the repo's `names/` word lists and
prints it. Report the name it printed.

## Add a pasted shader

1. Write the code verbatim to a file in your scratchpad, e.g. `incoming.frag`.
2. `screensaver-shaders check incoming.frag` compiles it offscreen and prints any
   errors.
3. If it doesn't compile, see "Formats" in [shader-guide.md](shader-guide.md). Fix only
   mechanical porting problems (e.g. `1/2` → `1./2.`, a missing `#define`), keep the
   author's work otherwise, and tell the user what you changed. Textures (`iChannel*`),
   multi-pass buffers, audio, and WGSL/HLSL/"golf" sources aren't supported: say so
   rather than rewriting the shader.
4. Invent a name: 1–3 lowercase words joined by `-`, evocative of what it shows
   (`copper-nebula`, `folded-lattice`). If the source credits an author or URL, keep
   that comment at the top.
5. `screensaver-shaders add <name> < incoming.frag`, then push.
6. Tell the user the name, a one-line description, and that it plays next.

## Last shown / delete

- "What was the last one?" → `screensaver-shaders last`. For more context,
  `screensaver-shaders history 5`.
- "Delete the last one" → `screensaver-shaders remove last`, then push.
- "Delete <name>" → `screensaver-shaders remove <name>`, then push. If the name is
  partial or ambiguous, show the matches from `screensaver-shaders list` and ask.
  Deleted shaders stay recoverable from git history.

## Generate new shaders

Default 10, or the number asked for. If the user gives a theme (a mood, a word, a
place, "express yourself"), every shader in the batch interprets it through palette,
form, motion and composition, not just in its name.

1. Read [shader-guide.md](shader-guide.md) first: formats, uniforms, the quality bar and
   the technique menu. Check `screensaver-shaders list` so ideas don't repeat.
2. Write each shader as original work in the scratchpad. Vary technique and format
   across the batch, and start each file with the header comment from the guide.
3. For each: `screensaver-shaders check <file> <file>.png` and compare the stats with
   the quality bar. Fix what fails (doesn't compile, too dark or bright, static or
   frantic, too slow). There is no separate thumbnail review.
4. Add each with `screensaver-shaders add <name> < <file>`, then push once at the end.
5. Report the batch as a short list, name plus one line on what it is (and how it reads
   the theme). They play first, in random order, starting at the next idle.

For large batches it's fine to draft shaders in parallel subagents and add what passes
the check.
