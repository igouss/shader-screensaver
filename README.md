# shader-screensaver

A GLSL shader screensaver for [Omarchy](https://omarchy.org) (Hyprland). It is a
runner for [screensaver-rotation](https://github.com/igouss/screensaver-rotation),
which decides what comes up at each idle period, across every installed screensaver:
never-shown first, then no recent repeats. When one of these shaders comes up, this
renderer shows it.

- `src/` is the renderer (Rust, SDL3, OpenGL ES 3). It understands twigl "geekest",
  FragCoord GLSL and Shadertoy shaders, skips ones that don't compile, and lowers the
  render resolution of shaders that can't hold 80% of the target frame rate, so they
  soften instead of stuttering. `resources/glsl/` holds the GLSL it wraps around each
  format.
- `bin/screensaver-shaders` manages the collection: add from the clipboard, remove,
  preview, check, last, list. A shader added without a name, or under
  a name that's taken, gets a random two-word name from the word lists in `names/`.
- `bin/rotation-runner` is the screensaver-rotation runner: `--list` names the
  collection's shaders, and given shaders it starts the renderer on them, first that
  compiles, at `render_scale` and `max_fps`.
- `skill/` is a Claude Code skill (`/screensaver`) that adds pasted shaders, removes
  them and writes new ones.
- `shaders/` is the collection.

## Install

Needs Rust (cargo), SDL3 and OpenGL ES (Mesa); to come up at idle, screensaver-rotation.

    ./install.sh

This builds `~/.local/bin/shader-screensaver` (release profile: fat LTO, one codegen
unit, no unwinding, tuned for this CPU) and symlinks the helper, the collection
(`~/.config/shader-screensaver/shaders`), the skill (`~/.claude/skills/screensaver`)
and the runner (`~/.local/lib/screensaver-rotation/runners/shaders`). Run it again
after pulling to rebuild.

## Use

    screensaver-shaders add copper-nebula   # from the clipboard, compile-checked
    screensaver-shaders last                # what was that one?
    screensaver-shaders remove last
    screensaver-shaders preview plasma      # any key exits
    screensaver-shaders list                # the collection's names
    screensaver-shaders cycle               # every shader in turn: space pause, d delete,
                                            # 1-9 seconds each (0 = 10), ←/→, q to quit

When each shader was last shown, and the order they come up in, are
`screensaver-rotation list` and `pick`. Adding or removing a shader commits to this
repo automatically. While cycling, a
notification names the shader on screen, and deletions are pushed when you quit.

The lock screen (an Omarchy shell plugin) draws the same shaders through a Qt
`ShaderEffect`. `screensaver-shaders qt` compiles the collection for it with Qt's
`qsb` into `~/.cache/shader-screensaver/qt`, rebuilding only changed shaders, and
`screensaver-shaders lock` takes the next one in the rotation's order and logs it as
shown.

Settings live in `settings.conf`: `cycle_seconds` (default 3), `render_scale`,
`max_fps`, and for the lock screen `lock_render_scale` and `lock_blank_seconds`.

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
