// Torch Alley — walking a narrow lane of Arkanar in rain and fog, torches smouldering on wet stone, in black and white (FragCoord GLSL)
// Theme: Hard to Be a God

const float CELL = 7.0;    // spacing of torches, alternating walls
const float LOOP = 140.0;  // the whole lane repeats seamlessly after this many units

float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// value noise, periodic in y with period P so the looping lane never pops
float vnoise(vec2 p, float P) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, P), y1 = mod(i.y + 1.0, P);
  return mix(mix(hash2(vec2(i.x, y0)), hash2(vec2(i.x + 1.0, y0)), f.x),
             mix(hash2(vec2(i.x, y1)), hash2(vec2(i.x + 1.0, y1)), f.x), f.y);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float torchSide(float cell) { return mod(cell, 2.0) * 2.0 - 1.0; }
vec3 torchPos(float cell) { return vec3(torchSide(cell) * 1.07, 0.62, (cell + 0.5) * CELL); }

float flicker(float cell) {
  float t = u_time;
  return 0.86 + 0.07 * sin(mod(t * 5.3, 6.2831853) + cell * 1.7)
              + 0.05 * sin(mod(t * 8.9, 6.2831853) + cell * 2.9)
              + 0.03 * sin(mod(t * 2.1, 6.2831853) + cell * 0.7);
}

float map(vec3 p) {
  float side = step(0.0, p.x);
  float hid = mod(floor(p.z / 3.5 + side * 0.5), 40.0) + side * 50.0;
  // jettied upper floors lean into the lane, a little differently for every house
  float w = 1.25
    - (0.12 + 0.16 * hash1(hid)) * smoothstep(1.45, 1.6, p.y)
    - (0.10 + 0.20 * hash1(hid + 9.0)) * smoothstep(3.1, 3.25, p.y);
  // rough stone courses on the ground floor, lumpy plaster above
  float row = floor(p.y * 5.0);
  vec2 st = vec2(p.z * (2.6 + 0.8 * hash1(row + side * 13.0)) + hash1(row * 1.7 + side) * 4.0, p.y * 5.0);
  vec2 fs = abs(fract(st) - 0.5);
  float stone = smoothstep(0.5, 0.36, max(fs.x * 0.85, fs.y)) * (1.0 - smoothstep(1.3, 1.5, p.y));
  float walls = w - abs(p.x) - 0.03 * stone;
  // muddy lane, higher at the walls, rutted
  float ground = p.y + 1.0 - 0.07 * p.x * p.x;
  if (ground < 0.1) ground -= 0.035 * vnoise(p.xz * 2.5, LOOP * 2.5);
  // timber beams bracing the houses overhead
  float beam = sdBox(vec3(p.x, p.y - 3.9, mod(p.z, 7.0) - 3.5), vec3(1.4, 0.07, 0.09));
  // iron torch brackets
  float cell = floor(p.z / CELL);
  float s = torchSide(cell), cz = (cell + 0.5) * CELL;
  float br = sdCapsule(p, vec3(s * 1.25, 0.2, cz), vec3(s * 1.08, 0.55, cz), 0.028);
  return min(min(walls, ground), min(beam, br));
}

vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.002;
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) +
                   k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;

  float z0 = mod(t * 0.35, LOOP);
  vec3 ro = vec3(0.18 * sin(mod(t * 0.11, 6.2831853)),
                 0.3 + 0.02 * sin(mod(t * 1.1, 6.2831853)), z0);
  vec3 ta = ro + vec3(0.12 * sin(mod(t * 0.07, 6.2831853)),
                      0.1 + 0.05 * sin(mod(t * 0.05, 6.2831853)), 1.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.3 * fw);

  // march
  float tt = 0.02, steps = 0.0;
  for (int i = 0; i < 64; i++) {
    float d = map(ro + rd * tt);
    if (d < 0.002 * tt || tt > 34.0) break;
    tt += d * 0.9;
    steps += 1.0;
  }

  vec3 col = vec3(0.0);
  if (tt < 34.0) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    bool isGround = p.y < -0.8;
    float alb = isGround ? 0.22 : (p.y < 1.45 ? 0.36 : 0.5);
    alb *= 0.75 + 0.5 * vnoise(p.yz * 9.0 + p.x, LOOP * 9.0);
    // dark half-timbering on the plastered upper floors
    if (!isGround && p.y > 1.5) {
      float post = abs(fract(p.z / 1.4 + 0.5 * step(0.0, p.x)) - 0.5) * 1.4;
      float floorBeam = min(abs(p.y - 1.55), abs(p.y - 3.2));
      float brace = abs(fract((p.z + (p.y - 1.55) * (mod(floor(p.z / 1.4), 2.0) * 2.0 - 1.0)) / 1.4) - 0.5) * 1.4 * 0.7;
      float timber = min(min(post, floorBeam), (p.y < 3.2 ? brace : 1.0));
      alb *= mix(0.25, 1.0, smoothstep(0.05, 0.08, timber));
    }
    float diff = 0.0, spec = 0.0;
    float c0 = floor(p.z / CELL);
    for (int k = -1; k <= 1; k++) {
      float cell = c0 + float(k);
      vec3 l = torchPos(cell) + vec3(0.0, 0.08, 0.0) - p;
      float dl = length(l);
      l /= dl;
      float I = flicker(cell);
      diff += I * max(dot(n, l), 0.0) / (1.0 + dl * dl * 1.3);
      spec += I * pow(max(dot(reflect(-l, n), -rd), 0.0), 36.0) / (1.0 + dl * dl * 0.5);
    }
    float amb = 0.035 * (0.4 + 0.6 * n.y) * smoothstep(-1.0, 4.0, p.y);
    col = vec3(alb * (diff * 1.7 + amb));
    col += (isGround ? 0.55 : 0.06) * spec;
    col *= 1.0 - 0.45 * steps / 64.0;
  } else {
    col = vec3(0.09 + 0.05 * uv.y);  // overcast sliver of sky
  }

  // heavy wet fog, and torchlight scattered in it (closed-form line integral per torch)
  float T = min(tt, 34.0);
  col = mix(col, vec3(0.045), 1.0 - exp(-T * 0.085));
  float sc = 0.0;
  float cc = floor(ro.z / CELL);
  for (int k = -1; k < 6; k++) {
    float cell = cc + float(k);
    vec3 w = torchPos(cell) + vec3(0.0, 0.08, 0.0) - ro;
    float t0 = dot(w, rd);
    float h = sqrt(max(dot(w, w) - t0 * t0, 1e-5));
    float s = (atan((T - t0) / h) - atan(-t0 / h)) / h;
    sc += flicker(cell) * s * exp(-max(t0, 0.0) * 0.05);
  }
  col += vec3(0.03 * sc);

  // rain, catching the torchlight where it falls through the glow
  float rain = 0.0;
  vec2 ruvb = uv * mat2(0.985, 0.17, -0.17, 0.985);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float scl = 28.0 + fk * 22.0;
    vec2 ruv = vec2(ruvb.x * scl, ruvb.y * scl * 0.07 + mod(t * scl * 0.07 * (1.1 - 0.2 * fk), 1000.0));
    float cx = floor(ruv.x);
    float h = hash1(cx + fk * 31.0);
    float fx = fract(ruv.x) - 0.5 + (h - 0.5) * 0.6;
    float fy = fract(ruv.y + h * 10.0);
    rain += smoothstep(0.07, 0.0, abs(fx)) * smoothstep(0.0, 0.04, fy) * smoothstep(0.3, 0.04, fy)
          * step(0.45, hash1(cx * 3.1 + fk)) * (1.0 - 0.3 * fk);
  }
  col += rain * (0.025 + 0.35 * min(sc, 3.0) * 0.1);

  // tone map to silver-grey film
  col = 1.0 - exp(-col * 1.5);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  float grain = hash2(gl_FragCoord.xy + mod(float(u_frame), 64.0) * 17.0) - 0.5;
  lum += grain * 0.012;
  lum *= 1.0 - 0.45 * dot(uv, uv);
  col = vec3(lum) * vec3(1.0, 0.975, 0.93);
  fragColor = vec4(pow(max(col, 0.0), vec3(0.95)), 1.0);
}
