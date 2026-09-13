// Magic Eye — a valve radio's green tuning-eye tube narrows as the amber dial needle drifts onto stations (FragCoord GLSL)
// Theme: radio

// lattice hash with period 256, so noise driven by a wrapped clock stays seamless
float hash2(vec2 p) { p = mod(p, 256.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x),
             mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// station positions on the dial (-1..1)
const float ST[7] = float[7](-0.80, -0.52, -0.23, 0.04, 0.31, 0.57, 0.84);

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float px = 1.0 / u_resolution.y;
  float t = u_time;

  // needle wanders slowly over the band
  float nx = 0.88 * sin(t * 0.11 + 0.9 * sin(t * 0.037 + 1.3) + 2.2);
  float sig = 0.0;
  for (int i = 0; i < 7; i++) {
    float d = (nx - ST[i]) / 0.06;
    sig = max(sig, (0.65 + 0.35 * fract(float(i) * 0.618)) * exp(-d * d));
  }
  sig *= 0.7 + 0.3 * noise(vec2(mod(t * 0.7, 256.0), 3.0)); // gentle ionospheric fading

  vec3 green = vec3(0.30, 1.00, 0.45);
  vec3 amber = vec3(1.00, 0.55, 0.18);

  // ---------- walnut cabinet ----------
  float grain = noise(vec2(uv.x * 2.5 + noise(uv * 3.0) * 1.5, uv.y * 55.0 + noise(uv * 5.0) * 6.0));
  vec3 col = vec3(0.045, 0.026, 0.016) * (0.7 + 0.5 * grain);

  // ---------- tuning eye ----------
  vec2 E = vec2(0.0, 0.12);
  vec2 q = uv - E;
  float r = length(q);
  float a = atan(q.x, q.y); // 0 at the top
  float ang = abs(a);

  // glass window
  float glass = 1.0 - smoothstep(0.285 - px, 0.285 + px, r);
  col = mix(col, vec3(0.006, 0.012, 0.008), glass);

  // phosphor target
  float open = mix(1.05, 0.07, sig) + 0.1 * (noise(vec2(mod(t * 1.6, 256.0), 7.0)) - 0.5) * (0.4 + sig);
  float soft = 0.03 + 0.05 * (1.0 - smoothstep(0.08, 0.23, r));
  float lit = smoothstep(open - soft, open + soft, ang);
  float rim = exp(-pow((ang - open) / 0.05, 2.0)) * 0.7;
  float ann = smoothstep(0.072, 0.085, r) * (1.0 - smoothstep(0.228, 0.236, r));
  float radial = mix(0.25, 1.0, smoothstep(0.085, 0.232, r));
  float streak = 0.7 + 0.3 * noise(vec2(a * 45.0 + mod(t * 0.9, 256.0), r * 10.0 - mod(t * 0.5, 256.0)));
  float I = ann * radial * streak * (lit * 0.9 + rim + 0.05) * (0.88 + 0.12 * sin(t * 1.1));
  col += green * I * 0.9;
  // bloom inside the glass and onto the cabinet
  float halo = exp(-max(r - 0.232, 0.0) / 0.035) * smoothstep(0.07, 0.24, r);
  col += green * halo * 0.08 * (0.3 + 0.7 * lit);
  col += green * 0.035 * exp(-r * 4.0) * (1.0 - glass);

  // cathode cap
  float cap = 1.0 - smoothstep(0.070 - px, 0.070 + px, r);
  vec3 capc = vec3(0.03, 0.035, 0.03) + green * 0.05 * smoothstep(0.04, 0.07, r)
            + vec3(0.06) * exp(-length(q - vec2(-0.02, 0.025)) * 60.0);
  col = mix(col, capc, cap);

  // chrome bezel
  float bz = (r - 0.302) / 0.016;
  if (abs(bz) < 1.0) {
    float h = sqrt(1.0 - bz * bz);
    float key = 0.18 + 0.16 * cos(a + 0.9);
    vec3 bc = vec3(0.05) + vec3(key) * h * h
            + green * 0.12 * (1.0 - smoothstep(-1.0, 0.3, bz))
            + amber * 0.10 * (1.0 - smoothstep(-1.0, 0.2, cos(a))) * h;
    float bmask = 1.0 - smoothstep(0.85, 1.0, abs(bz));
    col = mix(col, bc, bmask);
  }
  // soft reflection on the glass
  col += vec3(0.8, 1.0, 0.9) * 0.03 * glass * exp(-pow(length(q - vec2(-0.09, 0.12)) / 0.07, 2.0));

  // ---------- backlit dial ----------
  vec2 D = uv - vec2(0.0, -0.31);
  float sd = sdBox(D, vec2(0.62, 0.075), 0.02);
  float inside = 1.0 - smoothstep(-px, px, sd);
  float frame = (1.0 - smoothstep(0.004, 0.004 + 2.0 * px, abs(sd - 0.004)));
  vec3 dial = amber * (0.28 + 0.12 * exp(-D.y * D.y * 300.0)) * (0.85 + 0.15 * noise(D * vec2(30.0, 60.0)));
  float xs = D.x / 0.58;                       // dial scale -1..1
  // ticks
  float tk = abs(fract(D.x / 0.029 + 0.5) - 0.5) * 0.029;
  float major = step(0.5, fract(floor(D.x / 0.029 + 0.5) / 5.0 + 0.1) < 0.2 ? 1.0 : 0.0);
  float tlen = mix(0.018, 0.034, major);
  float tick = (1.0 - smoothstep(0.0012, 0.0012 + px, tk)) * step(0.045 - tlen, D.y) * step(D.y, 0.05) * step(abs(xs), 1.0);
  dial *= 1.0 - 0.8 * tick;
  // tiny printed station names
  for (int i = 0; i < 7; i++) {
    vec2 s = D - vec2(ST[i] * 0.58, -0.035);
    if (abs(s.x) < 0.045 && abs(s.y) < 0.008) {
      float letter = step(0.35, hash2(vec2(floor(s.x * 180.0), float(i)))) * step(0.3, fract(s.x * 180.0));
      dial *= 1.0 - 0.6 * letter;
    }
  }
  // needle
  float nd = abs(D.x - nx * 0.58);
  vec3 ncol = vec3(1.0, 0.22, 0.08);
  dial = mix(dial, ncol * 1.1, 1.0 - smoothstep(0.0015, 0.0015 + px, nd));
  dial += ncol * 0.25 * exp(-nd / 0.006);
  // pointer-carriage lamp: a warm pool of light travelling with the needle
  dial += amber * 0.35 * exp(-nd * nd / 0.006);
  col = mix(col, dial, inside);
  col = mix(col, vec3(0.20, 0.13, 0.06), frame * 0.8);
  // dial light spilling on the cabinet
  col += amber * (0.10 + 0.12 * exp(-nd * nd / 0.02)) * exp(-max(sd, 0.0) / 0.05) * (1.0 - inside);

  col *= 1.0 - 0.45 * dot(uv * 0.75, uv * 0.75);
  col = 1.0 - exp(-col * 1.4);
  fragColor = vec4(col, 1.0);
}
