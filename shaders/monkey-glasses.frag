// Monkey Glasses — the Stalker's daughter's gaze: glasses on a kitchen table, one sliding by itself while a passing train trembles their water (Shadertoy)
// Theme: Stalker

float h21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.1 + vec2(1.3, 7.1); a *= 0.5; }
  return s;
}

const vec2 LDIR = vec2(0.62, -0.45);   // window light falls from upper left

vec3 table(vec2 p) {
  vec2 q = p + vec2(0.0, 0.03 * sin(p.x * 3.0));
  float grain = fbm(vec2(q.x * 1.6, q.y * 30.0 + fbm(q * 3.0) * 6.0));
  float plank = smoothstep(0.985, 0.995, fract(q.y * 2.4 + 0.2)) * smoothstep(1.0, 0.995, fract(q.y * 2.4 + 0.2));
  vec3 c = mix(vec3(0.13, 0.085, 0.045), vec3(0.24, 0.16, 0.085), grain);
  c *= 1.0 - 0.45 * plank;
  c *= 0.75 + 0.5 * n2(p * 90.0) * 0.4;
  float win = exp(-length((p - vec2(-0.7, 0.55)) * vec2(0.6, 0.9)) * 1.6);
  return c * (0.35 + 1.2 * win);
}

void glassAt(inout vec3 col, vec2 uv, vec2 c, float R, float fill, float tremor, float T, float seed) {
  vec2 d = uv - c;
  float r = length(d);
  if (r > R) return;
  vec2 dir = d / max(r, 1e-4);
  // looking down through the thick bottom: magnified, slightly tinted table
  vec2 off = -d * 0.35;
  if (fill > 0.5) {
    float wv = sin(r * 110.0 - T * 4.0 + seed) * tremor * exp(-r * 6.0) + 0.3 * tremor * sin(r * 70.0 + T * 3.0 + seed);
    off += dir * wv * 0.006;
  }
  vec3 inside = table(uv + off) * vec3(0.8, 0.92, 0.88);
  if (fill > 0.5) {
    inside = mix(inside, vec3(0.08, 0.1, 0.09), 0.25);
    float men = smoothstep(R * 0.8, R * 0.93, r) * smoothstep(R * 0.97, R * 0.93, r);
    inside += vec3(0.25, 0.27, 0.24) * men * 0.4;
    float ring = sin(r * 110.0 - T * 4.0 + seed) * tremor;
    inside += vec3(0.3, 0.3, 0.26) * max(ring, 0.0) * 0.12 * smoothstep(R * 0.9, 0.0, r);
  }
  // the bottom's inner rim
  inside += vec3(0.2, 0.2, 0.18) * exp(-pow((r - R * 0.62) * 90.0, 2.0)) * 0.5;
  // glass wall: bright where it faces the window
  float wall = smoothstep(R - 0.012, R - 0.004, r);
  float face = pow(max(dot(dir, -normalize(LDIR)), 0.0), 3.0);
  vec3 wc = vec3(0.3, 0.31, 0.28) * (0.3 + 1.0 * face) + vec3(0.06) * (1.0 - face);
  vec3 g = mix(inside, wc, wall);
  // a hard specular glint
  vec2 sp = c - normalize(LDIR) * R * 0.7;
  g += vec3(0.8, 0.8, 0.75) * smoothstep(0.02, 0.0, length((uv - sp) * vec2(1.0, 2.2))) * 0.45;
  // the lip of the glass, lifted towards the viewer
  float lip = length(uv - c - vec2(0.0, R * 0.12)) - R * 1.02;
  g += vec3(0.4, 0.4, 0.37) * smoothstep(0.004, 0.0, abs(lip)) * (0.3 + 0.7 * face) * 0.6;
  float edge = smoothstep(R, R - 0.003, r);
  col = mix(col, g, edge);
  col += vec3(0.4, 0.4, 0.37) * smoothstep(0.004, 0.0, abs(lip)) * (1.0 - edge) * 0.25;
}

void shadowAt(inout vec3 col, vec2 uv, vec2 c, float R) {
  vec2 sc = c + normalize(LDIR) * R * 0.45;
  vec2 d = (uv - sc) * mat2(0.8, 0.0, 0.0, 1.0);
  float r = length(d);
  col *= 1.0 - 0.55 * smoothstep(R * 1.2, R * 0.85, r);
  // light focused through the glass into a caustic crescent
  vec2 cc = c + normalize(LDIR) * R * 0.75;
  float cr = length(uv - cc);
  float cres = exp(-pow((cr - R * 0.55) * 40.0, 2.0)) * smoothstep(-0.2, 0.8, dot(normalize(uv - cc + 1e-4), normalize(LDIR)));
  col += vec3(0.5, 0.44, 0.3) * cres * 0.35;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float T = mod(iTime, 3600.0);

  // a train passes every half minute: a slow swell of trembling
  float tp = mod(T, 32.0);
  float tremor = 0.2 + 0.8 * smoothstep(0.0, 6.0, tp) * smoothstep(20.0, 12.0, tp);
  vec2 shake = tremor * 0.0015 * vec2(sin(T * 23.0), cos(T * 19.0));

  vec3 col = table(uv);
  // a damp trail where the moving glass has been
  float ph = T * 0.11;
  vec2 path0 = vec2(0.4 * sin(ph), 0.13 * sin(ph * 2.0) - 0.08);
  float trail = 0.0;
  for (int i = 1; i < 10; i++) {
    float pk = ph - float(i) * 0.1;
    vec2 pp = vec2(0.4 * sin(pk), 0.13 * sin(pk * 2.0) - 0.08);
    trail += exp(-pow((length(uv - pp) - 0.12) * 60.0, 2.0)) * (1.0 - float(i) / 10.0);
  }
  col *= 1.0 - 0.18 * min(trail, 1.0);

  vec2 g0 = vec2(-0.5, 0.2) + shake;
  vec2 g1 = vec2(0.52, 0.22) + shake * 0.7;
  vec2 g2 = path0 + shake * 0.4;
  shadowAt(col, uv, g0, 0.15);
  shadowAt(col, uv, g1, 0.13);
  shadowAt(col, uv, g2, 0.14);
  glassAt(col, uv, g0, 0.15, 1.0, tremor, T, 0.0);
  glassAt(col, uv, g1, 0.13, 0.0, tremor, T, 2.0);
  glassAt(col, uv, g2, 0.14, 1.0, tremor + 0.2, T, 4.0);

  // dust turning in the window light
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec2 dp = vec2(fract(0.1 * T * (0.1 + 0.05 * h21(vec2(fi, 1.0))) + h21(vec2(fi, 2.0))) * 1.8 - 0.9,
                   0.5 * sin(T * 0.05 + fi * 1.7) + 0.1);
    col += vec3(0.4, 0.37, 0.3) * smoothstep(0.004, 0.0, length(uv - dp)) * 0.4 * exp(-length(dp - vec2(-0.6, 0.5)) * 1.5);
  }

  // muted colour, the way the last scene is lit
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(col, lum * vec3(1.05, 0.95, 0.75), 0.3);
  col = 1.0 - exp(-col * 1.6);
  vec2 vq = fragCoord / iResolution.xy - 0.5;
  col *= 1.0 - 0.9 * dot(vq, vq);
  fragColor = vec4(col, 1.0);
}
