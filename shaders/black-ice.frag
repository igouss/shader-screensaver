// Black ICE — a slow low flight over Gibson's cyberspace grid, neon edge-lit data fortresses rising around white-violet ICE monoliths (Shadertoy)
// Theme: hacking

const float ZPER = 1024.0;   // world repeats along z so positions stay precise for hours
const float MPER = 32.0;     // spacing of the ICE monoliths along the route

float hash21(vec2 p) {
  p = mod(p, ZPER);
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// the ICE monolith nearest to z, and which side of the route it stands on
vec3 monolith(float z) {
  float k = floor((z - 18.0) / MPER + 0.5);
  float side = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
  return vec3(side * (2.6 + 1.0 * hash21(vec2(k, 5.0))), 0.0, 18.0 + k * MPER);
}

// tower in a grid cell: half-width x, half-width z, height, colour kind (0 = empty lot)
vec4 cellInfo(vec2 id) {
  vec3 m = monolith(id.y + 0.5);
  if (length(id + 0.5 - m.xz) < 1.9) return vec4(0.0);
  float h = hash21(id);
  if (h < 0.55) return vec4(0.0);
  float h2 = hash21(id + 17.3);
  float h3 = hash21(id + 41.7);
  float h4 = hash21(id + 3.1);
  float ht = 0.08 + 0.55 * pow(h4, 1.5);
  if (h > 0.9 && abs(id.x + 0.5) > 1.0) ht = 1.1 + 1.4 * h4;  // the odd corporate spire, off the flight path
  return vec4(0.16 + 0.18 * h2, 0.16 + 0.18 * fract(h2 * 7.13), ht, h3 < 0.55 ? 1.0 : 2.0);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// distance within the current cell; mat: 0 ground, 1 tower, 2 ice
float map(vec3 p, out float mat, out float dIce) {
  vec2 id = floor(p.xz);
  vec4 ci = cellInfo(id);
  float d = p.y;
  mat = 0.0;
  if (ci.w > 0.5) {
    float db = sdBox(p - vec3(id.x + 0.5, 0.5 * ci.z, id.y + 0.5), vec3(ci.x, 0.5 * ci.z, ci.y));
    if (db < d) { d = db; mat = 1.0; }
  }
  vec3 m = monolith(p.z);
  dIce = sdBox(p - vec3(m.x, 2.6, m.z), vec3(0.55, 2.6, 0.55));
  if (dIce < d) { d = dIce; mat = 2.0; }
  return d;
}

// second-smallest of three: small where two faces meet, i.e. on an edge
float edgeDist(vec3 e) {
  return max(min(e.x, e.y), min(max(e.x, e.y), e.z));
}

vec3 kindColor(float k) {
  return k < 1.5 ? vec3(0.15, 0.85, 1.0) : vec3(1.0, 0.22, 0.78);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float tm = iTime;

  float camZ = mod(tm * 0.35, ZPER);
  vec3 ro = vec3(0.09 * sin(tm * 0.07), 0.95 + 0.10 * sin(tm * 0.11), camZ);
  float yaw = 0.20 * sin(tm * 0.045);
  float pitch = -0.21 + 0.03 * sin(tm * 0.08);
  float roll = 0.035 * sin(tm * 0.045 + 0.6);

  vec3 rd = normalize(vec3(uv, 1.25));
  rd.xy = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * rd.xy;
  rd.yz = mat2(cos(pitch), sin(pitch), -sin(pitch), cos(pitch)) * rd.yz;
  rd.xz = mat2(cos(yaw), sin(yaw), -sin(yaw), cos(yaw)) * rd.xz;

  // march, never stepping past a cell wall so each cell only tests its own tower
  float t = 0.0, mat = -1.0, dIce = 1e9, iceGlow = 0.0;
  vec3 p = ro;
  bool hit = false;
  for (int i = 0; i < 96; i++) {
    p = ro + rd * t;
    float m, di;
    float d = map(p, m, di);
    iceGlow += exp(-di * 2.5) * 0.016;
    if (d < 0.0015 * t + 0.0005) { hit = true; mat = m; break; }
    vec2 cid = floor(p.xz);
    vec2 bnd = (cid + step(0.0, rd.xz) - p.xz) / rd.xz;
    float dc = min(bnd.x, bnd.y) + 0.002;
    t += min(d, dc);
    if (t > 30.0 || (p.y > 5.5 && rd.y > 0.0)) break;
  }

  // sky: violet dark, a faint band on the horizon
  vec3 horizon = vec3(0.07, 0.03, 0.14);
  vec3 col = mix(horizon, vec3(0.004, 0.004, 0.018), smoothstep(-0.05, 0.35, rd.y));
  col += vec3(0.30, 0.15, 0.55) * 0.12 * exp(-abs(rd.y) * 40.0);

  float fw = 0.0015 * t + 0.002;  // line width grows with distance to stay anti-aliased

  if (hit) {
    vec3 c = vec3(0.0);
    if (mat < 0.5) {
      // ground grid: streets on integer lines, data running along them
      vec2 g = abs(fract(p.xz + 0.5) - 0.5);
      vec2 cid = floor(p.xz + 0.5);
      float lx = exp(-g.x / fw), lz = exp(-g.y / fw);
      c = vec3(0.05, 0.24, 0.45) * (lx + lz) * 1.3 + vec3(0.02, 0.06, 0.12) * exp(-min(g.x, g.y) / (fw * 6.0));
      // packets along the z-running lines and the x-running lines
      float hx = hash21(vec2(cid.x, 7.0)), hz = hash21(vec2(cid.y, 11.0));
      float qx = fract(p.z / 8.0 + tm * (0.05 + 0.10 * hx) * (hx < 0.5 ? 1.0 : -1.0) + hx * 9.0);
      float qz = fract(p.x / 4.0 + tm * (0.05 + 0.10 * hz) * (hz < 0.5 ? 1.0 : -1.0) + hz * 9.0);
      float px_ = smoothstep(0.8, 0.99, qx) * smoothstep(1.0, 0.99, qx);
      float pz_ = smoothstep(0.8, 0.99, qz) * smoothstep(1.0, 0.99, qz);
      c += kindColor(hx < 0.7 ? 1.0 : 2.0) * lx * px_ * 1.6;
      c += kindColor(hz < 0.7 ? 1.0 : 2.0) * lz * pz_ * 1.6;
      c += vec3(0.004, 0.006, 0.014);
    } else if (mat < 1.5) {
      vec2 id = floor(p.xz);
      vec4 ci = cellInfo(id);
      vec3 b = vec3(ci.x, 0.5 * ci.z, ci.y);
      vec3 q = p - vec3(id.x + 0.5, 0.5 * ci.z, id.y + 0.5);
      vec3 e = b - abs(q);
      float ed = edgeDist(e);
      vec3 kc = kindColor(ci.w);
      float edge = exp(-ed / fw) + 0.25 * exp(-ed / (fw * 8.0));
      // dark glass faces with faint floor bands that slowly scroll upward (data rising)
      float band = exp(-abs(fract(p.y * 7.0 - tm * 0.12 + hash21(id) * 5.0) - 0.5) / (fw * 7.0 + 0.02)) *
                   step(0.4, hash21(id + 2.0));
      c = vec3(0.006, 0.008, 0.016) + kc * (edge * 1.1 + band * 0.07);
      // glowing roof line
      c += kc * 0.12 * smoothstep(0.02, 0.0, e.y);
    } else {
      vec3 m = monolith(p.z);
      vec3 q = p - vec3(m.x, 2.6, m.z);
      vec3 e = vec3(0.55, 2.6, 0.55) - abs(q);
      float ed = edgeDist(e);
      vec3 ic = vec3(0.86, 0.78, 1.0);
      float breathe = 0.85 + 0.15 * sin(tm * 0.4);
      float edge = exp(-ed / fw) + 0.35 * exp(-ed / (fw * 10.0));
      float scan = exp(-abs(fract(q.y * 3.0 + tm * 0.2) - 0.5) / 0.04) * 0.12;
      c = vec3(0.05, 0.035, 0.09) + ic * (edge * 2.2 + scan * 1.5) * breathe;
    }
    float fog = exp(-t * 0.07);
    col = mix(col, c, fog);
  }

  col += vec3(0.62, 0.50, 1.0) * iceGlow * (0.85 + 0.15 * sin(tm * 0.4));

  col = 1.0 - exp(-1.2 * col);
  col *= 1.0 - 0.45 * smoothstep(0.4, 1.2, length(uv * vec2(0.8, 1.0)));
  fragColor = vec4(col, 1.0);
}
