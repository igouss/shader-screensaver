// Tetris Steps — security tint of zig-zag stair blocks set in a skewed brick grid, inching sideways like a slow conveyor (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float box(vec2 p, vec2 lo, vec2 hi) {
  vec2 c = 0.5 * (lo + hi), h = 0.5 * (hi - lo);
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float steps(vec2 b) {
  float d = box(b, vec2(0.0, 0.4), vec2(2.1, 1.5));
  d = min(d, box(b, vec2(2.0, 0.0), vec2(3.7, 2.45)));
  d = min(d, box(b, vec2(3.6, 1.0), vec2(4.3, 2.45)));
  d = min(d, box(b, vec2(4.2, 1.0), vec2(5.8, 3.5)));
  d = min(d, box(b, vec2(5.7, 2.0), vec2(8.0, 3.0)));
  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.04 * sin(t * 0.013);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv * 5.0 + vec2(t * 0.022, t * 0.008);
  p += 0.02 * vec2(sin(p.y * 0.5 + t * 0.05), cos(p.x * 0.4 - t * 0.04));

  float colW = 1.8;
  float rowH = 0.74;
  float slope = 0.27;
  float lean = 0.04;

  float u = (p.x + lean * p.y) / colW;
  float cx = floor(u);
  float off = 0.5 * mod(cx, 2.0);
  float v = (p.y + slope * p.x) / rowH + off;
  float cy = floor(v);

  float xc = (cx + 0.5) * colW - lean * p.y;
  float yc = (cy + 0.5 - off) * rowH - slope * xc;
  vec2 l = p - vec2(xc, yc);

  float b = 0.186;
  vec2 bp = vec2(l.x / b + 4.1, -l.y / b + 1.86);
  float shape = steps(bp) * b;

  float vline = abs(fract(u) - 0.5) * colW;
  vline = 0.5 * colW - vline;
  float hline = (0.5 - abs(fract(v) - 0.5)) * rowH / sqrt(1.0 + slope * slope);
  float grid = min(vline, hline);

  float aa = length(fwidth(p)) * 0.7;
  float ink = 1.0 - smoothstep(-aa, aa, shape);
  ink = max(ink, 1.0 - smoothstep(0.022 - aa, 0.022 + aa, grid));

  float gain = 0.72 + 0.28 * vnoise(gl_FragCoord.xy * 0.4) + 0.2 * (vnoise(p * 1.5) - 0.5);
  ink *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.02, 0.025, 0.075) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 cobalt = vec3(0.45, 0.55, 1.0);
  vec3 col = mix(paper, cobalt, ink * 0.8);

  float vg = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * vg, 1.0);
}
