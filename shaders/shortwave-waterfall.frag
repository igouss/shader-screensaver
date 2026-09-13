// Shortwave Waterfall — an SDR spectrum and waterfall of the night shortwave band: morse, a number station, radar chirps (Shadertoy)
// Theme: radio

// All time-dependent features are periodic in tau with a period dividing 1024,
// so the clock can wrap without seams.
float hash(vec2 p) {
  p = mod(p, 256.0);
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float signal(float f, float tau) {
  // noise floor with slow ionospheric fading
  float s = 0.11 + 0.11 * noise(vec2(f * 180.0, tau * 2.0)) + 0.05 * noise(vec2(f * 420.0, tau * 4.0));
  s *= 0.75 + 0.5 * noise(vec2(f * 5.0, tau * 0.25));

  // carriers: some steady, some keyed as morse
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float fc = 0.05 + 0.9 * hash(vec2(fi, 7.0)) + 0.003 * sin(tau * 6.2831853 / 64.0 + fi);
    float bw = 0.0012 + 0.002 * hash(vec2(fi, 3.0));
    float key = 1.0;
    if (hash(vec2(fi, 11.0)) < 0.55) {
      float cell = floor(tau * 2.0);
      key = step(0.42, hash(vec2(fi * 13.0, cell)));
      key *= step(0.3, hash(vec2(fi * 5.0, floor(tau * 0.25))));
    }
    float amp = 0.30 + 0.45 * hash(vec2(fi, 5.0));
    float d = (f - fc) / bw;
    s += amp * key * exp(-d * d);
  }

  // number station: AM carrier with voice sidebands, on air in slots
  float fc = 0.385;
  float onAir = smoothstep(0.35, 0.45, noise(vec2(3.0, tau * 0.25)));
  float dv = (f - fc) / 0.011;
  float voice = noise(vec2(f * 900.0, tau * 4.0)) * noise(vec2(9.0, tau * 2.0));
  s += onAir * (0.55 * exp(-pow((f - fc) / 0.0012, 2.0)) + 0.5 * voice * exp(-dv * dv));

  // over-the-horizon radar chirp sweeping up the band
  float ch = f - fract(tau / 8.0) * 1.2 + 0.1;
  s += 0.28 * exp(-ch * ch / 0.00002) * step(0.1, fract(tau / 8.0));

  // broadcast band: a dense comb of stations
  float band = smoothstep(0.64, 0.66, f) * (1.0 - smoothstep(0.77, 0.79, f));
  float comb = pow(0.5 + 0.5 * cos(f * 6.2831853 / 0.0055), 24.0);
  s += band * (0.10 + comb * (0.25 + 0.35 * noise(vec2(f * 180.0, tau))));
  return s;
}

vec3 cmap(float m) {
  vec3 c = mix(vec3(0.004, 0.008, 0.025), vec3(0.02, 0.06, 0.22), smoothstep(0.05, 0.3, m));
  c = mix(c, vec3(0.05, 0.42, 0.55), smoothstep(0.28, 0.55, m));
  c = mix(c, vec3(0.95, 0.72, 0.28), smoothstep(0.5, 0.85, m));
  c = mix(c, vec3(1.0, 0.93, 0.8), smoothstep(0.9, 1.3, m));
  return c;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float px = 1.0 / iResolution.y;
  float margin = 0.03;
  float f = (fragCoord.x / iResolution.x - margin) / (1.0 - 2.0 * margin);
  float T = mod(iTime * 0.6, 1024.0);
  float fpx = 1.0 / (iResolution.x * (1.0 - 2.0 * margin));

  vec3 col = vec3(0.006, 0.008, 0.014);
  float inX = step(0.0, f) * step(f, 1.0);

  // tuning cursor drifting across the band
  float ft = 0.5 + 0.42 * sin(iTime * 0.031 + 1.0);
  float cur = abs(f - ft);

  const float wTop = 0.19, wBot = -0.46;
  if (uv.y < wTop && uv.y > wBot) {
    // waterfall: top row is now, older rows scroll down
    float tau = T - (wTop - uv.y) / (wTop - wBot) * 26.0;
    float m = signal(f, tau);
    col = cmap(m) * inX;
    col *= 0.75 + 0.25 * smoothstep(wBot, wBot + 0.2, uv.y);
    col += vec3(1.0, 0.25, 0.15) * 0.05 * (1.0 - smoothstep(0.008, 0.012, cur)) * inX;
  } else if (uv.y > wTop + 0.02 && uv.y < 0.46) {
    // live spectrum trace
    float base = wTop + 0.035;
    float s0 = signal(f, T);
    float s1 = signal(f + fpx, T);
    float y = base + s0 * 0.19;
    float g = (s1 - s0) * 0.19 / px;
    float d = (uv.y - y) / sqrt(1.0 + g * g);
    // grid
    float gx = abs(fract(f * 10.0 + 0.5) - 0.5) / (10.0 * fpx);
    float gy = abs(fract((uv.y - base) / 0.05 + 0.5) - 0.5) * 0.05 / px;
    float grid = (1.0 - smoothstep(0.0, 1.2, gx)) + (1.0 - smoothstep(0.0, 1.2, gy)) * step(base, uv.y);
    col += vec3(0.03, 0.05, 0.07) * min(grid, 1.0) * inX;
    // fill and line
    float under = step(uv.y, y) * step(base, uv.y);
    col += cmap(s0 * 0.8) * 0.35 * under * inX * (0.4 + 0.6 * (uv.y - base) / max(y - base, 1e-3));
    col += vec3(0.55, 0.9, 1.0) * (1.0 - smoothstep(0.0, 1.8 * px, abs(d))) * inX * step(base - 0.004, uv.y);
    col += vec3(0.2, 0.5, 0.7) * exp(-abs(d) / 0.006) * 0.25 * inX;
    // ticks under the trace
    float tk = abs(fract(f * 40.0 + 0.5) - 0.5) / (40.0 * fpx);
    col += vec3(0.25, 0.35, 0.4) * (1.0 - smoothstep(0.5, 1.5, tk)) * step(abs(uv.y - base + 0.01), 0.006) * inX;
    col += vec3(1.0, 0.25, 0.15) * 0.07 * (1.0 - smoothstep(0.008, 0.012, cur)) * inX;
  }
  // cursor centre line through both panels
  col += vec3(1.0, 0.3, 0.2) * 0.5 * (1.0 - smoothstep(0.0, 1.5 * fpx, cur)) * step(wBot, uv.y) * step(uv.y, 0.46) * inX;

  col *= 1.0 - 0.3 * dot(uv * 0.7, uv * 0.7);
  col = 1.0 - exp(-col * 1.25);
  fragColor = vec4(col, 1.0);
}
