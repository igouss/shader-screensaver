// Sixteen Steps — an after-hours 16-step drum sequencer glowing on a dark floor as the playhead crawls across it (FragCoord GLSL)
// Theme: techno

const float ROWS = 8.0;
const float STEP = 0.55; // seconds per step: a slow, hypnotic 16-step loop

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float pattern(float row, float col, float seg) {
  if (row < 0.5) return mod(col, 4.0) < 0.5 ? 1.0 : 0.0;                        // kick
  if (row < 1.5) return abs(mod(col, 8.0) - 4.0) < 0.5 ? 1.0 : 0.0;             // clap
  if (row < 2.5) return abs(mod(col, 4.0) - 2.0) < 0.5 ? 1.0 : 0.0;             // open hat
  float dens = 0.18 + 0.3 * fract(row * 0.618);
  return hash(vec3(row, col, seg)) < dens ? 1.0 : 0.0;                          // perc, rim, bass
}

vec3 rowColor(float row) {
  return 0.5 + 0.5 * cos(6.2831 * (row / ROWS * 0.5 + vec3(0.02, 0.12, 0.25)) + 0.2);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;

  vec3 ro = vec3(0.0, 14.0, -3.0);
  vec3 ta = vec3(0.0, 0.0, 4.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0, 1, 0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.45 * fw);

  vec3 col = vec3(0.004, 0.004, 0.006);
  float tp = -ro.y / rd.y;
  vec3 p = ro + rd * tp;
  vec2 g = vec2(p.x + 8.0, p.z);        // grid coords: 16 columns x ROWS rows
  vec2 fwg = fwidth(g);
  float aa = max(fwg.x, fwg.y);

  float ph = mod(t / STEP, 16.0);        // playhead position in steps
  float loopT = t / (STEP * 16.0);
  float seg = mod(floor(loopT / 4.0), 97.0);
  float xf = smoothstep(0.75, 1.0, fract(loopT / 4.0)); // patterns morph over the last loop of four

  if (rd.y < 0.0) {
    float fog = exp(-tp * 0.03);
    // brushed dark panel
    vec3 floorc = vec3(0.012, 0.012, 0.014) * (0.85 + 0.15 * sin(g.x * 90.0 + sin(g.y * 7.0)));
    col = floorc;

    vec2 cell = floor(g);
    vec2 q = fract(g) - 0.5;
    float inGrid = step(0.0, g.x) * step(g.x, 16.0) * step(0.0, g.y) * step(g.y, ROWS);
    float sd = length(max(abs(q) - 0.29, 0.0)) - 0.1;
    float act = mix(pattern(cell.y, cell.x, seg), pattern(cell.y, cell.x, mod(seg + 1.0, 97.0)), xf);
    float age = mod(ph - cell.x, 16.0) * STEP;                 // seconds since the playhead hit this column
    float hit = (1.0 - exp(-age * 12.0)) * exp(-age * 0.6);
    vec3 rc = rowColor(cell.y);

    float pad = (1.0 - smoothstep(-aa, aa, sd)) * inGrid;
    float inner = exp(-dot(q, q) * 6.0);
    vec3 padc = vec3(0.025, 0.024, 0.026) + rc * act * (0.22 + 1.5 * hit * inner);
    padc += vec3(0.05) * (1.0 - smoothstep(0.0, 2.0 * aa, abs(sd + 0.02))) * (0.3 + 0.7 * act);
    col = mix(col, padc, pad);
    // light spilling onto the panel from lit pads
    col += rc * act * inGrid * exp(-max(sd, 0.0) * 9.0) * (1.0 - pad) * (0.03 + 0.45 * hit);

    // soft playhead wash
    float pw = g.x - ph - 0.5;
    pw = pw - 16.0 * floor(pw / 16.0 + 0.5);
    col += vec3(1.0, 0.55, 0.3) * 0.06 * exp(-pw * pw * 1.2) * step(-0.2, g.y) * step(g.y, ROWS + 0.2) * step(0.0, g.x) * step(g.x, 16.0);

    // step LEDs along the front edge
    vec2 lq = vec2(fract(g.x) - 0.5, g.y + 0.55);
    float led = length(lq * vec2(1.0, 1.0)) - 0.07;
    float beat = mod(cell.x, 4.0) < 0.5 ? 1.0 : 0.0;
    float on = (1.0 - exp(-age * 18.0)) * exp(-age * 3.0);
    vec3 ledc = vec3(1.0, 0.12, 0.05) * (0.04 + 0.03 * beat + 1.4 * on);
    float ledIn = step(0.0, g.x) * step(g.x, 16.0);
    col = mix(col, ledc, (1.0 - smoothstep(-aa, aa, led)) * ledIn);
    col += vec3(1.0, 0.15, 0.05) * on * 0.12 * exp(-max(led, 0.0) * 14.0) * ledIn;

    col *= fog;
  }
  // faint haze above the grid
  col += vec3(0.05, 0.025, 0.02) * exp(-abs(uv.y - 0.33) * 5.0) * 0.25;

  col *= 1.0 - 0.35 * dot(uv * 0.8, uv * 0.8);
  col = 1.0 - exp(-col * 2.5);
  fragColor = vec4(col, 1.0);
}
