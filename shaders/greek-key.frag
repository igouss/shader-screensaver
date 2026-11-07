// Greek Key — security tint of mirrored rectangular spirals, a meander maze of parallel lines sliding under the light (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.05 * sin(t * 0.017);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv * 4.2 + vec2(t * 0.018, t * 0.009);
  p += 0.025 * vec2(sin(p.y * 0.6 + t * 0.05), cos(p.x * 0.5 - t * 0.04));

  float s = 0.15;
  float w = 0.35;
  float rings = 5.0;
  vec2 extent = vec2(w + (rings + 0.5) * s, (rings + 0.5) * s);
  vec2 tile = 2.0 * extent + 0.02;
  vec2 id = floor(p / tile);
  vec2 q = (fract(p / tile) - 0.5) * tile;
  q.x *= mod(id.x, 2.0) < 1.0 ? 1.0 : -1.0;

  float dl = max(-q.x - w, abs(q.y));
  float dr = max(q.x - w, abs(q.y + 0.5 * s)) - 0.5 * s;
  float x = (q.x < 0.0 ? dl : dr) / s;
  float line = abs(fract(x + 0.5) - 0.5) * s;
  float outer = max(abs(q.x) - extent.x, abs(q.y) - extent.y);

  float halfWidth = 0.32 * s;
  float aa = length(fwidth(p)) * 0.7;
  float ink = 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, line);
  ink *= 1.0 - smoothstep(-0.5 * s - aa, -0.5 * s + aa, outer);

  float gain = 0.72 + 0.28 * vnoise(gl_FragCoord.xy * 0.4) + 0.2 * (vnoise(p * 1.5) - 0.5);
  ink *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.02, 0.025, 0.07) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 cobalt = vec3(0.4, 0.5, 1.0);
  vec3 col = mix(paper, cobalt, ink * 0.7);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
