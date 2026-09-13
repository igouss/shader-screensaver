// Velen Swamp — dead trees in moonlit fog over black water, will-o'-wisps drifting, and drowners' eyes surfacing at the waterline (FragCoord GLSL)
// Theme: The Witcher

const float TAU = 6.2831853;
const float HOR = -0.08;  // waterline

float hash1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, 64.0), x1 = mod(i.x + 1.0, 64.0);
  return mix(mix(hash2(vec2(x0, i.y)), hash2(vec2(x1, i.y)), f.x),
             mix(hash2(vec2(x0, i.y + 1.0)), hash2(vec2(x1, i.y + 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.0 + vec2(0.0, 5.1);
    a *= 0.5;
  }
  return v;
}
float segd(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// a gnarled dead tree rooted at the waterline: returns distance to its silhouette
float tree(vec2 p, float id, float H) {
  float lean = (hash1(id * 3.1) - 0.5) * 0.25;
  vec2 top = vec2(lean * H, H);
  vec2 mid = vec2(lean * 0.4 * H + (hash1(id * 5.7) - 0.5) * 0.06, H * 0.55);
  float d = segd(p, vec2(0.0), mid) - 0.018 * H / 0.5;
  d = min(d, segd(p, mid, top) - 0.01 * H / 0.5);
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float h = hash1(id * 11.3 + fk * 7.7);
    float at = 0.35 + 0.6 * (fk + h) / 4.0;
    vec2 base = at < 0.55 ? mix(vec2(0.0), mid, at / 0.55) : mix(mid, top, (at - 0.55) / 0.45);
    float side = mod(fk + floor(id), 2.0) * 2.0 - 1.0;
    float len = H * (0.35 - 0.2 * at) * (0.7 + 0.6 * h);
    vec2 tip = base + len * vec2(side * (0.8 + 0.3 * h), 0.45 + 0.5 * h);
    d = min(d, segd(p, base, tip) - 0.005 * H / 0.5);
    vec2 tw = tip + len * 0.45 * vec2(side * 0.2, 0.6);
    d = min(d, segd(p, mix(base, tip, 0.7), tw) - 0.003);
  }
  return d;
}

// silhouettes of one depth layer of trees
float treeLayer(vec2 p, float scale, float seed) {
  vec2 q = p / scale;
  float cell = floor(q.x / 1.1);
  float d = 1e3;
  for (int k = -1; k <= 1; k++) {
    float c = cell + float(k);
    float h = hash1(c * 1.7 + seed);
    if (h < 0.3) continue;
    float cx = (c + 0.25 + 0.5 * hash1(c * 2.9 + seed)) * 1.1;
    float H = 0.45 + 0.4 * hash1(c * 4.3 + seed);
    d = min(d, tree(q - vec2(cx, 0.0), c + seed * 10.0, H));
  }
  return d * scale;
}

vec3 wispPos(int i, float t) {
  float fi = float(i);
  float a = mod(t * (0.09 + 0.03 * fi), TAU) + fi * 2.1;
  float b = mod(t * (0.14 + 0.03 * fi), TAU) + fi * 1.3;
  return vec3(sin(a) * 0.75 + 0.2 * sin(b * 2.0), HOR + 0.07 + 0.06 * sin(b), 0.9 - 0.15 * fi);
}

// everything above the water; also sampled mirrored for the reflection
vec3 above(vec2 p, float t) {
  float sky = smoothstep(HOR - 0.05, 0.5, p.y);
  vec3 col = mix(vec3(0.075, 0.095, 0.085), vec3(0.025, 0.035, 0.035), sky);
  vec2 mc = vec2(-0.35, 0.28);
  float md = length(p - mc);
  col += vec3(0.5, 0.58, 0.5) * exp(-md * 5.0) * 0.18 + vec3(0.7, 0.75, 0.65) * smoothstep(0.05, 0.045, md) * 0.25;
  float drift = mod(t * 0.08, 64.0);
  // three layers of dead trees, each veiled by more fog than the one in front
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float scale = 0.35 + 0.3 * fl;
    // the view glides slowly past, near trees faster than far ones (a punt drifting through the reeds)
    float glide = t * 0.012 * (0.4 + fl);
    float d = treeLayer(vec2(p.x + fl * 3.7 + glide, p.y - HOR), scale, fl * 13.0);
    float fogAmt = 0.75 - 0.3 * fl;
    vec3 tc = mix(vec3(0.004, 0.006, 0.005), col, fogAmt);
    col = mix(col, tc, smoothstep(0.002, -0.002, d));
    // a fog bank between layers
    float fb = fbm(vec2(p.x * 2.0 + drift * (1.0 + fl) + fl * 9.0, p.y * 6.0 + fl * 3.0));
    col = mix(col, vec3(0.1, 0.125, 0.11), smoothstep(0.35, 0.75, fb) * exp(-max(p.y - HOR, 0.0) * (8.0 - fl)) * 0.45);
  }
  // will-o'-wisps
  for (int i = 0; i < 4; i++) {
    vec3 w = wispPos(i, t);
    float dd = length(p - w.xy);
    float pul = 0.8 + 0.2 * sin(mod(t * 0.8, TAU) + float(i) * 2.0);
    col += vec3(0.45, 1.0, 0.75) * (exp(-dd * dd * 9000.0) * 1.2 + exp(-dd * 25.0) * 0.1) * pul * w.z;
  }
  // drowners: dark heads breaking the surface, eyes catching the wisp-light, then sinking again
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cyc = t * 0.035 + fi * 0.37;
    float ph = fract(cyc);
    float id = mod(floor(cyc), 50.0);
    float vis = smoothstep(0.1, 0.3, ph) * smoothstep(0.75, 0.5, ph);
    vec2 hpos = vec2((hash1(id * 3.3 + fi) - 0.5) * 1.4, HOR + 0.004);
    float sc = 0.6 + 0.4 * hash1(id * 7.1 + fi);
    vec2 q = (p - hpos) / sc;
    float head = length(q * vec2(1.0, 1.5)) - 0.028 * vis;
    col = mix(col, vec3(0.006, 0.01, 0.008), smoothstep(0.002, -0.002, head) * step(HOR, p.y));
    vec2 e1 = q - vec2(-0.011, 0.012), e2 = q - vec2(0.011, 0.012);
    float blink = smoothstep(0.0, 0.1, abs(sin(mod(t * 0.4, TAU) + fi * 3.0)));
    float eyes = exp(-dot(e1, e1) * 40000.0) + exp(-dot(e2, e2) * 40000.0);
    col += vec3(0.75, 0.95, 0.35) * eyes * vis * blink * 0.9;
  }
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  vec3 col;
  if (uv.y > HOR) {
    col = above(uv, t);
  } else {
    // still black water: ripple the mirrored scene and darken it
    float depth = HOR - uv.y;
    float rip = sin(uv.y * 160.0 / (0.1 + depth) + mod(t * 0.8, TAU)) * 0.5
              + (noise(vec2(uv.x * 30.0 + mod(t * 0.3, 64.0), uv.y * 200.0)) - 0.5);
    vec2 rp = vec2(uv.x + rip * 0.004 * (0.3 + depth * 3.0), HOR + depth + rip * 0.002);
    col = above(rp, t) * 0.45;
    col += vec3(0.07, 0.09, 0.08) * 0.25 * smoothstep(0.3, 0.0, depth) * (noise(vec2(uv.x * 4.0, depth * 40.0)) - 0.3);
    // floating scum and a mist layer lying on the water
    float scum = fbm(vec2(uv.x * 8.0, depth * 60.0 / (0.3 + depth * 4.0)));
    col = mix(col, vec3(0.03, 0.04, 0.03), smoothstep(0.62, 0.8, scum) * 0.5);
  }
  float mist = fbm(vec2(uv.x * 1.5 + mod(t * 0.09, 64.0), uv.y * 10.0));
  col += vec3(0.09, 0.11, 0.1) * smoothstep(0.35, 0.8, mist) * exp(-abs(uv.y - HOR) * 14.0) * 0.8;

  // reeds in the near corners, barely stirring
  float rx = abs(uv.x) - 0.5 * u_resolution.x / u_resolution.y;
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float bx = -0.03 - 0.035 * fk - 0.01 * hash1(fk);
    float bh = 0.12 + 0.12 * hash1(fk * 3.7 + step(0.0, uv.x));
    float y = uv.y + 0.5;
    float bend = (0.02 + 0.01 * sin(mod(t * 0.5, TAU) + fk)) * y * y / (bh * bh);
    float dx = abs(rx - bx - bend * (hash1(fk * 9.1) - 0.3));
    float blade = smoothstep(0.004 * (1.0 - y / bh) + 0.0015, 0.0, dx) * step(y, bh);
    col = mix(col, vec3(0.003, 0.005, 0.004), blade);
  }

  col = 1.0 - exp(-col * 1.6);
  col *= 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
