// Sage Mesh — crosshatch security tint: two families of wobbly, unevenly spaced diagonal strokes crossing into a hand-ruled net (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

float vnoise1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

float strokes(vec2 p, vec2 dir, float seed) {
  vec2 n = vec2(-dir.y, dir.x);
  float along = dot(p, dir);
  float u = dot(p, n) + 0.35 * (vnoise1(along * 0.09 + seed * 7.0) - 0.5);
  float ink = 0.0;
  float i0 = floor(u);
  float side = fract(u) < 0.5 ? -1.0 : 1.0;
  float aa = fwidth(u);
  for (int k = 0; k < 2; k++) {
    float i = i0 + side * float(k);
    float h = hash(i + seed * 131.0);
    float c = i + 0.5 + 0.32 * (h - 0.5) + 0.12 * (vnoise1(along * 0.23 + i * 3.7) - 0.5);
    float w = 0.13 + 0.07 * hash(i * 1.7 + seed * 53.0) + 0.04 * (vnoise1(along * 0.5 + i) - 0.5);
    float d = abs(u - c);
    ink = max(ink, 1.0 - smoothstep(w - aa, w + aa, d));
  }
  return ink;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.03 * sin(t * 0.015);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv * 30.0 + vec2(mod(t * 0.1, 1000.0), mod(t * 0.04, 1000.0));

  vec2 d1 = normalize(vec2(1.0, 0.86));
  vec2 d2 = normalize(vec2(-1.0, 1.12));
  float ink = max(strokes(p, d1, 1.0), strokes(p, d2, 2.0));

  float gain = 0.7 + 0.3 * vnoise(gl_FragCoord.xy * 0.45) + 0.25 * (vnoise(p * 0.12) - 0.5);
  ink *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.025, 0.035, 0.035) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 sage = vec3(0.55, 0.72, 0.68);
  vec3 col = mix(paper, sage, ink * 0.75);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
