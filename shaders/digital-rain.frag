// Digital Rain — three depths of falling stroke-built glyphs in green phosphor, white-hot at each drop's head (FragCoord GLSL)
// Theme: The Matrix

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// katakana-like strokes on a small lattice (glyph space 0..1)
vec4 stroke(int i) {
  if (i == 0) return vec4(0.0, 1.0, 1.0, 1.0);
  if (i == 1) return vec4(0.0, 0.5, 1.0, 0.5);
  if (i == 2) return vec4(0.0, 0.0, 1.0, 0.0);
  if (i == 3) return vec4(0.5, 1.0, 0.5, 0.0);
  if (i == 4) return vec4(1.0, 1.0, 1.0, 0.3);
  if (i == 5) return vec4(0.0, 1.0, 0.0, 0.4);
  if (i == 6) return vec4(1.0, 1.0, 0.15, 0.0);
  if (i == 7) return vec4(0.5, 0.5, 0.0, 0.0);
  if (i == 8) return vec4(0.5, 0.5, 1.0, 0.0);
  if (i == 9) return vec4(0.0, 0.72, 1.0, 0.72);
  if (i == 10) return vec4(1.0, 0.5, 0.3, 0.0);
  if (i == 11) return vec4(0.15, 1.0, 0.45, 0.6);
  if (i == 12) return vec4(0.5, 1.0, 1.0, 0.62);
  if (i == 13) return vec4(0.0, 0.28, 1.0, 0.28);
  if (i == 14) return vec4(0.0, 1.0, 1.0, 0.2);
  return vec4(1.0, 0.72, 0.5, 0.0);
}

float glyph(vec2 g, float h) {
  g.x = 1.0 - g.x;                      // mirrored, as on the operators' screens
  float d = 1e3;
  for (int k = 0; k < 3; k++) {
    int s = int(floor(fract(h * (7.13 + float(k) * 3.71)) * 16.0));
    vec4 st = stroke(s);
    d = min(d, segD(g, st.xy, st.zw));
  }
  return d;
}

// one sheet of rain: returns colour
vec3 rain(vec2 uv, float cols, float layer, float t, float px) {
  vec2 cell = vec2(1.0 / cols, 1.45 / cols);
  vec2 sc = uv / cell;
  vec2 id = floor(sc);
  vec2 f = fract(sc);
  float hc = hash21(vec2(id.x, layer * 17.0));
  if (hc < 0.25) return vec3(0.0);                   // silent column
  float speed = 2.2 + 4.5 * hash21(vec2(id.x, layer * 9.0 + 1.0)); // cells per second
  float period = 50.0 + 60.0 * hash21(vec2(id.x, layer * 5.0 + 2.0));
  float b = 0.0, head = 0.0;
  for (int k = 0; k < 2; k++) {
    float off = hash21(vec2(id.x + float(k) * 31.0, layer)) * period;
    float len = 10.0 + 22.0 * hash21(vec2(id.x, float(k) + layer * 3.0));
    float H = mod(t * speed + off, period);          // head position, cells from the top
    float dist = mod(H - (-id.y - 1.0), period);      // how far behind the head this cell is
    float tr = dist < len ? exp(-dist / len * 3.5) : 0.0;
    b = max(b, tr);
    head = max(head, dist < 1.0 ? 1.0 : 0.0);
  }
  if (b < 0.01) return vec3(0.0);
  // glyphs mutate now and then
  float rate = 0.3 + 1.2 * hash21(id + 4.0);
  float gh = hash21(id + floor(t * rate + hash21(id) * 10.0) * 1.37);
  vec2 g = (f - vec2(0.14, 0.1)) / vec2(0.72, 0.8);
  float d = glyph(g, gh) * 0.72 * cell.x;              // back to screen units
  float w = 0.065 * cell.x;
  float core = smoothstep(w + px, w - px * 0.5, d);
  float halo = exp(-d / (0.25 * cell.x)) * 0.25;
  vec3 green = vec3(0.12, 1.0, 0.35);
  vec3 c = green * b * (core + halo);
  c += vec3(0.75, 1.0, 0.8) * head * (core * 1.5 + halo * 0.7);
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float px = 1.0 / u_resolution.y;
  float t = mod(u_time, 7200.0);

  vec3 col = vec3(0.0);
  col += rain(uv + vec2(0.013, 0.0), 70.0, 3.0, t * 0.55, px) * vec3(0.35, 0.55, 0.6) * 0.35;
  col += rain(uv + vec2(0.031, 0.0), 44.0, 2.0, t * 0.75, px) * 0.6;
  col += rain(uv, 26.0, 1.0, t, px) * 1.0;

  // faint phosphor haze
  col += vec3(0.0, 0.03, 0.012) * (0.6 + 0.4 * uv.y);
  col = 1.0 - exp(-col * 1.3);
  col *= 1.0 - 0.45 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
