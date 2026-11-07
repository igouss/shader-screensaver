// Tiger Tint — camouflage security tint: diagonal streaked blotches with pale outlined edges, flowing slowly like ink in water (FragCoord GLSL)
// Theme: envelope security patterns (after Joseph King's "Security Patterns" album)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float a = -0.6;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * uv * 9.0;
  p *= vec2(0.5, 1.5);
  p += vec2(t * 0.03, 0.0);
  float wn = fbm(p * 0.7 + vec2(0.0, t * 0.02));
  vec2 w = vec2(wn, vnoise(p * 0.9 + vec2(5.2, 1.3) - t * 0.015));
  float n = fbm(p + 1.4 * w);

  float edge = n - 0.47;
  float aa = fwidth(edge) * 1.2;
  float blot = smoothstep(-aa, aa, edge);
  float outline = 1.0 - smoothstep(0.012 - aa, 0.012 + aa, abs(edge + 0.035));
  float inner = smoothstep(-aa, aa, edge - 0.09);

  float gain = 0.8 + 0.2 * vnoise(gl_FragCoord.xy * 0.4);
  vec3 ground = vec3(0.03, 0.025, 0.06) + 0.012 * vnoise(gl_FragCoord.xy * 0.8);
  vec3 violet = vec3(0.36, 0.3, 0.62);
  vec3 deep = vec3(0.2, 0.16, 0.4);
  vec3 col = ground;
  col = mix(col, deep, blot * 0.9 * gain);
  col = mix(col, violet, inner * 0.6 * gain);
  col = mix(col, vec3(0.62, 0.56, 0.9), outline * 0.7 * gain);

  float v = 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col * v, 1.0);
}
