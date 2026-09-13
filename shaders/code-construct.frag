// Code Construct — a wall of dot-matrix code in which a turning shape resolves, torus to cube to octahedron, lit only by glyph density (Shadertoy)
// Theme: The Matrix

float T;

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float shape(vec3 p) {
  p.xz *= rot(T * 0.23);
  p.xy *= rot(T * 0.17);
  float tor = length(vec2(length(p.xz) - 0.85, p.y)) - 0.36;
  vec3 q = abs(p) - vec3(0.72);
  float box = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.06;
  float oct = (abs(p.x) + abs(p.y) + abs(p.z) - 1.25) * 0.57735;
  float ph = mod(T / 14.0, 3.0);
  float a = smoothstep(0.7, 1.0, ph) - smoothstep(2.7, 3.0, ph);   // torus -> box ... back
  float b = smoothstep(1.7, 2.0, ph);                              // box -> octahedron
  float d = mix(tor, box, a);
  return mix(d, oct, b * a);
}

// shade the construct at a screen position: returns brightness 0..1 and hit mask
vec2 construct(vec2 uv) {
  vec3 ro = vec3(0.0, 0.0, -3.6);
  vec3 rd = normalize(vec3(uv, 1.6));
  float d = 0.0;
  for (int i = 0; i < 48; i++) {
    float h = shape(ro + rd * d);
    if (h < 0.002) {
      vec3 p = ro + rd * d;
      vec2 e = vec2(0.003, 0.0);
      vec3 n = normalize(vec3(shape(p + e.xyy) - shape(p - e.xyy),
                              shape(p + e.yxy) - shape(p - e.yxy),
                              shape(p + e.yyx) - shape(p - e.yyx)));
      float dif = max(dot(n, normalize(vec3(-0.5, 0.7, -0.6))), 0.0);
      float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);
      return vec2(clamp(0.06 + 0.85 * dif * dif + 0.6 * rim * rim, 0.0, 1.0), 1.0);
    }
    d += h;
    if (d > 6.0) break;
  }
  return vec2(0.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  T = mod(iTime, 4200.0);

  // glyph grid: 5x7 dots in a 6x8 cell
  float rows = 24.0;
  vec2 dotUV = uv * rows * 8.0;
  vec2 cellSize = vec2(6.0, 8.0);
  vec2 cid = floor(dotUV / cellSize);
  vec2 dcell = floor(mod(dotUV, cellSize));
  vec2 dfr = fract(dotUV) - 0.5;

  // sample the scene once per glyph cell
  vec2 cuv = (cid + 0.5) * cellSize / (rows * 8.0);
  vec2 sc = construct(cuv);
  float L = sc.x;

  // ambient code falling through the grid
  float hc = hash21(vec2(cid.x, 7.0));
  float fall = fract(cid.y * 0.021 + T * (0.05 + 0.08 * hc) + hc * 5.0);
  float rain = pow(fall, 8.0) * 0.4 + 0.03;

  float bright = sc.y > 0.5 ? 0.08 + 0.92 * L : rain;
  float density = sc.y > 0.5 ? 0.25 + 0.6 * L : 0.4;

  // the glyph mutates slowly
  float rate = 0.4 + 1.0 * hash21(cid + 3.0);
  float seed = floor(T * rate + hash21(cid) * 20.0);
  float on = 0.0;
  if (dcell.x < 5.0 && dcell.y < 7.0) {
    float bh = hash21(cid * 1.7 + dcell * vec2(13.1, 7.3) + seed * 0.37);
    // mirror symmetry makes the random bits read like characters
    vec2 md = vec2(min(dcell.x, 4.0 - dcell.x), dcell.y);
    bh = hash21(cid * 1.7 + md * vec2(13.1, 7.3) + seed * 0.37);
    on = step(bh, density);
  }
  float dotShape = smoothstep(0.5, 0.25, length(dfr));

  vec3 green = vec3(0.12, 1.0, 0.38);
  vec3 col = green * bright * on * dotShape;
  col += vec3(0.7, 1.0, 0.8) * smoothstep(0.8, 1.0, L) * on * dotShape * 0.6;
  // soft phosphor bloom from the construct
  col += green * 0.08 * L;

  col = 1.0 - exp(-col * 2.3);
  col *= 1.0 - 0.45 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
