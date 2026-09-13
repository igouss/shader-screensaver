#!/bin/bash
# Build the renderer into ~/.local/bin/shader-screensaver
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p "$HOME/.local/bin"
gcc -O2 -Wall -Wextra -o "$HOME/.local/bin/shader-screensaver" main.c $(pkg-config --cflags --libs sdl3 glesv2 zlib) -lm
