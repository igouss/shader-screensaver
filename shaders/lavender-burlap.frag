// Lavender Burlap — woven-mesh security tint: blotchy lavender threads with rectangular gaps and a fine crosshatch weave, drifting like loose cloth (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float strand(vec2 q) {
  return 0.65 * vnoise(q) + 0.35 * vnoise(q * 2.3 + 7.1);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.04 * sin(t * 0.017);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv * 9.0 + vec2(t * 0.018, -t * 0.011);
  p += 0.08 * vec2(sin(p.y * 0.6 + t * 0.05), cos(p.x * 0.5 - t * 0.04));

  vec2 warp = 0.18 * vec2(vnoise(p * 1.7 + 3.0), vnoise(p * 1.7 - 5.0)) - 0.09;
  vec2 q = p + warp;
  float rows = strand(vec2(q.x * 1.4, q.y * 3.6));
  float cols = strand(vec2(q.x * 3.6, q.y * 1.4) + 11.0);
  float blot = vnoise(q * 1.1 + 23.0);
  float f = max(rows, cols) + 0.3 * (blot - 0.5);

  float aa = fwidth(f) * 1.2;
  float ink = smoothstep(0.52 - aa, 0.52 + aa, f);

  vec2 fine = q * 7.0;
  float wx = abs(fract(fine.x) - 0.5);
  float wy = abs(fract(fine.y) - 0.5);
  float waa = fwidth(fine.x) * 1.2;
  float weave = max(1.0 - smoothstep(0.12 - waa, 0.12 + waa, wx), 1.0 - smoothstep(0.12 - waa, 0.12 + waa, wy));
  float tone = 0.62 + 0.38 * weave;

  float gain = 0.72 + 0.28 * vnoise(gl_FragCoord.xy * 0.4) + 0.2 * (vnoise(p * 1.3) - 0.5);
  ink *= tone * clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.03, 0.022, 0.06) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 lavender = vec3(0.62, 0.55, 1.0);
  vec3 col = mix(paper, lavender, ink * 0.62);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
