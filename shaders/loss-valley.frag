// Loss Valley — a contour-lined loss landscape where glowing particles spiral down into the minima, camera slowly orbiting (FragCoord GLSL)
// Theme: AI

const vec2 B1 = vec2(1.15, 0.55);   // basins (minima)
const vec2 B2 = vec2(-1.05, -0.75);
const vec2 B3 = vec2(-0.45, 1.35);
const vec2 K1 = vec2(0.1, -0.1);    // ridges between them
const vec2 K2 = vec2(1.3, -1.25);
const vec2 K3 = vec2(-1.7, 0.6);

float gauss(vec2 p, vec2 c, float k) { vec2 d = p - c; return exp(-dot(d, d) * k); }

float H(vec2 p) {
  float h = 0.04 * dot(p, p);
  h -= 0.62 * gauss(p, B1, 1.5);
  h -= 0.48 * gauss(p, B2, 1.9);
  h -= 0.40 * gauss(p, B3, 2.3);
  h += 0.50 * gauss(p, K1, 1.1);
  h += 0.34 * gauss(p, K2, 1.6);
  h += 0.30 * gauss(p, K3, 1.4);
  h += 0.05 * sin(p.x * 2.3 + 0.7) * sin(p.y * 1.9 - 0.4);
  return h;
}

vec2 basin(int k) { return k == 0 ? B1 : (k == 1 ? B2 : B3); }

// descent path of particle i at progress u in [0,1]: a damped spiral into its basin
vec2 path(int i, float u) {
  float fi = float(i);
  vec2 c = basin(i - 3 * (i / 3));
  float r0 = 1.25 + 0.25 * sin(fi * 2.7);
  float a0 = fi * 2.399 + 0.6;
  float dir = (i / 3 == 0) ? 1.0 : -1.0;
  float r = r0 * pow(1.0 - u, 1.7);
  float a = a0 + dir * 3.2 * pow(u, 0.7);
  return c + r * vec2(cos(a), sin(a));
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;

  // slow orbit
  float ang = mod(t * 0.045, 6.2831853) + 0.8;
  vec3 ro = vec3(4.6 * cos(ang), 2.0 + 0.2 * sin(t * 0.07), 4.6 * sin(ang));
  vec3 ta = vec3(0.0, -0.3, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 1.7 + uv.x * rt + uv.y * up);

  // heightfield march
  float tmax = 16.0;
  float tt = max(0.0, (ro.y - 1.2) / max(-rd.y, 1e-3));
  float tl = tt;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * tt;
    float d = p.y - H(p.xz);
    if (d < 0.0015 * tt) { hit = true; break; }
    tl = tt;
    tt += max(d * 0.6, 0.004 * tt);
    if (tt > tmax) break;
  }
  if (hit) {  // refine between last outside and inside samples
    float a = tl, b = tt;
    for (int i = 0; i < 5; i++) {
      float m = 0.5 * (a + b);
      vec3 p = ro + rd * m;
      if (p.y - H(p.xz) > 0.0) a = m; else b = m;
    }
    tt = 0.5 * (a + b);
  }

  // night sky
  vec3 col = mix(vec3(0.012, 0.016, 0.035), vec3(0.03, 0.04, 0.08), exp(-max(rd.y + 0.05, 0.0) * 6.0));

  // particle clock
  float per = 30.0;
  float clk = t / per;

  if (hit) {
    vec3 p = ro + rd * tt;
    float h = H(p.xz);
    vec2 e = vec2(0.01, 0.0);
    vec3 n = normalize(vec3(H(p.xz - e.xy) - H(p.xz + e.xy), 2.0 * e.x, H(p.xz - e.yx) - H(p.xz + e.yx)));
    float dif = clamp(dot(n, normalize(vec3(-0.4, 0.8, 0.3))), 0.0, 1.0);

    // height tint: warm gold in the valleys, cool teal on the ridges
    float hn = clamp((h + 0.45) / 1.1, 0.0, 1.0);
    vec3 tint = mix(vec3(1.0, 0.62, 0.22), vec3(0.2, 0.75, 0.95), smoothstep(0.1, 0.6, hn));
    tint = mix(tint, vec3(0.55, 0.45, 1.0), smoothstep(0.65, 1.0, hn));

    vec3 base = vec3(0.01, 0.016, 0.034) + vec3(0.03, 0.045, 0.075) * dif * dif;

    // contour lines, every fifth one stronger
    float v = h * 16.0;
    float fwv = max(fwidth(v), 1e-4);
    float ln = 1.0 - smoothstep(0.0, 1.2, abs(fract(v + 0.5) - 0.5) / fwv);
    float v5 = v / 5.0;
    float ln5 = 1.0 - smoothstep(0.0, 1.4, abs(fract(v5 + 0.5) - 0.5) / max(fwidth(v5), 1e-4) * 0.55);
    float fade = clamp(1.0 - fwv * 1.6, 0.0, 1.0);   // lines too dense to resolve dissolve
    col = base + tint * (0.28 * ln + 0.55 * ln5) * fade;

    // soft glow pooling in the minima
    float pool = gauss(p.xz, B1, 6.0) + gauss(p.xz, B2, 7.0) + gauss(p.xz, B3, 8.0);
    col += vec3(1.0, 0.55, 0.2) * 0.12 * pool;

    // descent trails painted on the surface
    float tr = 0.0;
    for (int i = 0; i < 6; i++) {
      float s = fract(clk + float(i) / 6.0);
      float u = min(s / 0.8, 1.0);
      float alive = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.88, 1.0, s));
      // the whole trail lies inside the circle of its oldest sample: skip it when far away
      vec2 c = basin(i - 3 * (i / 3));
      float rmax = (1.25 + 0.25 * sin(float(i) * 2.7)) * pow(1.0 - max(u - 0.32, 0.0), 1.7) + 0.08;
      if (alive <= 0.0 || length(p.xz - c) > rmax) continue;
      vec2 a = path(i, u);
      for (int j = 1; j <= 16; j++) {
        float uj = max(u - float(j) * 0.02, 0.0);
        vec2 b = path(i, uj);
        float d = segDist(p.xz, a, b);
        float w = 1.0 - float(j) / 17.0;
        tr = max(tr, alive * w * exp(-d * d * 900.0));
        a = b;
      }
    }
    col += vec3(1.0, 0.85, 0.6) * 0.6 * tr;

    // distance fog
    col = mix(col, vec3(0.02, 0.025, 0.05), 1.0 - exp(-max(tt - 3.0, 0.0) * 0.14));
  }

  // the particles themselves
  for (int i = 0; i < 6; i++) {
    float s = fract(clk + float(i) / 6.0);
    float u = min(s / 0.8, 1.0);
    float alive = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.88, 1.0, s));
    vec2 q = path(i, u);
    vec3 P = vec3(q.x, H(q) + 0.035, q.y);
    float tp = dot(P - ro, rd);
    if (tp < 0.0) continue;
    float vis = (!hit || tp < tt + 0.08) ? 1.0 : 0.15;
    float d = length(ro + rd * tp - P) / tp;
    float settle = smoothstep(0.75, 0.85, s);   // resting in the minimum: gentle brighter halo
    col += vec3(1.0, 0.93, 0.8) * alive * vis * (exp(-d * d / 0.000012) * 0.9 + exp(-d / 0.012) * (0.12 + 0.12 * settle));
  }

  // tone map and vignette
  col = 1.0 - exp(-col * 1.4);
  col *= 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(pow(col, vec3(0.92)), 1.0);
}
