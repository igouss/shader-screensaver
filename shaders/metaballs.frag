// Morphing metaball blob with a glowing rim (Shadertoy style)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float field = 0.0;
  vec3 tint = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = 0.33 * vec2(sin(iTime * (0.31 + fi * 0.07) + fi * 2.1),
                         cos(iTime * (0.27 + fi * 0.05) + fi * 1.3));
    float r = 0.07 + 0.025 * sin(iTime * 0.5 + fi);
    vec2 d = uv - c;
    float w = r * r / (dot(d, d) + 1e-4);
    field += w;
    tint += w * (0.5 + 0.5 * cos(6.2831 * (fi / 7.0 + vec3(0.0, 0.33, 0.67))));
  }
  tint /= field;

  float body = smoothstep(0.95, 1.05, field);
  float rim = smoothstep(0.55, 1.0, field) - body;
  float depth = smoothstep(1.0, 3.0, field);
  vec3 col = tint * body * (0.55 + 0.45 * depth);
  col += mix(tint, vec3(1.0), 0.5) * rim * 0.8;
  col += tint * 0.12 * field * (1.0 - body);
  col *= 1.0 - 0.35 * length(uv);
  fragColor = vec4(col, 1.0);
}
