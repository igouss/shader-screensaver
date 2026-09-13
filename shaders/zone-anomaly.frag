// Zone Anomaly — a meadow of leaning telegraph poles and a far power plant, bent around an invisible anomaly that swallows a thrown nut (FragCoord GLSL)
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

const float HZ = 0.04;   // horizon
const float HC = 0.08;   // eye height

vec3 scene(vec2 p, float T) {
  float px = 1.5 / 360.0;
  // overcast sky
  vec3 col = mix(vec3(0.34, 0.35, 0.30), vec3(0.12, 0.14, 0.12), smoothstep(HZ, 0.55, p.y));
  col *= 0.8 + 0.35 * fbm(vec2(p.x * 1.2 + T * 0.008, p.y * 3.5));

  // the power plant, grey in the mist
  vec2 q = p - vec2(0.52, HZ);
  float ct = 0.045 * sqrt(1.0 + pow((q.y - 0.1) / 0.05, 2.0));
  float plant = step(abs(q.x), ct) * step(0.0, q.y) * step(q.y, 0.13);
  q.x += 0.12;
  plant = max(plant, step(abs(q.x), 0.0045) * step(q.y, 0.24) * step(0.0, q.y));
  float band = step(0.5, fract(q.y * 40.0)) * step(0.18, q.y);
  q.x -= 0.2;
  plant = max(plant, step(abs(q.x + 0.1), 0.09) * step(q.y, 0.045 + 0.02 * step(q.x + 0.1, 0.0)) * step(0.0, q.y));
  col = mix(col, vec3(0.2, 0.21, 0.19) - 0.03 * band, plant * 0.85);

  // treeline
  float tl = HZ + 0.012 + 0.025 * fbm(vec2(p.x * 9.0, 1.0)) + 0.01 * n2(vec2(p.x * 60.0, 3.0));
  col = mix(col, vec3(0.09, 0.1, 0.08), smoothstep(tl + 0.002, tl - 0.002, p.y));

  // meadow
  if (p.y < HZ) {
    float z = HC / (HZ - p.y);
    vec2 w = vec2(p.x * z, z);
    float g = fbm(w * vec2(3.0, 1.5));
    vec3 gr = mix(vec3(0.12, 0.13, 0.07), vec3(0.24, 0.24, 0.13), g);
    float blades = n2(vec2(p.x * 260.0 + 3.0 * sin(p.y * 30.0 + T * 0.4), p.y * 25.0));
    gr *= 0.7 + 0.5 * blades * smoothstep(3.0, 0.5, z);
    // muddy track with puddles of sky
    float tr = abs(w.x - 0.06 - 0.03 * sin(z * 1.3));
    float track = smoothstep(0.022, 0.012, tr) * 0.8;
    vec3 mud = vec3(0.1, 0.09, 0.065) * (0.7 + 0.5 * n2(w * 20.0));
    float pud = smoothstep(0.55, 0.62, fbm(w * vec2(6.0, 2.0) + 3.0)) * track;
    mud = mix(mud, vec3(0.24, 0.25, 0.22), pud * 0.8);
    gr = mix(gr, mud, track);
    col = mix(gr, vec3(0.28, 0.29, 0.25), smoothstep(1.5, 6.0, z) * 0.55);
  }

  // telegraph poles along the track, leaning, wires sagging between them
  vec2 prevTop = vec2(0.0);
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float z = 0.35 + fk * 0.55;
    float X = 0.2;
    float base = HZ - HC / z;
    float top = HZ + (0.22 - HC) / z;
    float lean = 0.18 * (h21(vec2(fk, 2.0)) - 0.5);
    float xb = X / z;
    float xp = xb + lean * (p.y - base);
    float wd = 0.006 / z + px * 0.3;
    float pole = step(abs(p.x - xp), wd) * step(base, p.y) * step(p.y, top);
    // crossbar
    float xt = xb + lean * (top - base);
    pole = max(pole, step(abs(p.x - xt), 0.04 / z) * step(abs(p.y - top + 0.012 / z), 0.0025 / z + px * 0.3));
    col = mix(col, vec3(0.06, 0.055, 0.045), pole * (1.0 - smoothstep(1.0, 4.5, z) * 0.6));
    vec2 tp = vec2(xt, top - 0.012 / z);
    if (k > 0) {
      for (int s = -1; s <= 1; s += 2) {
        vec2 a = prevTop + vec2(float(s) * 0.035 / (z - 0.55), 0.0);
        vec2 b = tp + vec2(float(s) * 0.035 / z, 0.0);
        float u = clamp((p.x - a.x) / (b.x - a.x), 0.0, 1.0);
        float y = mix(a.y, b.y, u) - 0.05 / z * 4.0 * u * (1.0 - u);
        float inx = step(min(a.x, b.x), p.x) * step(p.x, max(a.x, b.x));
        col = mix(col, vec3(0.07, 0.07, 0.06), smoothstep(px, 0.0, abs(p.y - y)) * inx * 0.8);
      }
    }
    prevTop = tp;
  }
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float T = mod(u_time, 3600.0);

  // the anomaly: space pinched and twisted around a point in the grass
  vec2 C = vec2(-0.08, -0.12);
  float R = 0.15;
  vec2 dv = uv - C;
  float r = length(dv);
  float fall = exp(-pow(r / R, 2.0));
  float breathe = 0.45 + 0.12 * sin(T * 0.23);
  float sw = fall * (0.8 * sin(T * 0.11) + 0.6);
  float cs = cos(sw), sn = sin(sw);
  vec2 wv = mat2(cs, -sn, sn, cs) * dv * (1.0 - breathe * fall);
  wv += 0.0025 * fall * vec2(sin(uv.y * 90.0 + T * 1.7), cos(uv.x * 80.0 - T * 1.5));   // heat shimmer
  vec3 col = scene(C + wv, T);
  // faint glassy rim
  float rim = exp(-pow((r - R * 0.9) * 28.0, 2.0));
  col += vec3(0.16, 0.17, 0.13) * rim * (0.5 + 0.4 * sin(atan(dv.y, dv.x) * 3.0 + T * 0.3));
  col *= 1.0 + 0.25 * fall * (0.6 + 0.4 * sin(r * 60.0 - T * 0.8));   // the air thickens into lensing ripples

  // dust and seeds slowly spiralling around it
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float ang = T * (0.2 + 0.05 * fi) + fi * 2.4;
    float rr = R * (0.5 + 0.6 * fract(fi * 0.618 + T * 0.01));
    vec2 pp = C + rr * vec2(cos(ang), 0.55 * sin(ang));
    col += vec3(0.5, 0.48, 0.38) * smoothstep(0.004, 0.0, length(uv - pp)) * 0.5;
  }

  // a nut tied with a strip of bandage is thrown, and swallowed
  float cyc = 13.0;
  float ph = mod(T, cyc);
  if (ph < 4.5) {
    for (int j = 0; j < 12; j++) {
      float tj = ph - float(j) * 0.035;
      if (tj < 0.0) break;
      vec2 np;
      if (tj < 2.6) {
        float s = tj / 2.6;
        np = mix(vec2(-0.75, -0.48), C + vec2(0.1, 0.02), s) + vec2(0.0, 0.33 * s * (1.0 - s));
      } else {
        float v = clamp((tj - 2.6) / 1.9, 0.0, 1.0);
        float a0 = atan(0.02, 0.1);
        float rr = length(vec2(0.1, 0.02)) * (1.0 - v);
        np = C + rr * vec2(cos(a0 + v * 9.0), 0.55 * sin(a0 + v * 9.0));
      }
      float fade = (1.0 - float(j) / 12.0) * (1.0 - smoothstep(3.8, 4.5, ph));
      float d = length(uv - np);
      if (j == 0) col = mix(col, vec3(0.05, 0.05, 0.045), smoothstep(0.006, 0.003, d) * fade);
      else col = mix(col, vec3(0.62, 0.6, 0.52), smoothstep(0.004, 0.0015, d) * fade * 0.8);
    }
  }

  // Zone grade: muted green-sepia
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(col, lum * vec3(0.95, 1.0, 0.78), 0.45);
  col = 1.0 - exp(-col * 1.5);
  vec2 vq = gl_FragCoord.xy / u_resolution - 0.5;
  col *= 1.0 - 0.9 * dot(vq, vq);
  fragColor = vec4(col, 1.0);
}
