// Context Tunnel — a slow flight down a tunnel walled with scrolling lines of code toward a warm coral light at the far end (FragCoord GLSL)
// Theme: Claude Code

const float TAU = 6.28318530718;
const float K = 0.5;           // tunnel depth scale
const float RD = 34.0;         // text rows per unit of depth
const float PANELS = 6.0;      // pages around the circumference
const float CW = 30.0;         // cells per page, incl. a 2-cell gutter
const float SCROLL = 400.0;    // depth scroll period (RD * SCROLL rows, divisible by BLK)
const float BLK = 8.0;         // rows per block (tool calls occupy one block)

float hash31(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

// smooth 1D noise down the rows, for coherent indentation
float rowNoise(float x, float seed) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash31(vec3(i, seed, 4.0)), hash31(vec3(i + 1.0, seed, 4.0)), f);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
    float t = u_time;
    uv -= 0.03 * vec2(sin(t * 0.061), cos(t * 0.047));      // vanishing point breathes a little

    float r = max(length(uv), 1e-4);
    float a = atan(uv.y, uv.x) + mod(t * 0.012, TAU);
    float zd = K / r;                                         // distance down the tunnel
    float rowf = (zd + mod(t * 0.085, SCROLL)) * RD;
    float row = floor(rowf);
    float fy = rowf - row;
    float rowId = mod(row, RD * SCROLL);

    float cells = PANELS * CW;
    float u = fract(a / TAU) * cells;
    float cell = floor(u);
    float fx = u - cell;
    float panel = floor(cell / CW);
    float c = cell - panel * CW;

    // pixel footprint in row / cell units, for antialiasing and far-field fade
    float wy = RD * K / (r * r * u_resolution.y);
    float wx = cells / (TAU * r * u_resolution.y);
    float fine = 1.0 - smoothstep(0.18, 0.55, max(wy, wx));  // 0 where text is sub-pixel

    // ---- block structure: tool calls ----
    float blk = floor(rowId / BLK);
    float rb = rowId - blk * BLK;
    float isTool = step(hash31(vec3(blk, panel, 7.0)), 0.065);
    float xr = u - panel * CW;            // cell coords within page
    float yr = rb + fy;                   // row coords within block

    // ---- line layout ----
    float nest = floor(rowNoise(rowId * 0.35, panel) * 4.0);
    float indent = nest * 2.0 + isTool * 2.0;
    float blank = step(hash31(vec3(rowId, panel, 2.0)), 0.17);
    float len = 3.0 + floor(pow(hash31(vec3(rowId, panel, 3.0)), 0.8) * 20.0);
    if (isTool > 0.5) {
        blank = (rb < 0.5 || rb > BLK - 1.5) ? 1.0 : 0.0;
        if (rb < 1.5) { indent = 2.0; len = 9.0 + floor(hash31(vec3(blk, panel, 5.0)) * 8.0); }
        else len = min(len, 22.0);
    }
    float lineEnd = min(indent + len, CW - 3.0);
    float inLine = step(indent, c) * step(c, lineEnd - 1.0) * (1.0 - blank);
    float space = step(hash31(vec3(rowId, panel, c + 10.0)), 0.16) * step(indent + 0.5, c);
    float glyph = inLine * (1.0 - space);

    // glyph bar: slight per-character height variation, tiny gaps between characters
    float top = 0.33 - 0.07 * hash31(vec3(rowId, cell, 9.0));
    float by = smoothstep(top - wy, top + wy, fy) * (1.0 - smoothstep(0.70 - wy, 0.70 + wy, fy));
    float bx = smoothstep(0.02, 0.02 + wx, fx) * (1.0 - smoothstep(0.98 - wx, 0.98, fx));
    float bar = mix(0.34, by * mix(0.85, 1.0, bx), fine);     // average coverage far away
    float text = glyph * bar;
    // far-field: the page just becomes a soft haze of average ink
    float ink = mix(0.26, text, fine);

    // tool call rectangle (rounded border, dim fill)
    vec2 rc = vec2(xr - 0.5 * (CW - 2.0), yr - 0.5 * BLK);
    vec2 hs = vec2(0.5 * (CW - 2.0) - 0.6, 0.5 * BLK - 0.35);
    vec2 q = abs(rc) - hs;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float pxw = max(wx, wy);
    float fill = (1.0 - smoothstep(-pxw, pxw, sd)) * isTool;
    float border = (1.0 - smoothstep(0.12, 0.12 + 1.5 * pxw, abs(sd))) * isTool;

    // ---- colour ----
    vec3 coral = vec3(0.93, 0.50, 0.38);
    vec3 grey = vec3(0.60, 0.65, 0.72);
    float far = smoothstep(0.7, 4.5, zd);
    vec3 inkCol = mix(grey, coral * 1.05, far * 0.85);
    float fog = exp(-zd * 0.3);

    vec3 col = vec3(0.016, 0.018, 0.026);
    col += coral * 0.05 * far;                               // far walls catch the light
    float gutter = 0.6 * step(CW - 2.0, c);
    col += grey * 0.02 * gutter * fine;
    col += inkCol * ink * 0.30 * (1.0 - isTool) * fog;
    col += coral * (fill * 0.10 + border * 0.45 * fine + glyph * bar * isTool * 0.75) * fog;

    // the end of the context: warm light far ahead
    col += coral * (0.55 * exp(-r * 7.0) + 0.55 * exp(-r * 26.0));
    col += vec3(1.0, 0.80, 0.68) * 0.45 * exp(-r * 90.0);

    col = 1.0 - exp(-col * 1.4);
    float v = 1.0 - 0.35 * dot(uv, uv);
    col *= clamp(v, 0.0, 1.0);
    fragColor = vec4(col, 1.0);
}
