// Neural Bloom — columns of neurons joined by faint weighted edges, slow activation waves flowing left to right and nodes blooming as they fire (FragCoord GLSL)
// Theme: AI

#define LAYERS 6
#define MAXN 7

float hash(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

// neurons per layer: 4 6 7 7 6 3
int layerCount(int l) {
  if (l == 0) return 4;
  if (l == 1) return 6;
  if (l == 2) return 7;
  if (l == 3) return 7;
  if (l == 4) return 6;
  return 3;
}

float layerX(int l, float span) {
  return (float(l) / float(LAYERS - 1) - 0.5) * span;
}

vec2 nodePos(int l, int i, float span, float T) {
  float n = float(layerCount(l));
  float y = (float(i) - 0.5 * (n - 1.0)) * 0.118;
  float h = hash(vec2(float(l), float(i)));
  y += 0.012 * sin(T * 0.21 + h * 6.2831);
  float x = layerX(l, span) + 0.008 * sin(T * 0.17 + h * 17.0);
  return vec2(x, y);
}

// distance to segment, and position along it (0..1)
vec2 segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return vec2(length(pa - ba * h), h);
}

void main() {
  vec2 res = u_resolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float T = mod(u_time, 3600.0);
  float aspect = res.x / res.y;
  float span = min(aspect * 0.82, 1.55);

  // two activation waves travel through the net, one every 8 s (16 s cycle, divides the wrap)
  const float SPEED = 0.0625;
  float ph0 = T * SPEED;
  vec2 fronts = vec2(fract(ph0), fract(ph0 + 0.5)) * 1.5 - 0.25;          // in units of network width
  vec2 waveId = vec2(floor(ph0), floor(ph0 + 0.5)) + vec2(0.0, 71.0);

  vec3 col = vec3(0.010, 0.012, 0.026) + vec3(0.018, 0.010, 0.035) * (1.0 - length(p));

  // faint background lattice of "embedding" dust
  vec2 g = p * 26.0 + vec2(T * 0.05, 0.0);
  vec2 gi = floor(g);
  float gh = hash(gi);
  float dust = smoothstep(0.08, 0.0, length(fract(g) - 0.5 - (vec2(gh, fract(gh * 9.1)) - 0.5) * 0.6));
  col += vec3(0.25, 0.2, 0.6) * dust * step(0.82, gh) * 0.10 * (0.6 + 0.4 * sin(T * 0.3 + gh * 40.0));

  vec3 edgeCol = vec3(0.0);
  vec3 pulseCol = vec3(0.0);

  // which gap between columns is this pixel in?
  float u = p.x / span + 0.5;
  float gapf = floor(u * float(LAYERS - 1));
  int gap = int(clamp(gapf, 0.0, float(LAYERS - 2)));

  // edges only reach past their own gap within a node's radius, so the neighbouring
  // gap is only needed right next to a column
  float fu = fract(u * float(LAYERS - 1));
  float colDist = min(fu, 1.0 - fu) * span / float(LAYERS - 1);
  int gaps = colDist < 0.03 ? 2 : 1;
  // pulse profile along the network, shared by every edge in this pixel column
  float ex = u;
  vec2 dd = ex - fronts;
  vec2 pulse = exp(-dd * dd * 1600.0) + exp(-max(-dd, 0.0) * 22.0) * step(dd, vec2(0.0)) * 0.25;

  for (int k = 0; k < 2; k++) {
    if (k >= gaps) break;
    int la = gap;
    if (k == 1) la = fu < 0.5 ? gap - 1 : gap + 1;
    if (la < 0 || la > LAYERS - 2) continue;
    int na = layerCount(la), nb = layerCount(la + 1);
    for (int i = 0; i < MAXN; i++) {
      if (i >= na) break;
      vec2 a = nodePos(la, i, span, T);
      float hi = hash(vec2(float(la), float(i)));
      // is this source neuron firing on each wave?
      vec2 srcAct = step(vec2(0.35), vec2(hash(vec2(float(la) * 5.0 + float(i), waveId.x)),
                                          hash(vec2(float(la) * 5.0 + float(i), waveId.y))));
      float pv = dot(pulse, srcAct);
      for (int j = 0; j < MAXN; j++) {
        if (j >= nb) break;
        vec2 b = nodePos(la + 1, j, span, T);
        vec2 sd = segment(p, a, b);
        float d2 = sd.x * sd.x;
        if (d2 > 0.0012) continue;
        float hw = hash(vec2(float(la) * 13.0 + float(i), float(j) * 7.0 + 3.0));
        // weight: signed, slowly shimmering
        float w = sin(hw * 6.2831 + T * (0.08 + 0.1 * hw) + hi * 3.0);
        float aw = abs(w);
        float line = exp(-d2 / (0.0000045 + 0.000004 * aw));
        float haze = exp(-d2 / 0.00012);
        vec3 wc = w > 0.0 ? vec3(0.35, 0.55, 1.0) : vec3(0.6, 0.3, 1.0);
        edgeCol += wc * (line * 0.12 * aw * aw + haze * 0.008 * aw);
        // activation pulses carried along the edge
        pulseCol += vec3(0.35, 0.95, 1.0) * pv * aw * aw * (line * 1.2 + haze * 0.06);
      }
    }
  }
  col += edgeCol + pulseCol;

  // neurons: nearest two columns
  for (int k = 0; k < 2; k++) {
    int l = int(clamp(floor(u * float(LAYERS - 1) + 0.5), 0.0, float(LAYERS - 1)));
    l += k == 0 ? 0 : (fract(u * float(LAYERS - 1) + 0.5) < 0.5 ? -1 : 1);
    if (l < 0 || l > LAYERS - 1) continue;
    int n = layerCount(l);
    float lx = float(l) / float(LAYERS - 1);
    for (int i = 0; i < MAXN; i++) {
      if (i >= n) break;
      vec2 c = nodePos(l, i, span, T);
      float r = length(p - c);
      float bloom = 0.0;
      for (int q = 0; q < 2; q++) {
        float act = l == 0 ? 1.0 : step(0.35, hash(vec2(float(l) * 5.0 + float(i), waveId[q])));
        if (l > 0) act = max(act, 0.25);
        float since = fronts[q] - lx;                  // >0 once the front has passed
        bloom += act * smoothstep(-0.045, 0.0, since) * exp(-max(since, 0.0) * 7.0);   // ~0.5 s swell
      }
      float hn = hash(vec2(float(i), float(l) + 40.0));
      float idle = 0.18 + 0.06 * sin(T * 0.4 + hn * 30.0);
      float ring = smoothstep(0.004, 0.0, abs(r - 0.016)) * 0.45;
      float core = exp(-r * r * 9000.0);
      float halo = exp(-r * 38.0) * 0.5 + exp(-r * r * 400.0) * 0.6;
      vec3 base = mix(vec3(0.55, 0.35, 1.0), vec3(0.4, 0.95, 1.0), clamp(bloom, 0.0, 1.0));
      col += base * (ring * (0.5 + bloom) * 0.6 + core * (idle + bloom * 1.3) + halo * (0.03 + bloom * 0.35));
    }
  }

  col *= 1.0 - 0.35 * dot(p, p);
  col = 1.0 - exp(-col * 1.9);
  col = pow(col, vec3(0.95));
  fragColor = vec4(col, 1.0);
}
