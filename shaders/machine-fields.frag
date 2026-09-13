// Machine Fields — drifting between endless towers of glowing human pods in the fog of the real world's power plant (FragCoord GLSL)
// Theme: The Matrix

float hash31(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float T;
const float SP = 6.0;       // tower spacing
const float RING = 0.72;    // vertical pod pitch
const float NSEC = 8.0;     // pods per ring

// returns (distance to structure, distance to pods), pod id in pid
vec2 map(vec3 p, out vec3 pid) {
  vec2 cell = floor(p.xz / SP + 0.5);
  vec2 q = p.xz - cell * SP;
  float r = length(q);
  float core = r - 0.34 + 0.025 * sin(p.y * 9.0);
  float yi = floor(p.y / RING);
  float py = p.y - (yi + 0.5) * RING;
  float sec = 6.2831 / NSEC;
  float ang = atan(q.y, q.x) + yi * sec * 0.5;
  float ai = floor(ang / sec + 0.5);
  float la = ang - ai * sec;
  vec2 pq = r * vec2(cos(la), sin(la));
  vec3 pp = vec3(pq.x - 0.8, py, pq.y);
  // pod: capsule shell
  vec3 pc = pp; pc.y = pc.y - clamp(pc.y, -0.13, 0.13);
  float pod = length(pc) - 0.1;
  // support arm and collar
  vec3 ap = vec3(pq.x - 0.55, py - 0.2, pq.y);
  vec3 ab = abs(ap) - vec3(0.24, 0.02, 0.025);
  float arm = length(max(ab, 0.0)) + min(max(ab.x, max(ab.y, ab.z)), 0.0);
  float collar = length(vec2(r - 0.4, py - 0.2)) - 0.035;
  pid = vec3(cell, yi * 16.0 + ai);
  return vec2(min(min(core, arm), collar), pod);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  T = mod(u_time, 10000.0);

  vec3 ro = vec3(SP * 0.5 + 0.6 * sin(T * 0.05), 1.5 + T * 0.05, T * 0.32);
  vec3 fw = normalize(vec3(0.3 * sin(T * 0.03), 0.18, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.3 + rt * uv.x + up * uv.y);

  vec3 fogCol = vec3(0.008, 0.014, 0.03);
  float d = 0.0;
  vec3 glow = vec3(0.0);
  vec3 pid;
  float mat = -1.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * d;
    vec2 m = map(p, pid);
    float e = hash31(pid);
    float live = e > 0.18 ? 0.55 + 0.45 * sin(T * 0.4 + e * 60.0) : 0.05;
    glow += vec3(1.0, 0.28, 0.18) * live * exp(-m.y * 16.0) * 0.018 * exp(-d * 0.16);
    float h = min(m.x, m.y);
    if (h < 0.002) { mat = m.x < m.y ? 0.0 : 1.0; break; }
    d += h * 0.85;
    if (d > 24.0) break;
  }

  // distant electrical storm: slow swelling light in the haze
  float storm = 0.5 + 0.5 * sin(T * 0.13) * sin(T * 0.071 + 1.0);
  vec3 sky = fogCol + vec3(0.03, 0.05, 0.1) * storm * smoothstep(-0.2, 0.6, rd.y);
  vec3 col = sky;
  if (mat >= 0.0) {
    vec3 p = ro + rd * d;
    vec2 e = vec2(0.002, 0.0);
    vec3 dummy;
    float d0 = mat < 0.5 ? map(p, dummy).x : map(p, dummy).y;
    vec3 n = normalize(vec3(
      (mat < 0.5 ? map(p + e.xyy, dummy).x : map(p + e.xyy, dummy).y) - d0,
      (mat < 0.5 ? map(p + e.yxy, dummy).x : map(p + e.yxy, dummy).y) - d0,
      (mat < 0.5 ? map(p + e.yyx, dummy).x : map(p + e.yyx, dummy).y) - d0));
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    if (mat < 0.5) {
      // dark machine metal, lit by the pods and a cold sky
      col = vec3(0.02, 0.025, 0.035) * (0.4 + 0.6 * max(n.y, 0.0));
      col += vec3(0.08, 0.12, 0.2) * fres * 0.5 * (0.4 + storm);
    } else {
      vec3 pd;
      map(p, pd);
      float eh = hash31(pd);
      float live = eh > 0.18 ? 0.55 + 0.45 * sin(T * 0.4 + eh * 60.0) : 0.05;
      float core = pow(max(dot(n, -rd), 0.0), 2.0);
      vec3 amnio = mix(vec3(0.6, 0.08, 0.06), vec3(1.0, 0.45, 0.3), core) * live;
      col = amnio * (0.15 + 0.6 * core) + vec3(0.15, 0.2, 0.3) * fres * 0.35;
    }
    col = mix(sky, col, exp(-d * 0.14));
  }
  col += glow;

  col = 1.0 - exp(-col * 1.8);
  col *= 1.0 - 0.4 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
