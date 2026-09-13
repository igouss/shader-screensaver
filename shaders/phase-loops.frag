// Phase Loops — concentric polymetric step rings, each with its own loop length, drift in and out of phase (Shadertoy)
// Theme: techno

const float SD = 0.6;   // seconds per step, shared by every ring
const float NS[9] = float[9](3.0, 4.0, 5.0, 6.0, 7.0, 9.0, 11.0, 13.0, 16.0);
const float R0 = 0.075, DR = 0.043;

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float stepOn(float ring, float k, float seg) {
  if (k < 0.5) return 1.0;                 // the one is always on
  return hash(vec3(ring, k, seg)) < 0.42 ? 1.0 : 0.0;
}

vec3 ringLight(vec2 uv, float i, float px) {
  float n = NS[int(i)];
  float rad = R0 + DR * i;
  float loopLen = n * SD;
  float cur = fract(iTime / loopLen);                  // this ring's playhead, in turns
  float a = atan(uv.x, uv.y) / 6.2831853;              // 0 at top, clockwise
  float th = fract(a);
  float k = floor(th * n + 0.5);
  k -= n * step(n - 0.5, k);
  float k2 = k + (fract(th * n + 0.5) > 0.5 ? 1.0 : -1.0);
  k2 += n * (step(k2, -0.5) - step(n - 0.5, k2));
  float seg = mod(floor(iTime / 64.0), 101.0);
  float xf = smoothstep(0.8, 1.0, fract(iTime / 64.0));
  vec3 col = vec3(0.0);
  for (int j = 0; j < 2; j++) {
    float kk = j == 0 ? k : k2;
    float ang = kk / n * 6.2831853;
    vec2 c = rad * vec2(sin(ang), cos(ang));
    float d = length(uv - c);
    float act = mix(stepOn(i, kk, seg), stepOn(i, kk, mod(seg + 1.0, 101.0)), xf);
    float age = fract(cur - kk / n) * loopLen;
    float hit = (1.0 - exp(-age * 14.0)) * exp(-age * 1.4);
    vec3 tint = kk < 0.5 ? vec3(1.0, 0.22, 0.12) : vec3(0.95, 0.9, 0.82);
    float dotR = 0.007 + 0.0045 * act;
    float fill = 1.0 - smoothstep(dotR - px, dotR + px, d);
    col += tint * fill * mix(0.08, 0.4 + 1.2 * hit, act);
    col += tint * act * (0.04 + hit) * 0.6 * exp(-d * d / 0.0004);
  }
  // guide circle and the moving playhead arc
  float rd = abs(length(uv) - rad);
  float guide = 1.0 - smoothstep(0.0, 1.5 * px, rd - 0.0004);
  float behind = fract(cur - th);                      // turns since the playhead passed
  float trail = exp(-behind * n * 1.2);
  col += vec3(0.5, 0.52, 0.55) * guide * (0.06 + 0.35 * trail);
  col += vec3(1.0, 0.8, 0.6) * trail * exp(-rd / 0.004) * 0.12;
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float px = 1.0 / iResolution.y;
  float r = length(uv);

  vec3 col = vec3(0.012, 0.011, 0.012) + vec3(0.02, 0.016, 0.014) * exp(-r * r * 6.0);
  float fi = (r - R0) / DR;
  float i0 = clamp(floor(fi), 0.0, 8.0);
  float i1 = clamp(i0 + 1.0, 0.0, 8.0);
  col += ringLight(uv, i0, px);
  if (i1 != i0) col += ringLight(uv, i1, px);

  // centre spindle
  col += vec3(0.9, 0.85, 0.8) * (1.0 - smoothstep(0.012 - px, 0.012 + px, r)) * 0.25;
  col *= 1.0 - 0.4 * dot(uv * 0.8, uv * 0.8);
  col = 1.0 - exp(-col * 1.8);
  fragColor = vec4(col, 1.0);
}
