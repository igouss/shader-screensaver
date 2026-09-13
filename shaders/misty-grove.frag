// Misty Grove — slow walk through a raymarched grove of trunks where sun shafts fall through canopy gaps into fog (FragCoord GLSL)
// Theme: forest

const float CELL = 4.0;
const float WRAP = 16.0;               // pattern repeats every WRAP cells so time can wrap
const vec3 SUN = vec3(0.3162, 0.8433, 0.4349); // normalize(0.35, 0.93, 0.48)

float h21(vec2 p) {
  p = mod(p, WRAP);
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hn(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hn(i), hn(i + vec2(1, 0)), f.x),
             mix(hn(i + vec2(0, 1)), hn(i + vec2(1, 1)), f.x), f.y);
}

float gTime;

// canopy openness above point p, looking back along the sun direction
float gaps(vec3 p) {
  vec2 s = p.xz + SUN.xz * (7.0 - p.y) / SUN.y;
  s = mod(s, CELL * WRAP);               // keeps coordinates small and seamless with the grove
  vec2 q = s * 0.45 + vec2(gTime * 0.012, gTime * 0.009);
  float n = vnoise(q) * 0.75 + vnoise(q * 2.3 + 5.1) * 0.25;
  return smoothstep(0.56, 0.74, n);
}

vec4 h4(vec2 id) {
  id = mod(id, WRAP);
  return fract(sin(vec4(dot(id, vec2(127.1, 311.7)), dot(id, vec2(269.5, 183.3)),
                        dot(id, vec2(419.2, 371.9)), dot(id, vec2(97.3, 157.1)))) * 43758.5453);
}

vec4 gH;
vec3 trunkPos(vec2 id) {
  gH = h4(id);
  float h = gH.x;
  vec2 off = gH.yz - 0.5;
  vec2 c = (id + 0.5) * CELL + off * CELL * 0.45;
  // keep a clear walking corridor near x = 0
  if (abs(c.x) < 1.3) c.x = sign(c.x + 1e-4) * 1.3;
  return vec3(c, 0.14 + 0.2 * h);
}

float map(vec3 p, out float mat) {
  vec2 id = floor(p.xz / CELL);
  vec2 lq = mod(p.xz, CELL) - 0.5 * CELL;
  float bound = 0.5 * CELL - max(abs(lq.x), abs(lq.y)) + 0.25;
  vec3 tp = trunkPos(id);
  vec2 q = p.xz - tp.xy;
  q -= (gH.w - 0.5) * 0.12 * p.y;         // gentle lean
  float r = tp.z * (1.0 + 0.55 * exp(-p.y * 3.0));  // root flare
  float dt = length(q) - r;
  if (dt < 0.3) {                                   // bark grooves only near the surface
    float a = atan(q.y, q.x);
    dt -= 0.012 * sin(a * 11.0 + p.y * 0.8 + tp.z * 40.0) + 0.006 * sin(p.y * 9.0 + a * 3.0);
  }
  float ground = p.y + 0.07 * sin(p.x * 0.9 + 1.0) * sin(p.z * 0.7) + 0.02 * sin(p.x * 3.1 + p.z * 2.3);
  mat = dt < ground ? 1.0 : 0.0;
  return min(min(dt, ground), bound);
}

vec3 normalAt(vec3 p) {
  float m;
  vec2 e = vec2(0.01, -0.01);
  return normalize(e.xyy * map(p + e.xyy, m) + e.yyx * map(p + e.yyx, m) +
                   e.yxy * map(p + e.yxy, m) + e.xxx * map(p + e.xxx, m));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  gTime = mod(u_time, 7200.0);
  float period = CELL * WRAP;
  float z = mod(u_time * 0.22, period);   // seamless because the grove repeats every period
  vec3 ro = vec3(0.35 * sin(u_time * 0.043), 1.55 + 0.05 * sin(u_time * 0.31), z);
  float yaw = 0.18 * sin(u_time * 0.031) + 0.06;
  vec3 fw = normalize(vec3(sin(yaw), 0.1, cos(yaw)));
  vec3 rt = normalize(cross(vec3(0, 1, 0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw + uv.x * rt + uv.y * up);

  // march
  float t = 0.0, mat = 0.0;
  bool hit = false;
  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * t;
    float d = map(p, mat);
    if (d < 0.003 * t) { hit = true; break; }
    t += d;
    if (t > 36.0) break;
  }
  float tEnd = min(t, 36.0);

  vec3 fogCol = vec3(0.045, 0.065, 0.058);
  vec3 sunCol = vec3(1.0, 0.82, 0.52);
  vec3 col = fogCol;

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    float lit = gaps(p) * max(dot(n, SUN), 0.0);
    float amb = 0.5 + 0.5 * n.y;
    vec3 alb = mat > 0.5
      ? mix(vec3(0.05, 0.045, 0.04), vec3(0.05, 0.08, 0.035), smoothstep(0.8, 0.0, p.y) * vnoise(p.xz * 8.0 + p.y * 4.0))
      : mix(vec3(0.04, 0.05, 0.025), vec3(0.07, 0.06, 0.03), vnoise(p.xz * 2.0));
    vec3 surf = alb * (vec3(0.25, 0.35, 0.3) * amb + sunCol * lit * 3.2);
    float fog = 1.0 - exp(-t * 0.06);
    col = mix(surf, fogCol, fog);
  }

  // god rays: in-scattering from sun shafts through the canopy gaps
  float jit = 0.5;
  float shafts = 0.0;
  float dtv = min(tEnd, 18.0) / 12.0;
  for (int i = 0; i < 12; i++) {
    float s = (float(i) + jit) * dtv;
    vec3 p = ro + rd * s;
    float dens = exp(-max(p.y, 0.0) * 0.18);
    shafts += gaps(p) * dens * exp(-s * 0.06) * dtv;
  }
  float phase = 0.55 + 0.9 * pow(max(dot(rd, SUN), 0.0), 3.0);
  col += sunCol * shafts * 0.10 * phase;

  // soft brightening high up where the canopy glows
  col += vec3(0.015, 0.025, 0.018) * smoothstep(0.0, 0.5, uv.y);

  col *= 1.0 - 0.4 * pow(length(uv * vec2(0.75, 1.0)), 2.0);
  col = 1.0 - exp(-col * 1.7);
  col = pow(col, vec3(0.95));
  fragColor = vec4(col, 1.0);
}
