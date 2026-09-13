// Tears in Rain — neon signs of a Los Angeles night, blurred behind a window where raindrops slide and leave clear trails (Shadertoy)
// Theme: Blade Runner

float h21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

vec3 neon(float r) {
  if (r < 0.3) return vec3(1.0, 0.18, 0.55);   // magenta
  if (r < 0.55) return vec3(0.15, 0.75, 1.0);  // cyan
  if (r < 0.8) return vec3(1.0, 0.55, 0.18);   // amber
  if (r < 0.93) return vec3(1.0, 0.12, 0.08);  // red
  return vec3(0.35, 1.0, 0.6);                 // green
}

// the city behind the glass; focus 1 = fogged bokeh, 0 = sharp points
vec3 city(vec2 uv, float T, float focus) {
  vec3 c = mix(vec3(0.006, 0.008, 0.02), vec3(0.03, 0.015, 0.04), clamp(uv.y + 0.6, 0.0, 1.0));
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float sc = 4.0 + 4.0 * fl;
    vec2 g = uv * sc + vec2(fl * 3.7, fl * 1.9);
    vec2 id0 = floor(g);
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 id = id0 + vec2(i, j);
      float r = h21(id + fl * 13.0);
      if (r < 0.35) continue;
      vec2 ctr = id + 0.5 + (vec2(h21(id + 1.3), h21(id + 2.7)) - 0.5) * 0.8;
      ctr.x += 0.12 * sin(T * 0.07 + r * 30.0);
      float radF = 0.3 + 0.35 * h21(id + 4.1);
      float rad = mix(0.07, radF, focus);
      float d = length(g - ctr);
      float disc = smoothstep(rad, rad * 0.8, d) * (0.7 + 0.3 * smoothstep(rad * 0.3, rad, d));
      float energy = min(pow(radF / rad, 2.0), 6.0);
      float pulse = 0.75 + 0.25 * sin(T * 0.35 + r * 20.0);
      c += neon(fract(r * 7.13)) * disc * pulse * energy * (0.16 - 0.05 * fl);
    }
  }
  // a tall vertical sign, softened by the fogged glass
  float sx = uv.x + 0.55;
  float sgn = smoothstep(0.05 + 0.1 * focus, 0.0, abs(sx) - 0.02) * smoothstep(0.5, 0.2, abs(uv.y - 0.05));
  float seg = 0.6 + 0.4 * smoothstep(0.3, 0.7, fract(uv.y * 5.0 + 0.2));
  c += vec3(1.0, 0.2, 0.45) * sgn * seg * (0.25 + 0.03 * sin(T * 0.9));
  return c;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float T = mod(iTime, 3600.0);

  vec2 nrm = vec2(0.0);   // refraction offset from drops
  float mask = 0.0;       // inside a drop
  float clear = 0.0;      // wiped trail (sharper view)

  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    vec2 cs = mix(vec2(0.085, 0.55), vec2(0.055, 0.35), fl);
    vec2 g = uv / cs + vec2(fl * 0.37, 0.0);
    float cx = floor(g.x);
    float hc = h21(vec2(cx, 7.0 + fl * 3.0));
    g.y += hc * 5.0;
    float ly = fract(g.y);
    // stick-slip descent, monotonic
    float s = (0.05 + 0.07 * hc) * (1.0 - 0.3 * fl);
    float ph = T * s + hc * 9.0;
    float dy = fract(-(ph + 0.035 * sin(6.2831 * ph * 3.0)));
    // the drop wanders sideways along a fixed wobbly path
    float wob = 0.18 * sin(g.y * 6.2831 * 2.0 + hc * 20.0) * sin(g.y * 6.2831 * 0.5 + hc * 7.0);
    float lx = fract(g.x) - 0.5 - wob;
    float ddy = fract(ly - dy + 0.5) - 0.5;
    vec2 q = vec2(lx * cs.x, ddy * cs.y);
    float rad = (0.012 + 0.008 * hc) * (1.0 - 0.35 * fl);
    q.y *= 1.0 + 0.4 * step(0.0, q.y);              // pear shape: tapered on top
    float d = length(q);
    float m = smoothstep(rad, rad * 0.75, d);
    nrm += q / rad * m;
    mask = max(mask, m);
    // trail of beads and a wiped streak above the drop
    float above = step(0.0, ddy) * smoothstep(0.45, 0.0, ddy);
    float streak = smoothstep(rad * 0.9, rad * 0.3, abs(q.x)) * above;
    clear = max(clear, streak);
    float by = fract(ly * 10.0) - 0.5;
    vec2 bq = vec2(q.x, by * cs.y / 10.0);
    float br = rad * 0.35 * above * step(0.02, ddy);
    float bead = clamp((br - length(bq)) / (br * 0.4 + 1e-5), 0.0, 1.0) * step(0.3, h21(vec2(cx, floor(ly * 10.0))));
    nrm += bq / (br + 1e-4) * bead * 0.6;
    mask = max(mask, bead);
  }

  // static condensation beads that swell and evaporate slowly
  {
    vec2 g = uv * 34.0;
    vec2 id = floor(g);
    float r = h21(id + 51.0);
    vec2 c = (vec2(h21(id + 2.1), h21(id + 5.3)) - 0.5) * 0.6;
    vec2 q = (fract(g) - 0.5 - c) / 34.0;
    float life = sin(T * 0.12 + r * 6.2831) * 0.5 + 0.5;
    float br = 0.004 * life * step(0.45, r) * (1.0 - clear);
    float m = clamp((br - length(q)) / (br * 0.4 + 1e-5), 0.0, 1.0);
    nrm += q / (br + 1e-4) * m * 0.5;
    mask = max(mask, m * 0.8);
  }

  float focus = 1.0 - 0.5 * clear;
  vec3 col = city(uv, T, focus) * (1.0 + 0.15 * clear);
  // each drop is a tiny lens: an inverted, sharper glimpse of the street
  vec3 lens = city(uv - nrm * 0.035, T, 0.45);
  col = mix(col, lens * 1.25 + vec3(0.02, 0.022, 0.03), mask);
  // drop rims catch a little light
  col += vec3(0.05, 0.06, 0.08) * mask * smoothstep(0.3, 1.0, length(nrm)) * 0.6;
  // a cold glint on the upper-left of each drop
  col += vec3(0.5, 0.6, 0.7) * mask * smoothstep(0.35, 0.8, dot(nrm, normalize(vec2(-0.6, 0.8)))) * 0.35;

  col = 1.0 - exp(-col * 1.3);
  vec2 vq = fragCoord / iResolution.xy - 0.5;
  col *= 1.0 - 0.7 * dot(vq, vq);
  fragColor = vec4(col, 1.0);
}
