// Glowing Surf — night breakers roll onto a dark beach and ignite in bioluminescent blue lace as they break (Shadertoy)
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
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.1 + 7.3; a *= 0.5; }
  return s;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = mod(iTime, 3000.0);
  float h0 = 0.27;
  vec3 glowC = vec3(0.1, 0.65, 1.0);
  vec3 col;

  if (uv.y > h0) {
    // sky: faint stars over a low bank of haze
    col = mix(vec3(0.03, 0.045, 0.07), vec3(0.008, 0.01, 0.022), smoothstep(h0, 0.5, uv.y));
    vec2 sp = uv * 90.0;
    float st = hash(floor(sp));
    col += vec3(0.7, 0.75, 0.9) * step(0.985, st) * smoothstep(0.35, 0.05, length(fract(sp) - 0.5))
           * (0.5 + 0.5 * sin(t * 0.4 + st * 60.0)) * 0.6;
  } else {
    // perspective ground plane: world x across, z away from the viewer
    float z = 0.24 / (h0 - uv.y);
    vec2 w = vec2(uv.x * z, z);
    // diagonal, gently curving shoreline
    float shore = 0.62 + 0.12 * w.x + 0.08 * sin(w.x * 1.7 + 0.5) + 0.03 * sin(w.x * 4.3);
    float s = w.y - shore;                 // > 0 at sea, < 0 on the sand
    float lam = 0.42;
    // crests travel shoreward; each crest's line wobbles with its own noise
    float ph = s / lam + t * 0.13;
    float n = floor(ph);
    float wob = 0.25 * (vnoise(vec2(w.x * 1.1, n * 3.7)) - 0.5) + 0.08 * sin(w.x * 4.0 + n);
    float f = fract(ph + wob);                 // 0 at the crest front, grows seaward
    float shoreFade = smoothstep(2.2, 0.0, s); // waves break near the shore
    float breakAmt = smoothstep(1.6, 0.2, s) * smoothstep(-0.12, 0.05, s);

    // water base: dark navy with long swell shading
    vec3 sea = vec3(0.01, 0.022, 0.045) + vec3(0.015, 0.03, 0.05) * (1.0 - f) * shoreFade;
    // horizon haze
    sea = mix(sea, vec3(0.03, 0.045, 0.07), smoothstep(3.0, 14.0, z));

    // breaking line: a sharp glowing front with a lacy foam wake behind it
    float front = exp(-f * lam * 30.0) + 0.5 * exp(-(1.0 - f) * lam * 160.0);
    vec2 lp = vec2(w.x * 4.0, s * 7.0 + t * 0.02) + n * 1.7;
    float lace = fbm(lp * 1.5);
    lace = smoothstep(0.06, 0.0, abs(lace - 0.5)) * exp(-f * 2.5);
    float glow = (front * 1.1 + lace * 0.8) * breakAmt;
    // dim sparks of plankton scattered in the dark water
    vec2 pc = w * vec2(70.0, 50.0);
    float pk = hash(floor(pc));
    glow += step(0.985, pk) * smoothstep(0.4, 0.1, length(fract(pc) - 0.5)) * breakAmt * (0.5 + 0.5 * sin(t * 0.7 + pk * 90.0));
    sea += glowC * glow * 0.9;

    // sand: dark and damp, with a glowing swash edge that slides up and back
    float swash = -0.04 - 0.06 * (0.5 + 0.5 * sin(t * 0.41 + w.x * 0.6));
    vec3 sand = vec3(0.025, 0.022, 0.02) * (0.8 + 0.4 * vnoise(w * 30.0));
    float wet = smoothstep(swash - 0.25, swash, s);
    sand = mix(sand, sand * 0.6 + vec3(0.0, 0.01, 0.02), wet);
    float edge = exp(-abs(s - swash) * 70.0) * (0.35 + 0.65 * smoothstep(0.3, 0.7, vnoise(vec2(w.x * 6.0, t * 0.1))));
    sand += glowC * edge * 0.35;
    // glints left in the wet sand
    vec2 gc = w * vec2(90.0, 70.0);
    float gs = hash(floor(gc));
    sand += glowC * step(0.99, gs) * smoothstep(0.4, 0.1, length(fract(gc) - 0.5)) * wet * 0.6 * (0.5 + 0.5 * sin(t * 0.5 + gs * 50.0));
    // wet sand mirrors the glow of the nearest breaker
    sand += glowC * 0.06 * wet * smoothstep(-0.4, 0.0, s);

    col = mix(sand, sea, smoothstep(swash - 0.005, swash + 0.005, s));
    col = mix(col, vec3(0.03, 0.045, 0.07), smoothstep(6.0, 30.0, z) * 0.7);
  }

  col *= 1.0 - 0.4 * pow(length(uv * vec2(0.75, 1.0)), 2.0);
  col = 1.0 - exp(-col * 1.8);
  fragColor = vec4(col, 1.0);
}
