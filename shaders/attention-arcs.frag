// Attention Arcs — a row of token dots under glowing parabolic arcs whose weights re-distribute as colour-coded attention heads take turns (FragCoord GLSL)
// Theme: AI

const int N = 13;  // tokens in the sequence

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// soft, distinct hue per head
vec3 headColor(int h) {
  if (h == 0) return vec3(0.40, 0.86, 0.82);  // teal
  if (h == 1) return vec3(0.98, 0.70, 0.42);  // amber
  if (h == 2) return vec3(0.72, 0.62, 1.00);  // lavender
  return vec3(1.00, 0.56, 0.66);              // rose
}

// how strongly query token j looks back at key token i (i < j) in head h, epoch e;
// each head has the character of a real one, plus a little per-epoch noise
float score(int h, int i, int j, float e) {
  float fi = float(i), fj = float(j), d = fj - fi;
  float r = hash(vec2(fi * 7.13 + e * 13.7 + float(h) * 3.1, fj * 3.31 + float(h) * 17.9 + e * 5.3));
  if (h == 0) return exp(-3.0 * (d - 1.0) * (d - 1.0)) * (0.55 + 0.45 * r) + 0.6 * pow(r, 12.0);  // previous token
  if (h == 1) return (i == 0 ? 0.35 + 0.45 * r : 0.0) + 0.6 * pow(r, 10.0);                         // attention sink
  if (h == 2) return (mod(d, 4.0) < 0.5 ? 0.30 + 0.55 * r : 0.0) + 0.4 * pow(r, 10.0);               // periodic
  return 1.25 * pow(r, 6.0);                                                                         // sparse semantic
}

void main() {
  vec2 R = u_resolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * R) / R.y;
  float px = 1.0 / R.y;
  float tb = mod(u_time, 6283.185);
  float sp = 0.125 * min(R.x / R.y / 1.78, 1.0);  // token spacing
  float y0 = -0.19;                                 // token baseline
  float mid = 0.5 * float(N - 1);

  // head schedule: one head holds the stage, then hands over to the next
  float T = u_time * 0.065;
  float hc = floor(T);
  float a1 = smoothstep(0.55, 1.0, fract(T));
  float a0 = 1.0 - a1;
  int h0 = int(mod(hc, 4.0));
  int h1 = int(mod(hc + 1.0, 4.0));
  float e0 = mod(floor(hc / 4.0), 97.0);
  float e1 = mod(floor((hc + 1.0) / 4.0), 97.0);
  vec3 c0 = headColor(h0), c1 = headColor(h1);

  vec3 acc = vec3(0.0);   // arcs
  vec3 recv = vec3(0.0);  // attention gathered at the token under this pixel

  if (p.y > y0 - 0.04) {
    for (int i = 0; i < N - 1; i++) {
      float xi = (float(i) - mid) * sp;
      if (p.x < xi - 0.04) break;
      for (int j = i + 1; j < N; j++) {
        float xj = (float(j) - mid) * sp;
        if (p.x > xj + 0.04) continue;
        float w = 0.5 * (xj - xi);
        float H = 0.78 * pow(w, 0.8);
        if (p.y > y0 + H + 0.07) continue;

        float r = hash(vec2(float(i), float(j)) + 0.37);
        float br = 0.8 + 0.2 * sin(tb * 0.35 + r * 6.2832);
        float g0 = a0 * score(h0, i, j, e0) * br;
        float g1 = a1 * score(h1, i, j, e1) * br;
        float g = g0 + g1;
        if (g < 0.015) continue;
        vec3 tint = (c0 * g0 + c1 * g1) / g;

        float c = 0.5 * (xi + xj);
        float u = (p.x - c) / w;
        float uc = clamp(u, -1.0, 1.0);
        float y = y0 + H * (1.0 - uc * uc);
        float sl = 2.0 * H * uc / w;
        float d = abs(p.y - y) / sqrt(1.0 + sl * sl);
        if (abs(u) > 1.0) d = length(p - vec2(c + sign(u) * w, y0));

        float th = 0.0005 + 0.0026 * g;
        float core = smoothstep(th + 1.5 * px, th, d);
        float glow = exp(-d / (0.004 + 0.012 * g));
        // a slow bead of information travelling from key to query
        float q = fract(0.5 * (uc + 1.0) - tb * 0.11 + r);
        float bead = exp(-80.0 * (q - 0.5) * (q - 0.5));
        acc += tint * g * (0.85 * core + 0.28 * glow + 0.9 * bead * (core + glow));

        if (abs(p.x - xi) < 0.04) recv += tint * g;
        if (abs(p.x - xj) < 0.04) recv += tint * g * 0.35;
      }
    }
  }

  // ground: deep ink with a faint lift behind the arcs
  vec3 col = vec3(0.010, 0.013, 0.024);
  col += vec3(0.025, 0.030, 0.060) * exp(-2.2 * length((p - vec2(0.0, 0.02)) * vec2(0.7, 1.3)));

  // baseline the tokens sit on
  float span = mid * sp + 0.08;
  col += vec3(0.20, 0.24, 0.34) * 0.10 * exp(-abs(p.y - y0) / 0.0015) * smoothstep(span, span - 0.2, abs(p.x));

  col += 1.0 - exp(-1.15 * acc);

  // tokens
  float k = clamp(floor(p.x / sp + mid + 0.5), 0.0, float(N - 1));
  float xk = (k - mid) * sp;
  float dt = length(p - vec2(xk, y0));
  float rl = min(dot(recv, vec3(0.33)), 2.0);
  col += (recv / (rl + 0.001)) * (1.0 - exp(-rl)) * 0.55 * exp(-dt / 0.012);
  col = mix(col, vec3(0.80, 0.84, 0.92), 0.85 * smoothstep(0.0075 + px, 0.0075 - px, dt));
  col *= 1.0 - 0.6 * smoothstep(0.0048, 0.0030, dt) * (1.0 - smoothstep(0.0, 0.3, rl)); // quiet tokens are hollow

  // embedding vectors hanging below each token, drifting slowly
  float cellH = 0.017;
  float m = floor((y0 - 0.045 + 0.5 * cellH - p.y) / cellH);
  if (m >= 0.0 && m < 9.0) {
    vec2 cc = vec2(xk, y0 - 0.045 - m * cellH);
    vec2 bq = abs(p - cc) - vec2(0.013, 0.0055);
    float bd = length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0) - 0.0015;
    float hv = hash(vec2(k, m));
    float v = 0.5 + 0.5 * sin(tb * (0.08 + 0.1 * hv) + hv * 40.0 + k * 0.7);
    vec3 ec = mix(vec3(0.22, 0.40, 0.62), vec3(0.72, 0.48, 0.32), v) * (0.07 + 0.22 * v * v);
    col += ec * smoothstep(px, -px, bd) * exp(-m * 0.22);
  }

  // head indicator: four small lamps, the active head lit
  for (int h = 0; h < 4; h++) {
    float act = (h == h0 ? a0 : 0.0) + (h == h1 ? a1 : 0.0);
    vec2 lc = vec2((float(h) - 1.5) * 0.028, y0 - 0.235);
    float ld = length(p - lc);
    col += headColor(h) * (0.10 + 0.75 * act) * smoothstep(0.0045 + px, 0.0045 - px, ld);
    col += headColor(h) * 0.12 * act * exp(-ld / 0.01);
  }

  // vignette
  col *= 1.0 - 0.45 * smoothstep(0.35, 1.2, length(p * vec2(0.8, 1.0)));
  fragColor = vec4(col, 1.0);
}
