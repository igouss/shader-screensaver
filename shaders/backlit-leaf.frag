// Backlit Leaf — a single leaf glowing against the dark wood, its veins and areoles lit by a slowly wandering sunfleck (FragCoord GLSL)
// Theme: forest

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 31.7)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// distance to Voronoi cell borders (areoles between the minor veins)
float voronoiEdge(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  vec2 mr; float md = 8.0; vec2 mg;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(i, j);
    vec2 r = g + hash2(n + g) * 0.8 + 0.1 - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = mg + vec2(i, j);
    vec2 r = g + hash2(n + g) * 0.8 + 0.1 - f;
    if (dot(mr - r, mr - r) > 0.0001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return md;
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = mod(u_time, 6283.0);
  float px = 1.0 / u_resolution.y;

  // dark wood background with soft bokeh discs of distant sunlit foliage
  vec3 col = mix(vec3(0.01, 0.02, 0.012), vec3(0.03, 0.045, 0.02), smoothstep(-0.6, 0.6, uv.y + uv.x * 0.3));
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    vec2 c = vec2((hash(vec2(fi, 1.0)) - 0.5) * 2.2, (hash(vec2(fi, 2.0)) - 0.5) * 1.1);
    c += 0.05 * vec2(sin(t * 0.07 + fi), cos(t * 0.05 + fi * 1.3));
    float r = 0.05 + 0.09 * hash(vec2(fi, 3.0));
    float d = length(uv - c) - r;
    float disc = smoothstep(0.01, -0.01, d) * (0.6 + 0.4 * smoothstep(-r, 0.0, d));
    vec3 bc = mix(vec3(0.25, 0.35, 0.08), vec3(0.4, 0.33, 0.1), hash(vec2(fi, 4.0)));
    col += bc * disc * 0.12 * (0.6 + 0.4 * sin(t * 0.13 + fi * 2.0));
  }

  // leaf frame: gentle sway
  float sway = 0.09 * sin(t * 0.21) + 0.03 * sin(t * 0.47 + 1.0);
  vec2 drift = 0.03 * vec2(sin(t * 0.13), cos(t * 0.11));
  vec2 p = rot(-0.45 + sway) * (uv - vec2(0.02, -0.02) - drift) * 1.1;
  p.y += 0.06 * p.x * p.x;               // leaf arches slightly
  float L = 0.78;
  float u = p.x / L;                      // -1 at stem end, +1 at tip
  float half_w = 0.33 * pow(max(1.0 - u * u, 0.0), 0.75) * (1.0 - 0.25 * u);
  // serrated margin
  float teeth = 0.008 * (1.0 - abs(fract(p.x * 32.0 + (p.y > 0.0 ? 0.0 : 0.5)) - 0.5) * 2.0);
  float margin = abs(p.y) - (half_w - teeth * step(-0.9, u));
  float inLeaf = smoothstep(px * 1.5, -px * 1.5, margin) * step(u, 1.0);

  // stem
  float stemMask = smoothstep(px * 1.5, -px * 1.5, max(abs(p.y) - 0.008, max(-(p.x + L + 0.25), p.x + L)));

  // sunfleck wandering across the leaf (the light coming through from behind)
  vec2 fleck = vec2(0.4 * sin(t * 0.12), 0.12 * sin(t * 0.17 + 1.3));
  float light = 0.35 + 1.3 * exp(-dot(p - fleck, p - fleck) * 7.0);

  // veins
  float ay = abs(p.y);
  float mid = ay - 0.006 * (1.0 - 0.7 * u);                       // midrib
  float v = p.x - 1.1 * ay + 1.3 * ay * ay;                           // secondaries sweep toward the tip
  float sp = 0.085;
  float vf = (fract(v / sp + (p.y > 0.0 ? 0.0 : 0.5)) - 0.5) * sp;
  float sec = abs(vf) - 0.0035 * (1.0 - ay / max(half_w, 0.01));
  float secFade = smoothstep(0.0, 0.03, half_w - ay);
  float tert = voronoiEdge(p * 26.0 + 3.0) / 26.0;
  float quat = voronoiEdge(p * 70.0 + 9.0) / 70.0;

  // lamina: translucent chlorophyll green with cell texture
  float cells = vnoise(p * 180.0) * 0.5 + vnoise(p * 40.0) * 0.5;
  vec3 lam = mix(vec3(0.20, 0.42, 0.04), vec3(0.42, 0.55, 0.06), cells * 0.6 + 0.2 * u);
  // minor veins read darker (more tissue), major veins paler and brighter
  lam *= 0.72 + 0.28 * smoothstep(0.0, 0.0022, tert);
  lam *= 0.85 + 0.15 * smoothstep(0.0, 0.0012, quat);
  vec3 veinCol = vec3(0.75, 0.78, 0.25);
  float secLine = smoothstep(px * 1.2, -px * 0.5, sec) * secFade;
  float midLine = smoothstep(px * 1.5, -px * 0.5, mid);
  lam = mix(lam, veinCol * 0.8, secLine * 0.75);
  lam = mix(lam, veinCol, midLine);
  // a darker rim where the leaf edge thickens
  lam *= 0.7 + 0.3 * smoothstep(0.0, 0.02, -margin);

  vec3 leaf = lam * light * 0.55;
  col = mix(col, leaf, inLeaf);
  col = mix(col, vec3(0.05, 0.07, 0.02), stemMask * (1.0 - inLeaf));

  // soft glow halo around the lit leaf
  col += vec3(0.08, 0.1, 0.02) * exp(-max(margin, 0.0) * 18.0) * (1.0 - inLeaf) * light * 0.4;

  col *= 1.0 - 0.45 * pow(length(uv * vec2(0.75, 1.0)), 2.0);
  col = 1.0 - exp(-col * 1.6);
  fragColor = vec4(col, 1.0);
}
