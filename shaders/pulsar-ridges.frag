// Pulsar Ridges — stacked radio-pulse profiles of a pulsar recede into the dark, Unknown Pleasures style (FragCoord GLSL)
// Theme: radio

float h11(float n) { return fract(sin(n * 127.1 + 11.3) * 43758.5453); }

float vnoise(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(h11(i), h11(i + 1.0), f) - 0.5;
}

// Height of pulse number k at horizontal position x (the plot spans about -0.34..0.34)
float profile(float x, float k) {
  float env = exp(-x * x * 24.0);
  float h = 0.0;
  for (int j = 0; j < 4; j++) {
    float fj = float(j);
    float pos = (h11(k * 3.17 + fj * 17.3) - 0.5) * 0.2;
    float w = 0.012 + 0.026 * h11(k * 5.71 + fj * 9.13);
    float a = 0.25 + 0.75 * h11(k * 1.37 + fj * 4.91);
    a *= 0.8 + 0.2 * sin(u_time * 0.35 + k * 1.9 + fj * 2.3);
    float d = (x - pos) / w;
    h += a * exp(-d * d);
  }
  float n = vnoise(x * 70.0 + k * 13.7) + 0.5 * vnoise(x * 160.0 - k * 7.3);
  return env * (h * 0.068 + n * 0.012 + 0.004) + n * 0.0022;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float px = 1.0 / u_resolution.y;
  const float N = 46.0;      // ridges on screen
  const float y0 = -0.40;    // front baseline
  const float sp = 0.74 / N; // spacing between ridges
  const float maxH = 0.13;   // tallest possible ridge
  const float halfW = 0.34;

  // ridges scroll slowly upward: a new pulse arrives at the front every 5 s
  float s = u_time * 0.2;
  float fs = fract(s);
  float is = floor(s);

  float rr = length(uv * vec2(0.75, 1.0));
  vec3 col = vec3(0.010, 0.012, 0.020) + vec3(0.020, 0.024, 0.040) * exp(-rr * rr * 5.0);

  float xmask = 1.0 - smoothstep(halfW - px, halfW + px, abs(uv.x));
  float lw = max(0.0011, 0.7 * px);

  if (xmask > 0.0) {
    // front-most ridge that could reach this pixel; walk backwards until one hides the rest
    float i0 = max(0.0, floor((uv.y - maxH - y0) / sp - fs));
    for (int n = 0; n < 12; n++) {
      float i = i0 + float(n);
      if (i > N) break;
      float yb = y0 + (i + fs) * sp;
      if (yb - 0.02 > uv.y) break;
      float k = mod(i - is, 512.0);
      float age = i + fs;
      float fade = smoothstep(0.0, 3.0, age) * (1.0 - smoothstep(N - 5.0, N, age));
      float c  = yb + fade * profile(uv.x, k);
      float c2 = yb + fade * profile(uv.x + px, k);
      float g = (c2 - c) / px;
      float d = (uv.y - c) / sqrt(1.0 + g * g);
      float depth = age / N;
      vec3 lc = mix(vec3(0.96, 0.92, 0.84), vec3(0.50, 0.60, 0.85), depth * depth);
      float stroke = (1.0 - smoothstep(lw - 0.5 * px, lw + px, abs(d))) * fade * xmask;
      float glow = exp(-abs(d) / 0.005) * 0.10 * fade * xmask;
      col = max(col, lc * stroke) + lc * glow * (1.0 - stroke);
      if (d < 0.0) break; // this ridge's black fill hides everything behind it
    }
  }

  col *= 1.0 - 0.35 * dot(uv * 0.7, uv * 0.7);
  col = 1.0 - exp(-col * 1.3);
  fragColor = vec4(col, 1.0);
}
