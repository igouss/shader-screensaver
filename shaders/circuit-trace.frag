// Circuit Trace — a black printed circuit board drifting past, data packets in primary colours racing along its traces (FragCoord GLSL)
// Theme: Computer World

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

// Kraftwerk primaries: red, yellow, blue, green
vec3 primary(float h) {
  if (h < 0.25) return vec3(1.0, 0.12, 0.08);
  if (h < 0.50) return vec3(1.0, 0.78, 0.10);
  if (h < 0.75) return vec3(0.15, 0.40, 1.00);
  return vec3(0.10, 1.0, 0.40);
}

// a packet: bright head, fading tail, moving along coordinate x
float packet(float x, float lane, float T) {
  float h = hash21(vec2(lane, 3.7));
  if (h < 0.2) return 0.0;                 // quiet bus
  float dir = h < 0.6 ? 1.0 : -1.0;
  float L = 5.0 + 9.0 * hash21(vec2(lane, 9.1));
  float v = 0.9 + 0.9 * hash21(vec2(lane, 1.3));
  float u = fract((dir * x - T * v) / L + h * 7.0);
  float tail = exp(-(1.0 - u) * L * 0.75);
  return tail * smoothstep(1.0, 0.985, u);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = u_time;
  float S = 8.0;
  vec2 p = uv * S + vec2(T * 0.11, T * 0.045);
  float px = S / u_resolution.y;

  vec2 c = floor(p);
  vec2 q = p - c - 0.5;

  // shared edge flags so neighbouring cells agree
  bool eR = hash21(c + vec2(0.5, 0.0) + 17.0) > 0.42;
  bool eL = hash21(c + vec2(-0.5, 0.0) + 17.0) > 0.42;
  bool eU = hash21(c + vec2(0.0, 0.5) + 31.0) > 0.42;
  bool eD = hash21(c + vec2(0.0, -0.5) + 31.0) > 0.42;

  float dH = 1e3, dV = 1e3;
  if (eR) dH = min(dH, q.x > 0.0 ? abs(q.y) : length(q));
  if (eL) dH = min(dH, q.x < 0.0 ? abs(q.y) : length(q));
  if (eU) dV = min(dV, q.y > 0.0 ? abs(q.x) : length(q));
  if (eD) dV = min(dV, q.y < 0.0 ? abs(q.x) : length(q));
  float n = float(eR) + float(eL) + float(eU) + float(eD);

  float w = 0.055;
  float d = min(dH, dV);
  float trace = smoothstep(w + px, w - px, d);

  // pads at dead ends, occasional vias
  float pad = 0.0;
  float hv = hash21(c + 71.3);
  if (n == 1.0 || (n > 0.0 && hv > 0.88)) {
    float r = length(q);
    pad = smoothstep(0.17 + px, 0.17 - px, r) * smoothstep(0.06 - px, 0.06 + px, r);
  }

  // chips on a coarse grid, hiding the traces beneath
  vec2 C = floor(p / 4.0);
  vec2 rr = p - C * 4.0 - 2.0;
  float hc = hash21(C + 5.0);
  float chip = 0.0, pins = 0.0, chipEdge = 0.0, led = 0.0;
  if (hc < 0.33) {
    vec2 hs = hc < 0.16 ? vec2(1.35, 0.85) : vec2(0.85, 1.35);
    vec2 a = abs(rr) - hs;
    float db = max(a.x, a.y);
    chip = smoothstep(px, -px, db);
    chipEdge = smoothstep(2.0 * px, 0.0, abs(db + 0.03)) * chip;
    // pins along the long sides
    vec2 pr = hs.x > hs.y ? rr : rr.yx;
    vec2 ph = hs.x > hs.y ? hs : hs.yx;
    float pxl = abs(fract(pr.x * 2.0 + 0.5) - 0.5) * 0.5;
    float inRow = step(abs(pr.x), ph.x - 0.1);
    float py = abs(pr.y) - ph.y - 0.12;
    pins = inRow * smoothstep(0.07 + px, 0.07 - px, pxl) * smoothstep(0.12 + px, 0.12 - px, abs(py));
    // status LED breathing slowly
    vec2 lp = rr - vec2(hs.x - 0.3, hs.y - 0.3) * vec2(1.0, 1.0);
    float br = 0.5 + 0.5 * sin(T * 0.6 + hc * 40.0);
    led = exp(-length(lp) * 18.0) * br;
  }

  // data packets: rows carry horizontal buses, columns vertical ones
  float pH = packet(p.x, c.y, T);
  float pV = packet(p.y, c.x + 101.0, T);
  vec3 colH = primary(hash21(vec2(c.y, 55.0)));
  vec3 colV = primary(hash21(vec2(c.x + 101.0, 55.0)));
  float coreH = smoothstep(w + px, w - px, dH);
  float coreV = smoothstep(w + px, w - px, dV);
  float haloH = exp(-max(dH - w, 0.0) * 16.0);
  float haloV = exp(-max(dV - w, 0.0) * 16.0);
  vec3 glow = colH * pH * (coreH * 1.8 + 0.6 * haloH) * (dH < 1e2 ? 1.0 : 0.0)
            + colV * pV * (coreV * 1.8 + 0.6 * haloV) * (dV < 1e2 ? 1.0 : 0.0);

  // board
  vec3 col = vec3(0.012, 0.013, 0.016);
  vec2 dq = abs(fract(p) - 0.5);
  col += 0.018 * smoothstep(0.05, 0.0, length(0.5 - dq)); // drill grid
  col = mix(col, vec3(0.10, 0.095, 0.085), max(trace, pad));
  col += glow * (1.0 - chip);

  // chips on top
  vec3 chipCol = vec3(0.02) + vec3(0.09) * chipEdge;
  col = mix(col, chipCol, chip);
  col = mix(col, vec3(0.22, 0.21, 0.2), pins * (1.0 - chip));
  col += vec3(1.0, 0.1, 0.05) * led * 1.4;

  col = 1.0 - exp(-col * 1.7);
  col *= 1.0 - 0.45 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
