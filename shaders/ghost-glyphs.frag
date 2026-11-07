// Ghost Glyphs — code security tint: dense rows of blocky glyphs knocked out of a fine grey halftone, a few slowly rewriting themselves (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

const vec2 GLYPH = vec2(4.0, 5.0);

float bitOn(vec2 sc, float epoch) {
  vec2 cell = floor(sc / GLYPH);
  vec2 local = sc - cell * GLYPH;
  if (local.x > 2.5 || local.y > 3.5) return 0.0;
  return step(0.45, hash(sc * 1.37 + epoch * 17.3 + cell * 0.11));
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float roundBox(vec2 d, float h, float r) {
  vec2 q = abs(d) - vec2(h - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float glyphDist(vec2 s, float t) {
  vec2 base = floor(s - 0.5);
  float dist = 1.5;
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 sc = base + vec2(float(i), float(j));
      vec2 cell = floor(sc / GLYPH);
      float ph = t * (0.012 + 0.012 * hash(cell + 3.3)) + hash(cell + 9.1);
      float epoch = floor(ph);
      float on = mix(bitOn(sc, epoch - 1.0), bitOn(sc, epoch), smoothstep(0.0, 0.04, fract(ph)));
      float wob = 0.06 * (hash(sc + 41.0) - 0.5);
      float d = roundBox(s - sc - 0.5, 0.58 + wob, 0.4) + 0.9 * (1.0 - on);
      dist = smin(dist, d, 0.35);
    }
  }
  return dist;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.03 * sin(t * 0.015);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv + vec2(t * 0.0025, t * 0.0012);
  vec2 s = p * vec2(48.0, 40.0);
  s += 0.25 * vec2(vnoise(s * 0.35), vnoise(s * 0.35 + 5.0)) - 0.125;

  float d = glyphDist(s, t);
  float aa = fwidth(d) * 1.2;
  float knock = 1.0 - smoothstep(-aa, aa, d);

  vec2 hp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / 5.0;
  vec2 hc = fract(hp) - 0.5;
  float hd = length(hc);
  float dotR = 0.36 + 0.06 * (vnoise(gl_FragCoord.xy * 0.05) - 0.5);
  float haa = fwidth(hp.x) * 0.9;
  float halftone = 1.0 - smoothstep(dotR - haa, dotR + haa, hd);

  float ink = mix(0.35, 1.0, halftone) * (1.0 - knock);
  float gain = 0.75 + 0.25 * vnoise(gl_FragCoord.xy * 0.4) + 0.2 * (vnoise(s * 0.2) - 0.5);
  ink *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.022, 0.024, 0.028) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 grey = vec3(0.6, 0.62, 0.64);
  vec3 col = mix(paper, grey, ink * 0.8);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
