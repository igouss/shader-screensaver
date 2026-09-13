// Zone Water — the camera glides over still shallow water; coins, a syringe, tiles and a drowned icon pass beneath the weeds (FragCoord GLSL)
// Theme: Stalker

float h21(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 32768);
  uint h = q.x * 1597334677u ^ q.y * 3812015801u;
  h = (h ^ (h >> 16)) * 2246822519u;
  h ^= h >> 13;
  return float(h & 0xffffffu) / 16777216.0;
}
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x),
             mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.1 + vec2(1.3, 7.1); a *= 0.5; }
  return s;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// the drowned things; returns colour, alpha in .a
vec4 objectAt(vec2 p, vec2 id) {
  float r = h21(id), r2 = h21(id + 17.0);
  if (r < 0.2) return vec4(0.0);
  vec2 c = vec2((r2 - 0.5) * 1.1, 0.0);
  vec2 q = rot(r * 12.0) * (p - c);
  float kind = floor(r * 7.0);
  vec3 col; float d;
  if (kind < 2.0) {                       // coins, a small scatter
    d = 1e9; col = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      vec2 o = vec2(h21(id + float(i) * 3.1), h21(id + float(i) * 5.7)) - 0.5;
      float dd = length(q - o * 0.18) - 0.022;
      d = min(d, dd);
    }
    float rim = smoothstep(0.006, 0.0, abs(d + 0.004));
    col = vec3(0.45, 0.36, 0.2) * (0.7 + 0.5 * rim);
  } else if (kind < 3.0) {                // syringe
    float barrel = sdBox(q, vec2(0.11, 0.018)) - 0.004;
    float needle = sdSeg(q, vec2(0.11, 0.0), vec2(0.2, 0.0)) - 0.0025;
    float plunger = sdBox(q + vec2(0.14, 0.0), vec2(0.03, 0.006));
    float cap = sdBox(q + vec2(0.17, 0.0), vec2(0.004, 0.03));
    d = min(min(barrel, needle), min(plunger, cap));
    float glass = step(barrel, 0.0) * (0.5 + 0.5 * step(0.5, fract(q.x * 50.0)) * 0.3);
    col = mix(vec3(0.5, 0.52, 0.48), vec3(0.3, 0.36, 0.33), glass);
  } else if (kind < 4.0) {                // a drowned icon in a gilt frame
    float frame = sdBox(q, vec2(0.12, 0.16));
    float inner = sdBox(q, vec2(0.1, 0.14));
    d = frame;
    float halo = smoothstep(0.045, 0.035, length(q - vec2(0.0, 0.06)));
    float figure = smoothstep(0.01, 0.0, sdBox(q + vec2(0.0, 0.03), vec2(0.035 - q.y * 0.2, 0.09)));
    col = inner < 0.0 ? mix(vec3(0.16, 0.1, 0.05), vec3(0.08, 0.1, 0.12), figure) + vec3(0.35, 0.26, 0.1) * halo
                      : vec3(0.42, 0.32, 0.14);
    col *= 0.8 + 0.3 * fbm(q * 30.0);
  } else if (kind < 5.0) {                // rusted pipe
    d = sdBox(q, vec2(0.25, 0.028)) - 0.01;
    float shade = 1.0 - abs(q.y) / 0.04;
    col = vec3(0.34, 0.16, 0.07) * (0.5 + 0.7 * shade) * (0.7 + 0.6 * fbm(q * 40.0));
  } else if (kind < 6.0) {                // a coiled spring
    float y = 0.03 * sin(q.x * 110.0);
    d = max(abs(q.y - y) - 0.004, abs(q.x) - 0.12);
    col = vec3(0.28, 0.26, 0.22);
  } else {                                // broken tiles
    vec2 g = q * 9.0;
    vec2 tf = fract(g) - 0.5;
    float t = max(abs(tf.x), abs(tf.y));
    d = sdBox(q, vec2(0.2, 0.15)) + 0.05 * (fbm(q * 12.0) - 0.5);
    col = vec3(0.2, 0.22, 0.17) * (0.7 + 0.5 * h21(floor(g) + id)) * mix(0.35, 1.0, smoothstep(0.5, 0.42, t)) * (0.6 + 0.6 * fbm(q * 20.0));
  }
  return vec4(col, smoothstep(0.004, -0.002, d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = mod(u_time, 3600.0);

  // still water, barely stirred; a drip falls every so often
  vec2 nrm = vec2(0.0);
  nrm += 0.004 * vec2(sin(uv.y * 9.0 + T * 0.4), cos(uv.x * 7.0 - T * 0.33));
  nrm += 0.002 * vec2(sin(uv.x * 23.0 + uv.y * 7.0 + T * 0.7), cos(uv.y * 19.0 - T * 0.6));
  float dp = fract(T / 7.0);
  vec2 dc = vec2(0.35 * sin(floor(T / 7.0) * 3.7), 0.25 * cos(floor(T / 7.0) * 2.3));
  float dr = length(uv - dc);
  float ring = sin((dr - dp * 0.5) * 70.0) * exp(-abs(dr - dp * 0.5) * 30.0) * (1.0 - dp) * smoothstep(0.0, 0.05, dp);
  nrm += normalize(uv - dc + 1e-4) * ring * 0.006;

  // the river bed scrolls beneath us
  vec2 bp = uv + nrm * 3.0 + vec2(0.0, T * 0.028);
  float mud = fbm(bp * 3.0);
  float moss = fbm(bp * 7.0 + 4.0);
  vec3 bed = mix(vec3(0.09, 0.08, 0.05), vec3(0.14, 0.15, 0.08), mud);
  bed = mix(bed, vec3(0.08, 0.14, 0.06), smoothstep(0.5, 0.75, moss) * 0.8);
  bed *= 0.75 + 0.5 * n2(bp * 40.0);

  // objects, one per band of silt
  vec2 cellSz = vec2(1.0, 0.55);
  vec2 cell = bp / cellSz;
  for (int j = 0; j < 2; j++) {
    vec2 lp = vec2(bp.x, (fract(cell.y + 0.5 * float(j)) - 0.5) * cellSz.y);
    vec2 lid = vec2(float(j) * 31.0, floor(cell.y + 0.5 * float(j)));
    // shadow first, then the object
    vec4 sh = objectAt(lp - vec2(0.015, -0.015), lid);
    bed *= 1.0 - 0.45 * sh.a;
    vec4 ob = objectAt(lp, lid);
    bed = mix(bed, mix(ob.rgb * 0.7, vec3(0.07, 0.09, 0.06), 0.25), ob.a);
  }

  // long weeds combed by an imperceptible current
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float wx = bp.x * (3.0 + fk) + fk * 1.7;
    float sway = 0.25 * sin(bp.y * (2.0 + fk) + T * (0.25 + 0.05 * fk) + floor(wx) * 2.0);
    float lx = fract(wx + sway) - 0.5;
    float live = step(0.55, h21(vec2(floor(wx + sway), fk)));
    float strand = smoothstep(0.06, 0.0, abs(lx)) * live * (0.5 + 0.5 * sin(bp.y * 3.0 + floor(wx) * 5.0));
    bed = mix(bed, vec3(0.1, 0.17, 0.07) * (0.7 + 0.3 * sin(bp.y * 40.0)), strand * 0.75);
  }

  // caustics dancing on the bottom
  vec2 cp = bp * 5.0;
  float cau = 0.0;
  for (int i = 0; i < 3; i++) {
    cp = cp + vec2(sin(cp.y + T * 0.23), cos(cp.x - T * 0.19));
    cau += 1.0 / (1.0 + 30.0 * abs(sin(cp.x * 0.7) * sin(cp.y * 0.7)));
  }
  bed *= 0.7 + 1.3 * cau / 3.0;

  // water body: murky green attenuation, a pale sky on the surface
  vec3 col = mix(bed, vec3(0.06, 0.09, 0.07), 0.3);
  float fres = 0.5 + 0.5 * uv.y;
  col += vec3(0.08, 0.09, 0.08) * fres * 0.35;
  col += vec3(0.3, 0.32, 0.28) * smoothstep(0.004, 0.009, length(nrm)) * 0.08;

  // Zone grade: toward a green-sepia monochrome
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(col, lum * vec3(0.95, 1.0, 0.75), 0.4);
  col = 1.0 - exp(-col * 1.8);
  vec2 vq = gl_FragCoord.xy / u_resolution - 0.5;
  col *= 1.0 - 0.9 * dot(vq, vq);
  fragColor = vec4(col, 1.0);
}
