// Tesseract Vector — a four-dimensional hypercube turning on a vector monitor, its edges coloured by axis in red, yellow, blue and green (FragCoord GLSL)
// Theme: Computer World

float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float px = 1.0 / u_resolution.y;
  float t = mod(u_time, 6283.0);

  // project the 16 vertices
  vec3 P[16];
  float a1 = t * 0.23, a2 = t * 0.17, a3 = t * 0.11, a4 = t * 0.07;
  for (int i = 0; i < 16; i++) {
    vec4 v = vec4(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1), float((i >> 3) & 1)) * 2.0 - 1.0;
    v.xw *= rot(a1);
    v.yz *= rot(a2);
    v.zw *= rot(a3);
    v.xy *= rot(a4);
    float s = 1.0 / (2.6 - v.w);
    vec3 q = v.xyz * s;
    q.xz *= rot(0.5);
    q.yz *= rot(0.35);
    float pz = 1.0 / (3.2 - q.z);
    P[i] = vec3(q.xy * pz * 0.95 + vec2(0.0, 0.05), pz);
  }

  vec3 axisCol[4];
  axisCol[0] = vec3(1.0, 0.14, 0.08);
  axisCol[1] = vec3(1.0, 0.80, 0.12);
  axisCol[2] = vec3(0.18, 0.42, 1.0);
  axisCol[3] = vec3(0.12, 1.0, 0.42);

  vec3 col = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    for (int k = 0; k < 4; k++) {
      if (((i >> k) & 1) == 1) continue;
      int jx = i | (1 << k);
      vec3 A = P[i], B = P[jx];
      float d = segD(uv, A.xy, B.xy);
      float depth = clamp((A.z + B.z) * 1.6 - 0.55, 0.25, 1.4);
      float core = smoothstep(1.6 * px, 0.4 * px, d);
      float glow = 0.0022 / (d + 0.004) + 0.25 * exp(-d * 90.0);
      col += axisCol[k] * (core * 1.1 + glow * 0.55) * depth;
    }
  }
  // vertices as bright beam dwell points
  for (int i = 0; i < 16; i++) {
    float d = length(uv - P[i].xy);
    col += vec3(1.0, 0.97, 0.9) * (smoothstep(3.0 * px, 1.0 * px, d) * 0.8 + 0.0008 / (d * d * 60.0 + 0.01)) * P[i].z * 2.0;
  }

  // vector floor grid receding to a horizon
  float hz = -0.36;
  if (uv.y < hz) {
    float z = 0.25 / (hz - uv.y);
    vec2 g = vec2(uv.x * z, z + mod(t * 0.25, 1.0));
    vec2 gw = fwidth(g);
    vec2 gl = abs(fract(g * 2.0) - 0.5) / (gw * 2.0);
    float line = 1.0 - clamp(min(gl.x, gl.y), 0.0, 1.0);
    col += vec3(0.12, 0.55, 0.3) * line * 0.6 * exp(-z * 0.4);
  }
  col += vec3(0.1, 0.45, 0.25) * 0.5 * exp(-abs(uv.y - hz) / px * 0.5);

  // faint scanlines and tube curvature falloff
  col *= 0.92 + 0.08 * sin(gl_FragCoord.y * 3.14159);
  col = tanh(col * 1.1);
  col *= 1.0 - 0.4 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
