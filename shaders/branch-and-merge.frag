// Branch and Merge — an endless git commit graph scrolling upward, coloured lanes forking off on smooth curves and merging back beside their log lines (FragCoord GLSL)
// Theme: coding

const int NL = 6;           // lanes
const float ROWH = 0.066;   // one commit per row

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 laneColor(int L) {
  if (L == 0) return vec3(0.56, 0.64, 0.80);  // main: slate blue
  if (L == 1) return vec3(0.54, 0.76, 0.58);  // sage
  if (L == 2) return vec3(0.88, 0.60, 0.60);  // dusty rose
  if (L == 3) return vec3(0.87, 0.76, 0.48);  // mustard
  if (L == 4) return vec3(0.46, 0.76, 0.80);  // teal
  return vec3(0.72, 0.62, 0.88);              // lavender
}

float laneX(int L, float x0) { return x0 + 0.062 * float(L); }

// is lane L alive at row r? Each lane lives in blocks of P rows and holds at most one
// branch per block, so this is a pure function of the row — no history needed.
bool alive(int L, float r) {
  if (L == 0) return true;
  float fL = float(L);
  float P = 7.0 + 2.0 * fL;
  float o = floor(hash(vec2(fL, 1.7)) * P);
  float b = floor((r + o) / P);
  float k = r + o - b * P;
  vec2 hb = vec2(fL * 3.1, b);
  if (hash(hb) < 0.2) return false;
  float s = 1.0 + floor(hash(hb + 0.31) * P * 0.35);
  float e = s + 2.0 + floor(hash(hb + 0.73) * (P - s - 4.0));
  return k >= s && k <= e;
}

// lane a new branch forks from, or an ending branch merges into
int parentLane(int L, float r0, float r1) {
  if (L > 1 && alive(L - 1, r0) && alive(L - 1, r1)) return L - 1;
  return 0;
}

// the single lane that holds this row's commit, and what kind it is (0 plain, 1 first of a branch, 2 merge)
int commitLane(float r, out int kind) {
  for (int L = 1; L < NL; L++) {
    if (alive(L, r - 1.0) && !alive(L, r)) { kind = 2; return parentLane(L, r - 1.0, r); }
  }
  for (int L = 1; L < NL; L++) {
    if (alive(L, r) && !alive(L, r - 1.0)) { kind = 1; return L; }
  }
  kind = 0;
  int cnt = 0;
  for (int L = 0; L < NL; L++) if (alive(L, r)) cnt++;
  int pick = int(floor(hash(vec2(r, 5.3)) * float(cnt)));
  for (int L = 0; L < NL; L++) {
    if (alive(L, r)) { if (pick == 0) return L; pick--; }
  }
  return 0;
}

float rbox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 R = u_resolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * R) / R.y;
  float px = 1.0 / R.y;
  float x0 = -0.52;               // leftmost lane
  float msgX = laneX(NL - 1, x0) + 0.07;

  // world coordinate grows downward and scrolls up; newest rows enter at the bottom
  float W = mod(u_time * 0.026, ROWH * 4096.0) - p.y;
  float fr = W / ROWH;
  float n = floor(fr);
  float fy = fract(fr);

  vec3 bg = vec3(0.048, 0.056, 0.070);
  bg += vec3(0.006, 0.007, 0.010) * step(0.5, mod(n + step(0.5, fy), 2.0));  // zebra rows
  bg += vec3(0.020, 0.024, 0.034) * exp(-p.y * p.y * 30.0);                   // reading band
  vec3 col = bg;

  // --- edges between row n and row n+1
  for (int L = 0; L < NL; L++) {
    bool a0 = alive(L, n), a1 = alive(L, n + 1.0);
    if (!a0 && !a1) continue;
    float xa = laneX(L, x0), xb = xa;
    if (!a0) xa = laneX(parentLane(L, n, n), x0);          // fork: parent at row n
    if (!a1) xb = laneX(parentLane(L, n, n + 1.0), x0);    // merge: into parent at row n+1
    float sm = smoothstep(0.0, 1.0, fy);
    float x = mix(xa, xb, sm);
    float dx = (xb - xa) * 6.0 * fy * (1.0 - fy) / ROWH;
    float d = abs(p.x - x) / sqrt(1.0 + dx * dx);
    col = mix(col, bg, 0.85 * smoothstep(0.006, 0.0045, d));           // gap where lines cross
    col = mix(col, laneColor(L) * 0.85, smoothstep(0.0022 + px, 0.0022 - px, d));
    col += laneColor(L) * 0.05 * exp(-d / 0.008);
  }

  // --- the commit on the nearest row
  float rr = floor(fr + 0.5);
  float yr = (W - rr * ROWH);            // offset from the row centre (world units)
  int kind;
  int cl = commitLane(rr, kind);
  vec3 lc = laneColor(cl);
  float dd = length(vec2(p.x - laneX(cl, x0), yr));
  float rad = kind == 2 ? 0.0115 : 0.0095;
  col = mix(col, bg, smoothstep(rad + 0.004 + px, rad + 0.004 - px, dd));
  if (kind == 2) {
    col = mix(col, lc, smoothstep(0.0028 + px, 0.0028 - px, abs(dd - rad + 0.002)));  // merge: ring
    col = mix(col, lc * 0.6, smoothstep(0.004 + px, 0.004 - px, dd));
  } else {
    col = mix(col, lc, smoothstep(rad + px, rad - px, dd));
    col = mix(col, lc * 1.25, 0.5 * smoothstep(0.004, 0.0, dd));
  }
  col += lc * 0.10 * exp(-dd / 0.02);

  // --- log line: short hash, optional branch label, message words
  float mx = p.x - msgX;
  float band = smoothstep(0.35, 0.0, abs(p.y));  // brighter near the reading band
  vec3 txt = vec3(0.50, 0.54, 0.62) * (0.35 + 0.45 * band);
  // short hash
  float hd = rbox(vec2(mx - 0.030, yr), vec2(0.030, 0.0042), 0.002);
  float hashGlyphs = step(0.18, fract(mx / 0.0086));
  col = mix(col, vec3(0.80, 0.68, 0.38) * (0.35 + 0.35 * band), smoothstep(px, -px, hd) * hashGlyphs);
  float cursor = 0.078;
  if (kind == 1) {
    // branch label pill in the lane's colour
    float lw = 0.035 + 0.03 * hash(vec2(rr, 2.2));
    float ld = rbox(vec2(mx - cursor - lw, yr), vec2(lw, 0.0075), 0.0075);
    col = mix(col, lc * 0.22, smoothstep(px, -px, ld));
    col = mix(col, lc * 0.9, smoothstep(0.0012 + px, 0.0012 - px, abs(ld)));
    col = mix(col, lc * 0.85, smoothstep(px, -px, rbox(vec2(mx - cursor - lw, yr), vec2(lw - 0.012, 0.0025), 0.0025)));
    cursor += 2.0 * lw + 0.015;
  }
  float words = 3.0 + floor(hash(vec2(rr, 9.1)) * 5.0);
  for (int k = 0; k < 8; k++) {
    if (float(k) >= words) break;
    float wl = 0.012 + 0.030 * hash(vec2(rr, float(k) * 1.37 + 0.5));
    float wd = rbox(vec2(mx - cursor - wl, yr), vec2(wl, 0.0038), 0.0025);
    vec3 wc = (kind == 2 && k == 0) ? lc * (0.45 + 0.35 * band) : txt;
    col = mix(col, wc, smoothstep(px, -px, wd) * step(0.22, fract((mx - cursor) / 0.0086)));
    cursor += 2.0 * wl + 0.012;
  }

  // fade in at the bottom, out at the top
  col = mix(bg * 0.6, col, smoothstep(0.5, 0.36, abs(p.y)));
  col *= 1.0 - 0.4 * smoothstep(0.45, 1.2, length(p * vec2(0.75, 1.0)));
  fragColor = vec4(col, 1.0);
}
