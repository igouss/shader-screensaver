// Bullet Time — orbiting a slow-motion bullet in the dark construct as rings of displaced air peel away behind it, the rain of code mirrored in its brass (Shadertoy)
// Theme: The Matrix

float T;

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// bullet in its own frame: axis +x, nose forward
float bullet(vec3 p) {
  vec2 q = vec2(p.x, length(p.yz));
  // body: capped cylinder from x=-0.34 to 0.02
  vec2 d = abs(vec2(q.x + 0.16, q.y)) - vec2(0.18, 0.1);
  float body = min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - 0.008;
  // ogive nose
  float nx = clamp(q.x / 0.3, 0.0, 1.0);
  float rNose = 0.1 * sqrt(max(1.0 - nx * nx, 0.0));
  float nose = (q.y - rNose) * 0.8;
  nose = max(nose, -q.x);
  nose = max(nose, q.x - 0.3);
  return min(body, nose);
}

// expanding air rings trailing the bullet
float rings(vec3 p, out float fade) {
  float sp = 0.42;
  float ph = fract(T * 0.12);
  float s = -p.x - 0.34;                       // distance behind the tail
  float n = clamp(floor(s / sp - ph + 0.5), 0.0, 7.0);
  float sr = (n + ph) * sp;
  float R = 0.12 + 0.2 * sqrt(sr + 0.02);
  fade = exp(-sr * 0.55) * smoothstep(0.0, 0.25, sr);
  return length(vec2(length(p.yz) - R, s - sr)) - 0.004 - 0.01 * sr;
}

// the construct's dark void, full of faint falling code
vec3 env(vec3 rd, float cols) {
  float a = atan(rd.z, rd.x);
  float col = floor(a * cols);
  float h = hash11(col);
  float fall = fract(rd.y * 1.2 + T * (0.04 + 0.06 * h) + h * 9.0);
  float streak = pow(fall, 10.0) * step(0.45, h) * smoothstep(0.0, 0.25, fract(a * cols)) * smoothstep(1.0, 0.75, fract(a * cols));
  vec3 c = vec3(0.1, 1.0, 0.35) * streak * 0.5 * smoothstep(0.9, 0.0, abs(rd.y));
  c += vec3(0.05, 0.25, 0.12) * exp(-abs(rd.y) * 6.0) * 0.4;
  return c;
}

mat3 lookAt(vec3 ro, vec3 ta) {
  vec3 f = normalize(ta - ro);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  return mat3(r, cross(f, r), f);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  T = mod(iTime, 3000.0);

  float a = T * 0.1 + 0.8;
  vec3 ro = vec3(2.0 * cos(a) - 0.6, 0.35 + 0.25 * sin(T * 0.07), 2.0 * sin(a));
  vec3 ta = vec3(-0.65, 0.0, 0.0);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, 1.5));

  vec3 col = env(rd, 40.0) * 0.35;
  float d = 0.0;
  vec3 glow = vec3(0.0);
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * d;
    float db = bullet(p);
    float fade;
    float dr = rings(p, fade);
    glow += vec3(0.35, 1.0, 0.6) * fade * 0.0022 / (dr * dr * 400.0 + 0.02) ;
    if (db < 0.0008) { hit = true; break; }
    d += min(db, max(dr * 0.7, 0.012));
    if (d > 6.0) break;
  }

  if (hit) {
    vec3 p = ro + rd * d;
    vec2 e = vec2(0.001, 0.0);
    vec3 n = normalize(vec3(bullet(p + e.xyy) - bullet(p - e.xyy),
                            bullet(p + e.yxy) - bullet(p - e.yxy),
                            bullet(p + e.yyx) - bullet(p - e.yyx)));
    vec3 r = reflect(rd, n);
    float fres = 0.45 + 0.55 * pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 brass = p.x > 0.0 ? vec3(0.9, 0.55, 0.3) : vec3(0.85, 0.65, 0.35);
    // spinning rifling marks
    float ang = atan(p.z, p.y) + T * 0.8;
    float rif = 0.8 + 0.2 * smoothstep(0.3, 0.5, abs(fract(ang * 6.0 / 6.2831 + p.x * 2.0) - 0.5));
    vec3 L = normalize(vec3(0.3, 1.0, 0.4));
    float spec = pow(max(dot(r, L), 0.0), 40.0);
    col = brass * (env(r, 9.0) * 1.8 + vec3(0.05, 0.08, 0.05) + vec3(0.25, 0.2, 0.15) * smoothstep(0.2, 1.0, r.y)) * fres * rif;
    col += brass * spec * 1.2;
    col += brass * 0.2 * max(dot(n, L), 0.0);
    col += vec3(0.1, 0.5, 0.25) * pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * 0.35;
  }
  col += glow;

  col = 1.0 - exp(-col * 1.6);
  col *= 1.0 - 0.4 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
