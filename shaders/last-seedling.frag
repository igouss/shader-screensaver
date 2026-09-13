// Last Seedling — a tiny two-leaf sprout growing from a battered old boot in the dusty dark, swaying in the last light left (FragCoord GLSL)
// Theme: Wall-E

const float PI = 3.14159265;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// shaft frame: the shaft leans back a little
vec2 shaftP(vec2 p) { return rot(0.05) * (p - vec2(-0.085, -0.13)); }

float sdSeg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// worn boots curl up at the toe
vec2 toeCurl(vec2 p) { float k = smoothstep(0.06, 0.26, p.x); return p - vec2(0.0, 0.03 * k * k); }

// the boot's upper, without the sole
float bootSDF(vec2 p) {
  vec2 s = shaftP(p);
  float shaft = sdRoundBox(s, vec2(0.086 + 0.008 * smoothstep(-0.13, 0.13, s.y), 0.132), 0.03);
  shaft = min(shaft, length((s - vec2(0.0, 0.132)) * vec2(1.0, 4.4)) / 4.4 - 0.0204);  // rim, seen from above
  // tongue poking up at the front, pull loop at the back
  shaft = smin(shaft, sdRoundBox(rot(-0.3) * (s - vec2(0.062, 0.142)), vec2(0.026, 0.024), 0.02), 0.012);
  vec2 lp = s - vec2(-0.088, 0.128);
  shaft = min(shaft, max(abs(length(lp) - 0.017) - 0.0045, -lp.x - 0.004));
  // heel counter bulge
  shaft = smin(shaft, length((p - vec2(-0.125, -0.27)) * vec2(1.0, 0.8)) - 0.06, 0.04);
  vec2 f = toeCurl(p);
  float foot = sdSeg(f, vec2(-0.08, -0.29), vec2(0.18, -0.29), 0.045);      // forefoot
  foot = smin(foot, sdSeg(f, vec2(-0.02, -0.17), vec2(0.15, -0.27), 0.042), 0.05);  // sloping instep
  float d = smin(shaft, foot, 0.05);
  d = max(d, -(p.y + 0.334));                                                // flat where the sole sits
  d += 0.004 * (noise(p * 48.0) - 0.5) + 0.002 * (noise(p * 140.0) - 0.5);   // battered edge
  return d;
}

float soleSDF(vec2 p) {
  vec2 f = toeCurl(p);
  float fore = sdRoundBox(f - vec2(0.085, -0.345), vec2(0.15, 0.013), 0.012);
  float heel = sdRoundBox(p - vec2(-0.128, -0.350), vec2(0.07, 0.019), 0.008);
  return min(fore, heel) + 0.0015 * (noise(p * 90.0) - 0.5);
}

void main() {
  vec2 R = u_resolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * R) / R.y;
  float px = 1.0 / R.y;
  float tb = mod(u_time, 6283.185);

  vec2 Lp = vec2(-0.05, 0.62);  // the one light, high above

  // --- background: dust haze, a skyline of compacted trash cubes, the floor
  float horizon = -0.10;
  vec3 col = mix(vec3(0.050, 0.043, 0.036), vec3(0.010, 0.009, 0.008), smoothstep(horizon, 0.45, p.y));
  col += vec3(0.035, 0.028, 0.020) * exp(-abs(p.y - horizon - 0.02) * 14.0);

  // distant towers of trash cubes
  float cw = 0.05, chh = 0.045;
  float cx = floor(p.x / cw);
  float stack = hash(vec2(cx, 3.0)) < 0.3 ? 0.0 : floor(1.0 + 6.5 * pow(hash(vec2(cx, 8.0)), 1.4));
  float cy = floor((p.y - horizon) / chh);
  if (p.y > horizon && cy < stack) {
    vec2 f = vec2(fract(p.x / cw), fract((p.y - horizon) / chh));
    float ins = 0.04 + 0.10 * hash(vec2(cx, cy + 5.0));   // each bale a little uneven
    vec2 g = min(f, 1.0 - f) - ins;
    float inside = smoothstep(0.0, 0.04, min(g.x, g.y));
    vec3 cube = vec3(0.026, 0.022, 0.018) * (0.7 + 0.6 * hash(vec2(cx, cy + 9.0)));
    cube *= 0.8 + 0.4 * f.y;
    col = mix(col, cube, 0.85 * inside);
  }

  // floor
  if (p.y < horizon) {
    float depth = (horizon - p.y);
    vec3 fl = mix(vec3(0.045, 0.038, 0.031), vec3(0.020, 0.017, 0.014), smoothstep(0.0, 0.4, depth));
    fl *= 0.85 + 0.3 * fbm(vec2(p.x * 9.0 / (depth + 0.1), depth * 30.0));
    col = fl;
  }

  // the cone of light and its pool on the floor
  vec2 axis = normalize(vec2(-0.03, -0.36) - Lp);
  vec2 rel = p - Lp;
  float along = dot(rel, axis);
  float across = abs(rel.x * axis.y - rel.y * axis.x);
  float beamW = 0.03 + 0.28 * along;
  float beam = exp(-pow(across / beamW, 2.0)) * smoothstep(0.0, 0.3, along);
  // dust haze drifting through the beam and the dark
  float haze = fbm(p * vec2(3.0, 4.0) + vec2(tb * 0.17, -tb * 0.08));
  col += vec3(0.11, 0.095, 0.075) * beam * (0.20 + 1.15 * haze);
  col += vec3(0.040, 0.034, 0.027) * smoothstep(0.3, 0.8, fbm(p * 2.6 - vec2(tb * 0.13, tb * 0.03)));
  float pool = exp(-length((p - vec2(-0.02, -0.37)) * vec2(1.0, 3.5)) * 3.2);
  col += vec3(0.10, 0.085, 0.065) * pool * step(p.y, horizon);

  // soft contact shadow under the boot
  col *= 1.0 - 0.65 * exp(-length((p - vec2(0.03, -0.365)) * vec2(0.9, 6.0)) * 4.0);

  // --- the boot
  float db = bootSDF(p);
  float ds = soleSDF(p);
  vec2 e = vec2(0.002, 0.0);
  vec2 lightDir2 = normalize(Lp - p);
  float light = 0.3 + 1.4 * exp(-length(p - vec2(-0.06, 0.0)) * 3.0);

  if (min(db, ds) < 0.004) {
    vec2 g = normalize(vec2(bootSDF(p + e.xy) - db, bootSDF(p + e.yx) - db) + 1e-5);
    float bevel = 1.0 - smoothstep(0.0, 0.045, -db);
    vec3 n = normalize(vec3(g * 1.4 * bevel, 1.0));
    vec3 L = normalize(vec3(Lp - p, 0.35));
    float dif = max(dot(n, L), 0.0);

    // dusty leather: mottling, lighter scuffs, cracks
    float m = fbm(p * 26.0);
    vec3 leather = vec3(0.15, 0.125, 0.10) * (0.7 + 0.6 * m);
    float scuff = smoothstep(0.58, 0.72, fbm(p * 11.0 + 3.0));
    leather = mix(leather, vec3(0.22, 0.20, 0.17), scuff * 0.6);
    float crease = smoothstep(0.03, 0.0, abs(sin((p.x + p.y * 0.6) * 95.0))) *
                   exp(-length((p - vec2(0.03, -0.20)) * vec2(1.4, 1.0)) * 16.0);
    leather *= 1.0 - 0.5 * crease;
    float crack = smoothstep(0.015, 0.0, abs(fbm(p * 18.0 + 11.0) - 0.5)) * 0.5;
    leather *= 1.0 - crack;

    vec3 bc = leather * (0.12 + 1.2 * dif) * light;

    // stitching along the welt
    float st = step(0.5, fract(p.x * 85.0)) * smoothstep(0.0025, 0.0008, abs(p.y + 0.322)) *
               step(-0.18, p.x) * step(p.x, 0.22);
    bc += vec3(0.10, 0.09, 0.07) * st * light;

    // eyelets up the front of the shaft
    vec2 s = shaftP(p);
    float ey = mod(s.y + 0.02, 0.042) - 0.021;
    float eyeD = length(vec2(s.x - 0.066, ey)) - 0.0055;
    if (s.y < 0.105 && s.y > -0.08) {
      bc = mix(bc, vec3(0.03, 0.028, 0.025), smoothstep(px, -px, eyeD));
      bc += vec3(0.20, 0.18, 0.15) * smoothstep(0.003, 0.0, abs(eyeD + 0.001)) * light * 0.5;
    }

    // opening at the top: dark inside, a lit rim, soil
    vec2 o = s - vec2(0.0, 0.132);
    float od = length(o * vec2(1.0, 5.0)) / 5.0 - 0.015;
    float inner = smoothstep(px, -px, od);
    vec3 soil = vec3(0.045, 0.032, 0.022) * (0.6 + 0.8 * fbm(p * 90.0)) * light;
    bc = mix(bc, soil, inner);
    bc += vec3(0.12, 0.10, 0.08) * smoothstep(0.004, 0.0, abs(od)) * light * 0.6 * step(0.0, o.y);

    col = mix(col, bc, smoothstep(px, -px, db));

    // sole
    vec3 sc = vec3(0.045, 0.040, 0.036) * (0.8 + 0.4 * noise(p * vec2(160.0, 20.0))) * light;
    sc += vec3(0.05, 0.045, 0.04) * smoothstep(0.004, 0.0, abs(ds + 0.004)) * step(-0.335, p.y) * light;
    col = mix(col, sc, smoothstep(px, -px, ds));
  }

  // --- the sprout
  float grow = 0.62 + 0.38 * smoothstep(0.0, 30.0, u_time);
  float sway = 0.17 * sin(tb * 0.6) + 0.06 * sin(tb * 0.93 + 1.3);
  vec2 base = vec2(-0.078, 0.004);
  float Hs = 0.175 * grow;
  float sy = clamp((p.y - base.y) / Hs, 0.0, 1.0);
  float xs = base.x + Hs * (sway * sy * sy + 0.07 * sy * (1.0 - sy));
  float dxs = 2.0 * sway * sy + 0.07 * (1.0 - 2.0 * sy);
  float dStem = abs(p.x - xs) / sqrt(1.0 + dxs * dxs) - mix(0.0048, 0.0030, sy);
  if (p.y < base.y) dStem = 1.0;
  if (p.y > base.y + Hs) dStem = length(p - vec2(base.x + Hs * sway, base.y + Hs)) - 0.003;

  vec3 green = vec3(0.30, 0.72, 0.20);
  float lightS = 0.55 + 0.6 * smoothstep(0.0, 0.25, p.y);
  col = mix(col, green * 0.55 * lightS * (0.7 + 0.5 * smoothstep(-0.004, 0.004, p.x - xs + 0.001)),
            smoothstep(px, -px, dStem));

  vec2 top = vec2(base.x + Hs * sway, base.y + Hs);
  float topAng = atan(2.0 * sway - 0.07, 1.0);
  float glowPlant = 0.0;
  for (int k = 0; k < 2; k++) {
    float sd = k == 0 ? -1.0 : 1.0;
    float ang = topAng + sd * (1.05 + 0.06 * sin(tb * 0.55 + sd)) - 0.12 * sway;
    vec2 dir = vec2(sin(ang), cos(ang));
    vec2 v = p - top;
    float u = dot(v, dir);
    float w = dot(v, vec2(dir.y, -dir.x)) * sd;  // positive toward the leaf's upper side
    float Ll = 0.09 * grow, Wl = 0.034 * grow;
    float x = clamp(u / Ll, 0.0, 1.0);
    w -= 0.25 * Ll * x * x;  // tips curl upward
    float hw = Wl * pow(sin(PI * x), 0.75) * (1.0 - 0.25 * x);
    float dl = max(abs(w) - hw, max(-u, u - Ll)) * 0.8;
    glowPlant += exp(-max(dl, 0.0) / 0.03);
    if (dl < 0.004) {
      float lit = 0.55 + 0.45 * smoothstep(-hw, hw, w);
      vec3 lc = green * lit * (0.75 + 0.35 * x);
      lc = mix(lc, vec3(0.55, 0.88, 0.40), 0.5 * smoothstep(0.0018, 0.0, abs(w)) * smoothstep(0.95, 0.2, x));
      lc += vec3(0.25, 0.45, 0.10) * smoothstep(0.004, 0.0, abs(dl)) * 0.5;
      col = mix(col, lc, smoothstep(px, -px, dl));
    }
  }
  col += vec3(0.25, 0.45, 0.15) * 0.035 * glowPlant;

  // --- dust motes drifting through the light
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float S = 7.0 + 8.0 * fl;
    vec2 q = p * S + vec2(tb * (0.09 + 0.05 * fl), tb * (0.06 - 0.02 * fl));
    q += 0.3 * vec2(sin(tb * 0.13 + fl), cos(tb * 0.11 + 2.0 * fl));
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(id + fl * 13.7);
    if (h < 0.62) {
      vec2 c = vec2(hash(id + 1.3 + fl), hash(id + 7.7 + fl)) - 0.5;
      c *= 0.6;
      float d = length(f - c) / S;
      float rad = (l == 0 ? 0.010 : 0.0035 - 0.0008 * fl) * (0.6 + 0.8 * hash(id + 4.4));
      float soft = l == 0 ? rad * 0.8 : px * 1.2;
      float disc = smoothstep(rad + soft, rad - soft * 0.5, d);
      float tw = 0.65 + 0.35 * sin(tb * (0.25 + 0.2 * h) + h * 40.0);
      vec2 wp = p;
      vec2 wr = wp - Lp;
      float wa = dot(wr, axis);
      float wc = abs(wr.x * axis.y - wr.y * axis.x);
      float inBeam = exp(-pow(wc / (0.03 + 0.28 * wa), 2.0));
      float amp = (l == 0 ? 0.16 : 0.45) * tw * (0.12 + inBeam);
      col += vec3(0.62, 0.55, 0.46) * disc * amp;
    }
  }

  col = 1.0 - exp(-1.25 * col);
  col *= 1.0 - 0.5 * smoothstep(0.35, 1.15, length(p * vec2(0.8, 1.0)));
  fragColor = vec4(col, 1.0);
}
