// Fourteen Lines — a sonnet as light: fourteen ink-ribbons swelling in iambic da-DUM beats, tinted by rhyme ABAB CDCD EFEF GG (FragCoord GLSL)
// Theme: Sonnet

// rhyme group of line i: ABAB CDCD EFEF GG
int rhyme(int i) { return i >= 12 ? 6 : 2 * (i / 4) + (i % 2); }

vec3 rhymeHue(int r) {
  if (r == 0) return vec3(1.0, 0.93, 0.80);   // A ivory
  if (r == 1) return vec3(0.55, 0.58, 1.0);   // B indigo
  if (r == 2) return vec3(1.0, 0.74, 0.34);   // C gold
  if (r == 3) return vec3(0.52, 0.78, 0.95);  // D moonlit blue
  if (r == 4) return vec3(1.0, 0.70, 0.66);   // E rose
  if (r == 5) return vec3(0.74, 0.56, 1.0);   // F violet
  return vec3(1.0, 0.86, 0.55);               // G couplet gold
}

float hash(float n) { return fract(sin(n * 78.233) * 43758.5453); }

float lineY(int i) {
  float fi = float(i);
  float stanza = float(min(i / 4, 3));
  return 0.385 - fi * 0.05 - stanza * 0.028;
}

// five soft da-DUM swells across ten syllables; s in syllable units
float swell(float s) {
  float y = 0.0;
  for (int k = 0; k < 10; k++) {
    float a = (k % 2 == 1) ? 1.0 : 0.28;
    float g = s - float(k) - 0.5;
    y += a * exp(-g * g * 5.5);
  }
  return y;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float sc = min(1.0, (u_resolution.x / u_resolution.y) / 1.6);
  uv /= sc;
  float px = 1.0 / (u_resolution.y * sc);
  float t = u_time;
  float T = mod(t * 0.38, 6.2831853);   // the breath

  // midnight ground with a faint indigo hush behind the verse
  vec3 col = vec3(0.008, 0.01, 0.026);
  col += vec3(0.03, 0.028, 0.07) * exp(-dot(uv * vec2(0.9, 1.4), uv * vec2(0.9, 1.4)) * 2.2);

  float xm = 0.64;   // right margin where each line's rhyme sounds

  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float yi = lineY(i);
    if (abs(uv.y - yi) > 0.07) continue;
    bool couplet = i >= 12;
    vec3 hue = rhymeHue(rhyme(i));
    float gain = couplet ? 1.35 : 1.0;

    float x0 = -0.70 + (couplet ? 0.08 : 0.0);
    float x1 = 0.50 + 0.08 * hash(fi + 3.0) - (couplet ? 0.03 : 0.0);
    float L = x1 - x0;
    float s = (uv.x - x0) / L * 10.0;

    // brush envelope: soft onset, tapered end
    float env = smoothstep(-0.25, 0.35, s) * (1.0 - smoothstep(9.3, 10.1, s));

    // the breath travels through the poem syllable by syllable
    float glob = fi * 10.0 + s;
    float br = 0.5 + 0.5 * sin(T - glob * 0.3);
    float br2 = 0.5 + 0.5 * sin(T - (glob + 0.5) * 0.3);
    float sw = swell(s) * (0.35 + 0.65 * br);
    float sw2 = swell(s + 0.08) * (0.35 + 0.65 * br2);
    float y = yi + 0.023 * sw * env;
    float slope = (0.023 * (sw2 - sw) * env) / (0.08 * L / 10.0);
    float d = abs(uv.y - y) / sqrt(1.0 + slope * slope);

    // ribbon: an inked core that thickens on the stressed beats, plus a faint underside
    float w = (0.0011 + 0.0024 * sw) * env;
    float core = smoothstep(w + px, max(w - px, 0.0), d) * env;
    float glow = exp(-d / (0.006 + 0.004 * sw)) * env;
    float twist = 0.003 + 0.0025 * sin(s * 1.3 + fi * 0.7 + T);
    float under = exp(-pow((uv.y - (y - twist)) / (0.0016 + px), 2.0)) * env;
    float sheen = step(y - twist, uv.y) * step(uv.y, y) * env;   // translucent band between the two edges

    col += hue * gain * (0.95 * core + 0.16 * glow * (0.6 + 0.4 * br) + 0.28 * under + 0.07 * sheen);

    // the rhyme sound: a small bead at the margin
    vec2 bp = uv - vec2(xm, yi);
    float bead = exp(-dot(bp, bp) / 0.000018);
    col += hue * gain * (0.8 * bead + 0.12 * exp(-length(bp) / 0.012));
  }

  // rhyme arcs in the margin joining lines that share a sound
  for (int j = 0; j < 7; j++) {
    int a = j < 6 ? 4 * (j / 2) + (j % 2) : 12;
    int b = j < 6 ? a + 2 : 13;
    float ya = lineY(a), yb = lineY(b);
    vec2 c = vec2(xm, 0.5 * (ya + yb));
    float R = 0.5 * (ya - yb);
    vec2 q = uv - c;
    float wide = 1.0 + 0.35 * float(j % 2);   // the B/D/F arcs swing a little wider
    q.x /= wide;
    float d = abs(length(q) - R);
    float arc = smoothstep(0.0013 + px, 0.0, d) * step(0.0, q.x);
    col += rhymeHue(rhyme(a)) * 0.22 * arc;
  }

  // tone map, vignette
  col = 1.0 - exp(-col * 1.25);
  vec2 vq = (gl_FragCoord.xy / u_resolution) - 0.5;
  col *= 1.0 - 0.6 * dot(vq, vq);
  fragColor = vec4(col, 1.0);
}
