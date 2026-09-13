// Twisting neon tunnel (Shadertoy style: mainImage + iTime/iResolution)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  float z = 0.3 / r + iTime * 0.6;
  float stripes = sin(8.0 * a + 4.0 * sin(z * 0.5) + z * 6.2831) * 0.5 + 0.5;
  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + z + a);
  col *= smoothstep(0.0, 0.6, stripes) * smoothstep(0.0, 0.4, r);
  fragColor = vec4(col, 1.0);
}
