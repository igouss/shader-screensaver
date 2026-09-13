// Origami Unicorn — Gaff's folded foil unicorn turning slowly on the floor in light cut by venetian blinds (FragCoord GLSL)
// Theme: Blade Runner

const int NV = 31;
const vec3 VP[NV] = vec3[NV](
  vec3(-0.50, 0.35, 0.0),  vec3(0.30, 0.42, 0.0),                           // 0 tail base, 1 withers
  vec3(-0.45, 0.12, 0.16), vec3(0.28, 0.12, 0.16),                          // 2,3 belly left
  vec3(-0.45, 0.12, -0.16), vec3(0.28, 0.12, -0.16),                        // 4,5 belly right
  vec3(0.55, 0.82, 0.0),   vec3(0.45, 0.35, 0.07), vec3(0.45, 0.35, -0.07), // 6 poll, 7,8 throat
  vec3(0.88, 0.58, 0.0),   vec3(0.60, 0.60, 0.07), vec3(0.60, 0.60, -0.07), // 9 muzzle, 10,11 jaw
  vec3(0.94, 1.24, 0.0),   vec3(0.66, 0.78, 0.0),                           // 12 horn tip, 13 horn base
  vec3(0.44, 1.00, 0.05),  vec3(0.48, 0.74, 0.06),                          // 14 ear tip, 15 ear base
  vec3(0.22, 0.16, 0.12),  vec3(0.32, 0.16, 0.12),  vec3(0.30, -0.40, 0.12),  // front left leg
  vec3(0.22, 0.16, -0.12), vec3(0.32, 0.16, -0.12), vec3(0.24, -0.40, -0.12), // front right leg
  vec3(-0.48, 0.20, 0.12), vec3(-0.36, 0.16, 0.12), vec3(-0.52, -0.40, 0.12), // back left leg
  vec3(-0.48, 0.20, -0.12), vec3(-0.36, 0.16, -0.12), vec3(-0.42, -0.40, -0.12), // back right leg
  vec3(-0.86, 0.02, 0.0),  vec3(-0.50, 0.25, 0.05), vec3(-0.50, 0.25, -0.05)  // tail
);
const int NT = 18;
const ivec3 TR[NT] = ivec3[NT](
  ivec3(0, 1, 3), ivec3(0, 3, 2), ivec3(0, 1, 5), ivec3(0, 5, 4),
  ivec3(1, 6, 7), ivec3(1, 6, 8), ivec3(1, 7, 3), ivec3(1, 8, 5),
  ivec3(6, 9, 10), ivec3(6, 9, 11), ivec3(6, 13, 12), ivec3(6, 14, 15),
  ivec3(16, 17, 18), ivec3(19, 20, 21), ivec3(22, 23, 24), ivec3(25, 26, 27),
  ivec3(0, 29, 28), ivec3(0, 28, 30)
);

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float cr(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
float segd(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

mat3 viewM;
vec3 toView(vec3 v) { return viewM * (v - vec3(0.03, 0.42, 0.0)); }
vec2 proj(vec3 v) { return v.xy * 1.25 / (v.z + 3.0); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = mod(u_time, 6283.1853);
  float px = 1.0 / u_resolution.y;

  // ---- the room: dark floor and wall, light through venetian blinds, drifting smoke
  vec2 sm = uv * 2.0 + vec2(T * 0.03, -T * 0.01);
  float smoke = n2(sm) * 0.6 + n2(sm * 2.3 + 5.0) * 0.4;
  float slat = smoothstep(0.35, 0.5, fract((uv.y - 0.55 * uv.x) * 7.0 + 0.04 * sin(T * 0.1)));
  float window = smoothstep(0.9, 0.1, length((uv - vec2(-0.55, 0.45)) * vec2(0.7, 1.0)));
  vec3 col = vec3(0.012, 0.014, 0.02) + vec3(0.02, 0.018, 0.02) * (uv.y + 0.5);
  col += vec3(0.22, 0.17, 0.12) * slat * window * (0.25 + 0.75 * smoke) * 0.6;
  // a spinner's searchlight sweeps past the window now and then
  float sw = fract(T / 23.0);
  float sweep = exp(-pow((uv.x + uv.y * 0.3 - mix(-1.6, 1.6, sw)) * 3.0, 2.0)) * smoothstep(0.0, 0.1, sw) * smoothstep(1.0, 0.8, sw);
  col += vec3(0.25, 0.3, 0.38) * sweep * slat * (0.3 + 0.7 * smoke) * 0.35;

  // floor: a soft pool of light and the unicorn's shadow
  float fy = uv.y + 0.33;
  vec2 fp = vec2(uv.x, fy * 3.2);
  float pool = exp(-dot(fp, fp) * 4.0);
  col += vec3(0.18, 0.15, 0.12) * pool * step(fy, 0.02) * 0.6;
  col *= 1.0 - 0.65 * exp(-dot(fp * vec2(1.6, 2.4), fp * vec2(1.6, 2.4)) * 5.0) * step(fy, 0.04);

  // ---- the folded foil unicorn
  float th = T * 0.22;
  float c = cos(th), s = sin(th);
  mat3 ry = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  float tl = 0.28;
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(tl), sin(tl), 0.0, -sin(tl), cos(tl));
  viewM = rx * ry;
  vec3 L = normalize(vec3(-0.6, 0.7, -0.5));   // window light
  vec3 L2 = normalize(vec3(0.8, 0.1, -0.3));   // cold neon fill

  float best = 1e9;
  vec3 fcol = vec3(0.0);
  float edge = 1e9;
  for (int k = 0; k < NT; k++) {
    ivec3 t3 = TR[k];
    vec3 A = toView(VP[t3.x]), B = toView(VP[t3.y]), C = toView(VP[t3.z]);
    vec2 a = proj(A), b = proj(B), cc = proj(C);
    float ar = cr(b - a, cc - a);
    if (abs(ar) < 1e-7) continue;
    float w0 = cr(cc - b, uv - b) / ar, w1 = cr(a - cc, uv - cc) / ar, w2 = 1.0 - w0 - w1;
    float de = min(segd(uv, a, b), min(segd(uv, b, cc), segd(uv, cc, a)));
    if (w0 >= 0.0 && w1 >= 0.0 && w2 >= 0.0) {
      float zd = w0 * A.z + w1 * B.z + w2 * C.z;
      if (zd < best) {
        best = zd;
        vec3 n = normalize(cross(B - A, C - A));
        if (n.z > 0.0) n = -n;                    // paper is two-sided: face the camera
        float fk = float(k);
        float crinkle = 0.85 + 0.3 * h11(fk + 1.0);
        vec3 R = reflect(vec3(0.0, 0.0, 1.0), n);
        float dif = max(dot(n, L), 0.0), dif2 = max(dot(n, L2), 0.0);
        float spec = pow(max(dot(R, L), 0.0), 24.0);
        vec3 foil = vec3(0.62, 0.64, 0.66) * crinkle;
        fcol = foil * (0.06 + 0.45 * dif) + vec3(0.25, 0.45, 0.6) * dif2 * 0.25 + vec3(1.0, 0.9, 0.75) * spec * 0.9;
        edge = de;
      }
    }
  }
  if (best < 1e8) {
    fcol += vec3(0.5, 0.5, 0.55) * smoothstep(1.8 * px, 0.0, edge) * 0.25;   // crisp folds
    col = fcol;
  }

  col = 1.0 - exp(-col * 1.5);
  vec2 vq = gl_FragCoord.xy / u_resolution - 0.5;
  col *= 1.0 - 0.8 * dot(vq, vq);
  fragColor = vec4(col, 1.0);
}
