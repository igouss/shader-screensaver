// Agent Loop — three luminous beads (think, act, observe) chasing each other forever around a glowing torus-knot track (FragCoord GLSL)
// Theme: harness

const float TAU = 6.28318530718;
const float PK = 2.0, QK = 3.0;       // (2,3) torus knot: a trefoil
const float R0 = 1.0, R1 = 0.44, TH = 0.062;
const float LOOP = 12.56637061436;    // TAU * PK, one full lap of the knot

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

vec3 knot(float s) {
    float phi = s * QK / PK;
    float rr = R0 + R1 * cos(phi);
    return vec3(rr * cos(s), R1 * sin(phi), rr * sin(s));
}

// distance to the tube, and the knot parameter of the nearest strand
vec2 track(vec3 p) {
    float a = atan(p.z, p.x);
    vec2 q = vec2(length(p.xz) - R0, p.y);
    vec2 qr = rot(-a * QK / PK) * q;
    float k = floor(atan(qr.y, qr.x) / 3.14159265 + 0.5);   // which of the two strands
    float m = mod(k, 2.0);
    qr *= 1.0 - 2.0 * m;                                     // rotate that strand onto +x
    // the strand crosses this slice at a slant: shrink the in-slice tangential axis
    float L = max(length(p.xz), R0 - R1);                    // clamp: no false hits along the axis
    float c = L * inversesqrt(L * L + R1 * R1 * QK * QK / (PK * PK));
    float d = length(vec2(qr.x - R1, qr.y * c)) - TH;
    return vec2(d, mod(a + TAU * m, LOOP));
}

// bead positions along the knot, with gentle catching-up and falling-back
float beadS(int i, float t) {
    float fi = float(i);
    return mod(t * 0.21 + fi * LOOP / 3.0 + 0.35 * sin(t * 0.11 + fi * 2.1), LOOP);
}

vec3 beadCol(int i) {
    if (i == 0) return vec3(0.62, 0.50, 1.00);    // think: lavender
    if (i == 1) return vec3(1.00, 0.55, 0.34);    // act: coral
    return vec3(0.34, 0.95, 0.76);                 // observe: mint
}

// light left on the track behind each bead (a fading comet trail)
vec3 trail(float s, float bs[3]) {
    vec3 c = vec3(0.0);
    for (int i = 0; i < 3; i++) {
        float ds = mod(bs[i] - s, LOOP);
        c += beadCol(i) * (exp(-ds * 1.4) + exp(-(LOOP - ds) * 12.0));
    }
    return c;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
    float t = u_time;

    float bs[3];
    vec3 bp[3];
    for (int i = 0; i < 3; i++) { bs[i] = beadS(i, t); bp[i] = knot(bs[i]); }

    // camera slowly circling and bobbing
    float ca = mod(t * 0.055, TAU);
    vec3 ro = vec3(2.9 * cos(ca), 3.6 + 0.5 * sin(t * 0.043), 2.9 * sin(ca));
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(uv.x * rt + uv.y * up + 1.75 * fw);

    vec3 base = vec3(0.13, 0.15, 0.27);      // the loop's own faint light
    vec3 glow = vec3(0.0);
    float tt = 2.0, thit = -1.0, hs = 0.0;
    for (int i = 0; i < 100; i++) {
        vec3 p = ro + rd * tt;
        vec2 h = track(p);
        vec3 tc = base + trail(h.y, bs);
        glow += tc * exp(-h.x * 22.0) * 0.02;
        if (h.x < 0.001) { thit = tt; hs = h.y; break; }
        tt += h.x * 0.55;
        if (tt > 8.0) break;
    }

    vec3 col = vec3(0.006, 0.007, 0.014) + vec3(0.02, 0.018, 0.035) * (1.0 - length(uv));

    if (thit > 0.0) {
        vec3 p = ro + rd * thit;
        const vec2 e = vec2(0.0015, -0.0015);
        vec3 n = normalize(e.xyy * track(p + e.xyy).x + e.yyx * track(p + e.yyx).x +
                           e.yxy * track(p + e.yxy).x + e.xxx * track(p + e.xxx).x);
        vec3 sc = vec3(0.012, 0.014, 0.022);
        // beads light the track around them
        for (int i = 0; i < 3; i++) {
            vec3 L = bp[i] - p;
            float dl = length(L);
            float dif = max(dot(n, L / dl), 0.0);
            sc += beadCol(i) * dif * 0.35 / (1.0 + dl * dl * 9.0);
        }
        float fr = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        sc += vec3(0.25, 0.30, 0.45) * fr * 0.18;
        sc += (base * 0.8 + trail(hs, bs)) * 0.8;          // the tube itself glows
        float fog = exp(-max(thit - 3.5, 0.0) * 0.35);
        col = sc * fog;
    }
    col += glow * 0.55;

    // beads: analytic glow along the ray, dimmed where the tube hides them
    for (int i = 0; i < 3; i++) {
        vec3 w = bp[i] - ro;
        float tc = dot(w, rd);
        float d2 = max(dot(w, w) - tc * tc, 0.0);
        float vis = (thit > 0.0 && tc > thit + 0.12) ? 0.12 : 1.0;
        vec3 bc = beadCol(i);
        col += bc * vis * (1.0 * exp(-d2 * 900.0) + 0.006 / (d2 + 0.003));
        col += vec3(1.0) * vis * 0.6 * exp(-d2 * 4000.0);
    }

    col = 1.0 - exp(-col * 1.3);
    col *= 1.0 - 0.3 * dot(uv, uv);
    fragColor = vec4(pow(col, vec3(0.95)), 1.0);
}
