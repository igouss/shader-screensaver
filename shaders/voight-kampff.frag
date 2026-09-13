// Voight-Kampff — a replicant's iris under test, pupil breathing, the burning city reflected in its cornea (FragCoord GLSL)
// Theme: Blade Runner

float h21(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 32768);
  uint h = q.x * 1597334677u ^ q.y * 3812015801u;
  h = (h ^ (h >> 16)) * 2246822519u;
  h ^= h >> 13;
  return float(h & 0xffffffu) / 16777216.0;
}
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x),
             mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.07 + vec2(3.1, 1.3); a *= 0.5; }
  return s;
}

// the city as seen in the curved cornea: skyline, smog and gas flares
vec3 reflection(vec2 p, float T) {
  float x = p.x * 5.0 + T * 0.04;
  float hy = p.y + 0.05;
  vec3 c = mix(vec3(0.3, 0.11, 0.04), vec3(0.02, 0.025, 0.045), smoothstep(-0.08, 0.2, hy));
  float bh = 0.02 + 0.14 * pow(h21(vec2(floor(x), 1.0)), 2.0) + 0.05 * h21(vec2(floor(x * 2.7), 2.0));
  float bld = step(hy, bh - 0.12);
  vec2 wg = vec2(x * 14.0, hy * 60.0);
  float win = step(0.8, h21(floor(wg))) * step(0.3, fract(wg.x)) * step(0.4, fract(wg.y));
  c = mix(c, vec3(0.02, 0.015, 0.02) + vec3(1.0, 0.7, 0.35) * win * 0.6, bld);
  // flares
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float fx = mod(1.3 + 2.9 * fi - T * 0.04 * 5.0 * 0.2, 6.0) - 3.0;
    float ph = fract(T / (7.0 + 3.0 * fi) + 0.3 * fi);
    float burst = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.25, 0.65, ph));
    vec2 q = vec2(p.x * 5.0 - fx, hy + 0.1);
    float nq = fbm(vec2(q.x * 6.0, q.y * 8.0 - T * 1.5) + fi * 5.0);
    float fl = smoothstep(0.12 + 0.3 * q.y, 0.0, abs(q.x + 0.2 * (nq - 0.5))) *
               smoothstep(0.0, 0.02, q.y) * smoothstep(0.05 + 0.3 * burst, 0.0, q.y - 0.1 * (nq - 0.5));
    c += vec3(1.0, 0.5, 0.12) * fl * (0.4 + 1.2 * burst);
    c += vec3(0.6, 0.2, 0.05) * burst * 0.25 * exp(-length(q) * 3.0);
  }
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = mod(u_time, 3600.0);

  // slow saccades: the eye wanders a little
  vec2 look = 0.012 * vec2(sin(T * 0.21) + 0.5 * sin(T * 0.53), cos(T * 0.17) + 0.4 * sin(T * 0.47));
  vec2 p = uv - look;
  float r = length(p);
  float a = atan(p.y, p.x);

  float RI = 0.40;                                        // iris radius
  float RP = 0.105 + 0.03 * sin(T * 0.31) + 0.012 * sin(T * 0.83);   // breathing pupil
  float s = clamp((r - RP) / (RI - RP), 0.0, 1.0);        // 0 at pupil edge, 1 at limbus

  // iris fibres: integer angular frequencies keep it seamless
  float warp = 0.35 * sin(a * 7.0 + s * 5.0) + 0.2 * sin(a * 13.0 - s * 3.0);
  float fib = 0.0;
  fib += 0.5 + 0.5 * sin(a * 67.0 + warp * 3.0 + s * 2.0);
  fib += 0.5 + 0.5 * sin(a * 109.0 - warp * 4.0 + s * 3.0);
  fib += 0.5 + 0.5 * sin(a * 131.0 + warp * 6.0);
  fib = pow(fib / 3.0, 1.6);
  vec2 cp = vec2(cos(a), sin(a));
  float crypt = fbm(cp * 4.0 + vec2(s * 3.0, s * 1.5) + 7.0);
  float collar = exp(-pow((s - 0.32 - 0.04 * sin(a * 9.0 + 1.0)) * 18.0, 2.0));

  vec3 inner = vec3(0.62, 0.38, 0.12);                   // amber around the pupil
  vec3 outer = vec3(0.12, 0.34, 0.33);                   // grey-green-teal
  vec3 iris = mix(inner, outer, smoothstep(0.2, 0.6, s));
  iris *= 0.35 + 0.9 * fib;
  iris *= 0.6 + 0.6 * smoothstep(0.35, 0.7, crypt);
  iris += inner * collar * 0.35;
  iris *= mix(1.0, 0.25, smoothstep(0.8, 1.0, s));       // dark limbal ring
  iris *= 0.55;

  float pupil = smoothstep(RP + 0.004, RP - 0.004, r);
  vec3 col = mix(iris, vec3(0.004, 0.003, 0.004), pupil);

  // sclera fading into darkness beyond the limbus
  float outside = smoothstep(RI - 0.005, RI + 0.005, r);
  vec3 sclera = vec3(0.22, 0.16, 0.15) * exp(-(r - RI) * 5.0);
  float veins = smoothstep(0.025, 0.0, abs(fbm(vec2(cp * 3.0 + r * 4.0)) - 0.5)) * exp(-(r - RI) * 6.0);
  sclera = mix(sclera, vec3(0.28, 0.06, 0.05), veins * 0.35);
  col = mix(col, sclera, outside);

  // corneal reflection of the city (bulged, mirrored)
  float cornea = smoothstep(RI + 0.06, RI - 0.03, r);
  vec2 rp = p / (1.0 + 3.5 * dot(p, p));
  vec3 refl = reflection(vec2(-rp.x, rp.y) * 1.6, T);
  col += refl * cornea * (0.09 + 0.16 * pupil);

  // window highlight
  vec2 hp = p - vec2(-0.12, 0.13);
  col += vec3(0.8, 0.85, 0.9) * 0.6 * smoothstep(0.035, 0.0, length(hp * vec2(1.0, 1.4)) - 0.012) * 0.6;

  // eyelid shadow and vignette
  float lid = smoothstep(0.62, 0.3, abs(uv.y + 0.06 * uv.x * uv.x) + 0.25 * uv.x * uv.x);
  col *= 0.25 + 0.75 * lid;
  col = 1.0 - exp(-col * 1.5);
  vec2 vq = gl_FragCoord.xy / u_resolution - 0.5;
  col *= 1.0 - 0.8 * dot(vq, vq);
  fragColor = vec4(col, 1.0);
}
