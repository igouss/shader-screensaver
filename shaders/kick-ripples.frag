// Kick Ripples — slow 909 kicks send soft rings through a black pool, wobbling the concentric ring lights mirrored in it (Shadertoy)
// Theme: techno

// gradient of the ripple height field from one source that fires every `period` seconds
vec2 rippleGrad(vec2 p, vec2 src, float period, float offs, float amp) {
  vec2 dv = p - src;
  float r = length(dv) + 1e-4;
  float tt = mod(iTime + offs, period);
  float dh = 0.0;
  const float S2 = 0.025, K = 30.0;
  for (int i = 0; i < 4; i++) {
    float age = tt + float(i) * period;
    float x = r - 0.26 * age;
    float env = amp * exp(-age * 0.38) / sqrt(1.0 + r * 4.0) * smoothstep(0.0, 0.5, age);
    float g = exp(-x * x / S2);
    dh += env * g * (-K * sin(x * K) - 2.0 * x / S2 * cos(x * K));
  }
  return dh * dv / r;
}

// what the pool mirrors: concentric ring lights straight above (amber, cool white, red) and a dim ceiling wash
vec3 ceiling(vec2 c) {
  float rr = length(c);
  float r1 = rr - 2.3, r2 = rr - 1.05, r3 = rr - 4.1;
  vec3 l = vec3(0.75, 0.9, 1.0) * (exp(-r1 * r1 / 0.006) * 2.2 + exp(-r1 * r1 / 0.3) * 0.12);
  l += vec3(1.0, 0.55, 0.25) * exp(-r2 * r2 / 0.004) * 0.7;
  l += vec3(1.0, 0.08, 0.12) * (exp(-r3 * r3 / 0.01) * 0.9 + exp(-r3 * r3 / 0.5) * 0.06);
  l += vec3(0.04, 0.055, 0.08) * (0.6 + 0.4 * sin(c.x * 0.9 + 1.0) * sin(c.y * 0.8));
  return l;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // looking straight down at the pool from 2 units above
  const float H = 2.0, HC = 5.0;
  vec3 rd = normalize(vec3(uv, -1.3));
  vec2 p = rd.xy * (H / -rd.z);

  vec2 grad = rippleGrad(p, vec2(0.0), 2.4, 0.0, 0.006)                 // the kick
            + rippleGrad(p, vec2(0.62, -0.28), 3.6, 1.3, 0.0022);        // an off-beat drip, 3 against 2
  vec3 n = normalize(vec3(-grad, 1.0));
  vec3 rf = reflect(rd, n);
  vec3 env = ceiling(p + rf.xy * (HC / max(rf.z, 0.05)));

  float fres = 0.3 + 0.7 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  vec3 col = vec3(0.002, 0.003, 0.005) + env * fres;

  // faint caustic-like brightening on the crests
  col += vec3(0.02, 0.03, 0.04) * max(dot(n, normalize(vec3(-0.5, 0.4, 1.0))) - 0.985, 0.0) * 40.0;

  col *= 1.0 - 0.45 * dot(uv * 0.8, uv * 0.8);
  col = 1.0 - exp(-col * 1.6);
  fragColor = vec4(col, 1.0);
}
