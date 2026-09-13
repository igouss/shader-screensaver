// Home Computer — gliding low over an endless dark keyboard where ripples press the keys and a few glow in primary colours (FragCoord GLSL)
// Theme: Computer World

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float T;

vec3 primary(float h) {
  if (h < 0.25) return vec3(1.0, 0.12, 0.06);
  if (h < 0.50) return vec3(1.0, 0.72, 0.08);
  if (h < 0.75) return vec3(0.12, 0.35, 1.0);
  return vec3(0.08, 1.0, 0.35);
}

// key cell of a point: id, local coords
void keyCell(vec3 p, out vec2 c, out vec3 q) {
  float row = floor(p.z);
  float xo = row * 0.37;
  c = vec2(floor(p.x + xo), row);
  q = vec3(fract(p.x + xo) - 0.5, p.y, fract(p.z) - 0.5);
}

float glowOf(vec2 c) {
  float h = hash21(c + 3.1);
  if (h < 0.9) return 0.0;
  float ph = sin(T * 0.35 + h * 80.0);
  return smoothstep(0.1, 0.9, ph);
}

float pressOf(vec2 c) {
  float w = 0.5 + 0.5 * sin(dot(c, vec2(0.31, 0.47)) - T * 0.9);
  float w2 = 0.5 + 0.5 * sin(dot(c, vec2(-0.43, 0.22)) - T * 0.63 + 1.0);
  return pow(w, 14.0) * 0.1 + pow(w2, 20.0) * 0.08;
}

float map(vec3 p) {
  vec2 c; vec3 q;
  keyCell(p, c, q);
  float taper = clamp(q.y - 0.1, 0.0, 0.4) * 0.18;
  float key = sdRoundBox(q - vec3(0.0, 0.24 - pressOf(c), 0.0), vec3(0.34 - taper, 0.14, 0.34 - taper), 0.07);
  return min(key, p.y);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.002, -0.002);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
                   e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// 3x5 key legends: letters of the band and the digits
const int FONT[32] = int[32](11245, 25166, 15211, 29391, 29385, 23533, 23277, 4687, 24557, 15213, 11114,
  15049, 15085, 25251, 29842, 23407, 23549, 23186, 31599, 9879, 14479, 14499, 23524, 29411, 25583,
  30866, 31727, 31715, 15083, 25454, 29847, 23213);

float legend(vec2 uv, float h) {
  vec2 g = floor(uv * vec2(3.0, 5.0));
  if (g.x < 0.0 || g.x > 2.0 || g.y < 0.0 || g.y > 4.0) return 0.0;
  int bits = FONT[int(floor(h * 32.0)) & 31];
  return float((bits >> int(g.x + g.y * 3.0)) & 1);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  T = mod(u_time, 20000.0);

  vec3 ro = vec3(T * 0.21 + 0.3, 4.2, T * 0.33);
  vec3 fw = normalize(vec3(0.3, -0.72, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.25 + rt * uv.x + up * uv.y);

  float d = 0.0;
  vec3 glow = vec3(0.0);
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * d;
    float h = map(p);
    if (h < 0.001) { hit = true; break; }
    d += h * 0.8;
    if (d > 28.0) break;
  }

  vec3 bg = vec3(0.004, 0.005, 0.01);
  vec3 col = bg;
  if (hit) {
    vec3 p = ro + rd * d;
    vec3 n = calcNormal(p);
    vec2 c; vec3 q;
    keyCell(p, c, q);
    float h = hash21(c);
    float gl = glowOf(c);
    vec3 pc = primary(hash21(c + 9.7));
    vec3 L = normalize(vec3(-0.5, 0.9, 0.3));
    float dif = max(dot(n, L), 0.0);
    float spe = pow(max(dot(reflect(rd, n), L), 0.0), 24.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    float isKey = step(0.01, p.y);
    vec3 base = mix(vec3(0.012), vec3(0.05, 0.05, 0.055), isKey);
    // key top legend
    float top = smoothstep(0.7, 0.95, n.y) * step(0.3, q.y) * isKey;
    float lg = legend((q.xz + vec2(0.11, 0.14)) * vec2(4.5, 3.6), h) * top;
    col = base * (0.15 + 0.85 * dif) + vec3(0.5) * spe * 0.25 * isKey + vec3(0.1, 0.12, 0.2) * fres * 0.25;
    col += vec3(0.55, 0.55, 0.5) * lg * 0.25;
    // glowing keys: translucent caps lit from below
    col += pc * gl * (0.35 + 0.9 * top + 0.6 * lg) * isKey;
    // light spill of glowing neighbours on the plate and nearby caps
    for (int j = -1; j <= 1; j++) {
      for (int k = -1; k <= 1; k++) {
        vec2 nc = c + vec2(float(j), float(k));
        float ng = glowOf(nc);
        if (ng > 0.0) {
          float row = nc.y;
          vec3 kc = vec3(nc.x + 0.5 - row * 0.37, 0.2, row + 0.5);
          float dd = length(p - kc);
          col += primary(hash21(nc + 9.7)) * ng * 0.12 * exp(-dd * 3.0) * (1.0 - isKey * 0.6);
        }
      }
    }
    float fog = exp(-d * 0.085);
    col = mix(bg, col, fog);
  }

  col = 1.0 - exp(-col * 2.2);
  col *= 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
