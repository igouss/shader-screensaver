// Heisenbug — a teal wave-interference field from drifting point sources; in its fringes a beetle's outline collapses into view in magenta, then dissolves and turns up somewhere else (FragCoord GLSL)
// Theme: debugging

float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float sdEllipse(vec2 p, vec2 r) {
  // cheap approximation, good enough for a soft outline
  float k = length(p / r);
  return (k - 1.0) * min(r.x, r.y);
}

// beetle outline facing +y, about 0.45 tall
float beetle(vec2 p) {
  vec2 q = vec2(abs(p.x), p.y);
  float elytra = sdEllipse(p - vec2(0.0, -0.03), vec2(0.085, 0.12));
  float pron = sdEllipse(p - vec2(0.0, 0.105), vec2(0.06, 0.035));
  float head = sdEllipse(p - vec2(0.0, 0.155), vec2(0.032, 0.025));
  float d = min(abs(elytra), abs(pron));
  d = min(d, abs(head));
  d = min(d, sdSeg(p, vec2(0.0, 0.07), vec2(0.0, -0.15)));          // wing seam
  // legs: three per side, jointed
  d = min(d, min(sdSeg(q, vec2(0.05, 0.09), vec2(0.11, 0.12)), sdSeg(q, vec2(0.11, 0.12), vec2(0.13, 0.18))));
  d = min(d, min(sdSeg(q, vec2(0.08, 0.0), vec2(0.14, 0.01)), sdSeg(q, vec2(0.14, 0.01), vec2(0.17, -0.05))));
  d = min(d, min(sdSeg(q, vec2(0.07, -0.08), vec2(0.12, -0.13)), sdSeg(q, vec2(0.12, -0.13), vec2(0.13, -0.21))));
  // antennae
  d = min(d, min(sdSeg(q, vec2(0.015, 0.175), vec2(0.04, 0.22)), sdSeg(q, vec2(0.04, 0.22), vec2(0.07, 0.24))));
  return d;
}

void main() {
  vec2 res = u_resolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float T = mod(u_time, 3600.0);
  float aspect = res.x / res.y;

  // the bug: one sighting per ~26 s cycle, somewhere new each time
  float cyc = T / 26.0 + 0.45;
  float ci = floor(cyc), cf = fract(cyc);
  float seen = smoothstep(0.2, 0.5, cf) * smoothstep(0.9, 0.62, cf);
  vec2 bugPos = vec2((hash(ci) - 0.5) * min(aspect - 0.7, 0.8), (hash(ci + 7.0) - 0.5) * 0.3);
  float ang = (hash(ci + 3.0) - 0.5) * 2.4 + 0.12 * sin(T * 0.2);
  vec2 bp = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (p - bugPos);
  const float BS = 0.62;                          // shrink the unit beetle to screen scale
  float bd = beetle(bp / BS * 0.5) * BS * 2.0;
  float near = exp(-max(bd, 0.0) * 14.0);

  // sum of circular waves from three drifting sources (complex amplitude)
  vec2 amp = vec2(0.0);
  const float K = 58.0;
  float Tp = mod(T, 6.2831853 / 0.8 * 100.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 s = vec2(0.6 * aspect * sin(T * (0.023 + 0.009 * fi) + fi * 2.4),
                  0.45 * cos(T * (0.019 + 0.007 * fi) + fi * 1.7));
    float r = length(p - s);
    float ph = K * r - Tp * 0.8 + fi * 2.1;
    // the observed bug bends the wavefronts along its outline
    ph += seen * 1.2 * exp(-bd * bd * 1500.0);
    amp += vec2(cos(ph), sin(ph)) / sqrt(0.3 + r);
  }
  float I = dot(amp, amp) / 6.0;                  // intensity, roughly 0..2

  // decoherence: where the bug is observed the fringes wash out
  float fr = mix(I, 0.5, 0.55 * seen * near);

  vec3 col = vec3(0.006, 0.018, 0.024);
  col += vec3(0.05, 0.22, 0.25) * fr * 0.55;
  col += vec3(0.25, 0.75, 0.7) * pow(max(fr - 0.6, 0.0), 2.0) * 0.12;
  // fine contour lines of the intensity, like a plotted measurement
  float cl = abs(fract(fr * 4.0) - 0.5);
  col += vec3(0.1, 0.4, 0.4) * smoothstep(0.06, 0.0, cl) * 0.05 * smoothstep(0.1, 0.6, fr);
  // the sources, as faint pinpricks
  // (recomputed cheaply: nearest source glow)
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 s = vec2(0.6 * aspect * sin(T * (0.023 + 0.009 * fi) + fi * 2.4),
                  0.45 * cos(T * (0.019 + 0.007 * fi) + fi * 1.7));
    col += vec3(0.4, 0.9, 0.85) * 0.00008 / (dot(p - s, p - s) + 0.0001);
  }

  // the beetle: its outline condenses where the fringes are bright
  float line = exp(-bd * bd * 30000.0);
  float glow = exp(-abs(bd) * 45.0);
  float bright = smoothstep(0.15, 1.0, I);
  col += vec3(1.0, 0.12, 0.5) * seen * (line * (0.10 + 1.2 * bright) + glow * 0.08);
  // a ghost of it lingers faintly in the teal even when unobserved
  col += vec3(0.15, 0.45, 0.45) * line * 0.07 * bright * (1.0 - seen);

  col *= 1.0 - 0.35 * dot(p, p);
  col = 1.0 - exp(-col * 1.6);
  fragColor = vec4(col, 1.0);
}
