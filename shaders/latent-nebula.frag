// Latent Nebula — a domain-warped nebula spun around drifting embedding clusters, with data samples migrating between them (Shadertoy)
// Theme: AI

const int NC = 5;      // cluster centres (embeddings)
const int NS = 42;     // data samples
const float TAU = 6.28318530718;

float hash11(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) {
        s += a * noise(p);
        p = m * p + vec2(3.1, 1.7);
        a *= 0.5;
    }
    return s;
}

// slow Lissajous drift of each cluster; phases stay bounded because they only feed sin/cos
vec2 centre(int i, float t) {
    float fi = float(i);
    float sx = 0.045 + 0.011 * fi, sy = 0.037 + 0.008 * fi;
    return vec2(0.66 * sin(t * sx + fi * 1.9) + 0.12 * sin(t * 0.021 + fi),
                0.33 * cos(t * sy + fi * 2.7));
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;

    // ---- cluster field: swirl the domain around every centre ----
    vec2 C[NC];
    for (int i = 0; i < NC; i++) C[i] = centre(i, t);
    vec2 p = uv;
    float dens = 0.0;
    float d1 = 9.0, d2 = 9.0;
    for (int i = 0; i < NC; i++) {
        vec2 c = C[i];
        vec2 d = uv - c;
        float r2 = dot(d, d);
        float w = exp(-r2 * 7.0);
        dens += w;
        // spiral arms: rotate the domain around the centre, strongest close in
        float dir = (i % 2 == 0) ? 1.0 : -1.0;
        p = c + rot(dir * 2.2 * w) * (p - c);
        float r = sqrt(r2);
        if (r < d1) { d2 = d1; d1 = r; } else if (r < d2) { d2 = r; }
    }

    // ---- domain-warped fbm nebula ----
    float ph = t * 0.035;
    vec2 q = vec2(fbm(p * 2.2 + vec2(0.0, 1.3) + 0.6 * vec2(sin(ph), cos(ph * 0.7))),
                  fbm(p * 2.2 + vec2(5.2, 8.3) + 0.6 * vec2(cos(ph * 0.8), sin(ph * 1.1))));
    float n = fbm(p * 2.6 + 2.4 * q);
    float fil = pow(clamp(n, 0.0, 1.0), 2.2);             // filament density
    float ridge = 1.0 - abs(2.0 * fbm(p * 4.0 + 1.5 * q) - 1.0);
    ridge = pow(ridge, 8.0);                                 // thin bright veins

    // Voronoi seams between clusters: faint decision boundaries
    float seam = exp(-abs(d2 - d1) * 38.0) * 0.35;

    float cl = clamp(dens, 0.0, 1.6);
    vec3 deep   = vec3(0.012, 0.016, 0.05);
    vec3 blue   = vec3(0.10, 0.18, 0.55);
    vec3 violet = vec3(0.42, 0.16, 0.62);
    vec3 cyan   = vec3(0.30, 0.62, 0.85);

    vec3 col = deep;
    col += blue * fil * (0.12 + 1.0 * cl);
    col += violet * fil * q.x * 1.4 * (0.1 + cl);
    col += cyan * ridge * fil * 1.4 * (0.15 + cl);
    col += violet * seam * fil * 0.8;
    col += vec3(0.25, 0.15, 0.45) * 0.12 * cl;               // soft cluster haze

    // ---- data samples: congregate in clusters, migrate between them ----
    vec3 pts = vec3(0.0);
    for (int k = 0; k < NS; k++) {
        float fk = float(k);
        float h = hash11(fk + 0.37);
        float cyc = t * (0.018 + 0.012 * hash11(fk + 7.1)) + h * 7.0;
        float cn = floor(cyc);
        float fr = cyc - cn;
        int a = int(floor(hash11(fk * 3.7 + cn * 1.31) * float(NC)));
        int b = int(floor(hash11(fk * 3.7 + (cn + 1.0) * 1.31) * float(NC)));
        vec2 ca = C[a], cb = C[b];
        float s = smoothstep(0.62, 1.0, fr);                 // dwell, then travel
        // orbit around whichever cluster the sample belongs to
        float orad = 0.03 + 0.11 * hash11(fk + 2.9);
        float oang = TAU * hash11(fk + 5.3) + t * (0.12 + 0.1 * h) * (h > 0.5 ? 1.0 : -1.0);
        vec2 off = orad * vec2(cos(oang), sin(oang));
        // curve the migration path so it arcs instead of cutting straight
        vec2 ab = cb - ca;
        vec2 bow = vec2(-ab.y, ab.x) * 0.25 * sin(3.14159 * s) * (h - 0.5) * 2.0;
        vec2 sp = mix(ca, cb, s) + off * (1.0 - 0.6 * sin(3.14159 * s)) + bow;

        vec2 d = uv - sp;
        float r2 = dot(d, d);
        float tw = 0.75 + 0.25 * sin(t * 0.6 + fk * 2.3);    // slow shimmer
        if (r2 > 0.004) continue;
        float core = exp(-r2 * 90000.0);
        float halo = exp(-r2 * 2500.0) * 0.18;
        vec3 pc = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.82, 0.55), hash11(fk + 9.9));
        float travel = sin(3.14159 * s);                     // travellers glow a touch warmer
        pts += pc * (core * 1.4 + halo * (1.0 + 1.5 * travel)) * tw;
    }
    col += pts;

    // tone map + vignette
    col = 1.0 - exp(-col * 1.5);
    float v = 1.0 - 0.45 * dot(uv * vec2(0.7, 1.0), uv * vec2(0.7, 1.0));
    col *= clamp(v, 0.0, 1.0);
    col = pow(col, vec3(0.95));
    fragColor = vec4(col, 1.0);
}
