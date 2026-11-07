// Blue Tartan — plaid security tint: fine graph-paper grid crossed by broad diagonal bands of doubled hatching that overlap like woven tartan (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

float line(float x, float halfWidth) {
  float d = abs(fract(x + 0.5) - 0.5);
  float aa = fwidth(x);
  return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, d);
}

float band(float x, float period, float seed) {
  float cell = floor(x / period);
  float f = x - cell * period;
  float w = period * (0.36 + 0.16 * hash(cell + seed));
  float aa = fwidth(x);
  return smoothstep(-aa, aa, f - 0.5) * (1.0 - smoothstep(-aa, aa, f - 0.5 - w));
}

float edge(float x, float period, float seed) {
  float cell = floor(x / period);
  float f = x - cell * period;
  float w = period * (0.36 + 0.16 * hash(cell + seed));
  float aa = fwidth(x);
  float d = min(abs(f - 0.5), abs(f - 0.5 - w));
  return 1.0 - smoothstep(0.065 - aa, 0.065 + aa, d);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  vec2 drift = vec2(mod(t * 0.09, 400.0), mod(t * 0.04, 400.0));
  vec2 p = rot(0.02 * sin(t * 0.013)) * uv * 52.0 + drift;
  p += 0.12 * vec2(sin(p.y * 0.07 + t * 0.03), cos(p.x * 0.06 - t * 0.025));

  vec2 g = rot(-0.14) * p;
  vec2 b = rot(0.72) * p;

  float bx = band(b.x, 17.0, 3.0);
  float by = band(b.y, 21.0, 9.0);

  float hw = 0.075;
  float gx = max(line(g.x, hw), bx * line(g.x * 2.0, hw * 2.0) * 0.85);
  float gy = max(line(g.y, hw), by * line(g.y * 2.0, hw * 2.0) * 0.85);
  float grid = max(gx, gy);
  float rule = max(edge(b.x, 17.0, 3.0), edge(b.y, 21.0, 9.0));

  float tone = 0.72 + 0.18 * max(bx, by) + 0.1 * bx * by;
  float ink = max(grid * tone, rule * 0.65);

  float gain = 0.7 + 0.3 * vnoise(gl_FragCoord.xy * 0.45) + 0.25 * (vnoise(p * 0.08) - 0.5);
  ink *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.02, 0.03, 0.06) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 sky = vec3(0.55, 0.72, 0.95);
  vec3 col = mix(paper, sky, ink * 0.85);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
