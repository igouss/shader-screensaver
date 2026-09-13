# Writing screensaver shaders

## Formats

The renderer compiles GLSL ES 3.00 (`precision highp float`) and detects the format
from the source:

| Format | Detected by | You write | Provided |
|---|---|---|---|
| FragCoord GLSL | a `void main()` | `void main()` that writes `fragColor` | `u_resolution` (vec2, pixels), `u_time`, `u_time_delta`, `u_frame` (int), `u_mouse` (vec4), `u_date` (year, month 0–11, day, seconds), `u_refresh_rate` |
| Shadertoy | a `mainImage(out vec4, in vec2)` | `mainImage` | `iResolution` (vec3), `iTime`, `iTimeDelta`, `iFrame`, `iMouse`, `iDate`, `iFrameRate`; `main()` is added |
| twigl geekest | neither | only the body of `main()` | `FC` (= `gl_FragCoord`), `r` (resolution), `t` (time), `f` (frame), `m` (mouse, 0–1), output `o` (starts at 0), `rotate2D(a)`, `rotate3D(a, axis)`, `hsv(h, s, v)`; uninitialized locals are zero |

Prefer FragCoord GLSL for new work because it reads best; use twigl for compact,
golf-style pieces.

- The mouse never moves (centred, or zero for Shadertoy), so don't rely on it.
  Alpha is forced to 1.
- Not available: textures and `iChannel*`, multiple passes or buffers, audio, keyboard.
- GLSL ES 3.00 has no implicit int→float conversion (write `2.0*x` and `float(i)`),
  `%` works on ints only (use `mod`), arrays need constant sizes, and there's no
  `double`.

## Quality bar

`screensaver-shaders check file png` reports what this bar is about:

- **Screensaver-friendly:** mostly dark ground with light accents. Aim for mean
  brightness around 0.05–0.35 and `white` under ~5%. A near-white or flat screen
  fails.
- **Calm motion:** time factors around 0.05–0.5, so things drift, rotate and morph
  slowly. `motion` between about 0.005 and 0.15; below that it's static, above it
  frantic.
- **No flashing or strobing:** no large areas changing brightness faster than about
  3 times a second, for photosensitivity.
- **Cost:** at most ~8 ms/frame at 1920x1080 (the GPU is an AMD Radeon HD 7970). The
  renderer lowers the resolution of slow shaders, but smooth is better, so cap raymarch
  steps (~64–100) and keep inner loops small.
- **Any aspect ratio:** normalize by height, `(FC.xy - 0.5*res) / res.y`, and keep the
  subject centred or the pattern full-bleed.
- **Long runs:** time starts at 0 when the screensaver starts and may run for hours.
  Avoid effects that blow up or drift into precision noise, and wrap phases with
  `mod`/`fract` where needed.
- **Tone mapping:** map glow with `1.0 - exp(-c)` or `tanh(c)` instead of clamping, and
  add a gentle vignette for depth.

## Header comment

First line: `// <Title> — <what it shows, one line> (<format>)`. Add `// Theme: <theme>`
when the batch has one. Keep credits for pasted code.

## Technique menu

Mix techniques across a batch rather than making ten variations of one idea.

- Raymarched SDF scenes: repeated domains, smooth unions, soft shadows, glow from step
  counts (like `sierpinski`), and fractals (Mandelbox, Menger, KIFS folds)
- Volumetric glow along rays through fields (`gyroid`)
- Domain-warped noise and fbm: nebulae, marble, smoke, liquid (`plasma`)
- Implicit 2D fields: metaballs (`metaballs`), contour lines, reaction-diffusion
  look-alikes
- Polar and tunnel mappings (`tunnel`), kaleidoscopes, hyperbolic tilings
- Layered particles: starfields (`starfield`), fireflies, snow, bokeh
- Curves and waves: aurora ribbons (`aurora`), Lissajous figures, harmonographs, slices
  of strange attractors
- Truchet and Voronoi tilings, cellular patterns, quasicrystals
- Colour: cosine palettes `a + b*cos(6.2831*(c*t + d))` give smooth, tunable colour
