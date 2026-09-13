// Laser Fan — slow green laser fans and red side scanners cut through warehouse haze from a distant stage (FragCoord GLSL)
// Theme: techno

float haze(vec3 p, float T) {
  p *= 0.45;
  float n = sin(p.x * 1.3 + sin(p.z * 0.9 + T * 0.23) * 1.5 + T * 0.11)
          * sin(p.y * 1.7 + sin(p.x * 1.1 - T * 0.17) * 1.5)
          + 0.5 * sin(p.z * 2.3 + sin(p.y * 2.1 + T * 0.2) + p.x * 0.7);
  return 0.25 + 0.75 * clamp(0.5 + 0.45 * n, 0.0, 1.0);
}

// light scattered toward the camera by one beam (origin E, direction B) seen along the ray O + s*R
float beam(vec3 O, vec3 R, vec3 E, vec3 B, float pixA, float T) {
  float len = B.y < 0.0 ? (E.y + 1.8) / -B.y : 60.0; // beams stop on the floor
  vec3 w0 = O - E;
  float b = dot(R, B), d = dot(R, w0), e = dot(B, w0);
  float den = max(1.0 - b * b, 1e-4);
  float u = clamp((e - b * d) / den, 0.0, len);
  vec3 bp = E + B * u;
  float s = max(dot(bp - O, R), 0.0);
  float dist = length(O + R * s - bp);
  float wdt = 0.015 + pixA * s;
  float core = exp(-dist * dist / (wdt * wdt)) * (0.02 / wdt);
  float halo = 0.03 * wdt / (dist * dist * 6.0 + wdt);
  return (core + halo) * haze(bp, T) * exp(-u * 0.035);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = u_time; // every use is a slow sine, precise enough for days

  vec3 O = vec3(0.0, 0.0, 0.0);
  vec3 fwd = normalize(vec3(0.0, 1.5, 14.0));
  vec3 rgt = normalize(cross(vec3(0, 1, 0), fwd));
  vec3 up = cross(fwd, rgt);
  vec3 R = normalize(uv.x * rgt + uv.y * up + 1.5 * fwd);
  float pixA = 1.6 / (u_resolution.y * 1.5);

  // soft kick breathing at ~0.45 Hz, only on the beams
  float pulse = 0.82 + 0.18 * (0.5 + 0.5 * cos(T * 2.83));

  // centre fan: green, breathing open and closed, tilting up and down
  vec3 E1 = vec3(0.0, 2.4, 16.0);
  float spread = 0.55 + 0.35 * sin(T * 0.11);
  float sweep = 0.25 * sin(T * 0.07);
  float tilt = -0.02 + 0.07 * sin(T * 0.13 + 1.0);
  float gsum = 0.0;
  for (int i = 0; i < 9; i++) {
    float th = (float(i) / 8.0 - 0.5) * 2.0 * spread + sweep;
    vec3 B = normalize(vec3(sin(th), tilt + 0.03 * cos(float(i) * 2.1 + T * 0.3), -cos(th)));
    gsum += beam(O, R, E1, B, pixA, T);
  }

  // side scanners: red, slowly rotating cones crossing over the room
  float rsum = 0.0;
  for (int j = 0; j < 2; j++) {
    float side = float(j) * 2.0 - 1.0;
    vec3 E = vec3(9.5 * side, 7.5, 10.0);
    for (int i = 0; i < 4; i++) {
      float ph = float(i) * 1.5708 + T * 0.16 * side;
      vec3 target = vec3(-2.5 * side + 1.8 * cos(ph), 0.4 + 1.2 * sin(ph), 5.0);
      rsum += beam(O, R, E, normalize(target - E), pixA, T);
    }
  }

  vec3 col = vec3(0.10, 1.0, 0.32) * gsum * pulse + vec3(1.0, 0.10, 0.12) * rsum * 0.55 * pulse;

  // emitter glows and faint lit haze around the stage
  vec3 dE = normalize(E1 - O);
  float ce = max(dot(R, dE), 0.0);
  float smoke = haze(R * 9.0 + vec3(0.0, 0.0, 3.0), T * 0.6);
  col += vec3(0.25, 1.0, 0.45) * (pow(ce, 3000.0) * 1.5 + pow(ce, 60.0) * 0.08 * smoke + pow(ce, 8.0) * 0.05 * smoke * pulse);
  col += vec3(0.015, 0.035, 0.03) * smoke * smoothstep(-0.6, 0.3, uv.y);

  // dark crowd silhouette at the bottom
  float crowd = -0.36 + 0.025 * sin(uv.x * 23.0) * sin(uv.x * 7.0 + 1.0) + 0.012 * sin(uv.x * 61.0);
  col *= smoothstep(crowd - 0.01, crowd + 0.01, uv.y) * 0.9 + 0.1;

  col *= 1.0 - 0.35 * dot(uv, uv);
  col = 1.0 - exp(-col * 1.5);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}
