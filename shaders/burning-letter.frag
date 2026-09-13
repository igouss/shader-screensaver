// Burning Letter — a handwritten page creeps into a ragged glowing burn front that leaves cracked, ember-veined char and rising sparks (FragCoord GLSL)
// Theme: flame

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
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + 13.7; a *= 0.5; }
  return s;
}
// crack network: distance to Voronoi borders (cheap F2-F1)
float cracks(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(i, j);
    vec2 o = vec2(hash(n + g), hash(n + g + 17.0));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = mod(u_time, 4000.0);

  // the sheet slowly feeds from the right toward the front; P are coordinates fixed to the paper
  vec2 P = uv + vec2(t * 0.018, 0.0);
  P.x = mod(P.x, 200.0);

  // ragged front: a gently curved line, torn by domain-warped noise in paper space
  vec2 wq = P * 2.2 + vec2(fbm(P * 1.7 + 3.0), fbm(P * 1.7 + 9.0)) * 1.2;
  float rag = fbm(wq) - 0.5;
  float frontX = -0.12 + 0.12 * uv.y - 0.1 * uv.y * uv.y;
  float b = (frontX - uv.x) + 0.22 * rag;          // > 0 burnt, < 0 paper

  // ---- paper: aged sheet lit only by the fire, rows of faded cursive
  float fib = vnoise(P * vec2(8.0, 120.0)) * 0.4 + vnoise(P * 50.0) * 0.6;
  vec3 paper = vec3(0.62, 0.5, 0.34) * (0.85 + 0.2 * fib);
  float row = P.y * 14.0 + 0.3;
  float rid = floor(row), rf = fract(row);
  float word = step(0.35, vnoise(vec2(P.x * 9.0, rid * 7.1)));      // gaps between words
  // cursive: frequency-modulated loops with varying letter heights
  float ph = P.x * 110.0 + 4.0 * sin(P.x * 23.0 + rid * 1.7) + rid * 3.0;
  float amp = 0.12 + 0.2 * vnoise(vec2(P.x * 45.0, rid * 3.3));
  float squig = abs(rf - 0.5 - amp * sin(ph) - 0.05 * sin(ph * 0.5 + 1.0));
  float ink = smoothstep(0.07, 0.025, squig) * word * step(0.12, rf) * step(rf, 0.88);
  paper = mix(paper, vec3(0.16, 0.1, 0.08), ink * 0.6);
  // scorch: paper browns and darkens approaching the front
  float scorch = smoothstep(-0.14, 0.0, b);
  paper = mix(paper, vec3(0.2, 0.08, 0.02), scorch * 0.85);
  // lit by the flames: bright near the front, falling into darkness
  float lit = exp(b * 7.0) * 0.55 + 0.06;
  vec3 col = paper * lit * vec3(1.0, 0.8, 0.6);

  // ---- burnt side: charred, cracked, with ember veins that cool with distance
  if (b > 0.0) {
    vec2 cp = P * 16.0 + rag * 2.0;
    float cr = cracks(cp);
    vec3 charc = vec3(0.025, 0.02, 0.018) * (0.7 + 0.6 * vnoise(P * 40.0));
    float heat = exp(-b * 9.0);
    float vein = smoothstep(0.1, 0.0, cr) * heat;
    float pulse = 0.75 + 0.25 * sin(t * 0.8 + hash(floor(cp)) * 6.2831);    // slow ember breathing
    charc += vec3(1.0, 0.25, 0.04) * vein * pulse * 0.9;
    // grey ash skin on cooled plates
    charc += vec3(0.07, 0.068, 0.065) * smoothstep(0.3, 0.8, vnoise(P * 22.0)) * smoothstep(0.1, 0.4, b) * smoothstep(0.05, 0.15, cr);
    col = mix(col, charc, smoothstep(0.0, 0.006, b));
  }

  // ---- glowing edge: thin white-hot line, orange band, deep red smoulder
  float e = b;
  vec3 edge = vec3(1.0, 0.8, 0.45) * exp(-abs(e) * 400.0) * 1.2
            + vec3(1.0, 0.42, 0.08) * exp(-abs(e - 0.012) * 90.0) * 0.9
            + vec3(0.6, 0.1, 0.02) * exp(-abs(e - 0.03) * 25.0) * 0.5;
  edge *= 0.75 + 0.25 * vnoise(vec2(P.y * 30.0, t * 0.5)) + 0.15 * vnoise(P * 60.0 + t * 0.3);
  col += edge;

  // ---- sparks rising from the front
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 sp = uv * (22.0 + fk * 14.0) + vec2(0.0, -t * (0.9 + fk * 0.4));
    sp.x += 0.4 * sin(sp.y * 0.7 + fk * 3.0);
    vec2 id = floor(sp), f = fract(sp) - 0.5;
    float h = hash(id + fk * 31.0);
    vec2 o = (vec2(hash(id + 7.0), hash(id + 13.0)) - 0.5) * 0.7;
    float d = length(f - o);
    float near = exp(-abs(frontX - uv.x + 0.05) * 7.0);
    float life = smoothstep(0.0, 0.2, fract(h * 17.0 + t * 0.15)) * smoothstep(1.0, 0.5, fract(h * 17.0 + t * 0.15));
    col += vec3(1.0, 0.5, 0.12) * step(0.9, h) * smoothstep(0.12, 0.0, d) * near * life * 1.3;
  }

  // warm air glow above the front
  col += vec3(0.12, 0.04, 0.01) * exp(-abs(b) * 10.0) * 0.5;

  col *= 1.0 - 0.45 * pow(length(uv * vec2(0.75, 1.0)), 2.0);
  col = 1.0 - exp(-col * 1.4);
  fragColor = vec4(col, 1.0);
}
