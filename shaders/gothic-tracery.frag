// Gothic Tracery — square lattice of interlaced circles and quatrefoil arcs with thorned bars and knotted centres, a navy tint under slow drift (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float band(float d, float w) {
  float aa = fwidth(d) * 1.2;
  return 1.0 - smoothstep(w - aa, w + aa, abs(d));
}

float fill(float d) {
  float aa = fwidth(d) * 1.2;
  return 1.0 - smoothstep(-aa, aa, d);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = 0.06 * sin(t * 0.02);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv * 5.5 + vec2(t * 0.02, t * 0.013);
  p += 0.02 * vec2(sin(p.y * 0.7 + t * 0.06), cos(p.x * 0.6 - t * 0.05));

  vec2 c = fract(p) - 0.5;
  vec2 cell = floor(p);
  float par = mod(cell.x + cell.y, 2.0);

  float w = 0.035;
  vec2 g = abs(c);
  vec2 e = 0.5 - g;
  float barD = min(e.x, e.y);
  float along = min(g.x, g.y);
  float thornPos = abs(fract(along * 5.0) - 0.5) / 5.0;
  float thorn = band(thornPos, 0.012) * (1.0 - smoothstep(0.045, 0.06, barD)) * step(0.16, 0.5 - max(g.x, g.y) + 0.16) * step(0.06, along);
  float bars = max(band(barD, w * 1.25), thorn);

  float ring = length(c) - 0.34;
  float ringInk = band(ring, w);
  float corner = length(e) - 0.5;
  float arcInk = band(corner, w);

  float ang = atan(c.y, c.x);
  float over = step(0.0, sin(ang * 4.0 + par * 3.14159));
  float ringGap = band(ring, w * 2.4);
  float arcGap = band(corner, w * 2.4);
  float barGap = band(barD, w * 2.2);
  float lattice = max(ringInk * mix(1.0 - arcGap, 1.0, over), arcInk * mix(1.0, 1.0 - ringGap, over));
  lattice *= 1.0 - barGap;

  float rk = length(e);
  float pet = rk - (0.1 + 0.04 * cos(4.0 * atan(e.y, e.x) * 2.0));
  float knot = max(band(pet, w * 0.8), fill(rk - 0.04));
  float knotGap = band(pet, w * 2.2);
  bars *= 1.0 - knotGap * (1.0 - band(barD, w * 0.9)) ;

  float inkV = clamp(max(max(lattice * (1.0 - knotGap), bars), knot), 0.0, 1.0);

  float gain = 0.72 + 0.28 * vnoise(gl_FragCoord.xy * 0.4) + 0.2 * (vnoise(p * 1.3) - 0.5);
  inkV *= clamp(gain, 0.0, 1.0);

  vec3 paper = vec3(0.015, 0.02, 0.055) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 navy = vec3(0.45, 0.55, 1.0);
  vec3 col = mix(paper, navy, inkV * 0.8);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
