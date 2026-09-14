# shader-screensaver

A GLSL shader screensaver for [Omarchy](https://omarchy.org) (Hyprland). Each idle period
shows one shader from `shaders/`. Shaders that were never shown go first; after that a
rotation avoids recent repeats.

- `src/` is the renderer (Rust, SDL3, OpenGL ES 3). It understands twigl "geekest",
  FragCoord GLSL and Shadertoy shaders, skips ones that don't compile, and lowers the
  render resolution of shaders that can't hold 80% of the target frame rate, so they
  soften instead of stuttering. `resources/glsl/` holds the GLSL it wraps around each
  format.
- `bin/screensaver-shaders` manages the collection: add from the clipboard, remove,
  preview, check, last, history, list, pick. A shader added without a name, or under
  a name that's taken, gets a random two-word name from the word lists in `names/`.
- `omarchy/omarchy-launch-screensaver` replaces Omarchy's launcher and keeps its window
  class, so idle and lock behaviour is unchanged. Depending on `mode` in
  `settings.conf` it runs the shaders, [commit-screensaver](https://github.com/igouss/commit-screensaver)
  (random Git commits replayed with gitlogue, in a fullscreen foot window), or one of
  the two at random.
- `skill/` is a Claude Code skill (`/screensaver`) that adds pasted shaders, removes
  them and writes new ones.
- `shaders/` is the collection.

## Install

Needs Rust (cargo), SDL3, OpenGL ES (Mesa), socat and jq.

    ./install.sh

This builds `~/.local/bin/shader-screensaver` (release profile: fat LTO, one codegen
unit, no unwinding, tuned for this CPU) and symlinks the helper, the launcher
override, the collection (`~/.config/shader-screensaver/shaders`) and the skill
(`~/.claude/skills/screensaver`). Run it again after pulling to rebuild.

Omarchy's idle service starts the launcher with `bash -lc`, so the override directory
has to come first on PATH. If `~/.bashrc` doesn't have it yet, `install.sh` prints the
line to add.

## Use

    screensaver-shaders add copper-nebula   # from the clipboard, compile-checked
    screensaver-shaders last                # what was that one?
    screensaver-shaders remove last
    screensaver-shaders preview plasma      # any key exits
    screensaver-shaders list                # "new" = not shown yet
    screensaver-shaders cycle               # every shader in turn: space pause, d delete,
                                            # 1-9 seconds each (0 = 10), ←/→, q to quit

Adding or removing a shader commits to this repo automatically. While cycling, a
notification names the shader on screen, and deletions are pushed when you quit.

Settings live in `settings.conf`: `mode` (`shaders`, `commits` or `mixed`; default
`shaders`), `cycle_seconds` (default 3), `render_scale` and `max_fps`.

## Develop

The renderer is laid out as ports and adapters. `src/domain/` holds the rules as plain
data and functions: format detection and wrapping, uniforms, the playlist, pacing,
input and frame stats. `src/ports.rs` names what the app needs from outside (GPU,
screen, presence, report), `src/app/` runs the screensaver loop and `--check` against
those traits, and `src/adapters/` implements them with SDL3, OpenGL ES, Hyprland and
the file system.

    cargo test                                  # unit and property tests
    cargo test -- --ignored                     # also compile every shader on the GPU
    cargo clippy --all-targets -- -D warnings   # strict lints: pedantic and nursery
    cargo mutants                               # mutation tests (cargo install cargo-mutants)

`.cargo/mutants.toml` leaves out the code that only runs against a live display and
GPU (the SDL and GL adapters, `main.rs`); the ignored tests in `tests/cli.rs` cover it
by running the binary.
