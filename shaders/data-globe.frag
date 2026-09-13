// Data Globe — a dark wireframe earth turning while arcs of data leap between its nodes (FragCoord GLSL)
// Theme: Computer World

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

vec3 nodeDir(float i) {
  float u = hash11(i * 3.17 + 1.0) * 2.0 - 1.0;
  float v = hash11(i * 7.31 + 2.0) * 6.2831;
  u *= 0.8;                                 // keep away from the poles
  float r = sqrt(1.0 - u * u);
  return vec3(r * cos(v), u, r * sin(v));
}

const float CAM = 3.4;
const float FOC = 1.3;

// world point -> (screen xy, camera depth)
vec3 proj(vec3 p) {
  float z = p.z + CAM;
  return vec3(p.xy * FOC / z, z);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float px = 1.0 / u_resolution.y;
  float t = mod(u_time, 3000.0);

  mat3 R = rotX(0.38) * rotY(t * 0.09);
  mat3 Ri = transpose(R);

  vec3 col = vec3(0.0);

  // ray / sphere
  vec3 ro = vec3(0.0, 0.0, -CAM);
  vec3 rd = normalize(vec3(uv, FOC));
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float disc = b * b - c;
  float diskR = FOC / sqrt(CAM * CAM - 1.0);   // silhouette radius on screen
  float frontZ = 1e3;
  if (disc > 0.0) {
    float th = -b - sqrt(disc);
    vec3 p = ro + rd * th;
    frontZ = p.z + CAM;
    vec3 g = Ri * p;
    float lat = asin(clamp(g.y, -1.0, 1.0));
    float lon = atan(g.z, g.x);
    float step_ = 3.14159 / 12.0;
    vec2 ll = vec2(lon, lat) / step_;
    vec2 fw = fwidth(ll) + 1e-4;
    vec2 gl = abs(fract(ll) - 0.5);
    gl = (0.5 - gl) / fw;
    float grid = 1.0 - clamp(min(gl.x * cos(lat) + 0.3, gl.y) - 0.3, 0.0, 1.0);
    float ndv = -dot(p, rd);
    col += vec3(0.01, 0.015, 0.035);                                  // dark body
    col += vec3(0.12, 0.3, 1.0) * grid * 0.55 * (0.35 + 0.65 * ndv);
    col += vec3(0.15, 0.35, 1.0) * pow(1.0 - ndv, 3.0) * 0.5;        // rim
  }
  // outer atmosphere halo
  float rr = length(uv);
  col += vec3(0.1, 0.25, 0.9) * 0.18 * exp(-max(rr - diskR, 0.0) * 18.0) * step(diskR, rr);

  // nodes
  for (int i = 0; i < 14; i++) {
    vec3 w = R * nodeDir(float(i));
    vec3 s = proj(w * 1.005);
    float vis = smoothstep(-0.05, 0.1, -w.z);                        // facing the camera
    float d = length(uv - s.xy);
    float pulse = 0.6 + 0.4 * sin(t * 0.9 + float(i) * 1.7);
    col += vec3(1.0, 0.25, 0.1) * vis * (smoothstep(3.5 * px, 1.5 * px, d) + 0.0006 / (d * d + 0.0004) * 0.25) * pulse;
  }

  // arcs of data between node pairs
  const int SEG = 12;
  for (int a = 0; a < 11; a++) {
    float fa = float(a);
    vec3 A = nodeDir(mod(fa, 14.0));
    vec3 B = nodeDir(mod(fa * 5.0 + 3.0, 14.0));
    float ang = acos(clamp(dot(A, B), -1.0, 1.0));
    if (ang < 0.25 || ang > 2.2) continue;
    float lift = 0.05 + 0.14 * ang / 3.14159;
    // cheap bounding test around the arc's projected apex and ends
    vec3 mid = R * (normalize(A + B) * (1.0 + lift));
    vec2 m2 = proj(mid).xy, a2 = proj(R * A).xy, b2 = proj(R * B).xy;
    float bR = max(length(a2 - m2), length(b2 - m2)) + 0.12;
    if (length(uv - m2) > bR) continue;
    float cyc = t * 0.06 + hash11(fa + 9.0);
    float env = smoothstep(0.0, 0.15, fract(cyc)) * smoothstep(1.0, 0.8, fract(cyc));
    float head = fract(cyc) * 1.5 - 0.1;                              // packet position along arc
    float best = 1e3, bs = 0.0, bvis = 1.0;
    vec3 prev = vec3(0.0);
    float sa = sin(ang);
    for (int k = 0; k <= SEG; k++) {
      float s = float(k) / float(SEG);
      vec3 dir = (sin((1.0 - s) * ang) * A + sin(s * ang) * B) / sa;
      vec3 w = R * (dir * (1.0 + lift * sin(3.14159 * s)));
      vec3 q = proj(w);
      float hidden = step(0.0, w.z) * step(length(q.xy), diskR);
      if (k > 0) {
        vec2 pa = uv - prev.xy, ba = q.xy - prev.xy;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float d = length(pa - ba * h);
        if (d < best) { best = d; bs = (float(k - 1) + h) / float(SEG); bvis = 1.0 - hidden; }
      }
      prev = q;
    }
    float behindHead = head - bs;
    float trail = behindHead > 0.0 ? exp(-behindHead * 6.0) : 0.0;
    float spark = exp(-abs(behindHead) * 50.0);
    float ph = mod(fa, 3.0);
    vec3 hue = ph == 0.0 ? vec3(1.0, 0.8, 0.15) : (ph == 1.0 ? vec3(1.0, 0.22, 0.1) : vec3(0.2, 1.0, 0.45));
    float line = smoothstep(2.0 * px, 0.5 * px, best) * 0.45 + 0.0008 / (best + 0.003) * 0.3;
    float lit = line * (0.4 + 2.2 * trail) + spark * (smoothstep(4.0 * px, 0.0, best) * 1.5 + 0.0012 / (best + 0.002));
    col += hue * lit * env * mix(0.2, 1.0, bvis);
  }

  col = 1.0 - exp(-col * 2.5);
  col *= 1.0 - 0.4 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
