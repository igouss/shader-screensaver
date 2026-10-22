#!/bin/bash

# Install the shader screensaver from this checkout: build the renderer and
# symlink the helper, the shader collection and the Claude Code skill into
# place, and link the runner into screensaver-rotation, which picks what the
# screensaver shows.

set -euo pipefail

repo=$(cd "$(dirname "$0")" && pwd)

# Points $2 at $1. An existing file is kept as $2.orig; a non-empty directory
# stops the install rather than being overwritten.
link() {
  local target=$1 path=$2
  mkdir -p "$(dirname "$path")"
  if [[ -L $path ]]; then
    rm "$path"
  elif [[ -d $path ]]; then
    rmdir "$path" 2>/dev/null || {
      echo "install.sh: $path is a non-empty directory; move it out of the way first" >&2
      exit 1
    }
  elif [[ -e $path ]]; then
    mv "$path" "$path.orig"
    echo "kept the previous $path as $path.orig"
  fi
  ln -s "$target" "$path"
  echo "linked $path -> $target"
}

cargo build --release --locked --manifest-path "$repo/Cargo.toml"
# install(1) replaces the file rather than rewriting it, so a running
# screensaver keeps its copy.
install -Dm755 "$repo/target/release/shader-screensaver" "$HOME/.local/bin/shader-screensaver"
echo "built ~/.local/bin/shader-screensaver"

link "$repo/bin/screensaver-shaders" "$HOME/.local/bin/screensaver-shaders"
link "$repo/shaders" "${XDG_CONFIG_HOME:-$HOME/.config}/shader-screensaver/shaders"
link "$repo/skill" "$HOME/.claude/skills/screensaver"
link "$repo/bin/rotation-runner" "$HOME/.local/lib/screensaver-rotation/runners/shaders"
