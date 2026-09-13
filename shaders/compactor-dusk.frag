// Compactor Dusk — slender towers of compacted trash cubes fading into a rust-orange haze and a low sun, a little boxy robot on a cube watching the dust blow (FragCoord GLSL)
// Theme: Wall-E

float hash(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdRBox(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }

// one layer of towers built from stacked cubes of size bs (layer units, cell width 1).
// returns distance (<0 inside, screen units); tint = per-cube shade, seam = cube joints
float towers(vec2 q, float scale, float seed, float bs, float density, float hmax, out float tint, out float seam) {
  float cx = floor(q.x);
  float d = 1e5;
  tint = 1.0; seam = 0.0;
  for (int n = -1; n <= 1; n++) {
    float c = cx + float(n);
    float cm = mod(c, 89.0);
    if (hash(vec2(cm, seed + 11.0)) > density) continue;
    float h = hash(vec2(cm, seed));
    float wBlocks = 3.0 + floor(4.0 * hash(vec2(cm, seed + 3.0)));   // 3..6 cubes wide
    float w = 0.5 * wBlocks * bs;
    float ht = floor((0.2 + h * h * hmax) / bs) * bs + 2.0 * bs;
    float xc = c + 0.5 + (hash(vec2(cm, seed + 5.0)) - 0.5) * 0.4;
    float row = floor(q.y / bs);
    // every course of cubes is shoved a little sideways and is a slightly different width
    float jig = (hash(vec2(cm * 3.1 + row, seed + 1.0)) - 0.5) * bs * 0.3;
    float taper = 1.0 - 0.3 * clamp(q.y / ht, 0.0, 1.0);             // narrowing toward the top
    float wr = floor(w * taper / (0.5 * bs) + hash(vec2(row, cm + seed)) * 1.4 - 0.5) * 0.5 * bs;
    vec2 lp = vec2(q.x - xc - jig, q.y);
    float db = sdBox(lp - vec2(0.0, ht * 0.5), vec2(max(wr, bs * 0.9), ht * 0.5));
    // a stray cube or two perched on top
    float tb = sdBox(lp - vec2((h - 0.5) * w, ht + bs * 0.5), vec2(bs * 0.5));
    if (h > 0.3) db = min(db, tb);
    if (db < d) {
      d = db;
      vec2 bl = vec2(lp.x / bs + 0.5 * mod(row, 2.0), lp.y / bs);
      vec2 f = abs(fract(bl) - 0.5);
      seam = smoothstep(0.40, 0.5, max(f.x, f.y));
      tint = 0.65 + 0.7 * hash(floor(bl) + vec2(cm * 7.0, seed));
    }
  }
  return d / scale;
}

// the robot, front view, sitting with its treads on the cube; origin at tread bottom
float robot(vec2 r, float look) {
  float body = sdRBox(r - vec2(0.0, 0.062), vec2(0.037, 0.040), 0.003);
  vec2 tr = vec2(abs(r.x) - 0.052, r.y - 0.030);
  float tread = sdRBox(tr, vec2(0.016, 0.030), 0.008);
  float arms = sdRBox(vec2(abs(r.x) - 0.050, r.y - 0.066), vec2(0.018, 0.006), 0.003);
  vec2 np = r - vec2(0.0, 0.094);
  float neck = sdBox(np - vec2(0.0, 0.014), vec2(0.0045, 0.016));
  vec2 hp = np - vec2(0.0, 0.040);
  hp = mat2(cos(look), -sin(look), sin(look), cos(look)) * hp;
  // two binocular eyes, tipped apart
  vec2 e = vec2(abs(hp.x) - 0.020, hp.y);
  e = mat2(cos(0.10), sin(0.10), -sin(0.10), cos(0.10)) * e;
  float eyes = sdRBox(e, vec2(0.018, 0.013), 0.008);
  float bridge = sdBox(hp, vec2(0.006, 0.004));
  return min(min(min(body, tread), min(arms, neck)), min(eyes, bridge));
}

void main() {
  vec2 res = u_resolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float T = mod(u_time, 3600.0);
  float aspect = res.x / res.y;

  vec2 sun = vec2(-0.30, -0.12);
  float sd = length((p - sun) * vec2(0.8, 1.2));
  float horizon = -0.26;

  // sky: dusty rust gradient, yellower low and toward the sun
  vec3 col = mix(vec3(0.62, 0.30, 0.11), vec3(0.09, 0.045, 0.03), smoothstep(horizon, 0.6, p.y));
  col += vec3(1.0, 0.55, 0.22) * exp(-sd * 3.0) * 0.45;
  col += vec3(1.0, 0.85, 0.55) * smoothstep(0.042, 0.034, length(p - sun)) * 0.55;
  float haze = fbm(vec2(p.x * 1.6 + T * 0.012, p.y * 6.0 - T * 0.003));
  col *= 0.8 + 0.4 * haze;

  // three layers of towers, far to near, drifting past at parallax speeds
  float tint, seam;
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float scale = L == 0 ? 11.0 : (L == 1 ? 6.0 : 3.2);
    float bs = L == 0 ? 0.16 : (L == 1 ? 0.13 : 0.11);
    float dens = L == 0 ? 0.9 : (L == 1 ? 0.65 : 0.35);
    float hmax = L == 0 ? 5.5 : (L == 1 ? 4.5 : 2.4);
    float speed = 0.003 + fl * 0.005;
    float yb = horizon - 0.01 - fl * 0.035;
    vec2 q = vec2((p.x + T * speed) * scale + fl * 31.0, (p.y - yb) * scale);
    float dT = towers(q, scale, 17.0 + fl * 5.0, bs, dens, hmax, tint, seam);
    float cover = smoothstep(0.0012, -0.0012, dT) * step(yb - 0.02, p.y);
    vec3 hazeCol = mix(vec3(0.40, 0.19, 0.075), vec3(0.75, 0.40, 0.16), exp(-sd * 2.2));
    vec3 tc = vec3(0.10, 0.052, 0.03) * mix(1.0, tint, 0.5 + 0.3 * fl);
    tc *= 1.0 - seam * (0.35 + 0.15 * fl);
    // the sun-facing side of each tower catches a warm edge
    tc += vec3(0.7, 0.33, 0.1) * smoothstep(-0.006 - 0.004 * fl, 0.0, dT) * 0.25 * exp(-abs(p.x - sun.x) * 1.2);
    // aerial perspective: far towers dissolve into the haze
    float fog = L == 0 ? 0.72 : (L == 1 ? 0.45 : 0.12);
    fog *= 0.7 + 0.3 * smoothstep(0.4, horizon, p.y);
    tc = mix(tc, hazeCol * (0.75 + 0.35 * haze), fog);
    col = mix(col, tc, cover);
    // sunlight scattering over the layer
    col += vec3(1.0, 0.55, 0.2) * exp(-sd * 5.0) * 0.07 * (1.0 - fl * 0.3);
  }

  // the dusty plain and the robot's cube
  vec2 rb = vec2(0.30, -0.345);
  float ground = p.y - (horizon - 0.075) - 0.012 * fbm(vec2(p.x * 7.0, 1.0)) + 0.02;
  float cube = sdRBox(p - rb, vec2(0.09, 0.075), 0.004);
  vec3 gc = mix(vec3(0.18, 0.085, 0.035), vec3(0.04, 0.02, 0.013), smoothstep(horizon - 0.08, -0.5, p.y));
  gc *= 0.7 + 0.6 * fbm(p * vec2(18.0, 40.0));
  gc += vec3(0.4, 0.18, 0.06) * exp(-length((p - vec2(sun.x, horizon - 0.08)) * vec2(0.7, 4.0)) * 3.0) * 0.25;
  col = mix(col, gc, smoothstep(0.002, -0.002, ground));

  // a compacted cube: crushed scrap in irregular slabs
  vec2 cq = (p - rb) * vec2(26.0, 40.0);
  cq.x += 0.5 * floor(cq.y);
  vec2 cf = abs(fract(cq) - 0.5);
  vec3 cc = vec3(0.07, 0.036, 0.022) * (0.5 + 0.8 * hash(floor(cq))) * (0.7 + 0.6 * noise(p * 150.0));
  cc *= 1.0 - 0.45 * smoothstep(0.38, 0.5, max(cf.x, cf.y));
  cc += vec3(0.8, 0.4, 0.12) * smoothstep(-0.006, 0.0, sdRBox(p - rb - vec2(-0.004, 0.003), vec2(0.09, 0.075), 0.004)) * 0.3 * step(cube, 0.0);
  col = mix(col, cc, smoothstep(0.0015, -0.0015, cube));

  // the robot on top, looking about slowly
  vec2 r0 = p - rb - vec2(0.0, 0.075);
  float look = 0.16 * sin(T * 0.11) + 0.07 * sin(T * 0.047 + 1.0);
  const float RS = 1.3;                                       // robot scale
  float rd = robot(r0 / RS, look) * RS;
  float rl = robot((r0 + normalize(p - sun) * 0.006) / RS, look) * RS;   // offset toward the sun for a rim
  vec3 rc = vec3(0.05, 0.028, 0.016);
  rc += vec3(1.0, 0.55, 0.2) * smoothstep(-0.001, 0.004, rl) * 0.55;
  // lenses: faint amber glints
  vec2 hp = mat2(cos(look), -sin(look), sin(look), cos(look)) * (r0 / RS - vec2(0.0, 0.134));
  float lens = length(vec2(abs(hp.x) - 0.022, hp.y - 0.001));
  rc += vec3(1.0, 0.7, 0.35) * smoothstep(0.004, 0.001, lens) * (0.35 + 0.1 * sin(T * 0.3));
  rc += vec3(0.8, 0.45, 0.18) * smoothstep(0.0022, 0.0006, abs(lens - 0.0095)) * 0.3;    // lens rims
  col = mix(col, rc, smoothstep(0.0015, -0.0015, rd));

  // dust motes drifting in front, lit by the sun
  for (int j = 0; j < 2; j++) {
    float fj = float(j);
    vec2 q = p * (9.0 + fj * 9.0) + vec2(T * (0.09 + 0.05 * fj), sin(T * 0.07 + fj) * 0.6 - T * 0.012);
    vec2 cid = floor(q);
    float h = hash(cid + fj * 19.0);
    vec2 off = vec2(hash(cid + 2.3), hash(cid + 5.9)) - 0.5;
    float m = smoothstep(0.07, 0.0, length(fract(q) - 0.5 - off * 0.7)) * step(0.82, h);
    col += vec3(0.9, 0.55, 0.25) * m * (0.08 + 0.3 * exp(-sd * 2.5)) / (1.0 + fj);
  }
  // a veil of blowing dust low over the plain
  float veil = fbm(vec2(p.x * 2.5 - T * 0.05, p.y * 9.0));
  col += vec3(0.4, 0.19, 0.07) * veil * 0.10 * smoothstep(0.05, -0.3, p.y);

  col *= 1.0 - 0.45 * dot(p * vec2(0.85, 1.0), p * vec2(0.85, 1.0));
  col = 1.0 - exp(-col * 1.3);
  fragColor = vec4(col, 1.0);
}
