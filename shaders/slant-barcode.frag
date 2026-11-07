// Slant Barcode — diagonal security tint: barcode stripes of uneven width and spacing, cut into staggered columns by thin cross gaps (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

float bar(float u, float i, float seed, float aa) {
  float h = hash(i * 1.37 + seed);
  float w = mix(0.07, 0.34, h * h) * step(0.2, hash(i * 2.91 + seed * 1.7));
  float c = i + 0.5 + (0.5 - w - 0.04) * (hash(i * 0.73 + seed * 3.1) * 2.0 - 1.0);
  return 1.0 - smoothstep(w - aa, w + aa, abs(u - c));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.785 + 0.02 * sin(t * 0.012);
  vec2 dir = vec2(cos(a), -sin(a));
  vec2 nrm = vec2(sin(a), cos(a));
  vec2 p = uv * 38.0;
  float u = dot(p, nrm) + mod(t * 0.06, 500.0);
  float v = dot(p, dir) + mod(t * 0.03, 500.0);

  float colLen = 17.0;
  float col = floor(v / colLen);
  float fv = v - col * colLen;
  float seed = hash(col) * 97.0;
  u += floor(hash(col + 5.0) * 40.0);

  float aa = fwidth(u);
  float i0 = floor(u);
  float ink = max(bar(u, i0, seed, aa), bar(u, i0 + (fract(u) < 0.5 ? -1.0 : 1.0), seed, aa));

  float aav = fwidth(v);
  float gap = 0.2;
  ink *= smoothstep(gap - aav, gap + aav, min(fv, colLen - fv));

  float gain = 0.7 + 0.3 * vnoise(gl_FragCoord.xy * 0.45) + 0.25 * (vnoise(p * 0.06) - 0.5);
  ink *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.03, 0.033, 0.04) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 grey = vec3(0.68, 0.71, 0.72);
  vec3 c = mix(paper, grey, ink * 0.8);

  float vig = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(c * vig, 1.0);
}
