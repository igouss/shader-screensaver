// Tyrell Skyline — Los Angeles 2019: a plain of city lights, gas-flare towers and the Tyrell pyramid under smog (FragCoord GLSL)
// Theme: Blade Runner

float h21(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 32768);
  uint h = q.x * 1597334677u ^ q.y * 3812015801u;
  h = (h ^ (h >> 16)) * 2246822519u;
  h ^= h >> 13;
  return float(h & 0xffffffu) / 16777216.0;
}
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x),
             mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = mod(u_time, 3600.0);
  float hz = -0.04;                        // horizon line
  vec3 col = vec3(0.0);

  // ---- smog sky, lit orange from below
  float hy = uv.y - hz;
  vec3 sky = mix(vec3(0.16, 0.06, 0.03), vec3(0.012, 0.012, 0.03), smoothstep(0.0, 0.45, hy));
  float smog = fbm(vec2(uv.x * 1.6 + T * 0.015, uv.y * 5.0 - T * 0.004));
  float smog2 = fbm(vec2(uv.x * 3.0 - T * 0.01, uv.y * 9.0) + 4.0);
  sky += vec3(0.20, 0.08, 0.04) * smoothstep(0.35, 0.85, smog) * exp(-max(hy, 0.0) * 3.0);
  sky += vec3(0.03, 0.035, 0.06) * smoothstep(0.4, 0.9, smog2);
  col = sky;

  // ---- city plain in perspective: sodium street grid + scattered windows
  if (hy < 0.0) {
    float d = -hy;
    float z = 0.10 / d;
    vec2 w = vec2(uv.x * z + T * 0.02, z);
    float pix = 1.0 / u_resolution.y;
    vec3 city = vec3(0.12, 0.045, 0.02) * exp(-d * 7.0);  // haze glow near horizon
    // streets lined with sodium lamps
    float SK = 9.0;
    vec2 cw = w * SK;
    vec2 e = (0.5 - abs(fract(cw) - 0.5)) / SK;
    vec2 ss = vec2(e.x / z, 0.10 * e.y / (z * z));
    vec2 spc = vec2(1.0 / (SK * z), 0.10 / (SK * z * z));
    float sw = 0.0012;
    float sb = 0.5 + 0.5 * h21(floor(cw) + 13.0);
    vec2 lineId = floor(cw + 0.5);
    vec2 keep = vec2(step(0.35, h21(vec2(lineId.x, 5.0))), step(0.3, h21(vec2(9.0, lineId.y))));
    vec2 fx = smoothstep(3.0 * pix, 12.0 * pix, spc);
    // lamps along the lines
    vec2 la = (fract(cw * 5.0) - 0.5) / (5.0 * SK);
    float lampX = exp(-(ss.x * ss.x + pow(0.10 * la.y / (z * z), 2.0)) / (sw * sw * 2.5));
    float lampZ = exp(-(ss.y * ss.y + pow(la.x / z, 2.0)) / (sw * sw * 2.5));
    float glowL = exp(-ss.x * ss.x / (sw * sw)) * fx.x * keep.x + 0.4 * exp(-ss.y * ss.y / (sw * sw)) * fx.y * keep.y;
    city += vec3(1.0, 0.5, 0.16) * (glowL * 0.12 + (lampX * fx.x * keep.x + lampZ * fx.y * keep.y) * 0.9) * sb;
    city += vec3(1.0, 0.5, 0.16) * 0.06 * (2.0 - fx.x - fx.y);
    // windows / point lights
    for (int L = 0; L < 2; L++) {
      float fl = float(L);
      vec2 k = mix(vec2(10.0, 5.0), vec2(24.0, 12.0), fl);
      vec2 g = w * k + fl * 17.0;
      vec2 id = floor(g), f = fract(g) - 0.5;
      float r = h21(id);
      vec2 off = (vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.7;
      vec2 dw = (f - off) / k;
      vec2 s = vec2(dw.x / z, 0.10 * dw.y / (z * z));
      float wdt = (0.0018 + 0.0005 * fl) * (1.0 + 0.25 / z);
      float lum = exp(-dot(s, s) / (wdt * wdt));
      float tw = 0.75 + 0.25 * sin(T * (0.6 + r * 1.5) + r * 40.0);
      vec3 lc = r < 0.55 ? vec3(1.0, 0.55, 0.2) : (r < 0.8 ? vec3(0.9, 0.85, 0.75) : (r < 0.9 ? vec3(0.2, 0.8, 1.0) : vec3(1.0, 0.25, 0.6)));
      float fade = smoothstep(2.0 * pix, 8.0 * pix, 0.10 / (k.y * z * z));
      city += lc * lum * tw * fade * step(0.3, r) * (1.2 - 0.4 * fl);
      city += lc * 0.035 * (1.0 - fade) * (1.0 - 0.5 * fl);   // unresolved far lights
    }
    // low smog rolling over the city
    float mist = fbm(vec2(w.x * 0.8 - T * 0.03, w.y * 0.6));
    city = mix(city, vec3(0.09, 0.04, 0.03), smoothstep(0.45, 0.9, mist) * 0.7);
    col = city;
  }

  // ---- Tyrell pyramid(s)
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float fj = 1.0 - fi;
    vec2 pb = mix(vec2(0.2, hz - 0.08), vec2(-0.2, hz - 0.03), fj);
    float H = mix(0.46, 0.28, fj), W = mix(0.44, 0.28, fj);
    vec2 q = uv - pb;
    float edge = W * (1.0 - q.y / H) - abs(q.x);
    if (q.y > 0.0 && edge > 0.0) {
      float face = q.x > 0.0 ? 0.55 : 1.0;          // right face in shadow
      vec3 pc = vec3(0.028, 0.022, 0.024) * face * (1.0 - 0.5 * fj);
      // terraces and windows
      vec2 wg = vec2(q.x * 150.0, q.y * 110.0);
      vec2 wid = floor(wg);
      float wr = h21(wid + fj * 91.0);
      vec2 wf = fract(wg);
      float win = step(0.2, wf.x) * step(wf.x, 0.8) * step(0.35, wf.y) * step(wf.y, 0.75);
      float lit = step(0.72, wr) * (0.7 + 0.3 * sin(T * 0.2 + wr * 50.0));
      float band = step(0.8, fract(q.y * 18.0));        // terrace ledges
      pc += vec3(1.0, 0.62, 0.3) * win * lit * 0.55 * face * (1.0 - band) * (1.0 - 0.45 * fj);
      pc += vec3(0.08, 0.05, 0.03) * band * face;
      pc *= smoothstep(0.0, 0.004, edge);
      // warm haze at its foot
      pc += vec3(0.10, 0.04, 0.02) * exp(-q.y * 14.0);
      col = mix(col, pc, smoothstep(0.0, 0.002, edge));
    }
    // apex beacon
    vec2 ap = q - vec2(0.0, H);
    col += vec3(1.0, 0.7, 0.4) * 0.004 / (dot(ap, ap) * 60.0 + 0.004) * (1.0 - 0.6 * fj) * 0.2;
  }

  // ---- gas-flare towers
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 base = vec2(i == 0 ? -0.66 : (i == 1 ? -0.42 : 0.72), hz - 0.06 - 0.12 * fract(fi * 0.618 + 0.3));
    float th = 0.12 + 0.06 * fract(fi * 0.37 + 0.5);
    vec2 top = base + vec2(0.0, th);
    // tower silhouette
    vec2 tq = uv - base;
    float tw = 0.004 + 0.006 * (1.0 - tq.y / th);
    float tower = step(abs(tq.x), tw) * step(0.0, tq.y) * step(tq.y, th);
    col = mix(col, vec3(0.01, 0.006, 0.006), tower * 0.9);
    // flame burst cycle
    float ph = fract(T / (9.0 + 2.0 * fi) + fi * 0.37);
    float burst = smoothstep(0.0, 0.14, ph) * (1.0 - smoothstep(0.22, 0.6, ph));
    float hgt = 0.025 + 0.2 * burst;
    vec2 q = uv - top;
    float nq = fbm(vec2(q.x * 30.0, q.y * 12.0 - T * 2.2) + fi * 7.0);
    float wid = 0.006 + 0.03 * clamp(q.y / hgt, 0.0, 1.0) * (0.5 + burst);
    float fl = smoothstep(wid, 0.0, abs(q.x + 0.01 * (nq - 0.5))) * smoothstep(0.0, 0.01, q.y) *
               smoothstep(hgt, 0.0, q.y - (nq - 0.5) * 0.05);
    vec3 fc = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.55), smoothstep(0.5, 1.0, fl));
    col += fc * fl * 1.6;
    // glow in the smog around the flare
    vec2 gq = uv - top - vec2(0.0, hgt * 0.4);
    col += vec3(0.8, 0.28, 0.06) * (0.03 + 0.14 * burst) * exp(-length(gq * vec2(1.0, 0.7)) * 9.0);
  }

  // ---- searchlights sweeping from the pyramid apex
  vec2 apex = vec2(0.2, hz - 0.08 + 0.46);
  vec2 bq = uv - apex;
  if (bq.y > 0.0) {
    float ang = atan(bq.x, bq.y);
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float a = 0.55 * sin(T * (0.13 + 0.05 * fi) + fi * 2.4);
      float beam = exp(-abs(ang - a) * 22.0) * exp(-length(bq) * 1.6);
      col += vec3(0.45, 0.55, 0.7) * beam * 0.12 * (0.5 + 0.8 * smog);
    }
  }

  // ---- spinners drifting through the smog
  float ar = u_resolution.x / u_resolution.y;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sp = 0.012 + 0.006 * fi;
    float px = (fract(T * sp + fi * 0.41) - 0.5) * (ar + 0.4) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
    vec2 sp2 = vec2(px, 0.06 + 0.12 * fi + 0.015 * sin(T * 0.4 + fi * 2.0));
    vec2 q = uv - sp2;
    float body = smoothstep(0.004, 0.0, length(q * vec2(0.5, 1.6)) - 0.002);
    col = mix(col, vec3(0.01), body * 0.8);
    float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 hl = q - vec2(0.009 * dir, 0.0);
    col += vec3(0.8, 0.9, 1.0) * 0.00004 / (dot(hl, hl) + 0.00004) * 0.5;
    vec2 rl = q + vec2(0.006 * dir, 0.004);
    float blink = 0.5 + 0.5 * sin(T * 3.0 + fi * 2.0);
    col += vec3(1.0, 0.1, 0.05) * 0.00002 / (dot(rl, rl) + 0.00002) * blink * 0.5;
    // headlight cone through the haze
    float cone = exp(-abs(q.y + 0.2 * q.x * dir * 0.0) * 120.0) * smoothstep(0.0, 0.01, q.x * dir) * exp(-q.x * dir * 14.0);
    col += vec3(0.4, 0.45, 0.5) * cone * 0.08;
  }

  col = 1.0 - exp(-col * 1.4);
  vec2 vq = gl_FragCoord.xy / u_resolution - 0.5;
  col *= 1.0 - 0.6 * dot(vq, vq);
  fragColor = vec4(pow(col, vec3(0.95)), 1.0);
}
