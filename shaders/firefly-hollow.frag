// Firefly Hollow — a misty night forest of layered trunks where fireflies wander and slowly blink (FragCoord GLSL)
// Theme: forest

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x),
             mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

// Silhouette of one layer of trunks (k = 0 near ... 3 far): x = coverage, y = moon-side rim.
vec2 trunks(vec2 uv, float k, float pan, float px) {
  float sc = 1.1 + k * 0.75;
  float x = (uv.x + pan) * sc + k * 13.7;
  float id = floor(x);
  float f = fract(x) - 0.5;
  float r = h11(id + k * 7.1);
  if (r < 0.2) return vec2(0.0);
  float cx = (h11(id * 2.7 + k) - 0.5) * 0.55;
  float w = 0.035 + 0.06 * h11(id * 3.1 + k * 1.3);
  float lean = (h11(id * 5.3 + k) - 0.5) * 0.12;
  float y = uv.y;
  float xx = f - cx - lean * y - 0.015 * sin(y * 4.0 + r * 6.2831);
  float flare = 1.0 + 0.9 * exp(-(y + 0.42 - k * 0.04) * 9.0); // roots flare at the base
  float ww = w * flare;
  float d = (abs(xx) - ww) / sc;
  float rim = smoothstep(0.35, 0.95, xx / ww);
  return vec2(smoothstep(px, -px, d), rim);
}

void main() {
  vec2 res = u_resolution;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float aspect = res.x / res.y;
  float px = 1.5 / res.y;
  float t = u_time;

  // slow oscillating camera pan: never grows with time
  float pan = 2.4 * sin(t * 0.011) + 0.6 * sin(t * 0.0037 + 1.0);

  // sky: deep blue-green, brighter low down where moonlit mist sits
  vec3 col = mix(vec3(0.055, 0.085, 0.10), vec3(0.008, 0.012, 0.025), smoothstep(-0.35, 0.5, uv.y));
  vec2 moon = vec2(0.35, 0.28);
  col += vec3(0.10, 0.12, 0.13) * exp(-length(uv - moon) * 3.5);

  vec3 fireCol = vec3(0.75, 1.0, 0.28);
  float glowSum = 0.0;

  for (int ki = 3; ki >= 0; ki--) {
    float k = float(ki);
    float par = 1.0 / (1.0 + k * 0.9);       // near layers move more
    float lp = pan * par;
    vec2 tr = trunks(uv, k, lp, px * (1.0 + k * 0.5));
    float cov = tr.x;
    // fog-tinted layer colour: far layers dissolve into mist
    float fogAmt = k / 3.5;
    vec3 lc = mix(vec3(0.004, 0.006, 0.008), vec3(0.05, 0.075, 0.09), fogAmt);
    lc += vec3(0.02, 0.03, 0.03) * fogAmt * smoothstep(0.2, -0.4, uv.y);
    lc += vec3(0.035, 0.045, 0.05) * tr.y * (1.0 - fogAmt) * smoothstep(0.45, -0.1, length(uv - moon) - 0.2);
    col = mix(col, lc, cov);

    // ground band for this layer
    float gy = -0.36 - (3.0 - k) * 0.035 + 0.02 * fbm(vec2((uv.x + lp) * 3.0, k));
    col = mix(col, lc * 0.9, smoothstep(px, -px, uv.y - gy));

    // drifting mist sheet between layers
    float m = fbm(vec2((uv.x + lp) * 1.6 + t * 0.02 * (1.0 + k * 0.3), uv.y * 3.0 + k * 5.0));
    float mh = exp(-pow((uv.y + 0.28 - k * 0.05) * 4.5, 2.0));
    col += vec3(0.05, 0.07, 0.08) * mh * smoothstep(0.35, 0.75, m) * (0.35 + 0.15 * k);

    // fireflies living at this depth (drawn in front of it, behind nearer trunks)
    float sz = 1.0 / (1.0 + k * 0.6);
    for (int i = 0; i < 7; i++) {
      float fi = float(i) + k * 11.0;
      float hx = h11(fi * 1.37 + 0.5), hy = h11(fi * 2.91 + 3.1), hp = h11(fi * 5.13 + 7.7);
      float span = aspect + 0.4;
      float bx = mod(hx * span - lp * 1.0 + 0.5 * span, span) - 0.5 * span;
      vec2 fp = vec2(bx, -0.33 + hy * 0.6);
      float ph = hp * 6.2831;
      fp += vec2(0.09 * sin(t * (0.21 + 0.13 * hx) + ph) + 0.03 * sin(t * 0.53 + ph * 2.0),
                 0.06 * sin(t * (0.17 + 0.11 * hy) + ph * 1.7) + 0.02 * cos(t * 0.41 + ph));
      // blink: quick-ish rise, slow fade, long dark pause (~4-7 s cycle)
      float cyc = fract(t / (4.0 + 3.0 * hp) + hx);
      float b = smoothstep(0.0, 0.08, cyc) * exp(-max(cyc - 0.08, 0.0) * 9.0);
      b = 0.06 + b;
      float d = length(uv - fp);
      float g = b * (exp(-d * d / (0.00002 * sz * sz)) * 1.4 + 0.0009 * sz / (d * d + 0.0006 * sz));
      col += fireCol * g * 0.55;
      glowSum += b * exp(-d * 5.0) * sz;
    }
  }

  // foreground ferns: pointed, arching fronds along the bottom
  float fern = -1.0;
  for (int j = 0; j < 2; j++) {
    float fj = float(j);
    float fx = (uv.x + pan * (1.2 + 0.2 * fj)) * (9.0 - 3.0 * fj) + fj * 3.7;
    float cid = floor(fx);
    float fr = fract(fx) - 0.5 - 0.25 * (h11(cid + fj * 5.0) - 0.5);
    float hgt = 0.05 + 0.07 * h11(cid * 1.9 + fj);
    float tip = 1.0 - pow(min(abs(fr) * 2.2, 1.0), 1.1);
    // little leaflet serration on the frond flanks
    tip *= 0.85 + 0.15 * abs(sin(fr * 60.0 + cid));
    fern = max(fern, -0.47 + fj * 0.02 + hgt * tip + 0.015 * sin(fx * 0.7));
  }
  col = mix(col, vec3(0.002, 0.003, 0.004), smoothstep(px, -px, uv.y - fern));

  // faint green bounce light from the fireflies onto the mist
  col += vec3(0.02, 0.035, 0.01) * glowSum;

  // canopy: dark leaf mass at the top edge
  vec2 cp = vec2((uv.x + pan * 0.5) * 2.5, uv.y * 2.0 + 3.0);
  float can = fbm(cp) + 0.35 * vnoise(cp * 6.0 + t * 0.03) + 0.15 * vnoise(cp * 15.0);
  float edge = uv.y + 0.14 * can - 0.12;
  col *= 1.0 - smoothstep(0.26, 0.30, edge);
  col += vec3(0.02, 0.025, 0.03) * exp(-abs(edge - 0.26) * 60.0) * smoothstep(0.7, 0.0, length(uv - moon));

  // vignette + tone map
  col *= 1.0 - 0.45 * pow(length(uv * vec2(0.7, 1.0)), 2.2);
  col = 1.0 - exp(-col * 1.6);
  col = pow(col, vec3(0.92));
  fragColor = vec4(col, 1.0);
}
