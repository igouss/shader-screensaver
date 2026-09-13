// Arkanar Orbit — the observer's view of the night side of Arkanar: grey murk and cloud, scattered torchlit towns, a cold dawn on the limb and the unseen Earth base hanging above (FragCoord GLSL)
// Theme: Hard to Be a God

const float TAU = 6.2831853;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
                 mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
                 mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    v += a * noise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, s, 0, 1, 0, -s, 0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, -s, 0, s, c); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time;

  vec3 ro = vec3(0.0, 0.0, -3.2);
  vec3 rd = normalize(vec3(uv, 1.6));
  vec3 C = vec3(0.0, -5.35, 2.4);
  float R = 5.0;
  vec3 sun = normalize(vec3(0.62, 0.12, 1.0));

  // faint stars
  vec3 col = vec3(0.0);
  vec2 sg = uv * 90.0;
  vec2 sid = floor(sg);
  float sh = fract(sin(dot(sid, vec2(41.3, 289.1))) * 43758.5);
  if (sh > 0.985) {
    vec2 so = vec2(fract(sh * 91.7), fract(sh * 57.3)) - 0.5;
    col += vec3(0.8, 0.85, 1.0) * (sh - 0.985) * 40.0 * exp(-dot(fract(sg) - 0.5 - so * 0.6, fract(sg) - 0.5 - so * 0.6) * 60.0);
  }

  // ray / planet
  vec3 oc = ro - C;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - R * R;
  float disc = b * b - c;
  float closest = sqrt(max(dot(oc, oc) - b * b, 0.0));  // ray's nearest approach to the centre
  float hAlt = closest - R;

  // atmosphere around the limb: cold light on the dawn side, a faint grey rim elsewhere
  float forward = pow(max(dot(rd, sun), 0.0), 6.0);
  float rimSide = 0.2 + 0.8 * smoothstep(-0.2, 0.9, dot(normalize(ro + rd * max(-b, 0.0) - C), sun));
  if (hAlt > 0.0) {
    float glow = exp(-hAlt * 28.0) * (0.25 + 2.5 * rimSide * rimSide + 3.0 * forward);
    col += vec3(0.55, 0.75, 1.0) * glow * 0.55;
  }

  if (disc > 0.0) {
    float d = -b - sqrt(disc);
    vec3 p = ro + rd * d;
    vec3 n = normalize(p - C);
    float spin = mod(t * 0.045, TAU);
    vec3 sn = rotY(spin) * rotX(0.5) * n;
    // murky continents and seas
    float land = fbm3(sn * 3.0, 5);
    float isLand = smoothstep(0.42, 0.47, land);
    float ndl = dot(n, sun);
    float day = smoothstep(-0.08, 0.25, ndl);
    vec3 surf = mix(vec3(0.04, 0.045, 0.055), vec3(0.17, 0.16, 0.14) * (0.5 + 0.9 * fbm3(sn * 14.0, 2)), isLand);
    // clouds on their own slow wind
    vec3 cn = rotY(mod(t * 0.06, TAU)) * rotX(0.5) * n;
    float cl = fbm3(cn * 4.0 + vec3(0.0, t * 0.01, 3.0), 4);
    cl = smoothstep(0.42, 0.75, cl);
    // torchlit towns, scattered and few, on the night side
    // towns cluster along river valleys: a coarse mask times a fine scatter of hearths
    float region = smoothstep(0.45, 0.7, fbm3(sn * 7.0 + 5.0, 2));
    vec3 g = sn * 60.0;
    vec3 gid = floor(g);
    float gh = hash3(gid);
    float town = 0.0;
    if (gh > 0.7) {
      vec3 go = vec3(hash3(gid + 3.1), hash3(gid + 7.3), hash3(gid + 1.9)) - 0.5;
      // feature point pulled onto the sphere, distance measured along the surface (in cells)
      vec3 fpnt = normalize((gid + 0.5 + go * 0.6) / 60.0);
      float dd = dot(sn - fpnt, sn - fpnt) * 3600.0;
      town = (exp(-dd * 30.0) * 1.3 + exp(-dd * 4.0) * 0.12) * (0.3 + (gh - 0.7) * 4.0);
      town *= 0.85 + 0.15 * sin(mod(t * 0.7, TAU) + gh * 90.0);
    }
    town *= 0.15 + region;
    town *= (0.08 + 0.92 * isLand) * (1.0 - smoothstep(-0.2, 0.05, ndl)) * (1.0 - 0.75 * cl);
    // a faint lunar ambient keeps the night side just readable
    float moon = 0.25 + 0.75 * max(dot(n, normalize(vec3(-0.6, 0.8, -0.4))), 0.0);
    vec3 night = surf * 1.1 * moon + vec3(0.13, 0.135, 0.14) * cl * moon;
    vec3 lit = mix(surf * 3.0, vec3(0.75, 0.8, 0.85), cl) * max(ndl, 0.0) * 1.6;
    col = mix(night, lit + night, day);
    col += vec3(1.0, 0.52, 0.18) * town * 1.3;
    // atmosphere haze towards the limb
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
    col += vec3(0.45, 0.65, 1.0) * fres * (0.08 + 0.9 * rimSide * rimSide) * 0.6;
  }

  // the Earth base: a slim ring station, dark against the stars, edged in cold light
  vec2 sc = vec2(-0.42, 0.22) + 0.012 * vec2(sin(mod(t * 0.09, TAU)), cos(mod(t * 0.07, TAU)));
  vec2 q = uv - sc;
  float tilt = 0.28;
  float er = length(vec2(q.x, q.y / tilt));
  float ring = abs(er - 0.13);
  float ringW = 0.012;
  float onRing = smoothstep(ringW * 1.4, ringW * 0.6, ring * tilt * 3.0);
  float edge = smoothstep(0.0, 1.0, q.x / 0.13) * 0.5 + 0.5 * smoothstep(-0.02, 0.03, q.y);
  col = mix(col, vec3(0.0), onRing * 0.9);
  col += vec3(0.6, 0.8, 1.0) * onRing * pow(max(edge, 0.0), 3.0) * 0.12;
  // hub and spokes
  float hub = length(q * vec2(1.0, 1.4));
  col = mix(col, vec3(0.0), smoothstep(0.018, 0.012, hub));
  col += vec3(0.7, 0.85, 1.0) * 0.9 * exp(-hub * hub * 9000.0);
  // steady running lights circling the ring
  float spin2 = mod(t * 0.08, TAU);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0 + spin2;
    vec2 lp = vec2(cos(a) * 0.13, sin(a) * 0.13 * tilt);
    float front = step(0.0, -sin(a));  // lights on the far half hide behind the hull
    vec2 dl = q - lp;
    col += vec3(0.75, 0.9, 1.0) * (0.2 + 0.8 * front) * 0.45 * exp(-dot(dl, dl) * 60000.0);
  }

  col = 1.0 - exp(-col * 2.1);
  col *= 1.0 - 0.35 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
