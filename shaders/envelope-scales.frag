// Envelope Scales — seigaiha security tint: overlapping fans of concentric arcs, drifting like a sheet on a light table (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

vec3 frontScale(vec2 p) {
  float j0 = floor(p.y * 2.0) - 2.0;
  for (int k = 0; k < 5; k++) {
    float j = j0 + float(k);
    float shift = mod(j, 2.0);
    float cx = floor((p.x - shift) * 0.5 + 0.5) * 2.0 + shift;
    vec2 c = vec2(cx, j * 0.5);
    float r = length(p - c);
    if (r < 1.0) return vec3(r, c);
  }
  return vec3(2.0, 0.0, 0.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.1 * sin(t * 0.02);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv * 5.0 + vec2(t * 0.025, t * 0.012);
  p += 0.05 * vec2(sin(p.y * 0.5 + t * 0.07), cos(p.x * 0.4 - t * 0.05));

  vec3 s = frontScale(p);
  float rings = 5.0;
  float x = s.x * rings;
  float d = abs(fract(x) - 0.5);
  float aa = fwidth(x) * 1.2;
  float ink = 1.0 - smoothstep(0.13 - aa, 0.13 + aa, d);
  float rim = 1.0 - smoothstep(0.0, aa * 1.5, abs(s.x - 1.0) * rings - 0.04);
  ink = max(ink, rim) * step(0.04, s.x);

  float gain = 0.72 + 0.28 * vnoise(gl_FragCoord.xy * 0.4) + 0.2 * (vnoise(p * 1.3 + s.yz * 3.1) - 0.5);
  ink *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.02, 0.03, 0.065) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 cobalt = vec3(0.38, 0.6, 1.0);
  vec3 col = mix(paper, cobalt, ink * 0.8);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
