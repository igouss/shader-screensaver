// Wild Hunt — spectral riders streaming across a cold night sky under the moon while the White Frost creeps in crystal from the edges of the world (Shadertoy)
// Theme: The Witcher

const float TAU = 6.2831853;

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
// value noise whose lattice repeats every 64 cells in x, so the procession's drift can wrap
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, 64.0), x1 = mod(i.x + 1.0, 64.0);
  return mix(mix(hash2(vec2(x0, i.y)), hash2(vec2(x1, i.y)), f.x),
             mix(hash2(vec2(x0, i.y + 1.0)), hash2(vec2(x1, i.y + 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.0 + vec2(0.0, 7.3);
    a *= 0.5;
  }
  return v;
}
// distance to the nearest Voronoi border
float cellEdge(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  vec2 mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(ip + g) - fp;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(ip + g) - fp;
    if (dot(mr - r, mr - r) > 0.0001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return md;
}

float pathY(float x) { return 0.02 + 0.1 * sin(x * 1.3 + 0.8) + 0.035 * sin(x * 3.1 + 2.0); }

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 res = iResolution.xy;
  vec2 uv = (fragCoord - 0.5 * res) / res.y;
  float asp = res.x / res.y;
  float t = iTime;
  vec3 spectral = vec3(0.55, 0.85, 1.0);

  // cold night sky, drifting cloud
  vec3 col = mix(vec3(0.004, 0.008, 0.02), vec3(0.02, 0.04, 0.075), smoothstep(-0.6, 0.6, uv.y));
  float cl = fbm(uv * vec2(1.6, 3.0) + vec2(mod(t * 0.02, 64.0), 0.0));
  col += vec3(0.03, 0.05, 0.08) * smoothstep(0.4, 0.8, cl);
  vec2 mc = vec2(0.42, 0.26);
  float md = length(uv - mc);
  float maria = 0.8 + 0.2 * fbm((uv - mc) * 22.0 + 40.0);
  col += vec3(0.75, 0.85, 0.95) * maria * smoothstep(0.072, 0.066, md) * (0.55 - 0.25 * smoothstep(0.45, 0.75, cl));
  col += vec3(0.4, 0.55, 0.75) * exp(-md * 7.0) * 0.12;

  // the Hunt's road: spectral mist flowing left to right along a wavering path
  float flowx = mod(t * 0.18, 64.0);
  float py = pathY(uv.x);
  float warp = fbm(vec2(uv.x * 3.0 - flowx * 3.0, uv.y * 4.0)) - 0.5;
  float dy = uv.y - py + warp * 0.08;
  float mist = fbm(vec2(uv.x * 5.0 - flowx * 5.0, dy * 9.0));
  col += spectral * exp(-dy * dy * 90.0) * smoothstep(0.35, 0.8, mist) * 0.35;

  // riders: cold bright heads with cloaks of ghost-light streaming behind
  float W = asp + 1.8;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float hx = mod(t * 0.09 + fi * W / 6.0 + 0.13 * sin(fi * 2.3), W) - W * 0.5;
    vec2 hp = vec2(hx, pathY(hx) + 0.025 * sin(mod(t * 0.9, TAU) + fi * 1.9));
    vec2 dv = uv - hp;
    float behind = hx - uv.x;
    if (behind > -0.05) {
      float spread = 1.0 + max(behind, 0.0) * 9.0;
      float cloakY = uv.y - pathY(uv.x) - (hp.y - pathY(hx)) * exp(-behind * 4.0);
      float wisp = fbm(vec2(uv.x * 7.0 - flowx * 9.0 + fi * 5.0, cloakY * 14.0 / spread));
      float cloak = exp(-cloakY * cloakY * 1400.0 / (spread * spread)) * exp(-max(behind, 0.0) * 3.5)
                  * smoothstep(-0.05, 0.03, behind) * (0.4 + 1.2 * wisp);
      col += spectral * cloak * 0.8;
    }
    float hd = dot(dv * vec2(1.0, 1.3), dv * vec2(1.0, 1.3));
    col += vec3(0.85, 0.95, 1.0) * (exp(-hd * 5000.0) * 1.4 + exp(-sqrt(hd) * 22.0) * 0.18);
  }

  // White Frost creeping in from the edges, growing and retreating very slowly
  float ex = asp * 0.5 - abs(uv.x), ey = 0.5 - abs(uv.y);
  float e = length(vec2(ex, ey));  // distance to the nearest corner: the frost grows from the corners
  float grow = 0.3 + 0.07 * sin(mod(t * 0.04, TAU));
  float fn = fbm(uv * 5.0 + 20.0);
  float front = e - grow - (fn - 0.5) * 0.22;
  float mask = smoothstep(0.012, -0.012, front);
  if (mask > 0.0) {
    float c1 = cellEdge(uv * 9.0 + 3.0);
    float c2 = cellEdge(uv * 23.0 + fn * 2.0);
    float lines = exp(-c1 * 40.0) * 0.5 + exp(-c2 * 30.0) * 0.35;
    float depth = smoothstep(0.0, -0.2, front);
    vec3 frost = vec3(0.55, 0.75, 0.9) * (0.04 + 0.14 * depth + lines * (0.15 + 0.3 * depth));
    frost += vec3(0.8, 0.95, 1.0) * pow(noise(uv * 90.0), 12.0) * 0.8 * depth;  // glints
    col = mix(col, frost + col * 0.5, mask * 0.85);
  }
  col += vec3(0.6, 0.85, 1.0) * exp(-abs(front) * 70.0) * 0.12;

  col = 1.0 - exp(-col * 1.5);
  col *= 1.0 - 0.25 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
