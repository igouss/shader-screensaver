// Space Dance — EVE and Wall-E looping around each other through the stars, his extinguisher puffing a trail, a planet rim glowing below (Shadertoy)
// Theme: Wall-E

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec2 centre(float t) {
  return vec2(-0.08, 0.05) + vec2(0.3 * sin(0.13 * t), 0.12 * sin(0.19 * t + 1.0));
}

// their separation vector: a slow orbit in a tilted, precessing plane (z = toward viewer)
vec3 rel(float t) {
  float a = mod(0.68 * t, 6.2831853);
  float R = 0.25 + 0.06 * sin(0.23 * t);
  float tilt = 1.0 + 0.35 * sin(0.07 * t);
  vec3 v = R * vec3(cos(a), sin(a) * cos(tilt), sin(a) * sin(tilt));
  v.xy = rot(0.05 * t) * v.xy;
  return v;
}

float segDist(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

vec3 stars(vec2 uv, float t) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float sc = 16.0 + fl * 12.0;
    vec2 p = uv * sc + vec2(mod(t * 0.08 * (fl + 1.0), 256.0), fl * 17.3);
    vec2 id = floor(p);
    id.x = mod(id.x, 256.0);
    vec2 f = fract(p) - 0.5;
    float h = hash21(id + fl * 31.0);
    vec2 o = vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5;
    float d = length(f - o * 0.7);
    float b = pow(h, 9.0) * (0.75 + 0.25 * sin(t * 0.7 + h * 60.0));
    vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash21(id + 11.0));
    c += tint * b * exp(-d * d * (900.0 - fl * 200.0)) * 1.4;
  }
  return c;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float aspect = iResolution.x / iResolution.y;
  float px = 1.0 / iResolution.y;
  float t = iTime;

  // deep space with a faint milky band
  vec3 col = vec3(0.006, 0.008, 0.02);
  float band = exp(-pow(dot(uv, normalize(vec2(0.45, 1.0))) * 2.6 + 0.3, 2.0));
  col += vec3(0.035, 0.035, 0.07) * band;
  col += stars(uv, t) * (0.6 + 0.6 * band);

  // planet limb in the lower right, lit from the upper left
  vec2 pc = vec2(0.5 * aspect + 0.15, -1.55);
  float pr = 1.3;
  vec2 pq = uv - pc;
  float pd = length(pq) - pr;
  float lit = 0.5 + 0.5 * dot(normalize(pq), normalize(vec2(-0.8, 0.6)));
  float inside = smoothstep(px, -px, pd);
  col = mix(col, vec3(0.008, 0.012, 0.022) + vec3(0.02, 0.04, 0.07) * lit * exp(pd * 9.0), inside);
  col += vec3(0.25, 0.55, 1.0) * lit * (0.55 * exp(-abs(pd) * 70.0) + 0.14 * exp(-max(pd, 0.0) * 9.0));

  // the dance
  vec2 c0 = centre(t);
  vec3 r0 = rel(t);
  vec3 E = vec3(c0, 0.0) + r0 * 0.4;
  vec3 W = vec3(c0, 0.0) - r0 * 0.6;

  float trE = 0.0, puff = 0.0;
  if (length(uv - c0) < 0.75) {
    vec2 pe = E.xy, pw = W.xy;
    const int N = 40;
    for (int k = 1; k <= N; k++) {
      float tk = t - float(k) * 0.14;
      vec2 ck = centre(tk);
      vec3 rk = rel(tk);
      vec2 ne = ck + rk.xy * 0.4;
      vec2 nw = ck - rk.xy * 0.6;
      float age = (float(k) - 0.5) / float(N);
      float h;
      // EVE: a thin, cool ribbon of light
      float de = segDist(uv, pe, ne, h);
      float fe = (1.0 - age) * (1.0 - age);
      trE = max(trE, fe * (smoothstep(0.003 + px, 0.0, de) * 0.7 + 0.4 * exp(-de / 0.008)));
      // Wall-E: extinguisher puffs, billowing out as they age
      float dw = segDist(uv, pw, nw, h);
      float ag = (float(k) - 1.0 + h) / float(N);
      float w = 0.005 + 0.04 * ag;
      float burst = 0.65 + 0.35 * sin((tk + h * 0.1) * 5.0);
      puff = max(puff, pow(1.0 - ag, 1.1) * burst * exp(-dw * dw / (w * w)) * (0.004 / w + 0.4));
      pe = ne; pw = nw;
    }
  }
  col += vec3(0.6, 0.8, 1.0) * trE * 0.9;
  col += vec3(0.82, 0.82, 0.86) * puff * 0.95;

  // Wall-E: a small warm spark
  float sW = 1.3 + 2.0 * W.z;
  float dW = length(uv - W.xy);
  vec3 wallE = vec3(1.0, 0.78, 0.4) * (exp(-dW * dW / (0.000022 * sW * sW)) * 1.4 + 0.35 * exp(-dW / (0.02 * sW)));

  // EVE: a smooth white ovoid with a separate head and two blue eyes
  float sE = 1.45 + 1.8 * E.z;
  vec2 ve = centre(t + 0.05) + rel(t + 0.05).xy * 0.4 - E.xy;
  float lean = clamp(-ve.x * 25.0, -0.5, 0.5);
  vec2 q = rot(lean) * (uv - E.xy) / sE;
  vec2 bq = q - vec2(0.0, -0.006);
  bq.x /= 1.0 + 0.3 * clamp(bq.y / 0.03, -1.0, 1.0);        // egg: fuller at the shoulders
  float body = (length(bq / vec2(0.019, 0.03)) - 1.0) * 0.019;
  vec2 hq = q - vec2(0.0, 0.035);
  float head = (length(hq / vec2(0.017, 0.0115)) - 1.0) * 0.0115;
  float eve = min(body, head);
  float em = smoothstep(px / sE, -px / sE, eve);
  vec2 nq = bq / vec2(0.019, 0.03);
  float shade = 0.55 + 0.45 * dot(normalize(vec3(nq, sqrt(max(1.0 - dot(nq, nq), 0.0)))), normalize(vec3(-0.5, 0.6, 0.7)));
  vec2 hn = hq / vec2(0.017, 0.0115);
  float hshade = 0.55 + 0.45 * dot(normalize(vec3(hn, sqrt(max(1.0 - dot(hn, hn), 0.0)))), normalize(vec3(-0.5, 0.6, 0.7)));
  vec3 eveCol = vec3(0.86, 0.92, 1.0) * (head < body ? hshade : shade);
  float visor = smoothstep(0.001, -0.001, (length((hq - vec2(0.0, -0.001)) / vec2(0.012, 0.0072)) - 1.0) * 0.0072);
  eveCol = mix(eveCol, vec3(0.02, 0.025, 0.04), visor);
  vec2 eq = vec2(abs(hq.x) - 0.0055, hq.y + 0.0005);
  float eyes = exp(-dot(eq / vec2(0.0028, 0.0017), eq / vec2(0.0028, 0.0017)));
  eveCol += vec3(0.3, 0.65, 1.0) * eyes * 1.6 * visor;
  vec3 eveGlow = vec3(0.55, 0.75, 1.0) * 0.22 * exp(-max(eve, 0.0) / (0.018 * sE));

  // depth order: whoever is nearer is drawn over the other
  if (W.z < E.z) {
    col += wallE * (1.0 - em);
    col += eveGlow;
    col = mix(col, eveCol, em);
  } else {
    col += eveGlow;
    col = mix(col, eveCol, em);
    col += wallE;
  }

  col = 1.0 - exp(-col * 1.3);
  col *= 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
