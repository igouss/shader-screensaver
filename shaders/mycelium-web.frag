// Mycelium Web — glowing fungal threads under the forest floor, with nutrient pulses crawling along the hyphae (Shadertoy)
// Theme: forest

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 19.19)); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float segDist(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// One network layer: every cell holds a node; threads join it to its right and upper neighbours
// (plus one diagonal), bowed by a noise field so they wander like hyphae.
vec3 network(vec2 p, float scale, float seed, float t, out float thread) {
  p *= scale;
  vec2 id = floor(p);
  vec3 glow = vec3(0.0);
  thread = 0.0;
  float best = 1e9;
  for (int j = -1; j <= 0; j++)
  for (int i = -1; i <= 0; i++) {
    vec2 c = id + vec2(i, j);
    vec2 a = c + 0.15 + 0.7 * hash2(c + seed);
    for (int k = 0; k < 3; k++) {
      vec2 o = k == 0 ? vec2(1, 0) : (k == 1 ? vec2(0, 1) : vec2(1, 1));
      vec2 cb = c + o;
      float keep = hash(c * 1.7 + o * 3.1 + seed);
      if (keep < (k == 2 ? 0.55 : 0.18)) continue;
      vec2 b = cb + 0.15 + 0.7 * hash2(cb + seed);
      // bow the segment: displace the sample point perpendicular to it
      vec2 dir = normalize(b - a);
      vec2 nrm = vec2(-dir.y, dir.x);
      float along = dot(p - a, dir) / length(b - a);
      float bow = (hash(c + o + seed * 2.0) - 0.5) * 0.5 * sin(3.14159 * clamp(along, 0.0, 1.0));
      vec2 q = p - nrm * bow;
      float h;
      float d = segDist(q, a, b, h);
      float w = 0.018 + 0.012 * keep;
      float core = exp(-d * d / (w * w));
      float halo = 0.012 / (d * d * 30.0 + 0.04);
      // pulses: bright packets travelling along the thread
      float spd = 0.08 + 0.06 * hash(c + o * 7.0 + seed);
      float ph = fract(h * 1.0 - t * spd + hash(c * 3.3 + o + seed));
      float pulse = exp(-pow((ph - 0.5) * 9.0, 2.0));
      float v = core * (0.35 + 1.4 * pulse) + halo * (0.25 + 0.8 * pulse);
      glow += vec3(v);
      thread = max(thread, core);
      best = min(best, d);
    }
    // node: a little spore knot
    float dn = length(p - a);
    glow += 0.05 / (dn * dn * 60.0 + 0.3) * (0.6 + 0.4 * sin(t * 0.4 + hash(c + seed) * 6.2831));
  }
  return glow;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = mod(iTime, 3600.0);

  // slow drift over the soil
  vec2 drift = vec2(0.012, 0.006) * t;
  vec2 p = uv + drift;

  // soil: dark humus with grains and faint root shadows
  float soil = vnoise(p * 6.0) * 0.5 + vnoise(p * 17.0) * 0.3 + vnoise(p * 45.0) * 0.2;
  vec3 col = vec3(0.028, 0.02, 0.016) * (0.6 + 0.8 * soil);
  float root = abs(vnoise(p * vec2(1.2, 3.0) + 4.0) - 0.5);
  col *= 0.75 + 0.25 * smoothstep(0.0, 0.08, root);

  // gentle warping so no thread is perfectly straight
  vec2 w = vec2(vnoise(p * 2.0 + 3.0), vnoise(p * 2.0 + 11.0)) - 0.5;

  float th1, th2;
  vec3 g1 = network(p + w * 0.12, 3.2, 1.0, t, th1);           // fine near threads
  vec3 g2 = network(p * 0.97 + w * 0.2 + 7.3, 1.7, 5.0, t * 0.8, th2); // thicker deep strands

  // wispy fine hyphae: many thin, strongly warped threads, dim, no pulses to speak of
  vec2 w2 = vec2(vnoise(p * 7.0 + 1.0), vnoise(p * 7.0 + 9.0)) - 0.5;
  float th3;
  vec3 g3 = network(p + w * 0.2 + w2 * 0.05 + 3.1, 7.5, 9.0, t * 0.5, th3);

  col += vec3(0.5, 0.8, 0.7) * g3 * 0.05;
  vec3 cA = vec3(0.35, 0.95, 0.75);  // cool foxfire green
  vec3 cB = vec3(0.55, 0.65, 1.0);   // faint violet-blue for deeper strands
  col += cA * g1 * 0.22;
  col += cB * g2 * 0.14 * (0.6 + 0.4 * vnoise(p * 1.3 + t * 0.02));

  // pale fungal tissue where threads are thick
  col += vec3(0.1, 0.12, 0.1) * (th1 * 0.3 + th2 * 0.2);

  vec2 v = uv * vec2(0.8, 1.0);
  col *= 1.0 - 0.55 * dot(v, v);
  col = 1.0 - exp(-col * 1.8);
  fragColor = vec4(col, 1.0);
}
