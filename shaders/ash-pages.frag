// Ash Pages — pages of forbidden books lifting off the pyre on the heat, charring and burning away to ash through grey smoke (Shadertoy)
// Theme: Hard to Be a God

float hash1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// value noise whose lattice repeats every 64 cells in y, so upward scrolling can wrap
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, 64.0), y1 = mod(i.y + 1.0, 64.0);
  return mix(mix(hash2(vec2(i.x, y0)), hash2(vec2(i.x + 1.0, y0)), f.x),
             mix(hash2(vec2(i.x, y1)), hash2(vec2(i.x + 1.0, y1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.0 + vec2(13.7, 0.0);
    a *= 0.5;
  }
  return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime;
  vec3 ember = vec3(1.0, 0.42, 0.1);

  // grey smoke rolling upward, lit from the pyre below the frame
  float rise = mod(t * 0.12, 64.0);
  vec2 sp = vec2(uv.x * 1.7, uv.y * 1.3 - rise);
  float warp = fbm(vec2(sp.x * 0.8, sp.y) + vec2(0.0, mod(t * 0.04, 64.0)));
  float smoke = fbm(sp + vec2(warp * 1.6, warp));
  float below = exp(-max(uv.y + 0.55, 0.0) * 2.2);
  vec3 col = vec3(0.02) + vec3(0.9, 0.86, 0.82) * smoke * smoke * (0.14 + 0.5 * below);
  col += vec3(0.6, 0.22, 0.05) * 0.5 * exp(-max(uv.y + 0.5, 0.0) * 3.5) * (0.6 + 0.8 * smoke);

  // pages
  for (int i = 0; i < 11; i++) {
    float fi = float(i);
    float h1 = hash1(fi * 7.1 + 1.0), h2 = hash1(fi * 3.7 + 2.0), h3 = hash1(fi * 5.3 + 3.0);
    float ph = fract(t * 0.05 * (0.8 + 0.4 * h1) + h2);
    float size = 0.65 + 0.55 * h3;
    vec2 pos = vec2((h1 - 0.5) * 1.3 + 0.16 * sin(ph * 5.0 + fi) * ph, -0.72 + ph * 1.65);
    float ang = (h2 - 0.5) * 2.0 + ph * (h3 - 0.5) * 5.0;
    float flip = cos(ph * (3.0 + 2.0 * h1) * 3.1416 + fi);
    vec2 q = uv - pos;
    q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
    q.x /= max(abs(flip), 0.18);
    q.y += 1.6 * q.x * q.x * (0.4 + ph);      // the page curls as it dries
    vec2 sz = vec2(0.09, 0.12) * size;
    vec2 a = abs(q) - sz;
    float box = max(a.x, a.y);
    if (box < 0.0) {
      vec2 lp = q / sz;
      // burn front eats the page from the bottom edge upward
      float v = 0.45 * (lp.y * 0.5 + 0.5) + 0.55 * fbm(lp * 2.2 + fi * 13.0);
      float e = v - (ph * 1.55 - 0.4);
      if (e > -0.012) {
        float paper = 0.5 * (0.8 + 0.2 * noise(lp * 9.0 + fi));
        // lines of script on both sides of the leaf
        float rowy = lp.y * 7.0;
        float word = step(0.38, noise(vec2(lp.x * 5.0 + floor(rowy) * 7.3, floor(rowy))));
        float ink = smoothstep(0.2, 0.08, abs(fract(rowy) - 0.5)) * word
                  * step(abs(lp.x), 0.72) * step(abs(lp.y), 0.8);
        paper *= 1.0 - 0.55 * ink * (flip > 0.0 ? 1.0 : 0.45);
        float lit = (0.35 + 0.65 * abs(flip)) * (0.45 + 0.9 * exp(-(pos.y + 0.7) * 1.4));
        vec3 pc = vec3(0.95, 0.9, 0.82) * paper * lit;
        float charred = smoothstep(0.0, 0.14, e);
        pc = mix(vec3(0.02, 0.012, 0.008), pc, charred);
        pc += ember * 2.2 * exp(-max(e, 0.0) * 70.0) * smoothstep(-0.012, 0.0, e);
        float alpha = smoothstep(0.0, -0.006, box) * smoothstep(-0.012, -0.002, e);
        col = mix(col, pc, alpha);
      }
    }
  }

  // sparks carried up with the smoke
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float s = 7.0 + fk * 6.0;
    vec2 g = vec2(uv.x * s + 0.4 * sin(uv.y * 3.0 + fk * 2.0 + mod(t * 0.3, 6.2832)),
                  uv.y * s - mod(t * (0.8 - 0.25 * fk) * s * 0.1, 64.0));
    vec2 id = floor(g);
    id.y = mod(id.y, 64.0);  // keep spark ids periodic with the scroll
    vec2 f = fract(g) - 0.5;
    float h = hash2(id + fk * 17.0);
    if (h > 0.55) {
      vec2 o = vec2(hash2(id + 3.1), hash2(id + 7.7)) - 0.5;
      float d = length(f - o * 0.7);
      float tw = 0.6 + 0.4 * sin(mod(t * 2.0, 6.2832) + h * 60.0);
      col += ember * (1.2 - 0.5 * fk) * tw * exp(-d * d * 900.0 / (1.0 + fk)) * smoothstep(0.55, -0.4, uv.y);
    }
  }

  col = 1.0 - exp(-col * 1.4);
  col *= 1.0 - 0.5 * dot(uv, uv);
  fragColor = vec4(pow(col, vec3(0.95)), 1.0);
}
