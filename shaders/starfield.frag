// Slow warp through layered star sheets (FragCoord GLSL)
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 starLayer(vec2 uv) {
  vec2 id = floor(uv);
  vec2 f = fract(uv) - 0.5;
  vec3 col = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      float n = hash(id + o);
      vec2 pos = o + vec2(n, fract(n * 34.0)) - 0.5;
      float d = length(f - pos);
      float size = fract(n * 345.32) * 0.6 + 0.2;
      float star = 0.015 * size / d * smoothstep(0.5, 0.15, d);
      vec3 tint = 0.65 + 0.35 * cos(6.2831 * (n + vec3(0.0, 0.3, 0.6)));
      col += star * tint;
    }
  }
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.06;
  uv *= mat2(cos(t), -sin(t), sin(t), cos(t));

  vec3 col = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    float layer = float(k) / 6.0;
    float depth = fract(layer + t);
    float scale = mix(18.0, 0.8, depth);
    float fade = depth * smoothstep(1.0, 0.85, depth);
    col += starLayer(uv * scale + layer * 453.2) * fade;
  }
  col = 1.0 - exp(-col * 1.5);
  fragColor = vec4(col, 1.0);
}
