// Claude Spark — the Claude sunburst as a slowly turning terracotta sculpture of twelve tapered, breathing rays with a soft rim light and halo (FragCoord GLSL)
// Theme: Claude Code

const float PI = 3.14159265;
const float RAYS = 12.0;

float T;

float hash1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// tapered rounded ray along +x (iq's round cone), flattened into a blade
float blade(vec3 q, float L, float r0, float r1) {
  q.z *= 1.9;
  float b = (r0 - r1) / L;
  float a = sqrt(1.0 - b * b);
  vec2 w = vec2(length(q.yz), q.x);  // (radial, axial)
  float k = dot(w, vec2(-b, a));
  if (k < 0.0) return length(w) - r0;
  if (k > a * L) return length(w - vec2(0.0, L)) - r1;
  return dot(w, vec2(a, b)) - r0;
}

float rayAt(vec3 p, float i) {
  float ang = i * 2.0 * PI / RAYS;
  vec3 q = p;
  q.xy = rot(-ang) * q.xy;
  float h = hash1(mod(i, RAYS));
  float L = 0.70 + 0.22 * h + 0.045 * sin(T * 0.45 + i * 1.9) + 0.02 * sin(T * 0.3);
  return blade(q, L, 0.118 + 0.015 * h, 0.058 + 0.014 * fract(h * 7.0));
}

float map(vec3 p) {
  float a = atan(p.y, p.x) / (2.0 * PI / RAYS);
  float id = floor(a + 0.5);
  float nb = id + (fract(a + 0.5) > 0.5 ? 1.0 : -1.0);
  float d = min(rayAt(p, id), rayAt(p, nb));
  d = smin(d, length(p * vec3(1.0, 1.0, 1.5)) - 0.13, 0.09);
  return d * 0.5;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
                   e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

void main() {
  vec2 R = u_resolution;
  vec2 uv = (gl_FragCoord.xy - 0.5 * R) / R.y;
  T = u_time;

  // object orientation: a slow sway and pitch, and a gentle turn in its own plane
  float yaw = 0.55 * sin(T * 0.13);
  float pitch = 0.30 * sin(T * 0.09 + 1.0);
  float spin = T * 0.06;

  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv, -1.15));

  // warm-black ground with a faint ember halo behind the mark
  float r = length(uv);
  vec3 bg = vec3(0.030, 0.019, 0.016);
  bg += vec3(0.85, 0.42, 0.28) * 0.10 * exp(-r * 2.6);
  bg += vec3(0.95, 0.55, 0.35) * 0.05 * exp(-r * 6.0);
  vec3 col = bg;

  // bounding sphere
  float bb = dot(ro, rd);
  float cc = dot(ro, ro) - 1.15 * 1.15;
  float disc = bb * bb - cc;
  float glow = 0.0;
  if (disc > 0.0) {
    float t = -bb - sqrt(disc);
    float tEnd = -bb + sqrt(disc);
    float minD = 1e9;
    bool hit = false;
    vec3 pos;
    for (int i = 0; i < 100; i++) {
      pos = ro + rd * t;
      vec3 q = pos;
      q.xz = rot(yaw) * q.xz;
      q.yz = rot(pitch) * q.yz;
      q.xy = rot(spin) * q.xy;
      float d = map(q);
      minD = min(minD, d);
      if (d < 0.0008) { hit = true; break; }
      t += d;
      if (t > tEnd) break;
    }
    glow = exp(-minD * 22.0);

    if (hit) {
      vec3 q = pos;
      q.xz = rot(yaw) * q.xz;
      q.yz = rot(pitch) * q.yz;
      q.xy = rot(spin) * q.xy;
      vec3 nq = calcNormal(q);
      // back to world space
      vec3 n = nq;
      n.xy = rot(-spin) * n.xy;
      n.yz = rot(-pitch) * n.yz;
      n.xz = rot(-yaw) * n.xz;

      vec3 base = vec3(0.85, 0.47, 0.34);  // Claude terracotta
      vec3 L1 = normalize(vec3(-0.5, 0.65, 0.6));
      vec3 L2 = normalize(vec3(0.7, -0.3, -0.5));
      float dif = max(dot(n, L1), 0.0);
      float wrap = 0.5 + 0.5 * dot(n, L1);
      float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
      vec3 hv = normalize(L1 - rd);
      float spec = pow(max(dot(n, hv), 0.0), 40.0);
      float back = pow(max(dot(n, L2), 0.0), 2.0);

      // cheap ambient occlusion toward the hub
      float ao = clamp(map(q + nq * 0.06) / 0.036 * 0.5 + 0.5, 0.0, 1.0);
      ao *= 0.55 + 0.45 * smoothstep(0.1, 0.5, length(q.xy));

      col = base * (0.12 + 1.10 * dif + 0.22 * wrap * wrap) * ao;
      col += vec3(1.0, 0.74, 0.58) * spec * 0.45;
      col += vec3(1.0, 0.64, 0.46) * fres * 0.7 * (0.4 + 0.6 * ao);
      col += vec3(0.95, 0.50, 0.40) * back * 0.25;
      col = 1.0 - exp(-1.3 * col);
    } else {
      col += vec3(0.95, 0.52, 0.34) * 0.22 * glow;
    }
  }

  col *= 1.0 - 0.45 * smoothstep(0.4, 1.2, length(uv * vec2(0.8, 1.0)));
  fragColor = vec4(col, 1.0);
}
