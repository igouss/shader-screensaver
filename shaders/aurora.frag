// Drifting aurora ribbons (FragCoord GLSL: void main + u_* uniforms)
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  vec3 col = vec3(0.0);
  for (float i = 0.0; i < 5.0; i++) {
    float y = uv.y - 0.4 + i * 0.2
            + 0.25 * sin(uv.x * (1.3 + i * 0.35) + u_time * (0.25 + i * 0.06) + i * 1.7)
            + 0.08 * sin(uv.x * 4.0 - u_time * 0.4 + i);
    vec3 tint = 0.5 + 0.5 * cos(6.2831 * (i * 0.12 + vec3(0.0, 0.33, 0.67)) + u_time * 0.15);
    col += tint * 0.015 / (abs(y) + 0.002);
  }
  col = 1.0 - exp(-col * 0.6);
  fragColor = vec4(col, 1.0);
}
