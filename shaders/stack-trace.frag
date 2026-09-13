// Stack Trace — sinking slowly through a deep column of translucent stack frames toward a red error frame glowing far below (FragCoord GLSL)
// Theme: debugging

const float TAU = 6.28318530718;
const float SP = 0.42;        // vertical spacing between frames
const float NP = 280.0;       // content repeats every NP frames (multiple of EV) so time can wrap seamlessly
const float EV = 40.0;        // one error frame every EV frames
const float EOFF = 20.0;
const int NV = 30;            // frames composited per ray
const float FOCAL = 1.5;
const vec2 HALF = vec2(0.95, 0.62);

float hash21(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float sdRR(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// each frame floats slightly off the spine and turned; frequencies are multiples of TAU/NP
void frameXf(float kk, float t, out vec2 off, out float tw) {
    float w = TAU / NP;
    off = 0.22 * vec2(sin(kk * w * 17.0 + t * 0.07), cos(kk * w * 13.0 + t * 0.053))
        + 0.09 * (vec2(hash21(vec2(kk, 1.0)), hash21(vec2(kk, 2.0))) - 0.5);
    tw = 0.30 * sin(kk * w * 9.0 + t * 0.041) + 0.16 * (hash21(vec2(kk, 3.0)) - 0.5);
}

float bandY(float y, float y0, float y1, float aa) {
    return smoothstep(y0 - aa, y0 + aa, y) * (1.0 - smoothstep(y1 - aa, y1 + aa, y));
}

// card contents: x = code text, y = header text, z = highlighted (current) line
vec3 cardText(vec2 p, float kk, float px) {
    float fine = 1.0 - smoothstep(0.010, 0.028, px);

    // header: function name on the left, file:line dimmer on the right
    float hlen = 0.35 + 0.55 * hash21(vec2(kk, 7.0));
    float head = bandY(p.y, 0.475, 0.535, px) * bandY(p.x, -0.86, -0.86 + hlen, px);
    head += 0.45 * bandY(p.y, 0.48, 0.525, px) * bandY(p.x, 0.5, 0.86, px);
    head += 0.25 * bandY(p.y, 0.415, 0.415 + max(0.006, px), px) * bandY(p.x, -0.9, 0.9, px);

    // code lines
    float rs = 0.085;
    float rf = (0.37 - p.y) / rs;
    float row = floor(rf);
    float fy = rf - row;
    float valid = step(0.0, row) * step(row, 9.0);
    vec2 rh = vec2(kk * 16.0 + row, 11.0);
    float indent = 2.0 * floor(3.0 * hash21(rh));
    float len = 4.0 + floor(24.0 * pow(hash21(rh + 1.3), 0.9));
    float blank = step(hash21(rh + 2.7), 0.15);
    float cw = 0.04;
    float cf = (p.x + 0.76) / cw;
    float cell = floor(cf);
    float inl = step(indent, cell) * step(cell, min(indent + len, 38.0) - 1.0) * (1.0 - blank);
    float sp = step(hash21(vec2(kk * 16.0 + row, cell + 30.0)), 0.16) * step(indent + 0.5, cell);
    float aay = px / rs;
    float bar = bandY(fy, 0.32, 0.68, aay);
    float code = valid * inl * (1.0 - sp) * mix(0.3, bar, fine);
    // line-number gutter
    code += 0.4 * valid * bandY(p.x, -0.88, -0.83, px) * mix(0.3, bar, fine);

    // the frame's current line
    float cur = floor(10.0 * hash21(vec2(kk, 9.0)));
    float hl = valid * step(abs(row - cur), 0.5) * bandY(p.x, -0.9, 0.9, px);

    return vec3(code, head, hl);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
    float t = u_time;

    float D = mod(t * 0.075, NP * SP);                 // depth travelled (wraps seamlessly)
    float ca = mod(t * 0.025, TAU);
    vec3 radial = vec3(cos(ca), 0.0, sin(ca));
    vec3 ro = vec3(0.0, -D, 0.0) + 0.55 * radial;
    vec3 fw = normalize(vec3(0.0, -1.0, 0.0) - 0.13 * radial);
    vec3 rt = normalize(cross(fw, -radial));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(uv.x * rt + uv.y * up + FOCAL * fw);

    vec3 col = vec3(0.0);
    float trans = 1.0;
    vec3 red = vec3(1.0, 0.16, 0.10);

    float k0 = floor(D / SP) + 1.0;
    for (int i = 0; i < NV; i++) {
        float k = k0 + float(i);
        float yk = -k * SP;
        float depth = k * SP - D;
        float tk = (yk - ro.y) / rd.y;
        vec2 h = ro.xz + rd.xz * tk;
        float kk = mod(k, NP);
        vec2 off; float tw;
        frameXf(kk, t, off, tw);
        vec2 lp = rot(tw) * (h - off);
        float px = tk / (u_resolution.y * FOCAL * max(-rd.y, 0.2));
        float sd = sdRR(lp, HALF, 0.05);
        float inside = 1.0 - smoothstep(-px, px, sd);
        float edge = 1.0 - smoothstep(0.5 * px, 0.5 * px + 0.012 + px, abs(sd));
        if (inside + edge < 0.001) continue;

        float fade = smoothstep(0.4, 2.6, depth) * (1.0 - smoothstep(float(NV - 7), float(NV), float(i)));
        float fog = exp(-depth * 0.13);
        float me = mod(kk, EV);
        float isErr = 1.0 - step(0.5, abs(me - EOFF));
        float dn = mod(EOFF - me + EV, EV);                // frames until the error below
        float lit = exp(-dn * 0.2) * (1.0 - isErr);        // glow reaching up from the error

        vec3 txt = cardText(lp, kk, px) * smoothstep(1.6, 4.0, depth);   // text resolves with distance
        vec3 glass = vec3(0.30, 0.42, 0.60);
        vec3 ink = vec3(0.62, 0.70, 0.84);
        vec3 e = glass * 0.035 * inside
               + mix(vec3(0.45, 0.56, 0.75), red, lit) * edge * (0.28 + 0.35 * lit)
               + ink * txt.x * 0.15 * inside
               + vec3(0.55, 0.78, 1.0) * txt.y * 0.30 * inside
               + glass * txt.z * 0.05 * inside;
        e += red * lit * 0.03 * inside;
        if (isErr > 0.5) {
            e = red * (0.16 * inside + 1.1 * edge)
              + vec3(1.0, 0.45, 0.38) * (txt.x * 0.4 + txt.y * 0.8) * inside
              + red * txt.z * 0.55 * inside;
        }
        col += trans * e * fog * fade;
        trans *= 1.0 - inside * 0.07 * fade;
    }

    // the error's light, seen through every frame above it
    float kE = k0 + mod(EOFF - mod(k0, EV) + EV, EV);
    vec2 offE; float twE;
    frameXf(mod(kE, NP), t, offE, twE);
    vec3 E = vec3(offE.x, -kE * SP, offE.y);
    vec3 w = E - ro;
    float tc = max(dot(w, rd), 0.0);
    float d2 = dot(w, w) - tc * tc;
    float depthE = kE * SP - D;
    float fogE = exp(-depthE * 0.13) * smoothstep(0.2, 2.0, depthE);
    col += red * (0.06 / (d2 + 0.06)) * fogE * (0.35 + 0.65 * trans);

    // deep background
    col += vec3(0.010, 0.012, 0.022) * trans;

    col = 1.0 - exp(-col * 1.5);
    col *= 1.0 - 0.35 * dot(uv, uv);
    fragColor = vec4(pow(col, vec3(0.95)), 1.0);
}
