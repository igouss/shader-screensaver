// Pocket Calculator — a calculator tape of seven-segment numbers being keyed in and scrolling away into the dark (Shadertoy)
// Theme: Computer World

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

int digitMask(int d) {
  if (d == 0) return 63;
  if (d == 1) return 6;
  if (d == 2) return 91;
  if (d == 3) return 79;
  if (d == 4) return 102;
  if (d == 5) return 109;
  if (d == 6) return 125;
  if (d == 7) return 7;
  if (d == 8) return 127;
  return 111;
}

// returns (lit distance, ghost distance) for a 7-segment cell
vec2 sevenSeg(vec2 p, int mask) {
  p.x -= p.y * 0.12;            // italic slant
  float w = 0.22, hh = 0.42, g = 0.05;
  float d[7];
  d[0] = segD(p, vec2(-w + g, hh), vec2(w - g, hh));
  d[1] = segD(p, vec2(w, hh - g), vec2(w, g));
  d[2] = segD(p, vec2(w, -g), vec2(w, -hh + g));
  d[3] = segD(p, vec2(-w + g, -hh), vec2(w - g, -hh));
  d[4] = segD(p, vec2(-w, -g), vec2(-w, -hh + g));
  d[5] = segD(p, vec2(-w, hh - g), vec2(-w, g));
  d[6] = segD(p, vec2(-w + g, 0.0), vec2(w - g, 0.0));
  float lit = 1e3, ghost = 1e3;
  for (int i = 0; i < 7; i++) {
    if (((mask >> i) & 1) == 1) lit = min(lit, d[i]);
    else ghost = min(ghost, d[i]);
  }
  return vec2(lit, ghost);
}

// operator glyphs: 0 '+', 1 '-', 2 'x', 3 '='
float opGlyph(vec2 p, int op) {
  if (op == 0) return min(segD(p, vec2(-0.18, 0.0), vec2(0.18, 0.0)), segD(p, vec2(0.0, -0.18), vec2(0.0, 0.18)));
  if (op == 1) return segD(p, vec2(-0.18, 0.0), vec2(0.18, 0.0));
  if (op == 2) return min(segD(p, vec2(-0.14, -0.14), vec2(0.14, 0.14)), segD(p, vec2(-0.14, 0.14), vec2(0.14, -0.14)));
  return min(segD(p, vec2(-0.18, 0.09), vec2(0.18, 0.09)), segD(p, vec2(-0.18, -0.09), vec2(0.18, -0.09)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime;

  float horizon = 0.40;
  float dy = horizon - uv.y;
  vec3 col = vec3(0.0);

  // faint haze towards the vanishing line
  col += vec3(0.03, 0.09, 0.09) * exp(-abs(dy) * 5.0);

  if (dy > 0.0) {
    float z = 1.0 / dy;                      // depth on the tape plane
    vec2 P = vec2(uv.x * z, z);
    float speed = 0.16;
    float sp = 0.34;                         // row pitch
    float dh = 0.22;                         // digit height
    float cw = 0.15;                         // column pitch
    float ncol = 12.0;

    float rowf = (P.y - t * speed) / sp;
    float k = floor(rowf);
    float ry = (fract(rowf) - 0.5) * sp / dh;

    float cx = P.x / cw + ncol * 0.5;       // column coordinate, 0 at left
    float ci = floor(cx);
    float j = ncol - 1.0 - ci;               // column from the right
    vec2 lp = vec2((fract(cx) - 0.5) * cw / dh, ry);

    // what this row holds
    float h = hash11(k * 1.37 + 0.5);
    bool result = mod(k, 4.0) == 0.0;
    float nd = result ? 6.0 + floor(h * 4.0) : 2.0 + floor(h * 6.0);
    float dp = floor(hash11(k + 7.1) * 3.0);     // decimal places
    float ybot = 1.0 / (horizon + 0.5);
    float age = ((k + 0.5) * sp + t * speed - ybot) / speed;
    float typed = result ? nd : clamp(floor((age - 0.4) * 2.2), 0.0, nd);

    vec3 hue = result ? vec3(1.0, 0.32, 0.12) : vec3(0.25, 1.0, 0.82);
    float lit = 1e3, ghost = 1e3;
    if (ci >= 0.0 && ci < ncol) {
      if (j < 10.0) {
        int mask = 0;
        if (j < typed) {
          float di = typed - 1.0 - j;            // digit index in the number
          int dv = int(floor(hash11(k * 13.1 + di * 1.7) * 10.0));
          if (di == 0.0 && dv == 0) dv = 1 + int(floor(h * 8.0));
          mask = digitMask(dv);
        }
        vec2 s = sevenSeg(lp, mask);
        lit = s.x;
        ghost = s.y;
        if (j == dp && dp > 0.0 && typed > dp) {
          lit = min(lit, length(lp - vec2(0.33, -0.43)) - 0.015);
        }
      } else if (j == 11.0) {
        int op = result ? 3 : int(floor(hash11(k + 3.3) * 3.0));
        lit = opGlyph(lp, op);
      }
    }

    float aa = fwidth(lit) + 1e-4;
    float thick = 0.045;
    float core = smoothstep(thick + aa, thick - aa, lit);
    float glow = exp(-max(lit - thick, 0.0) * 22.0) * 0.35;
    float gh = smoothstep(thick + aa, thick - aa, ghost) * 0.065;

    float fog = exp(-(z - 1.0) * 0.42);
    float fine = clamp(1.0 / (aa * 60.0), 0.0, 1.0);   // fade glyphs that get too small
    col += hue * (core * 1.25 + glow) * fog * fine;
    col += vec3(0.25, 1.0, 0.82) * gh * fog * fine;

    // mesh grid of the display glass
    vec2 g = abs(fract(P * vec2(12.0, 12.0)) - 0.5);
    float mesh = smoothstep(0.5 - fwidth(P.x) * 12.0, 0.5, max(g.x, g.y));
    col += vec3(0.02, 0.06, 0.055) * mesh * fog * fine;
  }

  col = 1.0 - exp(-col * 2.0);
  col *= 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
