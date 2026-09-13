// Candle Vigil — one candle in a dark room, its teardrop flame swaying in a draught above softly glowing wax (FragCoord GLSL)
// Theme: flame

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 uv0 = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = mod(u_time, 3600.0);
  // slow drifting viewpoint: the candle slides a little, the far candles slide more (parallax)
  vec2 cam = vec2(0.06 * sin(t * 0.11), 0.015 * sin(t * 0.08 + 1.0));
  vec2 uv = uv0 + cam;
  float px = 1.0 / u_resolution.y;

  // slow draught: sway and a gentle breathing of the flame height (no fast flicker)
  float sway = 0.6 * sin(t * 0.61) + 0.3 * sin(t * 1.13 + 1.3) + 0.3 * (vnoise(vec2(t * 0.8, 3.0)) - 0.5);
  float grow = 1.0 + 0.07 * sin(t * 0.9) + 0.04 * sin(t * 1.7 + 2.0);

  vec2 wick = vec2(0.0, -0.03);
  float H = 0.25 * grow;
  float fy = (uv.y - wick.y) / H;                  // 0 at the wick, 1 at the tip
  float bend = sway * 0.06 * fy * fy;
  float fx = uv.x - wick.x - bend;
  float w = 0.066 * pow(clamp(fy + 0.06, 0.0, 1.2), 0.5) * pow(clamp(1.0 - fy, 0.0, 1.0), 1.1);
  float s = abs(fx) / max(w, 1e-4);                // 0 on the axis, 1 at the flame edge

  // ---- room: warm dark wall and a table the candle stands on
  vec2 lc = vec2(sway * 0.09, 0.08);                 // light centre follows the leaning flame
  float breath = 0.8 + 0.2 * sin(t * 0.43) * sin(t * 0.17 + 1.0);
  float light = (0.08 / (dot(uv - lc, uv - lc) * 2.5 + 0.08)) * breath;
  // plaster wall with faint mottling
  float plaster = vnoise(uv * 6.0) * 0.6 + vnoise(uv * 25.0) * 0.4;
  vec3 col = vec3(0.075, 0.045, 0.028) * light * (0.8 + 0.35 * plaster);
  // two more candles far behind, out of focus, swaying on their own
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 bc = vec2(fi < 0.5 ? -0.55 : 0.62, fi < 0.5 ? 0.02 : 0.1) + cam * 3.0;
    bc.x += 0.006 * sin(t * (0.5 + 0.2 * fi) + fi * 2.0);
    vec2 bd = (uv - bc) * vec2(1.0, 0.7);
    float bk = smoothstep(0.075, 0.06, length(bd)) * (0.8 + 0.2 * smoothstep(0.03, 0.075, length(bd)));
    col += vec3(1.0, 0.55, 0.22) * (bk * 0.11 + 0.02 / (dot(bd, bd) * 40.0 + 0.4)) * (0.7 + 0.3 * sin(t * 0.7 + fi * 3.0));
    vec2 bw = uv - bc - vec2(0.0, -0.12);
    col += vec3(0.3, 0.22, 0.15) * 0.05 * smoothstep(0.06, 0.04, abs(bw.x)) * smoothstep(0.05, -0.02, bw.y) * smoothstep(-0.3, -0.2, bw.y);
  }
  float tableY = -0.36;
  if (uv.y < tableY) {
    float grain = vnoise(vec2(uv.x * 3.0, uv.y * 80.0)) * 0.5 + vnoise(vec2(uv.x * 12.0, uv.y * 250.0)) * 0.5;
    vec3 wood = vec3(0.07, 0.035, 0.018) * (0.7 + 0.5 * grain);
    // glossy reflection pool of the flame on the table
    float refl = exp(-pow(uv.x * 7.0, 2.0)) * exp(-(tableY - uv.y) * 7.0);
    col = wood * light * 1.1 + vec3(1.0, 0.6, 0.25) * refl * 0.16;
  }

  // ---- candle body: ivory wax cylinder, lit from above, glowing through near the top
  float cw = 0.085, top = -0.07;
  float rim = top + 0.008 * (1.0 - pow(uv.x / cw, 2.0));        // soft cupped top
  float body = max(abs(uv.x) - cw, max(uv.y - rim, tableY - uv.y));
  // one wax drip down the front
  vec2 dp = uv - vec2(0.042, top - 0.035);
  float drip = length(vec2(dp.x, max(dp.y, 0.0) * 0.25 + min(dp.y, 0.0))) - 0.012;
  body = min(body, max(drip, uv.y - top));
  if (body < px) {
    float cyl = sqrt(max(1.0 - pow(uv.x / cw, 2.0), 0.0));
    float sss = exp(-(top - uv.y) * 9.0);                        // light soaking into the wax
    vec3 wax = vec3(0.5, 0.42, 0.32) * (0.25 + 0.55 * cyl) * light * 0.35
             + vec3(1.0, 0.55, 0.2) * sss * 0.35 * (0.6 + 0.4 * cyl);
    wax *= 0.92 + 0.08 * vnoise(uv * vec2(40.0, 8.0));
    col = mix(col, wax, smoothstep(px, -px, body));
  }
  // the pool of molten wax on top catches a hot glint
  col += vec3(1.0, 0.7, 0.35) * 0.25 * exp(-pow(uv.x * 14.0, 2.0) - pow((uv.y - top) * 120.0, 2.0));

  // ---- wick: dark curl with a glowing tip
  float wk = abs(uv.x - 0.006 * (uv.y - top) / 0.03 - 0.0) - 0.0035;
  float wickMask = smoothstep(px, -px, max(wk, max(top - uv.y, uv.y - wick.y - 0.012)));
  col = mix(col, vec3(0.02, 0.012, 0.01), wickMask);
  col += vec3(1.0, 0.35, 0.08) * 0.8 * exp(-dot(uv - wick - vec2(0.0, 0.01), uv - wick - vec2(0.0, 0.01)) * 9000.0);

  // ---- flame
  float inside = smoothstep(1.0, 0.55, s) * smoothstep(-0.02, 0.06, fy) * smoothstep(1.02, 0.8, fy);
  // colour zones: blue skirt at the root, a darker inner cone, a bright yellow-white body, orange tip
  vec3 fc = mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.95, 0.8), smoothstep(0.7, 0.1, s));
  fc = mix(fc, vec3(1.0, 0.55, 0.15), smoothstep(0.55, 1.0, fy) * 0.8);
  float cone = smoothstep(0.45, 0.1, s) * smoothstep(0.35, 0.05, fy);
  fc *= 1.0 - 0.45 * cone;
  float skirt = smoothstep(0.25, 0.0, fy) * smoothstep(0.2, 0.9, s);
  vec3 flame = fc * inside * (1.0 - skirt * 0.7);
  flame += vec3(0.15, 0.3, 1.0) * skirt * smoothstep(1.3, 0.6, s) * smoothstep(-0.03, 0.04, fy) * 0.7;
  // subtle upward-drifting shimmer inside the flame
  flame *= 0.9 + 0.1 * vnoise(vec2(fx * 60.0, fy * 6.0 - t * 1.2));
  col = col * (1.0 - inside * 0.8) + flame * 0.95;

  // halo: soft warm glow around the flame
  vec2 hc = vec2(uv.x - bend * 0.7, (uv.y - wick.y - H * 0.4) * 0.65);
  col += vec3(1.0, 0.55, 0.2) * 0.015 / (dot(hc, hc) + 0.015) * 0.4;

  // dust motes drifting through the candlelight
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 mp = uv * (9.0 + fk * 6.0) + vec2(t * 0.04 * (1.0 + fk), -t * 0.06 * (1.0 + fk * 0.5)) + fk * 5.3;
    mp.x += 0.3 * sin(mp.y * 0.8 + t * 0.2);
    vec2 id = floor(mp), f = fract(mp) - 0.5;
    float h = hash(id + fk * 17.0);
    vec2 o = (vec2(hash(id + 3.0), hash(id + 9.0)) - 0.5) * 0.7;
    float d = length(f - o);
    col += vec3(1.0, 0.75, 0.45) * step(0.7, h) * smoothstep(0.1, 0.0, d) * light * 0.5 * (1.0 - fk * 0.4);
  }

  // faint smoke thread rising above the tip
  float sy = uv.y - (wick.y + H);
  if (sy > 0.0) {
    float sx = uv.x - bend - 0.02 * sin(sy * 12.0 - t * 0.7) * sy * 3.0;
    col += vec3(0.08, 0.07, 0.065) * exp(-sx * sx * 3000.0 / (1.0 + sy * 8.0)) * exp(-sy * 5.0) * 0.5;
  }

  col *= 1.0 - 0.5 * pow(length(uv0 * vec2(0.7, 1.0)), 2.0);
  col = 1.0 - exp(-col * 1.5);
  fragColor = vec4(col, 1.0);
}
