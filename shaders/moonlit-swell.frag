// Moonlit Swell — a raymarched night ocean rolling under a low moon, its glitter path trembling toward the horizon (FragCoord GLSL)
// Theme: waves

const float TAU = 6.2831853;
// every angular speed is a whole multiple of TAU/60, so time can wrap every 60 s without a seam
const float W0 = TAU / 60.0;

// direction angle, wavelength, amplitude, speed multiple
const vec4 WV[8] = vec4[8](
  vec4( 0.00, 19.0, 0.42,  9.0),
  vec4( 0.55, 11.0, 0.26, 12.0),
  vec4(-0.50,  7.0, 0.15, 15.0),
  vec4( 1.25,  4.6, 0.08, 19.0),
  vec4(-1.10,  3.1, 0.05, 23.0),
  vec4( 2.20,  2.0, 0.03, 29.0),
  vec4( 0.30,  1.3, 0.018, 36.0),
  vec4(-2.00,  0.85, 0.010, 43.0));

float sea(vec2 p, float T, int n, float dist) {
  float h = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= n) break;
    vec4 w = WV[i];
    float lod = clamp(w.y / (dist * 0.025 + 0.001) - 1.0, 0.0, 1.0);
    vec2 d = vec2(sin(w.x), -cos(w.x));
    float x = dot(p, d) * TAU / w.y + mod(T * W0 * w.w, TAU) + float(i) * 1.7;
    float s = 0.5 + 0.5 * sin(x + 0.35 * sin(x));
    h += w.z * (s * s * 2.0 - 0.7) * lod;
  }
  return h;
}

vec3 sky(vec3 rd, vec3 L) {
  float y = max(rd.y, 0.0);
  vec3 c = mix(vec3(0.045, 0.065, 0.11), vec3(0.004, 0.007, 0.02), pow(y, 0.45));
  float m = max(dot(rd, L), 0.0);
  c += vec3(0.55, 0.6, 0.7) * pow(m, 60.0) * 0.25 + vec3(0.3, 0.35, 0.45) * pow(m, 8.0) * 0.08;
  c += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.99975, m) * 1.6;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = mod(u_time, 60.0);
  vec3 L = normalize(vec3(0.1, 0.115, 1.0));

  vec3 ro = vec3(0.0, 2.3 + 0.12 * sin(T * W0 * 3.0), 0.0);
  vec3 fw = normalize(vec3(0.0, -0.075, 1.0));
  vec3 rt = normalize(cross(vec3(0, 1, 0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.7 * fw);

  vec3 col;
  if (rd.y > -0.004) {
    col = sky(rd, L);
    // sparse stars
    vec2 sp = rd.xz / (rd.y + 0.3) * 90.0;
    vec2 si = floor(sp);
    float h = fract(sin(dot(si, vec2(12.9898, 78.233))) * 43758.5453);
    col += vec3(0.7, 0.75, 0.9) * step(0.994, h) * max(0.0, 1.0 - length(fract(sp) - 0.5) * 2.5) * smoothstep(0.02, 0.2, rd.y) * 0.5;
  } else {
    // coarse march through the wave slab, then refine by secant steps
    float t0 = max(0.0, (ro.y - 0.9) / -rd.y);
    float t = t0, tl = t0;
    float hl = 1.0;
    float hit = 0.0;
    for (int i = 0; i < 64; i++) {
      vec3 p = ro + rd * t;
      float h = p.y - sea(p.xz, T, 5, t);
      if (h < 0.0) { hit = 1.0; break; }
      tl = t; hl = h;
      t += max(h * 0.8, 0.02 + t * 0.03);
      if (t > 150.0) break;
    }
    if (hit > 0.5) {
      float ta = tl, tb = t;
      for (int i = 0; i < 5; i++) {
        float tm = 0.5 * (ta + tb);
        vec3 p = ro + rd * tm;
        if (p.y - sea(p.xz, T, 5, tm) < 0.0) tb = tm; else ta = tm;
      }
      t = 0.5 * (ta + tb);
    } else {
      t = 150.0;
    }
    vec3 p = ro + rd * t;
    float e = 0.02 + 0.004 * t;
    float hc = sea(p.xz, T, 8, t);
    vec3 n = normalize(vec3(hc - sea(p.xz + vec2(e, 0.0), T, 8, t), e, hc - sea(p.xz + vec2(0.0, e), T, 8, t)));
    vec3 rf = reflect(rd, n);
    rf.y = abs(rf.y);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    vec3 refl = sky(rf, L);
    float spec = pow(max(dot(rf, L), 0.0), 350.0) * 2.2 + pow(max(dot(rf, L), 0.0), 40.0) * 0.12;
    vec3 body = vec3(0.004, 0.018, 0.026) + vec3(0.01, 0.04, 0.05) * clamp(hc + 0.3, 0.0, 1.2) * 0.4;
    col = body * (1.0 - fres) + refl * fres + vec3(0.9, 0.92, 1.0) * spec * (0.3 + fres) * exp(-t * 0.025);
    // distance haze into the horizon
    vec3 hz = sky(vec3(rd.x, 0.0, rd.z), L);
    col = mix(col, hz, 1.0 - exp(-t * 0.03));
  }

  col *= 1.0 - 0.3 * dot(uv * 0.8, uv * 0.8);
  col = 1.0 - exp(-col * 1.8);
  fragColor = vec4(col, 1.0);
}
