// Bug Lens — a magnifying glass drifts over dim, slowly scrolling code; only through the lens does a small red beetle show (FragCoord GLSL)
// Theme: debugging

const float RH = 0.044;     // row height
const float CW = 0.02;    // character width
const float NROWS = 256.0;  // the listing repeats every NROWS rows

float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float rowNoise(float r) {   // smooth per-row value noise, periodic in NROWS
  float i = floor(r), f = fract(r);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(mod(i, NROWS) + 0.37), hash(mod(i + 1.0, NROWS) + 0.37), f);
}

float sdRoundBar(vec2 p, vec2 h) {
  vec2 q = abs(p) - vec2(h.x - h.y, 0.0);
  return length(max(q, 0.0)) - h.y + min(max(q.x, -h.y), 0.0) * 0.0;
}

vec3 tokenHue(float k) {
  if (k < 1.0) return vec3(0.78, 0.52, 1.0);   // keyword
  if (k < 2.6) return vec3(0.55, 0.76, 1.0);   // identifier
  if (k < 3.4) return vec3(0.62, 0.9, 0.55);   // string
  if (k < 4.0) return vec3(1.0, 0.7, 0.42);    // number
  return vec3(0.62, 0.62, 0.72);               // punctuation
}

// syntax-highlighted listing; returns colour * coverage
vec3 code(vec2 p, float scroll, float left, float px) {
  float v = scroll - p.y;   // grows downward
  float row = floor(v / RH);
  float ly = (fract(v / RH) - 0.5) * RH;
  float id = mod(row, NROWS);
  vec3 c = vec3(0.0);

  // gutter line numbers
  float gx = left - 0.075;
  float gd = sdRoundBar(vec2(p.x - gx, ly), vec2(0.018 - 0.006 * step(0.5, hash(id * 3.1)), 0.0085));
  c += vec3(0.32, 0.34, 0.42) * smoothstep(px, -px, gd);

  if (hash(id * 1.31 + 0.2) < 0.1) return c;   // blank line
  float indent = floor(4.0 * rowNoise(row * 0.21));
  float x = left + indent * 2.0 * CW;

  if (hash(id * 2.17 + 0.9) < 0.1) {   // comment line
    float len = (18.0 + floor(hash(id * 5.3) * 34.0)) * CW;
    float d = sdRoundBar(vec2(p.x - (x + 0.5 * len), ly), vec2(0.5 * len, 0.0085));
    return c + vec3(0.36, 0.48, 0.42) * smoothstep(px, -px, d);
  }

  float ntok = 3.0 + floor(hash(id * 7.7 + 0.1) * 8.0);
  for (int k = 0; k < 10; k++) {
    float fk = float(k);
    if (fk >= ntok) break;
    float len = (2.0 + floor(hash(id * 9.13 + fk * 3.71) * 8.0)) * CW;
    if (p.x < x - CW) break;
    if (p.x < x + len + CW) {
      float kind = (k == 0) ? hash(id * 1.7) * 1.6 : hash(id * 4.3 + fk * 1.9) * 5.0;
      float d = sdRoundBar(vec2(p.x - (x + 0.5 * len), ly), vec2(0.5 * len, 0.0085));
      c += tokenHue(kind) * smoothstep(px, -px, d);
      break;
    }
    x += len + CW;
  }
  return c;
}

// beetle in its own frame (forward = +y), unit ~ body half-length; returns signed distance and a detail mask
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float beetle(vec2 p, float t, out float detail) {
  vec2 q = p;
  float body = (length(q / vec2(0.58, 0.8) - vec2(0.0, -0.15)) - 1.0) * 0.58;
  float thorax = (length((q - vec2(0.0, 0.62)) / vec2(0.4, 0.24)) - 1.0) * 0.24;
  float head = length(q - vec2(0.0, 0.92)) - 0.2;
  float d = min(min(body, thorax), head);
  // legs: three per side, gently paddling
  q.x = abs(p.x);
  float side = sign(p.x);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y0 = 0.5 - fi * 0.42;
    float sw = 0.12 * sin(t * 3.0 + fi * 2.1 + side * 1.57);
    vec2 a = vec2(0.35, y0);
    vec2 k = vec2(0.78, y0 + 0.12 - fi * 0.1 + sw);
    vec2 e = vec2(0.88, y0 + 0.3 - fi * 0.4 + sw);
    d = min(d, min(sdSeg(q, a, k), sdSeg(q, k, e)) - 0.045);
  }
  // antennae
  d = min(d, sdSeg(q, vec2(0.08, 1.05), vec2(0.3, 1.45)) - 0.03);
  // elytra seam and spots
  float seam = smoothstep(0.05, 0.0, abs(p.x)) * step(p.y, 0.45) * step(-0.95, p.y);
  float spots = smoothstep(0.13, 0.08, length(q - vec2(0.28, 0.05))) + smoothstep(0.11, 0.06, length(q - vec2(0.24, -0.5)));
  detail = max(seam, spots * step(body, 0.0)) + smoothstep(0.02, -0.02, thorax) * 0.35;
  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float aspect = u_resolution.x / u_resolution.y;
  float px = 1.0 / u_resolution.y;
  float t = u_time;

  float scroll = mod(t * 0.014, RH * NROWS);
  float left = -0.5 * aspect + 0.14;

  // the bug crawls slowly; the lens hunts around it, drifting away and closing in
  // keep the hunt over the listing, which starts at the left margin
  float bx = left + 0.62, ax = 0.36;
  vec2 bug = vec2(bx + ax * sin(t * 0.037), 0.24 * sin(t * 0.053 + 1.3));
  vec2 bv = vec2(ax * 0.037 * cos(t * 0.037), 0.24 * 0.053 * cos(t * 0.053 + 1.3));
  float roff = 0.03 + 0.28 * smoothstep(0.15, 0.85, 0.5 - 0.5 * cos(t * 0.069));
  float ph = t * 0.11;
  vec2 lens = bug + roff * vec2(cos(ph), 0.8 * sin(ph * 1.3));
  float R = 0.2;
  float mag = 1.7;

  // editor background and the dim listing
  vec3 bg = vec3(0.016, 0.018, 0.028);
  vec3 dim = code(uv, scroll, left, px);
  float lum = dot(dim, vec3(0.3, 0.5, 0.2));
  vec3 col = bg + mix(vec3(lum), dim, 0.55) * 0.26;

  vec2 dl = uv - lens;
  float r = length(dl);

  // soft shadow of lens and handle on the page
  vec2 hdir = normalize(vec2(1.0, -1.0));
  vec2 so = uv - vec2(0.014, -0.018);
  float shR = abs(length(so - lens) - R) - 0.01;
  float shH = sdSeg(so, lens + hdir * (R + 0.02), lens + hdir * (R + 0.21)) - 0.02;
  col *= 1.0 - 0.55 * exp(-max(min(shR, shH), 0.0) * 60.0) * step(R, length(so - lens) + 0.0);

  if (r < R) {
    // magnified view, slightly barrel-shaped toward the rim
    float rr = r / R;
    vec2 q = lens + dl / mag * (1.0 + 0.22 * rr * rr);
    float qpx = px / mag;
    vec3 c = code(q, scroll, left, qpx);
    vec3 glass = vec3(0.03, 0.036, 0.055) + c * 0.85;

    // the beetle, only here
    vec2 fwd = normalize(bv);
    vec2 bq = q - bug;
    bq = vec2(dot(bq, vec2(fwd.y, -fwd.x)), dot(bq, fwd));
    float S = 0.021;
    float det;
    float bd = beetle(bq / S, t, det) * S;
    float bodyM = smoothstep(qpx, -qpx, bd);
    vec3 red = vec3(1.0, 0.16, 0.08);
    glass += red * 0.55 * exp(-max(bd, 0.0) / 0.016);                       // glow on the page
    glass = mix(glass, red * (1.2 - 0.75 * det) + vec3(0.25, 0.08, 0.02) * smoothstep(0.0, -0.01, bd), bodyM);

    // glass: faint tint, edge darkening, curved highlight
    glass *= 1.0 - 0.35 * rr * rr * rr;
    float hl = exp(-pow((length(dl - vec2(-0.05, 0.05)) - R * 0.72) / 0.012, 2.0)) * smoothstep(0.0, 1.0, -dl.x + dl.y) * 0.5;
    glass += vec3(0.7, 0.8, 1.0) * hl * 0.25;
    col = mix(col, glass, smoothstep(R, R - 2.0 * px, r));
  }

  // metal rim
  float rimD = abs(r - R - 0.004) - 0.009;
  float rimM = smoothstep(px, -px, rimD);
  float ang = atan(dl.y, dl.x);
  vec3 rim = vec3(0.34, 0.36, 0.42) * (0.55 + 0.45 * cos(ang - 2.3)) + vec3(0.25) * exp(-pow((r - R - 0.001) / 0.003, 2.0)) * (0.5 + 0.5 * cos(ang - 2.3));
  col = mix(col, rim, rimM);

  // handle
  vec2 ha = lens + hdir * (R + 0.012), hb = lens + hdir * (R + 0.21);
  float hd = sdSeg(uv, ha, hb) - 0.019;
  float neck = sdSeg(uv, ha, lens + hdir * (R + 0.045)) - 0.013;
  vec2 hn = vec2(-hdir.y, hdir.x);
  float across = dot(uv - ha, hn) / 0.019;
  vec3 handle = vec3(0.07, 0.05, 0.045) * (0.6 + 0.4 * (1.0 - across * across)) + vec3(0.35, 0.22, 0.14) * exp(-pow((across - 0.45) / 0.18, 2.0)) * 0.35;
  col = mix(col, handle, smoothstep(px, -px, hd));
  col = mix(col, rim * 0.9, smoothstep(px, -px, neck));

  col = 1.0 - exp(-col * 1.3);
  col *= 1.0 - 0.3 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
