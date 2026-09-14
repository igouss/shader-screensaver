#version 300 es
// One triangle that covers the screen: vertices (-1,-1), (3,-1) and (-1,3).
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}
