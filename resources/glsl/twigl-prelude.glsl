#version 300 es
// Mirrors twigl's "geekest (300 es)" prelude so snippets can be pasted as-is.
// The snippet becomes the body of main(), which twigl-epilogue.glsl closes.
precision highp float;
uniform vec2 r;
uniform vec2 m;
uniform float t;
uniform float f;
out vec4 o;

mat2 rotate2D(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

mat3 rotate3D(float angle, vec3 axis) {
  vec3 a = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float r = 1. - c;
  return mat3(
    a.x * a.x * r + c, a.y * a.x * r + a.z * s, a.z * a.x * r - a.y * s,
    a.x * a.y * r - a.z * s, a.y * a.y * r + c, a.z * a.y * r + a.x * s,
    a.x * a.z * r + a.y * s, a.y * a.z * r - a.x * s, a.z * a.z * r + c);
}

vec3 hsv(float h, float s, float v) {
  vec4 t = vec4(1., 2. / 3., 1. / 3., 3.);
  vec3 p = abs(fract(vec3(h) + t.xyz) * 6. - vec3(t.w));
  return v * mix(vec3(t.x), clamp(p - vec3(t.x), 0., 1.), s);
}

#define FC gl_FragCoord

void main() {
  o = vec4(0);
