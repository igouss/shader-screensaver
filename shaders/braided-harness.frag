// Braided Harness — glowing cables woven tightly over-and-under around a dim crystal core, light pulses running along them (FragCoord GLSL)
// Theme: harness

const float TAU = 6.28318530718;
const float NB = 4.0;        // cables per winding direction
const float F = 1.55;        // helix twist, radians per unit of length
const float RC = 0.07;       // cable radius
const float AMP = 0.055;     // over/under weave amplitude
const float RB = 0.43;       // braid radius
const float RCORE = 0.27;    // crystal core radius

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float hash11(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }

float sdHex(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

float gSpin;

// x: distance, y: material (0 core, 1 cyan cables, 2 amber cables), z: cable index
vec3 map(vec3 p) {
    float y = p.y;
    float rho = length(p.xz);
    float th = atan(p.z, p.x);
    float sec = TAU / NB;
    float wv = cos(NB * F * y);

    float tA = th - (y * F + gSpin);
    float kA = floor(tA / sec + 0.5);
    float aA = tA - kA * sec;
    float rA = RB + AMP * wv;
    float cA = inversesqrt(1.0 + rA * rA * F * F);       // slant of the helix
    float dA = length(vec2(rho * cos(aA) - rA, rho * sin(aA) * cA)) - RC;

    float tB = th - (-y * F + gSpin);
    float kB = floor(tB / sec + 0.5);
    float aB = tB - kB * sec;
    float rB = RB - AMP * wv;
    float cB = inversesqrt(1.0 + rB * rB * F * F);
    float dB = length(vec2(rho * cos(aB) - rB, rho * sin(aB) * cB)) - RC;

    vec2 cp = rot(gSpin) * p.xz;
    float dC = sdHex(cp, RCORE) - 0.012;

    vec3 res = vec3(dC, 0.0, 0.0);
    if (dA < res.x) res = vec3(dA, 1.0, mod(kA, NB));
    if (dB < res.x) res = vec3(dB, 2.0, mod(kB, NB));
    return res;
}

// travelling light pulses; phases wrapped so they stay exact for hours
float pulses(float y, float mat, float k, float t) {
    float dir = mat < 1.5 ? 1.0 : -1.0;
    float ph = fract(y * 0.32 * dir - mod(t * 0.11, 1.0) + hash11(k * 7.3 + mat * 3.1));
    float x = ph - 0.5;
    return exp(-x * x * 900.0) + 0.25 * exp(-x * x * 120.0);
}

vec3 cableCol(float mat) {
    return mat < 1.5 ? vec3(0.25, 0.85, 1.0) : vec3(1.0, 0.62, 0.22);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
    float t = u_time;
    gSpin = mod(t * 0.07, TAU);

    // world -> braid frame: axis tilted across the screen
    mat3 toB;
    {
        vec3 ax = normalize(vec3(0.62, 1.0, 0.3));
        vec3 bx = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));
        vec3 bz = cross(bx, ax);
        toB = transpose(mat3(bx, ax, bz));
    }

    vec3 ro = vec3(0.0, 0.0, -5.2);
    vec3 rd = normalize(vec3(uv, 1.55));
    // slow sway of the viewpoint
    float sw = 0.18 * sin(t * 0.05);
    ro.xz = rot(sw) * ro.xz;
    rd.xz = rot(sw) * rd.xz;
    vec3 rob = toB * ro, rdb = toB * rd;

    vec3 glow = vec3(0.0);
    float tt = 3.2, hit = -1.0;
    vec3 m = vec3(0.0);
    for (int i = 0; i < 90; i++) {
        vec3 p = rob + rdb * tt;
        m = map(p);
        float fade = exp(-p.y * p.y * 0.14);
        if (m.y > 0.5) {
            float e = 0.05 + pulses(p.y, m.y, m.z, t);
            glow += cableCol(m.y) * e * exp(-m.x * 22.0) * 0.022 * fade;
        } else {
            glow += vec3(0.35, 0.3, 0.8) * exp(-m.x * 10.0) * 0.004 * fade;
        }
        if (m.x < 0.0012) { hit = tt; break; }
        tt += m.x * 0.7;
        if (tt > 8.2) break;
    }

    vec3 col = vec3(0.008, 0.009, 0.013);
    col += vec3(0.015, 0.02, 0.03) * (1.0 - 0.8 * length(uv));

    if (hit > 0.0) {
        vec3 p = rob + rdb * hit;
        const vec2 e = vec2(0.0015, -0.0015);
        vec3 n = normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +
                           e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
        vec3 v = -rdb;
        vec3 L = normalize(toB * vec3(-0.5, 0.7, -0.6));
        vec3 hv = normalize(L + v);
        float dif = max(dot(n, L), 0.0);
        float spec = pow(max(dot(n, hv), 0.0), 48.0);
        float fr = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        float fade = exp(-p.y * p.y * 0.14);
        // ambient occlusion from the neighbouring cables
        float ao = clamp(map(p + n * 0.06).x / 0.06, 0.0, 1.0);
        ao = 0.35 + 0.65 * ao;

        vec3 sc;
        if (m.y > 0.5) {
            vec3 cc = cableCol(m.y);
            float pl = pulses(p.y, m.y, m.z, t);
            vec3 metal = mix(vec3(0.06, 0.065, 0.075), cc * 0.08, 0.5);
            sc = metal * (0.25 + dif) * ao + vec3(0.7, 0.75, 0.85) * spec * 0.6 * ao;
            sc += cc * fr * 0.12;
            sc += cc * (0.025 + 1.4 * pl) * (0.4 + 0.6 * ao);  // light carried inside
        } else {
            // crystal: dark glass with bright facet edges and a slow inner breath
            float br = 0.5 + 0.5 * sin(t * 0.35);
            vec2 cp = rot(gSpin) * p.xz;
            float edge = abs(sdHex(cp, RCORE * 0.9));
            sc = vec3(0.03, 0.03, 0.06) * (0.3 + dif) + vec3(0.5, 0.55, 0.8) * spec * 0.4;
            sc += vec3(0.30, 0.26, 0.75) * (fr * 0.5 + 0.08 + 0.06 * br) * ao;
            sc += vec3(0.35, 0.5, 0.9) * exp(-edge * 60.0) * 0.12 * ao;
        }
        col = mix(col, sc, fade);
        col = mix(col, vec3(0.008, 0.009, 0.013), 1.0 - exp(-max(hit - 4.8, 0.0) * 0.5));
    }
    col += glow;

    col = 1.0 - exp(-col * 1.5);
    col *= 1.0 - 0.3 * dot(uv, uv);
    fragColor = vec4(pow(col, vec3(0.95)), 1.0);
}
