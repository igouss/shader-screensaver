// Great Ink Wave — a woodblock-style breaking wave in Prussian blue and cream, its clawed crest curling over a tiny Fuji (FragCoord GLSL)
// Theme: waves

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float T;

// Curl the plane around a crest centre: rotation that fades with distance turns a hump into a spiral lip.
vec2 curl(vec2 p, vec2 c, float strength, float radius) {
  vec2 d = p - c;
  float a = strength * exp(-dot(d, d) / (radius * radius));
  return c + rot(a) * d;
}

// sea surface height at x (big hump for the great wave, small rolling swells elsewhere)
float surface(float x) {
  float w = x < -0.08 ? 0.5 : 0.17;             // long back slope, steep face
  float big = 0.56 * exp(-pow((x + 0.08) / w, 2.0));
  float swell = 0.025 * sin(x * 9.0 - T * 0.5) + 0.015 * sin(x * 17.0 + T * 0.35);
  return -0.28 + big + swell;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  T = mod(u_time, 6283.0);
  float px = 1.0 / u_resolution.y;

  // night paper: dark indigo with faint fibres
  float fib = vnoise(uv * vec2(3.0, 60.0)) * 0.5 + vnoise(uv * 140.0) * 0.5;
  vec3 col = vec3(0.03, 0.035, 0.06) * (0.85 + 0.3 * fib);
  col += vec3(0.04, 0.035, 0.03) * smoothstep(0.6, -0.2, length(uv - vec2(0.3, 0.25)));

  // tiny Fuji in the distance, framed by the wave
  vec2 fj = uv - vec2(0.38, -0.2);
  float mount = fj.y - (0.12 - abs(fj.x) * 0.55 - 0.08 * fj.x * fj.x);
  float snow = fj.y - 0.075 + 0.012 * sin(fj.x * 90.0);
  vec3 fujiCol = mix(vec3(0.05, 0.08, 0.14), vec3(0.62, 0.6, 0.52), step(0.0, snow));
  col = mix(col, fujiCol, smoothstep(px, -px, mount) * step(-0.28, fj.y));

  // the breathing curl: the lip rears and settles on a slow cycle
  float breathe = 0.5 + 0.5 * sin(T * 0.23);
  vec2 C = vec2(0.02, 0.17);
  vec2 q = curl(uv, C, 3.3 + 0.35 * breathe, 0.2 + 0.015 * breathe);
  q = curl(q, vec2(0.1, 0.02), -0.6, 0.12);          // secondary finger of the break
  float depth = surface(q.x) - q.y;                   // > 0 inside water

  // claws: foam fingers along the crest where it is curled
  vec2 dc = uv - C;
  float nearCrest = exp(-dot(dc, dc) / 0.07);
  float ang = atan(dc.y, dc.x);
  float claws = pow(abs(sin(ang * 13.0 + length(dc) * 30.0)), 6.0) * nearCrest;
  float foamEdge = 0.007 + 0.05 * claws + 0.02 * nearCrest + 0.008 * smoothstep(0.0, 0.35, uv.y + 0.1);

  if (depth > -0.5) {
    float inWater = smoothstep(-px, px, depth);
    // water body: Prussian blue, darker in the trough, with woodcut contour lines flowing along the surface
    vec3 body = mix(vec3(0.12, 0.25, 0.45), vec3(0.02, 0.06, 0.15), smoothstep(0.0, 0.35, depth));
    float lines = fract(depth * 26.0 - T * 0.08);
    float lineMask = smoothstep(0.06, 0.0, abs(lines - 0.5) - 0.12) * smoothstep(0.02, 0.06, depth);
    body = mix(body, vec3(0.2, 0.36, 0.55), lineMask * 0.55 * smoothstep(0.4, 0.05, depth));
    // cream foam band with an ink outline
    float foam = smoothstep(foamEdge, foamEdge - 0.006, depth);
    float dots = step(0.72, hash(floor(q * 180.0))) * smoothstep(foamEdge + 0.03, foamEdge, depth);
    vec3 cream = vec3(0.82, 0.78, 0.66);
    body = mix(body, cream * 0.9, max(foam, dots * 0.6));
    col = mix(col, body, inWater);
    float ink = smoothstep(px * 2.0, 0.0, abs(depth) - 0.0015);
    col = mix(col, vec3(0.01, 0.015, 0.03), ink * 0.9);
    // inner outline between foam and blue
    col = mix(col, vec3(0.03, 0.07, 0.15), smoothstep(px * 2.0, 0.0, abs(depth - foamEdge)) * 0.6 * inWater);
  }

  // spray: cream droplets flung off the crest, drifting down-right
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 sp = (uv - C - vec2(0.1, 0.05)) * (32.0 + fi * 20.0) + vec2(-T * 0.25, T * 0.18) * (1.0 + fi * 0.5);
    vec2 id = floor(sp);
    vec2 f = fract(sp) - 0.5;
    float h = hash(id + fi * 7.0);
    vec2 o = vec2(hash(id + 3.1), hash(id + 5.7)) - 0.5;
    float d = length(f - o * 0.6);
    vec2 mc = uv - C - vec2(0.12, 0.05);
    float mask = exp(-dot(mc, mc) / 0.012);
    col = mix(col, vec3(0.8, 0.76, 0.64), step(0.8, h) * smoothstep(0.14, 0.1, d) * mask * 0.85);
  }

  col *= 1.0 - 0.5 * pow(length(uv * vec2(0.7, 1.0)), 2.2);
  col = 1.0 - exp(-col * 1.4);
  fragColor = vec4(col, 1.0);
}
