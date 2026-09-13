// Hearth Fire — a log fire on dark ground: layered flame tongues around a white-hot heart, glowing coals and sparks lifting on the draught (FragCoord GLSL)
// Theme: flame

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// value noise with a lattice that repeats every 64 cells in y, so the upward scroll wraps cleanly
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, 64.0), y1 = mod(i.y + 1.0, 64.0);
  return mix(mix(hash2(vec2(i.x, y0)), hash2(vec2(i.x + 1.0, y0)), f.x),
             mix(hash2(vec2(i.x, y1)), hash2(vec2(i.x + 1.0, y1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.0 + vec2(19.1, 0.0);
    a *= 0.5;
  }
  return v;
}

vec3 blackbody(float T) {
  T = max(T, 0.0);
  return vec3(1.25 * T, 1.05 * pow(T, 2.1), 0.9 * pow(T, 4.5)) * 1.5;
}

float segd(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// one flame layer: width envelope, turbulent warp and tongue-breaking noise
float flame(vec2 p, float t, float seed, float width, float height, float speed) {
  float ty = mod(t * speed, 64.0);
  float n1 = fbm(vec2(p.x * 2.8 + seed, p.y * 2.0 - ty));
  float n2 = fbm(vec2(p.x * 7.0 + seed * 1.7 + 3.0, p.y * 4.2 - mod(t * speed * 1.7, 64.0)));
  float y = p.y / height;
  float xw = p.x + (n1 - 0.5) * 0.7 * smoothstep(0.0, 0.7, y) * height;
  float w = width * pow(max(1.0 - y, 0.0), 0.8) * (0.9 + 0.25 * smoothstep(0.0, 0.25, y));
  float shape = 1.0 - abs(xw) / max(w, 1e-3);
  float dens = shape * 1.35 - (n2 - 0.5) * 2.4 * smoothstep(-0.1, 0.45, y) - y * 0.55 + 0.05;
  return max(dens, 0.0) * smoothstep(-0.03, 0.05, p.y) * smoothstep(1.0, 0.75, y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  vec2 p = uv + vec2(0.0, 0.36);  // fire base sits low in the frame
  float sway = 0.03 * sin(mod(t * 0.4, 6.2832)) + 0.015 * sin(mod(t * 0.73, 6.2832));
  vec2 fp = vec2(p.x - sway * smoothstep(0.0, 0.6, p.y), p.y);

  // steady warm light the fire throws around itself (slow, shallow breathing only)
  float breathe = 0.93 + 0.07 * sin(mod(t * 0.9, 6.2832)) * sin(mod(t * 0.37, 6.2832));
  vec3 col = vec3(0.006, 0.004, 0.003);
  col += vec3(1.0, 0.35, 0.08) * 0.22 * breathe * exp(-length((p - vec2(0.0, 0.18)) * vec2(1.1, 0.8)) * 2.6);

  // ground: dark earth with a pool of firelight
  if (p.y < 0.02) {
    float gn = noise(vec2(p.x * 14.0, p.y * 40.0)) * 0.5 + noise(vec2(p.x * 40.0, p.y * 90.0)) * 0.5;
    float pool = exp(-length(vec2(p.x, (p.y - 0.02) * 4.0)) * 3.0);
    col = mix(col, vec3(0.012, 0.008, 0.006) + vec3(0.6, 0.24, 0.07) * pool * 0.35 * (0.5 + gn) * breathe,
              smoothstep(0.02, -0.02, p.y));
  }

  // back layer (wide, dim, slow) then the main body
  float back = flame(fp * vec2(1.05, 1.0), t, 11.0, 0.27, 0.6, 0.9);
  float main_ = flame(fp, t, 0.0, 0.24, 0.72, 1.25);
  float core = flame(fp * vec2(1.4, 1.25), t, 37.0, 0.2, 0.5, 1.6);
  float T = max(main_ * 0.85, back * 0.42);
  T = max(T, core * 1.05 * smoothstep(0.5, 0.0, p.y));
  col += blackbody(pow(T, 1.25)) * smoothstep(0.0, 0.06, T);

  // logs across the base, glowing along their cracks
  float l1 = segd(p, vec2(-0.36, -0.015), vec2(0.28, 0.055)) - 0.032;
  float l2 = segd(p, vec2(0.37, -0.02), vec2(-0.24, 0.06)) - 0.03;
  float logd = min(l1, l2);
  if (logd < 0.01) {
    vec2 lp = p * vec2(18.0, 40.0);
    float cn = noise(lp) * 0.6 + noise(lp * 2.3 + 5.0) * 0.4;
    float under = smoothstep(0.06, -0.02, p.y);  // the undersides smoulder hottest
    float hot = smoothstep(0.6, 0.85, cn) * (0.1 + 0.9 * under) * (0.7 + 0.3 * noise(vec2(p.x * 6.0, mod(t * 0.3, 64.0))));
    float heat = exp(-abs(p.x) * 3.5);
    float bark = 0.6 + 0.4 * noise(vec2(p.x * 60.0, p.y * 25.0));
    vec3 lc = vec3(0.022, 0.013, 0.008) * bark + blackbody(0.5 + 0.35 * heat) * hot * heat * 0.8;
    lc += vec3(0.5, 0.18, 0.04) * 0.25 * heat * smoothstep(-0.03, 0.0, logd);  // rim lit by flame behind
    col = mix(col, lc, smoothstep(0.004, -0.004, logd));
  }
  // bed of coals under the logs
  float bed = smoothstep(0.035, 0.0, abs(p.y + 0.01) - 0.012) * smoothstep(0.42, 0.1, abs(p.x));
  if (bed > 0.0) {
    vec2 cp = vec2(p.x * 16.0, p.y * 30.0);
    float cn = noise(cp) * 0.65 + noise(cp * 2.1 + vec2(0.0, mod(t * 0.2, 64.0))) * 0.35;
    col += blackbody(0.3 + 0.55 * cn) * bed * smoothstep(0.3, 0.8, cn) * 0.7 * breathe;
  }

  // sparks lifting on the draught, drifting sideways and cooling as they climb
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float s = 9.0 + fk * 5.0;
    float vy = (0.35 + 0.12 * fk);
    vec2 gp = p;
    gp.x += 0.05 * sin(p.y * 4.0 + fk * 2.1 + mod(t * 0.6, 6.2832));
    vec2 g = vec2(gp.x * s, gp.y * s - mod(t * vy * s, 64.0));
    vec2 id = floor(g);
    id.y = mod(id.y, 64.0);  // keep spark ids periodic with the scroll
    float h = hash2(id + fk * 31.0);
    if (h > 0.8) {
      vec2 o = vec2(hash2(id + 4.1), hash2(id + 8.3)) - 0.5;
      vec2 d = fract(g) - 0.5 - o * 0.6;
      float life = smoothstep(0.02, 0.18, p.y) * exp(-max(p.y - 0.15, 0.0) * (2.2 - 0.4 * fk));
      float lane = exp(-gp.x * gp.x * (16.0 - 4.0 * fk));
      float cool = clamp(1.0 - p.y * 0.9, 0.3, 1.0);
      col += blackbody(0.55 + 0.45 * cool) * exp(-dot(d, d) * 260.0) * life * lane * (1.1 - 0.25 * fk);
    }
  }

  col = 1.0 - exp(-col * 1.25);
  col *= 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
