// Yrden Circle — a witcher's violet trap sigil burning on dark ground, runes wheeling in its band and a curtain of light rising from the ring (FragCoord GLSL)
// Theme: The Witcher

const float TAU = 6.2831853;
const float RC = 1.1;  // ring radius

float hash1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x),
             mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
float segd(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// a futhark-like rune: a staff with branches, chosen from the slot's id
float rune(vec2 p, float id) {
  float d = segd(p, vec2(0.0, -1.0), vec2(0.0, 1.0));
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float h1 = hash1(id * 13.1 + fk * 3.7);
    float h2 = hash1(id * 7.3 + fk * 5.1 + 1.0);
    float y1 = floor(h1 * 3.0) - 1.0;
    float y2 = y1 + (fract(h1 * 7.0) < 0.5 ? -1.0 : 1.0);
    y2 = clamp(y2, -1.0, 1.0);
    float sx = h2 < 0.5 ? -0.6 : 0.6;
    if (k == 2 && h2 > 0.7) sx = 0.0;  // sometimes a chevron back to the staff instead
    d = min(d, segd(p, vec2(0.0, y1), vec2(sx == 0.0 ? 0.6 : sx, y2)));
  }
  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  vec3 violet = vec3(0.62, 0.3, 1.0);

  vec3 ro = vec3(0.0, 1.75, -4.1);
  vec3 ta = vec3(0.0, 0.32, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.7 * fw);

  float rot = mod(t * 0.07, TAU);
  float breath = 0.85 + 0.15 * sin(mod(t * 0.5, TAU));

  // night mist behind
  vec3 col = vec3(0.008, 0.006, 0.014) + violet * 0.035 * exp(-abs(rd.y + 0.05) * 7.0);

  float tg = rd.y < 0.0 ? -ro.y / rd.y : 1e4;
  if (rd.y < 0.0) {
    vec2 g = (ro + rd * tg).xz;
    float r = length(g);
    float a = atan(g.y, g.x);
    // wet earth and stones, lit from the sigil
    float gn = noise(g * 3.0) * 0.6 + noise(g * 9.0) * 0.4;
    float lightR = 1.0 / (1.0 + pow(abs(r - RC), 2.0) * 5.0) * (r < RC ? 1.0 : exp(-(r - RC) * 1.5));
    col = vec3(0.02, 0.018, 0.024) * (0.4 + gn) * exp(-tg * 0.08);
    col += violet * lightR * 0.18 * (0.35 + gn) * breath;

    // the sigil: guard rings, the inner triad and a small heart circle
    float line = abs(r - (RC - 0.17));
    line = min(line, abs(r - (RC + 0.17)));
    float thin = abs(r - (RC + 0.25));
    float ci = cos(-rot * 0.6), si = sin(-rot * 0.6);
    vec2 gr = mat2(ci, -si, si, ci) * g;
    for (int k = 0; k < 3; k++) {
      float ak = float(k) * TAU / 3.0 + 1.5708;
      vec2 P = vec2(cos(ak), sin(ak)) * (RC - 0.17);
      vec2 Q = vec2(cos(ak + TAU / 3.0), sin(ak + TAU / 3.0)) * (RC - 0.17);
      line = min(line, segd(gr, P, Q));
      thin = min(thin, segd(gr, vec2(0.0), P));
    }
    line = min(line, abs(length(gr) - 0.2));

    // runes in the band, wheeling slowly
    const float N = 13.0;
    float ar = a - rot;
    float slot = floor(ar / (TAU / N));
    float id = mod(slot, N);
    float u = (fract(ar / (TAU / N)) - 0.5) * (TAU / N) * r;
    vec2 rp = vec2(u, r - RC) / 0.1;
    float rn = rune(rp, id) * 0.1;
    float pulse = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(ar * 1.0 - mod(t * 0.45, TAU) + 3.0), 3.0);

    float w = 0.007 + tg * 0.0012;  // lines thicken a touch with distance so they stay crisp
    float core = smoothstep(w, w * 0.4, line) + smoothstep(w * 0.7, w * 0.25, thin) * 0.6
               + smoothstep(w * 0.8, w * 0.3, rn) * pulse * 1.2;
    float glow = exp(-line * 45.0) * 0.45 + exp(-thin * 60.0) * 0.2 + exp(-rn * 55.0) * 0.4 * pulse;
    col += violet * (glow + core * 1.3) * breath;
    col += vec3(1.0, 0.9, 1.0) * core * 0.35 * breath;
  }

  // curtain of light rising from the ring: a thin glowing cylinder, brightest low
  float A = dot(rd.xz, rd.xz), B = dot(ro.xz, rd.xz), Cc = dot(ro.xz, ro.xz) - RC * RC;
  float D = B * B - A * Cc;
  if (D > 0.0) {
    float s = sqrt(D);
    for (int k = 0; k < 2; k++) {
      float tc = (-B + (k == 0 ? -s : s)) / A;
      if (tc > 0.0 && tc < tg) {
        vec3 cp = ro + rd * tc;
        float h = cp.y;
        if (h > 0.0) {
          float ca = atan(cp.z, cp.x) - rot;
          float tm = mod(t, 628.3185);
          float streak = 0.5 + 0.25 * sin(ca * 17.0 + 2.0 * sin(ca * 5.0 + tm * 0.3) - h * 2.0)
                              + 0.25 * sin(ca * 29.0 - tm * 0.2 + h * 1.5);
          float flow = 0.7 + 0.3 * sin(h * 7.0 - tm * 1.1 + ca * 3.0);
          float I = exp(-h * 1.9) * streak * flow;
          vec2 nx = cp.xz / RC;
          float cosv = abs(dot(nx, rd.xz));
          col += violet * I * 0.09 / max(cosv, 0.12) * (k == 0 ? 1.0 : 0.7) * breath;
          // motes riding up the curtain
          vec2 mp = vec2((ca + TAU) * RC * 6.0, h * 6.0 - mod(t * 0.5, 60.0));
          vec2 mid = floor(mp);
          mid.y = mod(mid.y, 60.0);  // periodic with the scroll
          float mh = hash2(mid + float(k) * 19.0);
          if (mh > 0.8) {
            vec2 md = fract(mp) - 0.5 - (vec2(hash2(mid + 2.3), hash2(mid + 5.9)) - 0.5) * 0.6;
            col += vec3(0.85, 0.6, 1.0) * exp(-dot(md, md) * 120.0) * exp(-h * 1.2) * 0.9;
          }
        }
      }
    }
  }

  col = 1.0 - exp(-col * 1.5);
  col *= 1.0 - 0.3 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
