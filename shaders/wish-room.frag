// Wish Room — inside the Room at the heart of the Zone: sand dunes, still pools, a dusty shaft of light and a quiet rain (FragCoord GLSL)
// Theme: Stalker

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float dune(vec2 q) {
  return -0.55 + 0.3 * sin(q.x * 0.7 + sin(q.y * 0.45) * 1.5) * cos(q.y * 0.55 + 0.5)
       + 0.12 * sin(q.x * 1.9 + q.y * 1.2) + 0.04 * sin(q.x * 4.3 - q.y * 3.1);
}
const float WL = -0.6;   // water level

float map(vec3 p, out float id) {
  float sand = (p.y - dune(p.xz)) * 0.6;
  float water = p.y - WL;
  float room = min(min(4.0 - abs(p.x), 12.0 - p.z), 3.6 - p.y);
  float d = sand; id = 0.0;
  if (water < d) { d = water; id = 1.0; }
  if (room < d) { d = room; id = 2.0; }
  return d;
}
float mapD(vec3 p) { float i; return map(p, i); }
vec3 normal(vec3 p) {
  vec2 e = vec2(0.004, 0.0);
  return normalize(vec3(mapD(p + e.xyy) - mapD(p - e.xyy), mapD(p + e.yxy) - mapD(p - e.yxy), mapD(p + e.yyx) - mapD(p - e.yyx)));
}

// light enters through a high window in the left wall
const vec3 LD = vec3(0.78, -0.58, 0.24);   // direction the light travels (normalized below)
float lit(vec3 p) {
  vec3 ld = normalize(LD);
  float t = (p.x + 4.0) / ld.x;
  vec3 h = p - ld * t;
  vec2 w = vec2(abs(h.z - 6.5) - 1.1, abs(h.y - 2.5) - 0.7);
  return smoothstep(0.12, -0.12, max(w.x, w.y));
}

vec3 env(vec3 rd, float T) {
  vec3 c = vec3(0.07, 0.075, 0.066) * (0.6 + 0.4 * rd.y) + vec3(0.1, 0.1, 0.085) * exp(-abs(rd.y - 0.1) * 6.0);
  c += vec3(0.25, 0.24, 0.2) * exp(-length(vec2(rd.x + 0.35, rd.y - 0.35)) * 5.0);
  c += vec3(0.9, 0.85, 0.7) * pow(max(dot(rd, -normalize(LD)), 0.0), 40.0) * (0.85 + 0.15 * sin(T * 0.1));
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = mod(u_time, 6283.0);
  float sun = 0.85 + 0.15 * sin(T * 0.1) * sin(T * 0.037);   // clouds passing outside

  vec3 ro = vec3(0.7 * sin(T * 0.08), 0.4 + 0.08 * sin(T * 0.11), 0.2 + 1.3 * sin(T * 0.07));
  vec3 ta = vec3(0.6 * sin(T * 0.06 + 1.0), -0.35, 7.0);
  vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0, 1, 0), fw)), up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.5 * fw);

  float jit = h21(gl_FragCoord.xy + fract(T) * 17.0);
  float t = 0.05 + 0.05 * jit, id = 0.0, beam = 0.0;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * t;
    float d = map(p, id);
    // dust in the shaft of light
    float b = lit(p) * step(p.x, 3.9);
    float mote = 0.6 + 0.4 * sin(p.x * 9.0 + T * 0.3) * sin(p.y * 7.0 - T * 0.2) * sin(p.z * 8.0);
    beam += b * mote * min(d, 0.25);
    if (d < 0.002 || t > 30.0) break;
    t += d;
  }
  vec3 p = ro + rd * t;
  vec3 n = normal(p);
  vec3 ld = normalize(LD);
  vec3 col;

  if (id < 0.5) {                          // sand
    float rip = 0.9 + 0.1 * sin(p.x * 22.0 + sin(p.z * 3.0) * 2.0);
    vec3 alb = vec3(0.4, 0.37, 0.3) * rip;
    float dif = max(dot(n, -ld), 0.0) * lit(p) * sun;
    col = alb * (0.2 + 0.1 * n.y + 1.3 * dif + 0.12 * exp(-length(p.xz - vec2(0.6, 7.0)) * 0.4));
  } else if (id < 1.5) {                   // pools, dimpled by rain
    vec2 q = p.xz;
    vec2 nd = vec2(0.0);
    for (int j = 0; j < 2; j++) {
      vec2 g = q * (1.8 + float(j)) + float(j) * 3.3;
      vec2 cid = floor(g);
      vec2 cf = fract(g) - 0.5 - (vec2(h21(cid), h21(cid + 3.0)) - 0.5) * 0.5;
      float ph = fract(T * 0.35 + h21(cid + 7.0));
      float rr = length(cf);
      float wave = sin((rr - ph * 0.45) * 60.0) * exp(-abs(rr - ph * 0.45) * 25.0) * (1.0 - ph);
      nd += cf / max(rr, 1e-3) * wave * 0.14;
    }
    vec3 wn = normalize(vec3(nd.x, 1.0, nd.y));
    vec3 rf = reflect(rd, wn);
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, wn), 0.0), 5.0);
    float depth = WL - dune(p.xz);
    vec3 under = vec3(0.3, 0.3, 0.24) * (0.2 + 1.0 * lit(p) * sun) * exp(-depth * 5.0) + vec3(0.02, 0.028, 0.024);
    col = mix(under, env(rf, T) * 1.3, fr) + vec3(0.9, 0.85, 0.7) * lit(p) * sun * pow(max(dot(rf, -ld), 0.0), 60.0) * 0.4;
    col += vec3(0.8, 0.8, 0.7) * pow(max(dot(rf, -ld), 0.0), 30.0) * 0.3;
  } else {                                 // bare walls, stained
    float st = h21(floor(p.xy * 3.0 + p.zz * 3.0));
    float stain = 0.7 + 0.3 * sin(p.y * 2.0 + sin(p.x * 3.0 + p.z * 2.0) * 1.5);
    col = vec3(0.12, 0.12, 0.1) * stain * (0.8 + 0.2 * st) * (0.6 + 0.4 * max(dot(n, -ld), 0.0));
    // the window itself, where the wall is cut open
    if (p.x < -3.95) {
      vec2 w = vec2(abs(p.z - 6.5) - 1.1, abs(p.y - 2.5) - 0.7);
      col = mix(col, vec3(0.9, 0.88, 0.75) * sun, smoothstep(0.02, -0.02, max(w.x, w.y)));
    }
  }

  col = mix(col, vec3(0.06, 0.065, 0.058), 1.0 - exp(-t * 0.04));      // murk
  col += vec3(0.75, 0.72, 0.6) * beam * 0.09 * sun;

  // a slow thin rain falling through the gloom
  vec2 rg = uv * vec2(70.0, 3.0) + vec2(0.0, T * 1.4);
  vec2 rid = floor(rg);
  float rh = h21(rid);
  float streak = smoothstep(0.08, 0.0, abs(fract(rg.x) - 0.5)) * smoothstep(0.35, 0.0, abs(fract(rg.y + rh) - 0.5)) * step(0.75, rh);
  col += vec3(0.3, 0.3, 0.27) * streak * 0.3;

  // Zone grade
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(col, lum * vec3(1.0, 0.97, 0.8), 0.4);
  col = 1.0 - exp(-col * 2.0);
  vec2 vq = gl_FragCoord.xy / u_resolution - 0.5;
  col *= 1.0 - 0.9 * dot(vq, vq);
  fragColor = vec4(col, 1.0);
}
