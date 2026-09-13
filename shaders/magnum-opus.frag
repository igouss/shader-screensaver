// Magnum Opus — ranks of golden cathedral organ pipes receding into the dark, warm light shafts and dust drifting as the camera glides along (Shadertoy)
// Theme: Opus

#define STEPS 64
#define CELLS 64.0

float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float hash2(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

// rank k: z position, spacing, radius
vec3 rankInfo(int k) {
  if (k == 0) return vec3(0.0, 0.40, 0.170);
  if (k == 1) return vec3(0.95, 0.32, 0.135);
  return vec3(2.3, 0.26, 0.105);
}

// pipe height for cell id in rank k: towers with mitred tops plus flats
float pipeHeight(float id, int k) {
  float c = mod(id, CELLS);
  float g = mod(c, 11.0);                          // 11 pipes per group
  float mitre = 1.0 - abs(g - 5.0) / 5.0;           // rises to the middle of each group
  float grp = floor(c / 11.0);
  float tower = 0.6 + 0.8 * hash1(grp + float(k) * 17.0);
  float h = 1.6 + float(k) * 0.9 + tower * (0.6 + 1.6 * mitre * mitre);
  return h + 0.15 * hash1(c + float(k) * 31.0);
}

float cylinder(vec3 p, float x, float r, float h) {
  vec2 d = vec2(length(p.xz - vec2(x, 0.0)) - r, abs(p.y - 0.5 * h) - 0.5 * h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// returns distance; id.x = rank, id.y = cell id (for shading)
float map(vec3 p, out vec2 id) {
  float d = max(p.y + 0.02, -0.3 - p.z);          // the organ chest: top and front face
  id = vec2(-1.0, 0.0);
  for (int k = 0; k < 3; k++) {
    vec3 ri = rankInfo(k);
    vec3 q = p - vec3(0.0, 0.0, ri.x);
    if (abs(q.z) - ri.z * 1.01 > d) continue;     // this whole rank is farther than what we have
    float s = ri.y;
    float offs = float(k) * 0.37 * s;
    float cx = floor((q.x - offs) / s + 0.5);
    float lx = q.x - offs - cx * s;
    // own cell and the nearer neighbour
    float nb = cx + (lx > 0.0 ? 1.0 : -1.0);
    for (int n = 0; n < 2; n++) {
      float c = n == 0 ? cx : nb;
      float h = pipeHeight(c, k);
      float r = ri.z * (0.85 + 0.15 * (h / 5.0));
      float dc = cylinder(vec3(q.x - offs - c * s, q.y, q.z), 0.0, r, h);
      if (dc < d) { d = dc; id = vec2(float(k), c); }
    }
  }
  return d;
}

float mapD(vec3 p) { vec2 id; return map(p, id); }

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(mapD(p + e.xyy) - mapD(p - e.xyy),
                        mapD(p + e.yxy) - mapD(p - e.yxy),
                        mapD(p + e.yyx) - mapD(p - e.yyx)));
}

// light shafts: bright bands in the plane across the light direction, like a tall window
float shafts(vec3 p, vec3 L, float T) {
  vec3 u = normalize(cross(L, vec3(0.0, 0.0, 1.0)));
  float s = dot(p, u);
  float b = 0.5 + 0.5 * sin(s * 1.9 + 0.6 * sin(s * 0.7 + T * 0.05));
  b *= 0.55 + 0.45 * sin(s * 5.3 - T * 0.06 + 1.7);
  return smoothstep(0.5, 0.95, b);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float T = mod(iTime, 3600.0);

  // camera glides along the ranks (the pipe pattern repeats every CELLS pipes)
  float camX = T * 0.12;
  vec3 ro = vec3(camX, 1.35 + 0.10 * sin(T * 0.07), -4.6);
  vec3 ta = ro + vec3(0.85, 0.16 + 0.04 * sin(T * 0.05), 1.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.35 * fw);

  vec3 L = normalize(vec3(-0.55, 0.75, -0.40));    // high window, behind-left of camera

  // nothing stands in front of the chest face, so start the march there
  float t = rd.z > 0.0 ? max((-0.31 - ro.z) / rd.z, 0.05) : 0.05;
  vec2 id = vec2(-1.0, 0.0);
  bool hit = false;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = map(p, id);
    if (d < 0.001 * t) { hit = true; break; }
    t += d * 0.9;
    if (t > 22.0 || (p.y > 7.0 && rd.y > 0.0)) break;
  }

  vec3 col = vec3(0.0);
  vec3 gold = vec3(1.0, 0.62, 0.22);
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    float fog = exp(-max(t - 3.5, 0.0) * 0.30);
    if (id.x < 0.0) {
      // dark walnut chest with a faint gilded rail
      float rail = smoothstep(0.02, 0.0, abs(fract(p.z * 0.8) - 0.5) - 0.46);
      col = vec3(0.035, 0.018, 0.010) * (0.4 + 0.6 * max(dot(n, L), 0.0));
      col += gold * rail * 0.05;
    } else {
      float k = id.x;
      float h = pipeHeight(id.y, int(k));
      float diff = max(dot(n, L), 0.0);
      vec3 hv = normalize(L - rd);
      float spec = pow(max(dot(n, hv), 0.0), 40.0);
      float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
      // fake reflection of the dark nave: vertical bands across the cylinder
      vec3 rf = reflect(rd, n);
      // the tall window reflects as a vertical stripe down every pipe
      float win = max(dot(normalize(rf.xz), normalize(L.xz)), 0.0);
      float env = pow(win, 18.0) * 1.6 * smoothstep(-0.4, 0.4, rf.y + 0.2)
                + pow(win, 3.0) * 0.18
                + 0.05 * smoothstep(-0.3, 0.9, rf.y)                // dim vault above
                + 0.12 * pow(0.5 + 0.5 * sin(rf.x * 5.0 + rf.z * 2.0), 6.0); // candles in the nave
      vec3 base = gold * (0.8 + 0.2 * hash1(id.y + k * 9.0));
      col = base * (0.01 + 0.22 * diff) + base * env * (0.6 + 0.4 * fres);
      col += vec3(1.0, 0.82, 0.55) * spec * 0.8;
      // ambient occlusion toward the chest, and the pipe mouth (a dark slot with a lip)
      col *= 0.35 + 0.65 * smoothstep(0.0, 0.8, p.y);
      float facing = smoothstep(0.55, 0.9, -n.z);
      float mouthY = 0.28 + 0.06 * k;
      // the mouth: a dark slot under an arched upper lip
      float mx = abs(n.x) * 0.5;
      float mouth = smoothstep(0.015, 0.0, abs(p.y - mouthY) - 0.06 + mx * 0.2) * facing;
      col *= 1.0 - 0.9 * mouth;
      col += gold * 0.5 * smoothstep(0.015, 0.0, abs(p.y - mouthY - 0.065 + mx * 0.25)) * facing * (0.3 + diff);
      // open top: dark inside
      col *= 1.0 - 0.9 * smoothstep(0.5, 0.9, n.y) * step(h - 0.01, p.y);
    }
    col *= fog;
  }

  // volumetric shafts sampled along the ray up to the hit
  float tEnd = min(t, 14.0);
  float acc = 0.0;
  for (int i = 0; i < 14; i++) {
    float tt = tEnd * (float(i) + 0.5) / 14.0;
    vec3 q = ro + rd * tt;
    float dens = shafts(q, L, T) * smoothstep(-0.2, 2.5, q.y) * exp(-tt * 0.18);
    acc += dens;
  }
  acc *= tEnd / 14.0;
  col += vec3(1.0, 0.60, 0.24) * acc * 0.12;

  // dust motes drifting in the light (three screen-space layers)
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float sc = 7.0 + fj * 5.0;
    vec2 q = uv * sc + vec2(T * (0.05 + fj * 0.03) + fj * 13.0, T * (0.02 - fj * 0.012) + 7.0 * fj);
    q.x += 0.4 * sin(q.y * 0.7 + T * 0.1);
    vec2 cid = floor(q);
    vec2 f = fract(q) - 0.5;
    float hh = hash2(cid + fj * 31.0);
    vec2 off = vec2(hash2(cid + 3.1), hash2(cid + 7.7)) - 0.5;
    float dm = length(f - off * 0.7);
    float tw = 0.5 + 0.5 * sin(T * (0.3 + hh) + hh * 40.0);
    float mote = smoothstep(0.06 - fj * 0.012, 0.0, dm) * step(0.72, hh) * tw;
    col += vec3(1.0, 0.75, 0.45) * mote * (0.25 + acc * 0.08) / (1.0 + fj);
  }

  col *= 1.0 - 0.45 * dot(uv, uv);
  col = 1.0 - exp(-col * 1.6);
  col = pow(col, vec3(0.92));
  fragColor = vec4(col, 1.0);
}
