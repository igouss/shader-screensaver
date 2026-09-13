# shader-screensaver

A GLSL shader screensaver for [Omarchy](https://omarchy.org) (Hyprland). Each idle period
shows one shader from `shaders/`. Shaders that were never shown go first; after that a
rotation avoids recent repeats.

- `src/` is the renderer (C, SDL3, OpenGL ES 3). It understands twigl "geekest",
  FragCoord GLSL and Shadertoy shaders, skips ones that don't compile, and lowers the
  render resolution for heavy ones.
- `bin/screensaver-shaders` manages the collection: add from the clipboard, remove,
  preview, check, last, history, list, pick.
- `omarchy/omarchy-launch-screensaver` replaces Omarchy's launcher and keeps its window
  class, so idle and lock behaviour is unchanged.
- `skill/` is a Claude Code skill (`/screensaver`) that adds pasted shaders, removes
  them and writes new ones.
- `shaders/` is the collection.

## Install

Needs gcc, SDL3, OpenGL ES (Mesa), zlib, socat and jq.

    ./install.sh

This builds `~/.local/bin/shader-screensaver` and symlinks the helper, the launcher
override, the collection (`~/.config/shader-screensaver/shaders`) and the skill
(`~/.claude/skills/screensaver`).

Omarchy's idle service starts the launcher with `bash -lc`, so the override directory
has to come first on PATH. If `~/.bashrc` doesn't have it yet, `install.sh` prints the
line to add.

## Use

    screensaver-shaders add copper-nebula   # from the clipboard, compile-checked
    screensaver-shaders last                # what was that one?
    screensaver-shaders remove last
    screensaver-shaders preview plasma      # any key exits
    screensaver-shaders list                # "new" = not shown yet

Adding or removing a shader commits to this repo automatically.
