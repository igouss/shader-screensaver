// shader-screensaver: fullscreen GLSL screensaver for Omarchy.
//
// Shows the first shader that compiles from the --shader arguments: files are
// tried in the order given, directories contribute their *.frag / *.glsl files
// in random order. Defaults to ~/.config/shader-screensaver/shaders/.
// Understands three formats:
//   - twigl "geekest (300 es)" bodies: FC, r, t, o, rotate3D, ...
//   - FragCoord GLSL: void main() writing fragColor, with u_resolution/u_time/...
//   - Shadertoy: mainImage(out vec4, in vec2) with iResolution/iTime/...
// Exits on keyboard/mouse input, or when focus leaves the screensaver (e.g. the
// session locks). --check compiles a shader offscreen and, with --thumb, renders
// a PNG thumbnail with brightness/motion/cost stats without showing anything.
// --cycle N steps through the playlist, N seconds per shader, driven by keys
// instead of exiting on them, and reports each step on stdout.

#define _GNU_SOURCE
#include <GLES3/gl3.h>
#include <SDL3/SDL.h>
#include <ctype.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <math.h>
#include <signal.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#include <zlib.h>

static const char *VERT_SRC =
    "#version 300 es\n"
    "void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);"
    "gl_Position=vec4(p*2.-1.,0.,1.);}\n";

// Mirrors twigl's geekest (300 es) prelude so snippets can be pasted as-is.
static const char *TWIGL_HEADER =
    "#version 300 es\n"
    "precision highp float;\n"
    "uniform vec2 r;\n"
    "uniform vec2 m;\n"
    "uniform float t;\n"
    "uniform float f;\n"
    "out vec4 o;\n"
    "mat2 rotate2D(float r){return mat2(cos(r),sin(r),-sin(r),cos(r));}\n"
    "mat3 rotate3D(float angle,vec3 axis){vec3 a=normalize(axis);float s=sin(angle);"
    "float c=cos(angle);float r=1.-c;return mat3("
    "a.x*a.x*r+c,a.y*a.x*r+a.z*s,a.z*a.x*r-a.y*s,"
    "a.x*a.y*r-a.z*s,a.y*a.y*r+c,a.z*a.y*r+a.x*s,"
    "a.x*a.z*r+a.y*s,a.y*a.z*r-a.x*s,a.z*a.z*r+c);}\n"
    "vec3 hsv(float h,float s,float v){vec4 t=vec4(1.,2./3.,1./3.,3.);"
    "vec3 p=abs(fract(vec3(h)+t.xyz)*6.-vec3(t.w));"
    "return v*mix(vec3(t.x),clamp(p-vec3(t.x),0.,1.),s);}\n"
    "#define FC gl_FragCoord\n"
    "void main(){o=vec4(0);\n"
    "#line 1\n";

static const char *TWIGL_FOOTER = "\no.a=1.;}\n";

static const char *COMMON_HEADER =
    "#version 300 es\n"
    "precision highp float;\n"
    "precision highp int;\n"
    "precision highp sampler3D;\n"
    "precision highp samplerCube;\n";

// Declared unless the shader declares them itself (FragCoord's prelude).
static const char *FRAGCOORD_UNIFORMS[][2] = {
    {"vec2", "u_resolution"}, {"float", "u_time"},        {"float", "u_time_delta"},
    {"int", "u_frame"},       {"vec4", "u_mouse"},        {"vec2", "u_drag"},
    {"float", "u_scroll"},    {"vec4", "u_date"},         {"float", "u_refresh_rate"},
    {"int", "u_recursion"},   {"int", "u_max_recursion"}, {"int", "u_color_gamut"},
    {"vec3", "u_camera_pos"}, {"vec3", "u_camera_dir"},   {"mat4", "u_camera_view"},
};

static const char *SHADERTOY_UNIFORMS[][2] = {
    {"vec3", "iResolution"}, {"float", "iTime"}, {"float", "iTimeDelta"}, {"int", "iFrame"},
    {"float", "iFrameRate"}, {"vec4", "iMouse"}, {"vec4", "iDate"},
};

typedef enum { FMT_TWIGL, FMT_FRAGCOORD, FMT_SHADERTOY } Format;
static const char *FORMAT_NAMES[] = {"twigl", "fragcoord", "shadertoy"};

// Uniform values are computed once per frame into these slots; every name
// below maps onto one, and is uploaded according to the type the shader
// actually declared (e.g. u_frame as int or float, resolution as vec2 or vec3).
enum {
  U_RES, U_TIME, U_DT, U_FRAME, U_MOUSE_NORM, U_MOUSE_FC, U_MOUSE_ST, U_DRAG, U_SCROLL,
  U_DATE, U_RATE, U_REC, U_MAXREC, U_GAMUT, U_CAMPOS, U_CAMDIR, U_CAMVIEW, U_COUNT
};

typedef float Values[U_COUNT][16];

static const struct {
  const char *name;
  int slot;
} UNIFORM_NAMES[] = {
    {"r", U_RES},           {"u_resolution", U_RES},       {"iResolution", U_RES},
    {"t", U_TIME},          {"u_time", U_TIME},            {"iTime", U_TIME},
    {"u_time_delta", U_DT}, {"iTimeDelta", U_DT},          {"f", U_FRAME},
    {"u_frame", U_FRAME},   {"iFrame", U_FRAME},           {"m", U_MOUSE_NORM},
    {"u_mouse", U_MOUSE_FC}, {"iMouse", U_MOUSE_ST},       {"u_drag", U_DRAG},
    {"u_scroll", U_SCROLL}, {"u_date", U_DATE},            {"iDate", U_DATE},
    {"u_refresh_rate", U_RATE}, {"iFrameRate", U_RATE},    {"u_recursion", U_REC},
    {"u_max_recursion", U_MAXREC}, {"u_color_gamut", U_GAMUT}, {"u_camera_pos", U_CAMPOS},
    {"u_camera_dir", U_CAMDIR}, {"u_camera_view", U_CAMVIEW},
};
#define N_UNIFORM_NAMES (sizeof UNIFORM_NAMES / sizeof UNIFORM_NAMES[0])

typedef struct {
  GLint loc;
  GLenum type;
} Uniform;

typedef struct {
  GLuint fbo, tex;
  int w, h;
} Target;

static bool is_ident(char c) { return isalnum((unsigned char)c) || c == '_'; }

// Finds `word` as a whole identifier in s.
static const char *find_word(const char *s, const char *word) {
  size_t n = strlen(word);
  for (const char *p = strstr(s, word); p; p = strstr(p + 1, word))
    if ((p == s || !is_ident(p[-1])) && !is_ident(p[n])) return p;
  return NULL;
}

static bool has_void_main(const char *src) {
  for (const char *p = find_word(src, "main"); p; p = find_word(p + 1, "main")) {
    const char *q = p + 4;
    while (isspace((unsigned char)*q)) q++;
    if (*q != '(') continue;

    const char *b = p;
    while (b > src && isspace((unsigned char)b[-1])) b--;
    if (b - src >= 4 && !strncmp(b - 4, "void", 4) && (b - 4 == src || !is_ident(b[-5]))) return true;
  }
  return false;
}

// True if some line starts with `first` and (when given) mentions `name`,
// e.g. declares(src, "uniform", "u_time").
static bool declares(const char *src, const char *first, const char *name) {
  size_t first_len = strlen(first);
  for (const char *line = src; line && *line;) {
    const char *eol = strchr(line, '\n');
    size_t len = eol ? (size_t)(eol - line) : strlen(line);

    char buf[512];
    len = SDL_min(len, sizeof buf - 1);
    memcpy(buf, line, len);
    buf[len] = '\0';

    const char *s = buf;
    while (isspace((unsigned char)*s)) s++;
    if (!strncmp(s, first, first_len) && !is_ident(s[first_len]) && (!name || find_word(s, name))) return true;

    line = eol ? eol + 1 : NULL;
  }
  return false;
}

static Format detect_format(const char *src) {
  if (find_word(src, "mainImage")) return FMT_SHADERTOY;
  if (has_void_main(src)) return FMT_FRAGCOORD;
  return FMT_TWIGL;
}

// Blanks #version lines (the prelude supplies its own) without shifting line numbers.
static void blank_version_lines(char *src) {
  for (char *line = src; line && *line;) {
    char *s = line;
    while (*s == ' ' || *s == '\t') s++;
    char *eol = strchr(line, '\n');
    if (!strncmp(s, "#version", 8))
      for (char *c = s; *c && c != eol; c++) *c = ' ';
    line = eol ? eol + 1 : NULL;
  }
}

static char *wrap_source(const char *src, Format fmt) {
  char *out = NULL;
  size_t len = 0;
  FILE *m = open_memstream(&out, &len);

  if (fmt == FMT_TWIGL) {
    fputs(TWIGL_HEADER, m);
    fputs(src, m);
    fputs(TWIGL_FOOTER, m);
  } else {
    fputs(COMMON_HEADER, m);
    if (!declares(src, "out", NULL) && !declares(src, "layout", "out"))
      fputs("layout(location = 0) out vec4 fragColor;\n", m);

    const char *(*list)[2] = fmt == FMT_SHADERTOY ? SHADERTOY_UNIFORMS : FRAGCOORD_UNIFORMS;
    size_t count = fmt == FMT_SHADERTOY ? SDL_arraysize(SHADERTOY_UNIFORMS) : SDL_arraysize(FRAGCOORD_UNIFORMS);
    for (size_t i = 0; i < count; i++)
      if (!declares(src, "uniform", list[i][1])) fprintf(m, "uniform %s %s;\n", list[i][0], list[i][1]);

    fputs("#line 1\n", m);
    fputs(src, m);
    if (fmt == FMT_SHADERTOY && !has_void_main(src))
      fputs("\nvoid main(){mainImage(fragColor, gl_FragCoord.xy);}\n", m);
  }

  fclose(m);
  return out;
}

static GLuint compile_shader(GLenum type, const char *src, const char *label) {
  GLuint shader = glCreateShader(type);
  glShaderSource(shader, 1, &src, NULL);
  glCompileShader(shader);

  GLint ok;
  glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
  if (!ok) {
    char log[4096];
    glGetShaderInfoLog(shader, sizeof log, NULL, log);
    fprintf(stderr, "shader-screensaver: %s: compile failed:\n%s\n", label, log);
    glDeleteShader(shader);
    return 0;
  }
  return shader;
}

// Loads, wraps and links one shader file; returns 0 (after logging why) on failure.
static GLuint load_program(const char *path, Format *fmt_out) {
  char *src = SDL_LoadFile(path, NULL);
  if (!src) {
    fprintf(stderr, "shader-screensaver: cannot read %s: %s\n", path, SDL_GetError());
    return 0;
  }
  blank_version_lines(src);
  Format fmt = detect_format(src);
  char *frag_src = wrap_source(src, fmt);
  SDL_free(src);

  GLuint vert = compile_shader(GL_VERTEX_SHADER, VERT_SRC, "vertex");
  GLuint frag = compile_shader(GL_FRAGMENT_SHADER, frag_src, path);
  free(frag_src);
  if (!vert || !frag) {
    if (vert) glDeleteShader(vert);
    if (frag) glDeleteShader(frag);
    return 0;
  }

  GLuint program = glCreateProgram();
  glAttachShader(program, vert);
  glAttachShader(program, frag);
  glLinkProgram(program);
  glDeleteShader(vert);
  glDeleteShader(frag);

  GLint ok;
  glGetProgramiv(program, GL_LINK_STATUS, &ok);
  if (!ok) {
    char log[4096];
    glGetProgramInfoLog(program, sizeof log, NULL, log);
    fprintf(stderr, "shader-screensaver: %s: link failed:\n%s\n", path, log);
    glDeleteProgram(program);
    return 0;
  }
  *fmt_out = fmt;
  return program;
}

static void lookup_uniforms(GLuint program, Uniform *uniforms) {
  for (size_t i = 0; i < N_UNIFORM_NAMES; i++) uniforms[i].loc = -1;

  GLint count;
  glGetProgramiv(program, GL_ACTIVE_UNIFORMS, &count);
  for (GLint k = 0; k < count; k++) {
    char name[128];
    GLint size;
    GLenum type;
    glGetActiveUniform(program, (GLuint)k, sizeof name, NULL, &size, &type, name);
    for (size_t i = 0; i < N_UNIFORM_NAMES; i++) {
      if (strcmp(name, UNIFORM_NAMES[i].name)) continue;
      uniforms[i].loc = glGetUniformLocation(program, name);
      uniforms[i].type = type;
    }
  }
}

static void set_uniform(Uniform u, const float *v) {
  switch (u.type) {
  case GL_FLOAT: glUniform1f(u.loc, v[0]); break;
  case GL_FLOAT_VEC2: glUniform2fv(u.loc, 1, v); break;
  case GL_FLOAT_VEC3: glUniform3fv(u.loc, 1, v); break;
  case GL_FLOAT_VEC4: glUniform4fv(u.loc, 1, v); break;
  case GL_INT: glUniform1i(u.loc, (GLint)v[0]); break;
  case GL_FLOAT_MAT4: glUniformMatrix4fv(u.loc, 1, GL_FALSE, v); break;
  }
}

static void init_values(Values v, float refresh) {
  memset(v, 0, sizeof(Values));
  // Neutral camera for FragCoord's u_camera_*: at (0,0,3) looking down -z.
  v[U_CAMPOS][2] = 3.0f;
  v[U_CAMDIR][2] = -1.0f;
  for (int i = 0; i < 4; i++) v[U_CAMVIEW][i * 5] = 1.0f;
  v[U_CAMVIEW][14] = -3.0f;
  v[U_MOUSE_NORM][0] = v[U_MOUSE_NORM][1] = 0.5f;
  v[U_MOUSE_FC][2] = v[U_MOUSE_FC][3] = -1.0f;
  v[U_RATE][0] = refresh;
  v[U_MAXREC][0] = 1.0f;
}

static void update_values(Values v, int w, int h, double time_s, double dt, unsigned frame) {
  struct timespec ts;
  struct tm tm;
  clock_gettime(CLOCK_REALTIME, &ts);
  localtime_r(&ts.tv_sec, &tm);

  v[U_RES][0] = (float)w, v[U_RES][1] = (float)h, v[U_RES][2] = 1.0f;
  v[U_TIME][0] = (float)time_s;
  v[U_DT][0] = (float)dt;
  v[U_FRAME][0] = (float)frame;
  v[U_MOUSE_FC][0] = w * 0.5f, v[U_MOUSE_FC][1] = h * 0.5f;
  v[U_DATE][0] = (float)(tm.tm_year + 1900);
  v[U_DATE][1] = (float)tm.tm_mon;
  v[U_DATE][2] = (float)tm.tm_mday;
  v[U_DATE][3] = (float)(tm.tm_hour * 3600 + tm.tm_min * 60 + tm.tm_sec) + (float)(ts.tv_nsec / 1e9);
}

// Draws one frame into fbo (0 = the window), keeping alpha opaque whatever the
// shader writes so the window never shows through.
static void draw_frame(const Uniform *uniforms, Values v, GLuint fbo, int w, int h) {
  for (size_t i = 0; i < N_UNIFORM_NAMES; i++)
    if (uniforms[i].loc >= 0) set_uniform(uniforms[i], v[UNIFORM_NAMES[i].slot]);

  glBindFramebuffer(GL_FRAMEBUFFER, fbo);
  glViewport(0, 0, w, h);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
  glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
  glClear(GL_COLOR_BUFFER_BIT);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_FALSE);
  glDrawArrays(GL_TRIANGLES, 0, 3);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
}

static void target_resize(Target *t, int w, int h) {
  if (!t->fbo) {
    glGenFramebuffers(1, &t->fbo);
    glGenTextures(1, &t->tex);
  }
  glBindTexture(GL_TEXTURE_2D, t->tex);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glBindFramebuffer(GL_FRAMEBUFFER, t->fbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, t->tex, 0);
  t->w = w, t->h = h;
}

static void put_u32(unsigned char *p, uint32_t v) {
  p[0] = v >> 24, p[1] = v >> 16, p[2] = v >> 8, p[3] = v;
}

static void write_chunk(FILE *f, const char *type, const unsigned char *data, uint32_t len) {
  unsigned char head[8], crc_bytes[4];
  put_u32(head, len);
  memcpy(head + 4, type, 4);
  fwrite(head, 1, 8, f);
  if (len) fwrite(data, 1, len, f);

  uLong crc = crc32(0, (const Bytef *)type, 4);
  if (len) crc = crc32(crc, data, len);
  put_u32(crc_bytes, (uint32_t)crc);
  fwrite(crc_bytes, 1, 4, f);
}

// Writes bottom-up RGBA rows (as glReadPixels returns them) as an RGB PNG.
static bool write_png(const char *path, const unsigned char *rgba, int w, int h) {
  size_t stride = 1 + (size_t)w * 3, raw_len = stride * h;
  unsigned char *raw = malloc(raw_len);
  for (int y = 0; y < h; y++) {
    unsigned char *row = raw + y * stride;
    const unsigned char *src = rgba + (size_t)(h - 1 - y) * w * 4;
    row[0] = 0;
    for (int x = 0; x < w; x++) memcpy(row + 1 + x * 3, src + x * 4, 3);
  }

  uLongf z_len = compressBound(raw_len);
  unsigned char *z = malloc(z_len);
  bool ok = compress2(z, &z_len, raw, raw_len, 6) == Z_OK;
  FILE *f = ok ? fopen(path, "wb") : NULL;
  if (f) {
    unsigned char ihdr[13] = {0};
    put_u32(ihdr, (uint32_t)w);
    put_u32(ihdr + 4, (uint32_t)h);
    ihdr[8] = 8, ihdr[9] = 2; // 8-bit truecolor
    fwrite("\x89PNG\r\n\x1a\n", 1, 8, f);
    write_chunk(f, "IHDR", ihdr, 13);
    write_chunk(f, "IDAT", z, (uint32_t)z_len);
    write_chunk(f, "IEND", NULL, 0);
    ok = fclose(f) == 0;
  }
  free(raw);
  free(z);
  return f && ok;
}

static void read_frame(const Uniform *uniforms, Values v, const Target *t, double time_s, unsigned char *pixels) {
  update_values(v, t->w, t->h, time_s, 1.0 / 60.0, (unsigned)(time_s * 60.0));
  draw_frame(uniforms, v, t->fbo, t->w, t->h);
  glReadPixels(0, 0, t->w, t->h, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
}

// Compiles `path`; with `thumb`, also renders it offscreen at `at` seconds and
// reports what a reviewer needs without putting anything on screen.
static int run_check(const char *path, const char *thumb, double at) {
  Format fmt;
  GLuint program = load_program(path, &fmt);
  if (!program) return 1;
  printf("%s: OK (%s format)\n", path, FORMAT_NAMES[fmt]);
  if (!thumb) return 0;

  glUseProgram(program);
  Uniform uniforms[N_UNIFORM_NAMES];
  lookup_uniforms(program, uniforms);
  GLuint vao;
  glGenVertexArrays(1, &vao);
  glBindVertexArray(vao);
  Values v;
  init_values(v, 60.0f);

  enum { TW = 640, TH = 360 };
  Target small = {0};
  target_resize(&small, TW, TH);
  unsigned char *a = malloc(TW * TH * 4), *b = malloc(TW * TH * 4);
  read_frame(uniforms, v, &small, at, a);
  read_frame(uniforms, v, &small, at + 1.5, b);
  if (!write_png(thumb, a, TW, TH)) {
    fprintf(stderr, "shader-screensaver: cannot write %s\n", thumb);
    return 1;
  }

  double lum_sum = 0.0, diff_sum = 0.0;
  int white = 0, black = 0;
  for (int i = 0; i < TW * TH; i++) {
    const unsigned char *p = a + i * 4, *q = b + i * 4;
    double lum = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255.0;
    lum_sum += lum;
    white += lum > 0.9;
    black += lum < 0.03;
    diff_sum += (abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2])) / (3.0 * 255.0);
  }
  free(a);
  free(b);

  Target big = {0};
  target_resize(&big, 1920, 1080);
  update_values(v, big.w, big.h, at, 1.0 / 60.0, 0);
  draw_frame(uniforms, v, big.fbo, big.w, big.h);
  glFinish();
  Uint64 t0 = SDL_GetTicksNS();
  for (int i = 1; i <= 8; i++) {
    update_values(v, big.w, big.h, at + i / 60.0, 1.0 / 60.0, (unsigned)i);
    draw_frame(uniforms, v, big.fbo, big.w, big.h);
  }
  glFinish();
  double ms = (SDL_GetTicksNS() - t0) / 8.0 / 1e6;

  printf("  thumbnail:  %s (t=%.1fs, %dx%d)\n", thumb, at, TW, TH);
  printf("  brightness: mean %.2f, white %.1f%%, black %.1f%%\n", lum_sum / (TW * TH),
         100.0 * white / (TW * TH), 100.0 * black / (TW * TH));
  printf("  motion:     %.3f (mean change over 1.5s)\n", diff_sum / (TW * TH));
  printf("  cost:       %.1f ms/frame at 1920x1080\n", ms);
  return 0;
}

static int compare_strings(const void *a, const void *b) {
  return strcmp(*(char *const *)a, *(char *const *)b);
}

static bool has_suffix(const char *s, const char *suffix) {
  size_t n = strlen(s), m = strlen(suffix);
  return n >= m && !strcmp(s + n - m, suffix);
}

// A file yields itself; a directory yields its *.frag / *.glsl files, shuffled.
static int collect_shaders(const char *path, char ***out) {
  struct stat st;
  if (stat(path, &st) != 0) return 0;
  if (!S_ISDIR(st.st_mode)) {
    *out = malloc(sizeof(char *));
    (*out)[0] = strdup(path);
    return 1;
  }

  DIR *dir = opendir(path);
  if (!dir) return 0;
  int count = 0, cap = 16;
  *out = malloc(cap * sizeof(char *));

  struct dirent *entry;
  while ((entry = readdir(dir))) {
    if (entry->d_name[0] == '.' || !(has_suffix(entry->d_name, ".frag") || has_suffix(entry->d_name, ".glsl"))) continue;
    char full[PATH_MAX];
    if (snprintf(full, sizeof full, "%s/%s", path, entry->d_name) >= (int)sizeof full) continue;
    if (stat(full, &st) != 0 || !S_ISREG(st.st_mode)) continue;
    if (count == cap) *out = realloc(*out, (cap *= 2) * sizeof(char *));
    (*out)[count++] = strdup(full);
  }
  closedir(dir);

  // Sort first so a given seed always yields the same order.
  qsort(*out, count, sizeof(char *), compare_strings);
  for (int i = count - 1; i > 0; i--) {
    int j = rand() % (i + 1);
    char *tmp = (*out)[i];
    (*out)[i] = (*out)[j], (*out)[j] = tmp;
  }
  return count;
}

static void state_path(char *buf, size_t size, const char *file) {
  const char *xdg = getenv("XDG_STATE_HOME");
  if (xdg && *xdg) snprintf(buf, size, "%s/shader-screensaver", xdg);
  else snprintf(buf, size, "%s/.local/state/shader-screensaver", getenv("HOME"));
  mkdir(buf, 0755);
  if (file) {
    size_t len = strlen(buf);
    snprintf(buf + len, size - len, "/%s", file);
  }
}

static bool command_output_contains(const char *cmd, const char *needle) {
  FILE *pipe = popen(cmd, "r");
  if (!pipe) return false;

  char buf[8192];
  size_t n = fread(buf, 1, sizeof buf - 1, pipe);
  buf[n] = '\0';
  pclose(pipe);
  return strstr(buf, needle) != NULL;
}

// Same rule as Omarchy's terminal screensaver: keep running only while a
// screensaver window is focused (other monitors' instances count) and the
// session isn't locked.
static bool screensaver_should_stay(const char *app_id) {
  if (command_output_contains("omarchy-shell lock isLocked 2>/dev/null", "true")) return false;

  char needle[256];
  snprintf(needle, sizeof needle, "\"class\": \"%s\"", app_id);
  return command_output_contains("hyprctl activewindow -j 2>/dev/null", needle);
}

// Dismissing one monitor's screensaver dismisses them all. Matches sibling
// instances by executable rather than command line, so unrelated processes
// that merely mention the app id are left alone.
static void close_all_screensavers(void) {
  char self_exe[PATH_MAX];
  ssize_t len = readlink("/proc/self/exe", self_exe, sizeof self_exe - 1);
  if (len < 0) return;
  self_exe[len] = '\0';

  DIR *proc = opendir("/proc");
  if (!proc) return;

  pid_t self = getpid();
  struct dirent *entry;
  while ((entry = readdir(proc))) {
    pid_t pid = (pid_t)atoi(entry->d_name);
    if (pid <= 0 || pid == self) continue;

    char link[64], exe[PATH_MAX];
    snprintf(link, sizeof link, "/proc/%d/exe", pid);
    ssize_t n = readlink(link, exe, sizeof exe - 1);
    if (n < 0) continue;
    exe[n] = '\0';
    if (!strcmp(exe, self_exe)) kill(pid, SIGTERM);
  }
  closedir(proc);
}

__attribute__((format(printf, 1, 2))) static void log_line(const char *fmt, ...) {
  char when[32];
  time_t wall = time(NULL);
  strftime(when, sizeof when, "%F %T", localtime(&wall));

  va_list ap;
  va_start(ap, fmt);
  fprintf(stderr, "%s ", when);
  vfprintf(stderr, fmt, ap);
  fputc('\n', stderr);
  va_end(ap);
}

// Opens the first shader that compiles, starting at `from` and moving by
// `step` through the playlist (wrapping around). Files that fail are marked
// gone so a cycle doesn't retry them. Returns 0 when nothing usable is left.
static GLuint open_shader(char **files, bool *gone, int count, int from, int step, int *index, Format *fmt) {
  for (int n = 0; n < count; n++) {
    int i = ((from + step * n) % count + count) % count;
    if (gone[i]) continue;
    GLuint program = load_program(files[i], fmt);
    if (program) {
      *index = i;
      return program;
    }
    gone[i] = true;
  }
  return 0;
}

// Records what's on screen: the run log (which drives the rotation and
// `screensaver-shaders history`) and the "current" file.
static void announce(const char *path, Format fmt) {
  log_line("showing %s (%s format)", path, FORMAT_NAMES[fmt]);

  char current_path[PATH_MAX];
  state_path(current_path, sizeof current_path, "current");
  FILE *current = fopen(current_path, "w");
  if (current) {
    fprintf(current, "%s\n", path);
    fclose(current);
  }
}

// Cycle mode tells the wrapper script what's on screen, as tab-separated lines.
static void report_show(char **files, const bool *gone, int count, int index) {
  int pos = 0, total = 0;
  for (int i = 0; i < count; i++) {
    if (gone[i]) continue;
    total++;
    if (i <= index) pos++;
  }
  printf("show\t%d\t%d\t%s\n", pos, total, files[index]);
}

static void usage(const char *argv0) {
  fprintf(stderr,
          "usage: %s [--shader FILE|DIR]... [--scale 0.1-1] [--max-fps N] [--seed N] [--app-id ID] [--log FILE] [--fps]\n"
          "       %s --cycle SECONDS [--shader FILE|DIR]... [...]\n"
          "       %s --check FILE [--thumb OUT.png] [--time SECONDS]\n",
          argv0, argv0, argv0);
}

int main(int argc, char **argv) {
  const char *app_id = "org.omarchy.screensaver";
  const char *shader_args[256];
  int n_shader_args = 0;
  const char *check_path = NULL, *thumb_path = NULL, *log_path = NULL;
  double thumb_time = 4.0;
  float scale = 1.0f;
  unsigned seed = (unsigned)time(NULL) ^ ((unsigned)getpid() << 16);
  bool show_fps = false;
  double cycle_seconds = 0.0, max_fps = 0.0;

  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--app-id") && i + 1 < argc) app_id = argv[++i];
    else if (!strcmp(argv[i], "--shader") && i + 1 < argc) {
      if (n_shader_args < (int)SDL_arraysize(shader_args)) shader_args[n_shader_args++] = argv[i + 1];
      i++;
    } else if (!strcmp(argv[i], "--check") && i + 1 < argc) check_path = argv[++i];
    else if (!strcmp(argv[i], "--thumb") && i + 1 < argc) thumb_path = argv[++i];
    else if (!strcmp(argv[i], "--time") && i + 1 < argc) thumb_time = strtod(argv[++i], NULL);
    else if (!strcmp(argv[i], "--log") && i + 1 < argc) log_path = argv[++i];
    else if (!strcmp(argv[i], "--scale") && i + 1 < argc) scale = strtof(argv[++i], NULL);
    else if (!strcmp(argv[i], "--seed") && i + 1 < argc) seed = (unsigned)strtoul(argv[++i], NULL, 10);
    else if (!strcmp(argv[i], "--cycle") && i + 1 < argc) {
      cycle_seconds = strtod(argv[++i], NULL);
      if (cycle_seconds < 0.5) cycle_seconds = 0.5;
    }
    else if (!strcmp(argv[i], "--max-fps") && i + 1 < argc) max_fps = strtod(argv[++i], NULL);
    else if (!strcmp(argv[i], "--fps")) show_fps = true;
    else {
      usage(argv[0]);
      return 2;
    }
  }
  if (!(scale >= 0.1f && scale <= 1.0f)) scale = 1.0f;
  if (log_path) {
    if (freopen(log_path, "a", stderr)) setvbuf(stderr, NULL, _IOLBF, 0); // files default to full buffering
    else perror("shader-screensaver: --log");
  }

  char default_dir[PATH_MAX];
  if (n_shader_args == 0) {
    const char *xdg = getenv("XDG_CONFIG_HOME");
    if (xdg && *xdg) snprintf(default_dir, sizeof default_dir, "%s/shader-screensaver/shaders", xdg);
    else snprintf(default_dir, sizeof default_dir, "%s/.config/shader-screensaver/shaders", getenv("HOME"));
    shader_args[n_shader_args++] = default_dir;
  }

  // Twigl snippets rely on uninitialized locals being zero; ask Mesa to guarantee it.
  setenv("glsl_zero_init", "true", 0);

  if (check_path) app_id = "shader-screensaver-check";
  SDL_SetHint(SDL_HINT_APP_ID, app_id);
  SDL_SetAppMetadata("Shader Screensaver", "1.0", app_id);

  // Mesa announces the glsl_zero_init override on stderr while the context is
  // created; keep that notice out of logs and check output.
  fflush(stderr);
  int saved_stderr = dup(STDERR_FILENO), devnull = open("/dev/null", O_WRONLY);
  if (devnull >= 0) dup2(devnull, STDERR_FILENO);

  SDL_Window *win = NULL;
  SDL_GLContext ctx = NULL;
  if (SDL_Init(SDL_INIT_VIDEO)) {
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
    SDL_GL_SetAttribute(SDL_GL_ALPHA_SIZE, 0);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 0);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);

    SDL_WindowFlags flags = SDL_WINDOW_OPENGL | (check_path ? SDL_WINDOW_HIDDEN : SDL_WINDOW_FULLSCREEN | SDL_WINDOW_BORDERLESS);
    win = SDL_CreateWindow("Shader Screensaver", 1280, 720, flags);
    if (win) ctx = SDL_GL_CreateContext(win);
    if (ctx && !check_path) SDL_GL_SetSwapInterval(1);
  }

  fflush(stderr); // anything Mesa buffered goes to /dev/null too
  if (saved_stderr >= 0) dup2(saved_stderr, STDERR_FILENO), close(saved_stderr);
  if (devnull >= 0) close(devnull);
  if (!ctx) {
    fprintf(stderr, "shader-screensaver: cannot create a GL window: %s\n", SDL_GetError());
    return 1;
  }

  if (check_path) {
    int rc = run_check(check_path, thumb_path, thumb_time);
    SDL_Quit();
    return rc;
  }

  // Build the playlist in the order given; the launcher puts never-shown and
  // long-unseen shaders first and passes the same arguments to every monitor.
  srand(seed);
  char **files = NULL;
  int file_count = 0;
  for (int a = 0; a < n_shader_args; a++) {
    char **part = NULL;
    int k = collect_shaders(shader_args[a], &part);
    files = realloc(files, (size_t)(file_count + k + 1) * sizeof(char *));
    if (k) memcpy(files + file_count, part, (size_t)k * sizeof(char *));
    file_count += k;
    free(part);
  }

  bool *gone = calloc(SDL_max(file_count, 1), sizeof(bool)); // deleted, or failed to compile
  Format fmt = FMT_TWIGL;
  int index = 0;
  GLuint program = open_shader(files, gone, file_count, 0, 1, &index, &fmt);
  if (!program) {
    fprintf(stderr, "shader-screensaver: no usable shader found\n");
    return 1;
  }
  announce(files[index], fmt);

  bool cycle = cycle_seconds > 0.0;
  if (cycle) {
    setvbuf(stdout, NULL, _IOLBF, 0);
    report_show(files, gone, file_count, index);
  }

  SDL_HideCursor();

  glUseProgram(program);
  Uniform uniforms[N_UNIFORM_NAMES];
  lookup_uniforms(program, uniforms);

  GLuint vao;
  glGenVertexArrays(1, &vao);
  glBindVertexArray(vao);

  const SDL_DisplayMode *mode = SDL_GetCurrentDisplayMode(SDL_GetDisplayForWindow(win));
  float refresh = mode && mode->refresh_rate > 0 ? mode->refresh_rate : 60.0f;
  // Frames beyond max_fps are held back; vsync alone covers displays that
  // aren't faster than the cap.
  bool limit_fps = max_fps > 0.0 && max_fps < refresh - 0.5;
  double frame_rate = limit_fps ? max_fps : refresh;
  // Below this frame rate the render resolution drops (heavy shaders).
  double min_fps = SDL_min(20.0, frame_rate * 0.66);

  Values values;
  init_values(values, refresh);

  // At scale < 1 the shader renders into a smaller offscreen texture that is
  // stretched to the window, trading sharpness for frame rate.
  Target offscreen = {0};
  int pw = 0, ph = 0, rw = 0, rh = 0;
  float target_scale = 0.0f;

  Uint64 start = SDL_GetTicksNS(), last = start, fps_mark = start, perf_mark = start, check_focus_at = 0;
  const Uint64 session_start = start;
  const float start_scale = scale;
  // Cycle mode: when to advance, and what the keys asked for this frame.
  Uint64 advance_at = start + (Uint64)(cycle_seconds * 1e9);
  bool paused = false, delete_current = false;
  int switch_step = 0;
  unsigned frame = 0;
  int frames = 0, perf_frames = 0;
  float motion = 0.0f;
  const char *stop_reason = NULL;

  for (;;) {
    Uint64 now = SDL_GetTicksNS();
    double elapsed = (now - start) / 1e9;

    SDL_Event ev;
    while (SDL_PollEvent(&ev)) {
      bool armed = elapsed > 0.5;
      switch (ev.type) {
      case SDL_EVENT_QUIT:
        stop_reason = "window closed";
        break;
      case SDL_EVENT_KEY_DOWN:
        if (ev.key.repeat) break;
        if (!cycle) {
          if (armed) stop_reason = "key press";
          break;
        }
        switch (ev.key.key) {
        case SDLK_ESCAPE:
        case SDLK_Q:
          stop_reason = "quit";
          break;
        case SDLK_SPACE:
          paused = !paused;
          advance_at = now + (Uint64)(cycle_seconds * 1e9);
          printf("%s\t%s\n", paused ? "paused" : "resumed", files[index]);
          break;
        case SDLK_D:
          delete_current = true;
          break;
        case SDLK_RIGHT:
        case SDLK_N:
          switch_step = 1;
          break;
        case SDLK_LEFT:
        case SDLK_P:
          switch_step = -1;
          break;
        default:
          if (ev.key.key >= SDLK_0 && ev.key.key <= SDLK_9) {
            cycle_seconds = ev.key.key == SDLK_0 ? 10.0 : (double)(ev.key.key - SDLK_0);
            paused = false;
            advance_at = now + (Uint64)(cycle_seconds * 1e9);
            printf("interval\t%.0f\t%s\n", cycle_seconds, files[index]);
          }
        }
        break;
      case SDL_EVENT_MOUSE_BUTTON_DOWN:
      case SDL_EVENT_MOUSE_WHEEL:
      case SDL_EVENT_FINGER_DOWN:
        if (armed && !cycle) stop_reason = "click or scroll";
        break;
      case SDL_EVENT_MOUSE_MOTION:
        // Ignore jitter and the pointer settling right after the window maps.
        if (!cycle && elapsed > 1.5 && (motion += fabsf(ev.motion.xrel) + fabsf(ev.motion.yrel)) > 24.0f)
          stop_reason = "mouse moved";
        break;
      case SDL_EVENT_WINDOW_FOCUS_LOST:
        // Deferred: while launching on several monitors focus hops between
        // outputs before every instance has mapped.
        check_focus_at = now + 1500000000ull;
        break;
      case SDL_EVENT_WINDOW_FOCUS_GAINED:
        check_focus_at = 0;
        break;
      }
    }
    if (check_focus_at && now >= check_focus_at) {
      check_focus_at = 0;
      if (!screensaver_should_stay(app_id)) stop_reason = "focus left the screensaver or the session locked";
    }
    if (stop_reason) break;

    if (cycle && !paused && !switch_step && !delete_current && now >= advance_at) switch_step = 1;
    if (delete_current || switch_step) {
      if (delete_current) {
        printf("delete\t%s\n", files[index]);
        gone[index] = true;
        if (!switch_step) switch_step = 1;
      }
      glDeleteProgram(program);
      program = open_shader(files, gone, file_count, index + switch_step, switch_step, &index, &fmt);
      delete_current = false, switch_step = 0;
      if (!program) {
        stop_reason = "no shaders left";
        break;
      }
      glUseProgram(program);
      lookup_uniforms(program, uniforms);
      announce(files[index], fmt);
      report_show(files, gone, file_count, index);

      // Each shader starts at time 0 with a fresh frame-rate budget.
      start = last = perf_mark = now;
      elapsed = 0.0;
      frame = 0, perf_frames = 0;
      scale = start_scale;
      advance_at = now + (Uint64)(cycle_seconds * 1e9);
    }

    int w, h;
    SDL_GetWindowSizeInPixels(win, &w, &h);
    if (w != pw || h != ph || scale != target_scale) {
      pw = w, ph = h, target_scale = scale;
      rw = SDL_max(1, (int)(pw * scale)), rh = SDL_max(1, (int)(ph * scale));
      if (scale < 1.0f) target_resize(&offscreen, rw, rh);
    }
    bool use_offscreen = scale < 1.0f;

    update_values(values, rw, rh, elapsed, (now - last) / 1e9, frame);
    last = now;
    draw_frame(uniforms, values, use_offscreen ? offscreen.fbo : 0, rw, rh);

    if (use_offscreen) {
      glBindFramebuffer(GL_READ_FRAMEBUFFER, offscreen.fbo);
      glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
      glBlitFramebuffer(0, 0, rw, rh, 0, 0, pw, ph, GL_COLOR_BUFFER_BIT, GL_LINEAR);
    }
    SDL_GL_SwapWindow(win);
    if (limit_fps) {
      Uint64 frame_ns = (Uint64)(1e9 / max_fps), spent = SDL_GetTicksNS() - now;
      if (spent < frame_ns) SDL_DelayPrecise(frame_ns - spent);
    }
    frame++, frames++, perf_frames++;

    // Measure over 2s windows after a 1s warm-up; shrink the render target
    // while the shader can't keep up.
    if (elapsed < 1.0) perf_mark = now, perf_frames = 0;
    else if (now - perf_mark >= 2000000000ull) {
      double fps = perf_frames * 1e9 / (double)(now - perf_mark);
      if (fps < min_fps && scale > 0.36f) {
        scale = SDL_max(0.35f, scale * 0.7f);
        fprintf(stderr, "shader-screensaver: %.1f fps, render scale -> %.2f\n", fps, scale);
      }
      perf_mark = now, perf_frames = 0;
    }

    if (show_fps && now - fps_mark >= 1000000000ull) {
      fprintf(stderr, "shader-screensaver: %dx%d -> %dx%d  %.1f fps\n", rw, rh, pw, ph,
              frames * 1e9 / (double)(now - fps_mark));
      frames = 0, fps_mark = now;
    }
  }

  log_line("stopped after %.0fs: %s", (SDL_GetTicksNS() - session_start) / 1e9, stop_reason);

  SDL_GL_DestroyContext(ctx);
  SDL_DestroyWindow(win);
  SDL_Quit();
  close_all_screensavers();
  return 0;
}
