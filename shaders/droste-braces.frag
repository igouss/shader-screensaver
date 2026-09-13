// Droste Braces — a code block of curly braces that contains itself, spiralling inward forever in amber light (FragCoord GLSL)
// Theme: coding

const float S = 2.4;   // scale between one level and the next

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// quarter arc of radius r around c, in the quadrant given by signs (sx, sy)
float arcQ(vec2 p, vec2 c, float r, float sx, float sy) {
  vec2 q = p - c;
  if (q.x * sx >= 0.0 && q.y * sy >= 0.0) return abs(length(q) - r);
  return min(length(q - vec2(sx * r, 0.0)), length(q - vec2(0.0, sy * r)));
}
// an opening brace '{' whose spine sits at x0, half-height h, curl radius a
float sdBrace(vec2 p, float x0, float h, float a) {
  p.y = abs(p.y);
  float d = sdSeg(p, vec2(x0, a), vec2(x0, h - a));
  d = min(d, arcQ(p, vec2(x0 + a, h - a), a, -1.0, 1.0));
  d = min(d, arcQ(p, vec2(x0 - a, a), a, 1.0, -1.0));
  return d;
}

float cov(float d, float px) {   // coverage of a shape, fading to its average when smaller than a pixel
  return clamp(0.5 - d / px, 0.0, 1.0) * min(1.0, 0.07 / px);
}

float bar(vec2 p, float x0, float x1, float y) {
  return sdBox(p - vec2(0.5 * (x0 + x1), y), vec2(0.5 * (x1 - x0), 0.035), 0.035);
}

// one level: a framed code block with braces around a hole where the next level sits
float level(vec2 P, float px) {
  float I = 0.0;
  float frame = abs(sdBox(P, vec2(1.58, 1.2), 0.24)) - 0.022;
  I = max(I, 0.8 * cov(frame, px));
  float br = min(sdBrace(P, -1.2, 0.74, 0.17), sdBrace(vec2(-P.x, P.y), -1.2, 0.74, 0.17)) - 0.036;
  I = max(I, cov(br, px));
  // a line of code above the hole and its closing line below
  float tx = min(min(bar(P, -1.36, -1.02, 0.95), bar(P, -0.92, -0.38, 0.95)), min(bar(P, -0.28, -0.18, 0.95), bar(P, -0.08, 0.52, 0.95)));
  tx = min(tx, min(bar(P, 0.62, 0.72, 0.95), bar(P, -1.36, -0.72, -0.95)));
  tx = min(tx, bar(P, -0.62, 0.1, -0.95));
  I = max(I, 0.5 * cov(tx, px));
  // three window dots in the frame corner
  float dots = min(min(length(P - vec2(1.12, 0.98)), length(P - vec2(1.24, 0.98))), length(P - vec2(1.36, 0.98))) - 0.035;
  I = max(I, 0.55 * cov(dots, px));
  return I;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;
  float r = max(length(uv), 1e-5);
  float th = atan(uv.y, uv.x);

  // log-polar Droste spiral: one full turn steps down exactly one level
  float ls = log(S);
  float k = ls / 6.2831853;
  float zoom = mod(t * 0.07, ls);
  float re = log(r) + th * k;
  float im = th - log(r) * k + mod(t * 0.025, 6.2831853);
  re = mod(re - zoom, ls);
  vec2 P = exp(re) * vec2(cos(im), sin(im));
  float pxP = length(P) * sqrt(1.0 + k * k) / (r * u_resolution.y);

  // the level, plus the parts that spill into its neighbours
  float I = max(level(P, pxP), max(level(P / S, pxP / S), level(P * S, pxP * S)));

  // depth: glow deepens toward the centre, where the levels crowd into light
  float depth = -log(r) / ls;
  float bright = 0.28 + 0.5 * smoothstep(-0.5, 3.0, depth);
  vec3 amber = vec3(1.0, 0.6, 0.18);
  vec3 col = amber * I * bright;
  col += amber * (0.5 * exp(-r * 9.0) + 0.06 * exp(-r * 2.0));
  col += vec3(0.02, 0.012, 0.006);

  col = 1.0 - exp(-col * 1.5);
  col *= 1.0 - 0.3 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
