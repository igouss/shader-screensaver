// Quen Shield — the witcher's golden ward: a shimmering sphere of cells that ripples where blows land, the sign's glyph glowing at its heart (FragCoord GLSL)
// Theme: The Witcher

const float TAU = 6.2831853;

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
float hash1(float n) { return fract(sin(n * 91.345) * 47453.5453); }

// cellular pattern: x = distance to the cell border, y = cell id, and the feature point
vec2 voronoi(vec3 p, out vec3 feat) {
  vec3 ip = floor(p), fp = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec3 best = vec3(0.0), bid = vec3(0.0);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 r = g + hash33(ip + g) * 0.85 - fp;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; best = r; bid = ip + g; }
    else if (d < d2) { d2 = d; }
  }
  feat = p + best;
  return vec2(sqrt(d2) - sqrt(d1), fract(sin(dot(bid, vec3(7.1, 157.3, 113.7))) * 43758.5));
}

float segd(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float shell(vec3 p, vec3 rd, mat3 R, float t) {
  vec3 n = normalize(p);
  vec3 sp = R * n;
  vec3 feat;
  vec2 v = voronoi(sp * 4.2, feat);
  vec3 cdir = normalize(feat);
  float cb = 0.3 + 0.25 * sin(mod(t * 0.8, TAU) + v.y * TAU);
  // blows landing on the ward: a bright spot, then a ring of lit cells running outward
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cyc = t * 0.11 + fi / 3.0;
    float ph = fract(cyc);
    float id = mod(floor(cyc), 97.0);
    vec3 dir = normalize(hash33(vec3(id, fi, 3.7)) - 0.5);
    float ang = acos(clamp(dot(cdir, dir), -1.0, 1.0));
    float env = smoothstep(0.0, 0.06, ph) * (1.0 - ph) * (1.0 - ph);
    cb += env * (1.6 * exp(-pow((ang - ph * 2.4) * 5.0, 2.0)) + 1.5 * exp(-ang * ang * 40.0));
  }
  float edge = exp(-v.x * 16.0);
  float rim = pow(1.0 - abs(dot(n, rd)), 2.5);
  return edge * (0.25 + cb) * 0.9 + 0.1 * cb + rim * 0.9;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  vec3 gold = vec3(1.0, 0.68, 0.26);

  vec3 ro = vec3(0.0, 0.0, -3.3);
  vec3 rd = normalize(vec3(uv, 1.7));
  float Rs = 0.8;

  float a1 = mod(t * 0.09, TAU), a2 = mod(t * 0.05, TAU);
  mat3 R = mat3(cos(a1), 0.0, sin(a1), 0.0, 1.0, 0.0, -sin(a1), 0.0, cos(a1))
         * mat3(1.0, 0.0, 0.0, 0.0, cos(a2), -sin(a2), 0.0, sin(a2), cos(a2));

  // warm dark ground and halo
  float rl = length(uv);
  vec3 col = vec3(0.012, 0.008, 0.004) + gold * 0.1 * exp(-rl * 3.0);

  float b = dot(ro, rd);
  float c = dot(ro, ro) - Rs * Rs;
  float disc = b * b - c;
  float closest = sqrt(max(dot(ro, ro) - b * b, 0.0));
  col += gold * 0.25 * exp(-max(closest - Rs, 0.0) * 14.0);

  if (disc > 0.0) {
    float sq = sqrt(disc);
    vec3 pf = ro + rd * (-b - sq);
    vec3 pb = ro + rd * (-b + sq);
    float glow = shell(pf, rd, R, t) + 0.45 * shell(pb, rd, R, t);
    // the Quen glyph hanging inside, seen through the ward
    vec2 g = uv / 0.23;
    g.y += 0.1;
    float d = segd(g, vec2(-0.75, -0.55), vec2(0.0, 0.8));
    d = min(d, segd(g, vec2(0.75, -0.55), vec2(0.0, 0.8)));
    d = min(d, segd(g, vec2(-0.75, -0.55), vec2(0.75, -0.55)));
    d = min(d, abs(length(g - vec2(0.0, -0.1)) - 0.22));
    d = min(d, segd(g, vec2(0.0, 0.8), vec2(0.0, 1.1)));
    d = min(d, segd(g, vec2(-0.75, -0.55), vec2(-0.98, -0.72)));
    d = min(d, segd(g, vec2(0.75, -0.55), vec2(0.98, -0.72)));
    float gl = 0.75 + 0.25 * sin(mod(t * 0.6, TAU));
    glow += gl * (smoothstep(0.07, 0.03, d) * 1.1 + exp(-d * 5.0) * 0.35);
    col += gold * glow * 0.5;
    col += vec3(1.0, 0.95, 0.8) * smoothstep(0.03, 0.0, d) * 0.3 * gl;
  }

  // loose motes of the ward drifting around it
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float h = hash1(fi * 3.3 + 1.0);
    float ang = mod(t * (0.1 + 0.12 * h), TAU) + fi * 1.7;
    float el = (hash1(fi * 7.1) - 0.5) * 1.6 + 0.2 * sin(mod(t * 0.2, TAU) + fi);
    float rr = Rs * (1.12 + 0.35 * hash1(fi * 5.7));
    vec3 mp = rr * vec3(cos(ang) * cos(el), sin(el), sin(ang) * cos(el));
    vec2 sp = mp.xy / (mp.z + 3.3) * 1.7;
    float dd = length(uv - sp);
    float bright = (mp.z < 0.0 || length(sp) > Rs / 3.3 * 1.7) ? 1.0 : 0.4;
    col += gold * bright * 0.5 * exp(-dd * dd * 20000.0) + gold * bright * 0.04 * exp(-dd * 60.0);
  }

  col = 1.0 - exp(-col * 1.4);
  col *= 1.0 - 0.3 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
