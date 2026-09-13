// Slow liquid plasma, domain-warped, with a cosine palette (FragCoord GLSL)
vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.2831 * (vec3(1.0, 0.8, 0.6) * t + vec3(0.0, 0.15, 0.3)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y * 3.0;
  float t = u_time * 0.2;
  for (int i = 1; i < 6; i++) {
    float fi = float(i);
    uv += 0.6 / fi * vec2(sin(fi * uv.y + t + 0.3 * fi), cos(fi * uv.x - t + 0.5 * fi));
  }
  float v = 0.5 + 0.5 * sin(uv.x + uv.y);
  vec3 col = palette(v * 0.8 + t * 0.1);
  col *= 0.7 + 0.3 * sin(uv.x * 2.0) * sin(uv.y * 2.0);
  fragColor = vec4(col, 1.0);
}
