// Log Jam — security tint of short parallel dash bundles tossed at random angles, drifting like timber on slow water (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float bundle(vec2 p, vec2 cell) {
  vec3 h = hash3(cell);
  vec3 g = hash3(cell + 41.7);
  vec2 c = cell + vec2(0.5 + 0.5 * mod(cell.y, 2.0), 0.5) + (h.xy - 0.5) * 0.3;
  vec2 q = p - c;
  vec2 dir = normalize(vec2(h.z, g.x) - 0.5 + 1e-4);
  q = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x)));
  float n = g.z < 0.4 ? 2.0 : 3.0;
  float pitch = 0.21;
  float k = clamp(floor(q.y / pitch + 0.5 * n), 0.0, n - 1.0);
  vec2 o = vec2((fract(g.x * 7.0 + k * 0.37) - 0.5) * 0.12, (k - 0.5 * (n - 1.0)) * pitch);
  float halfLen = 0.27 + 0.12 * fract(g.y * 5.0 + k * 0.61);
  vec2 r = q - o;
  r.x = max(abs(r.x) - halfLen, 0.0);
  return length(r);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.08 * sin(t * 0.015);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv * 9.0 + vec2(t * 0.02, -t * 0.011);
  p += 0.06 * vec2(sin(p.y * 0.45 + t * 0.05), cos(p.x * 0.4 - t * 0.04));

  float row = floor(p.y);
  float near = fract(p.y) < 0.5 ? -1.0 : 1.0;
  float d = 9.0;
  for (int j = 0; j <= 1; j++) {
    float y = row + float(j) * near;
    float x = p.x - 0.5 * mod(y, 2.0);
    float x0 = floor(x);
    float side = fract(x) < 0.5 ? -1.0 : 1.0;
    d = min(d, bundle(p, vec2(x0, y)));
    d = min(d, bundle(p, vec2(x0 + side, y)));
  }

  float aa = length(fwidth(p)) * 0.6;
  float ink = 1.0 - smoothstep(0.055 - aa, 0.055 + aa, d);

  float grain = vnoise(gl_FragCoord.xy * 0.4);
  float gain = 0.72 + 0.28 * grain + 0.2 * (vnoise(p * 1.7) - 0.5);
  ink *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.02, 0.025, 0.07) + 0.012 * grain;
  vec3 cobalt = vec3(0.42, 0.5, 1.0);
  vec3 col = mix(paper, cobalt, ink * 0.85);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
