//! Turns shader code as pasted from twigl, FragCoord or Shadertoy into a
//! complete GLSL ES 3.00 fragment shader.
//!
//! The GLSL wrapped around the code lives in `resources/glsl/`.

use std::borrow::Cow;
use std::fmt::{self, Write as _};

/// Fullscreen triangle shared by every format.
pub const VERTEX_SHADER: &str = include_str!("../../resources/glsl/vertex.glsl");

const TWIGL_PRELUDE: &str = include_str!("../../resources/glsl/twigl-prelude.glsl");
const TWIGL_EPILOGUE: &str = include_str!("../../resources/glsl/twigl-epilogue.glsl");
const ES_PRELUDE: &str = include_str!("../../resources/glsl/es-prelude.glsl");
const FRAG_COLOR: &str = include_str!("../../resources/glsl/frag-color.glsl");
const SHADERTOY_MAIN: &str = include_str!("../../resources/glsl/shadertoy-main.glsl");

/// Declared by `twigl-prelude.glsl`.
const TWIGL_UNIFORMS: &[(&str, &str)] =
    &[("vec2", "r"), ("vec2", "m"), ("float", "t"), ("float", "f")];

const FRAGCOORD_UNIFORMS: &[(&str, &str)] = &[
    ("vec2", "u_resolution"),
    ("float", "u_time"),
    ("float", "u_time_delta"),
    ("int", "u_frame"),
    ("vec4", "u_mouse"),
    ("vec2", "u_drag"),
    ("float", "u_scroll"),
    ("vec4", "u_date"),
    ("float", "u_refresh_rate"),
    ("int", "u_recursion"),
    ("int", "u_max_recursion"),
    ("int", "u_color_gamut"),
    ("vec3", "u_camera_pos"),
    ("vec3", "u_camera_dir"),
    ("mat4", "u_camera_view"),
];

const SHADERTOY_UNIFORMS: &[(&str, &str)] = &[
    ("vec3", "iResolution"),
    ("float", "iTime"),
    ("float", "iTimeDelta"),
    ("int", "iFrame"),
    ("float", "iFrameRate"),
    ("vec4", "iMouse"),
    ("vec4", "iDate"),
];

/// The dialects the renderer understands, told apart by their entry point.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Format {
    /// twigl "geekest (300 es)": a bare body using `FC`, `r`, `t`, `o`, `rotate3D`, ...
    Twigl,
    /// FragCoord: `void main()` writing `fragColor`, with `u_resolution`, `u_time`, ...
    FragCoord,
    /// Shadertoy: `mainImage(out vec4, in vec2)` with `iResolution`, `iTime`, ...
    Shadertoy,
}

impl Format {
    #[must_use]
    pub fn detect(code: &str) -> Self {
        if find_word(code, "mainImage").is_some() {
            Self::Shadertoy
        } else if has_void_main(code) {
            Self::FragCoord
        } else {
            Self::Twigl
        }
    }

    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Twigl => "twigl",
            Self::FragCoord => "fragcoord",
            Self::Shadertoy => "shadertoy",
        }
    }

    /// The uniforms the format's prelude provides, as (GLSL type, name).
    /// FragCoord and Shadertoy shaders may declare them themselves.
    #[must_use]
    pub const fn prelude_uniforms(self) -> &'static [(&'static str, &'static str)] {
        match self {
            Self::Twigl => TWIGL_UNIFORMS,
            Self::FragCoord => FRAGCOORD_UNIFORMS,
            Self::Shadertoy => SHADERTOY_UNIFORMS,
        }
    }
}

impl fmt::Display for Format {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.name())
    }
}

/// A shader ready to compile: its format and the complete fragment source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fragment {
    pub format: Format,
    pub source: String,
}

impl Fragment {
    /// Wraps shader code in the prelude its format expects. Compiler errors
    /// keep pointing at the right line of the original.
    #[must_use]
    pub fn new(code: &str) -> Self {
        let code = blank_version_lines(code);
        let format = Format::detect(&code);
        Self {
            format,
            source: wrap(&code, format),
        }
    }
}

fn wrap(code: &str, format: Format) -> String {
    let zeroed;
    let code = if format == Format::Twigl {
        zeroed = zero_init(code);
        zeroed.as_str()
    } else {
        code
    };
    let mut out = String::with_capacity(TWIGL_PRELUDE.len() + code.len() + 64);
    match format {
        Format::Twigl => out.push_str(TWIGL_PRELUDE),
        Format::FragCoord | Format::Shadertoy => {
            out.push_str(ES_PRELUDE);
            if !declares(code, "out", None) && !declares(code, "layout", Some("out")) {
                out.push_str(FRAG_COLOR);
            }
            for (ty, name) in format.prelude_uniforms() {
                if !declares(code, "uniform", Some(name)) {
                    writeln!(out, "uniform {ty} {name};").expect("writing to a String cannot fail");
                }
            }
        }
    }
    out.push_str("#line 1\n");
    out.push_str(code);
    // On a line of its own, in case the code ends in a // comment.
    out.push('\n');
    match format {
        Format::Twigl => out.push_str(TWIGL_EPILOGUE),
        Format::Shadertoy if !has_void_main(code) => out.push_str(SHADERTOY_MAIN),
        Format::FragCoord | Format::Shadertoy => {}
    }
    out
}

/// Blanks `#version` lines (the prelude supplies its own) without moving
/// anything else, so line numbers and byte offsets stay put.
fn blank_version_lines(code: &str) -> String {
    code.split_inclusive('\n')
        .map(|line| {
            let body = line.strip_suffix('\n').unwrap_or(line);
            let indent = body.len() - body.trim_ascii_start().len();
            if body[indent..].starts_with("#version") {
                let blanks = " ".repeat(body.len() - indent);
                Cow::Owned([&line[..indent], &blanks, &line[body.len()..]].concat())
            } else {
                Cow::Borrowed(line)
            }
        })
        .collect()
}

/// Gives each variable declared without an initializer an explicit zero, so
/// `float a, b=1.;` becomes `float a=0., b=1.;`. twigl runs in WebGL, which
/// zeroes a local every time its declaration runs; Mesa's `glsl_zero_init`
/// zeroes it once, on entry to main, so a `for(int j;...)` nested in another
/// loop would only loop on the first pass. Arrays, struct members, comments
/// and preprocessor lines are left alone, and nothing moves to another line.
fn zero_init(code: &str) -> String {
    let tokens = tokens(code);
    let mut inserts = Vec::new();
    let mut i = 0;
    while let Some(&token) = tokens.get(i) {
        i += 1;
        match token {
            Token::Word("struct", _) => i = past_struct_body(&tokens, i),
            Token::Word(ty, _) => {
                if zero_value(ty).is_some() && matches!(tokens.get(i), Some(Token::Word(..))) {
                    i = declarators(&tokens, i, ty, &mut inserts);
                }
            }
            Token::Number | Token::Punct(_) => {}
        }
    }
    let mut out = String::with_capacity(code.len() + 8 * inserts.len());
    let mut copied = 0;
    for (at, ty) in inserts {
        out.push_str(&code[copied..at]);
        out.push('=');
        out.push_str(&zero_value(ty).unwrap_or_default());
        copied = at;
    }
    out.push_str(&code[copied..]);
    out
}

/// The zero a variable of scalar, vector or matrix type `ty` starts at.
fn zero_value(ty: &str) -> Option<Cow<'static, str>> {
    let scalar = match ty {
        "float" => "0.",
        "int" => "0",
        "uint" => "0u",
        "bool" => "false",
        _ => {
            let size = ["vec", "ivec", "uvec", "bvec", "mat"]
                .iter()
                .find_map(|prefix| ty.strip_prefix(prefix))?;
            let vector_or_square = matches!(size, "2" | "3" | "4");
            let matrix = ty.starts_with("mat")
                && matches!(size.as_bytes(), [b'2'..=b'4', b'x', b'2'..=b'4']);
            if !(vector_or_square || matrix) {
                return None;
            }
            let zero = if ty.starts_with("bvec") { "false" } else { "0" };
            return Some(Cow::Owned(format!("{ty}({zero})")));
        }
    };
    Some(Cow::Borrowed(scalar))
}

/// Walks the declarators of a declaration from `i`, just past its type,
/// noting where each one without an initializer needs a zero of type `ty`.
/// Returns the index of the token that ends the list.
fn declarators<'a>(
    tokens: &[Token<'a>],
    mut i: usize,
    ty: &'a str,
    inserts: &mut Vec<(usize, &'a str)>,
) -> usize {
    while let Some(&Token::Word(_, end)) = tokens.get(i) {
        i += 1;
        match tokens.get(i) {
            Some(Token::Punct(b'=')) => i = expression_end(tokens, i + 1),
            Some(Token::Punct(b'[')) => i = expression_end(tokens, i),
            Some(Token::Punct(b',' | b';')) => inserts.push((end, ty)),
            _ => break,
        }
        if tokens.get(i) != Some(&Token::Punct(b',')) {
            break;
        }
        i += 1;
    }
    i
}

/// The index of the `,` or `;` that ends the expression starting at `i`, or
/// of the unmatched bracket that closes around it.
fn expression_end(tokens: &[Token<'_>], mut i: usize) -> usize {
    let mut depth = 0_usize;
    while let Some(token) = tokens.get(i) {
        match token {
            Token::Punct(b'(' | b'[' | b'{') => depth += 1,
            Token::Punct(b')' | b']' | b'}' | b',' | b';') if depth == 0 => break,
            Token::Punct(b')' | b']' | b'}') => depth -= 1,
            _ => {}
        }
        i += 1;
    }
    i
}

/// The index just past the body of the struct whose name starts at `i`.
fn past_struct_body(tokens: &[Token<'_>], i: usize) -> usize {
    let mut depth = 0_usize;
    for (at, token) in tokens.iter().enumerate().skip(i) {
        match token {
            Token::Punct(b'{') => depth += 1,
            Token::Punct(b'}') if depth <= 1 => return at + 1,
            Token::Punct(b'}') => depth -= 1,
            _ => {}
        }
    }
    tokens.len()
}

/// A GLSL token, as far as `zero_init` needs to tell them apart.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Token<'a> {
    /// An identifier or keyword, and the byte offset just past it.
    Word(&'a str, usize),
    Number,
    Punct(u8),
}

/// Splits `code` into tokens, skipping whitespace, comments and preprocessor
/// lines.
fn tokens(code: &str) -> Vec<Token<'_>> {
    let bytes = code.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    let mut line_start = true;
    while let Some(&b) = bytes.get(i) {
        let rest = &bytes[i..];
        if b == b'\n' {
            line_start = true;
            i += 1;
        } else if b.is_ascii_whitespace() {
            i += 1;
        } else if (b == b'#' && line_start) || rest.starts_with(b"//") {
            // To the end of the line, following backslash continuations.
            let mut escaped = false;
            while let Some(&c) = bytes.get(i) {
                if c == b'\n' && !escaped {
                    break;
                }
                escaped = c == b'\\';
                i += 1;
            }
        } else if rest.starts_with(b"/*") {
            i += rest[2..]
                .windows(2)
                .position(|pair| pair == b"*/")
                .map_or(rest.len(), |at| at + 4);
        } else if is_ident(b) || (b == b'.' && rest.get(1).is_some_and(u8::is_ascii_digit)) {
            line_start = false;
            let start = i;
            let number = b.is_ascii_digit() || b == b'.';
            let hex = rest.starts_with(b"0x") || rest.starts_with(b"0X");
            let mut prev = b;
            i += 1;
            while let Some(&c) = bytes.get(i) {
                let exponent_sign =
                    number && !hex && matches!(c, b'+' | b'-') && matches!(prev, b'e' | b'E');
                if !(is_ident(c) || (number && c == b'.') || exponent_sign) {
                    break;
                }
                prev = c;
                i += 1;
            }
            out.push(if number {
                Token::Number
            } else {
                Token::Word(&code[start..i], i)
            });
        } else {
            line_start = false;
            out.push(Token::Punct(b));
            i += 1;
        }
    }
    out
}

const fn is_ident(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Byte offsets where `word` occurs as a whole identifier.
fn word_positions<'a>(s: &'a str, word: &'a str) -> impl Iterator<Item = usize> + 'a {
    let bytes = s.as_bytes();
    s.match_indices(word).map(|(i, _)| i).filter(move |&i| {
        let before = i.checked_sub(1).map(|j| bytes[j]);
        let after = bytes.get(i + word.len()).copied();
        !before.is_some_and(is_ident) && !after.is_some_and(is_ident)
    })
}

fn find_word(s: &str, word: &str) -> Option<usize> {
    word_positions(s, word).next()
}

/// Whether `code` defines `void main(`, allowing whitespace between the tokens.
fn has_void_main(code: &str) -> bool {
    word_positions(code, "main").any(|i| {
        let called = code[i + "main".len()..].trim_ascii_start().starts_with('(');
        let returns_void = code[..i]
            .trim_ascii_end()
            .strip_suffix("void")
            .is_some_and(|rest| !rest.bytes().next_back().is_some_and(is_ident));
        called && returns_void
    })
}

/// True if some line starts with the keyword `first` and, when given,
/// mentions `name`, e.g. `declares(code, "uniform", Some("u_time"))`.
fn declares(code: &str, first: &str, name: Option<&str>) -> bool {
    code.lines().any(|line| {
        let line = line.trim_ascii_start();
        let keyword = line
            .strip_prefix(first)
            .is_some_and(|rest| !rest.bytes().next().is_some_and(is_ident));
        keyword && name.is_none_or(|name| find_word(line, name).is_some())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use proptest::sample::subsequence;

    const RESOURCES: [&str; 6] = [
        VERTEX_SHADER,
        TWIGL_PRELUDE,
        TWIGL_EPILOGUE,
        ES_PRELUDE,
        FRAG_COLOR,
        SHADERTOY_MAIN,
    ];

    #[test]
    fn resources_are_whole_lines() {
        for resource in RESOURCES {
            assert!(resource.ends_with('\n'), "{resource:?}");
        }
        for prelude in [VERTEX_SHADER, TWIGL_PRELUDE, ES_PRELUDE] {
            assert!(prelude.starts_with("#version 300 es\n"));
        }
    }

    #[test]
    fn the_twigl_prelude_declares_its_uniforms() {
        for (ty, name) in TWIGL_UNIFORMS {
            assert!(
                TWIGL_PRELUDE.contains(&format!("uniform {ty} {name};\n")),
                "{name}"
            );
        }
    }

    #[test]
    fn a_bare_body_is_twigl() {
        assert_eq!(Format::detect("o+=vec4(FC.xy/r,0,1);"), Format::Twigl);
        assert_eq!(Format::detect(""), Format::Twigl);
    }

    #[test]
    fn void_main_is_fragcoord() {
        for code in [
            "void main(){}",
            "void main (void) {}",
            "void\nmain\n(){}",
            "precision highp float;\nvoid main() {}",
        ] {
            assert_eq!(Format::detect(code), Format::FragCoord, "{code:?}");
        }
    }

    #[test]
    fn main_image_is_shadertoy_even_next_to_void_main() {
        assert_eq!(
            Format::detect("void mainImage(out vec4 c, in vec2 p){}"),
            Format::Shadertoy
        );
        assert_eq!(
            Format::detect("void main(){}\nvoid mainImage(out vec4 c, in vec2 p){}"),
            Format::Shadertoy
        );
    }

    #[test]
    fn main_must_be_a_whole_word_returning_void() {
        for code in [
            "void mainly(){}",
            "avoid main(){}",
            "void domain(){}",
            "int main(){}",
            "void main;",
            "main()",
            "void_main()",
        ] {
            assert_eq!(Format::detect(code), Format::Twigl, "{code:?}");
        }
    }

    #[test]
    fn main_image_must_be_a_whole_word() {
        assert_eq!(Format::detect("void mainImages(){}"), Format::Twigl);
        assert_eq!(
            Format::detect("void main(){ mainImage2(); }"),
            Format::FragCoord
        );
    }

    #[test]
    fn names_match_the_run_log() {
        let names = [Format::Twigl, Format::FragCoord, Format::Shadertoy].map(|f| f.to_string());
        assert_eq!(names, ["twigl", "fragcoord", "shadertoy"]);
    }

    #[test]
    fn version_lines_are_blanked_in_place() {
        let code = "#version 300 es\nvoid main(){}\n  #version 100\n";
        assert_eq!(
            blank_version_lines(code),
            "               \nvoid main(){}\n              \n"
        );
    }

    #[test]
    fn a_final_version_line_needs_no_newline() {
        assert_eq!(
            blank_version_lines("x\n\t#version 300 es"),
            "x\n\t               "
        );
    }

    #[test]
    fn mentions_of_version_elsewhere_stay() {
        let code = "// #version 300 es\nint v = 1; #version\n";
        assert_eq!(blank_version_lines(code), code);
    }

    #[test]
    fn twigl_goes_inside_the_geekest_main() {
        let fragment = Fragment::new("o=vec4(1);");
        assert_eq!(fragment.format, Format::Twigl);
        assert_eq!(
            fragment.source,
            format!("{TWIGL_PRELUDE}#line 1\no=vec4(1);\n{TWIGL_EPILOGUE}")
        );
    }

    #[test]
    fn a_trailing_comment_cannot_swallow_the_epilogue() {
        let source = Fragment::new("o=vec4(1); // done").source;
        assert!(source.ends_with(&format!("// done\n{TWIGL_EPILOGUE}")));
    }

    #[test]
    fn fragcoord_gets_the_output_and_uniforms_it_lacks() {
        let fragment = Fragment::new("uniform float u_time;\nvoid main(){fragColor=vec4(u_time);}");
        assert_eq!(fragment.format, Format::FragCoord);
        assert!(fragment.source.starts_with(ES_PRELUDE));
        assert!(fragment.source.contains(FRAG_COLOR));
        assert!(fragment.source.contains("uniform vec2 u_resolution;\n"));
        assert!(fragment.source.contains("uniform mat4 u_camera_view;\n"));
        assert_eq!(fragment.source.matches("uniform float u_time;").count(), 1);
        assert!(!fragment.source.contains("iResolution"));
        assert!(!fragment.source.contains(SHADERTOY_MAIN));
    }

    #[test]
    fn a_declared_output_is_not_declared_again() {
        for code in [
            "out vec4 color;\nvoid main(){color=vec4(1);}",
            "  layout(location = 0) out vec4 c;\nvoid main(){}",
        ] {
            assert!(!Fragment::new(code).source.contains(FRAG_COLOR), "{code:?}");
        }
    }

    #[test]
    fn only_real_output_declarations_count() {
        for code in [
            "layout(std140) uniform B{float x;};\nvoid main(){}",
            "output(1);\nvoid main(){}",
            "vec4 f(){ out vec4 x; }\nvoid main(){}",
        ] {
            assert!(Fragment::new(code).source.contains(FRAG_COLOR), "{code:?}");
        }
    }

    #[test]
    fn shadertoy_gets_a_main_that_calls_main_image() {
        let fragment = Fragment::new("void mainImage(out vec4 c, in vec2 p){c=vec4(iTime);}");
        assert_eq!(fragment.format, Format::Shadertoy);
        assert!(fragment.source.ends_with(SHADERTOY_MAIN));
        assert!(fragment.source.contains("uniform vec3 iResolution;\n"));
        assert!(!fragment.source.contains("u_resolution"));
    }

    #[test]
    fn shadertoy_with_its_own_main_keeps_it() {
        let code = "void mainImage(out vec4 c, in vec2 p){}\nvoid main(){mainImage(fragColor, gl_FragCoord.xy);}";
        assert!(Fragment::new(code).source.ends_with(&format!("{code}\n")));
    }

    #[test]
    fn code_starts_at_line_one() {
        for code in [
            "o=vec4(1);",
            "void main(){}",
            "void mainImage(out vec4 c, in vec2 p){}",
        ] {
            let source = Fragment::new(code).source;
            let at = source.find(code).expect("code is included verbatim");
            assert!(source[..at].ends_with("#line 1\n"), "{code:?}");
        }
    }

    fn naive_find_word(s: &str, word: &str) -> Option<usize> {
        let (s, w) = (s.as_bytes(), word.as_bytes());
        (0..=s.len().checked_sub(w.len())?).find(|&i| {
            s[i..].starts_with(w)
                && (i == 0 || !is_ident(s[i - 1]))
                && s.get(i + w.len()).is_none_or(|&b| !is_ident(b))
        })
    }

    fn newlines(s: &str) -> Vec<usize> {
        s.match_indices('\n').map(|(i, _)| i).collect()
    }

    fn code_with_version_lines() -> impl Strategy<Value = String> {
        let line = prop_oneof!["[ \t]{0,2}#version[ 0-9a-z]{0,8}", "[^\n]{0,16}"];
        (prop::collection::vec(line, 0..8), any::<bool>()).prop_map(|(lines, newline)| {
            let mut code = lines.join("\n");
            if newline {
                code.push('\n');
            }
            code
        })
    }

    fn assert_prelude_declares_each_uniform_once(
        format: Format,
        declared: &[(&str, &str)],
        entry: &str,
    ) {
        let code: String = declared
            .iter()
            .map(|(ty, name)| format!("uniform {ty} {name};\n"))
            .chain([entry.to_owned()])
            .collect();
        let fragment = Fragment::new(&code);
        assert_eq!(fragment.format, format);
        for (_, name) in format.prelude_uniforms() {
            let declarations = fragment
                .source
                .lines()
                .filter(|l| l.starts_with("uniform") && find_word(l, name).is_some())
                .count();
            assert_eq!(declarations, 1, "{name} in {code:?}");
        }
    }

    proptest! {
        #[test]
        fn find_word_agrees_with_a_naive_scan(s in "[a-c_ (){};\n]{0,40}", word in "[a-c_]{1,3}") {
            prop_assert_eq!(find_word(&s, &word), naive_find_word(&s, &word));
        }

        #[test]
        fn blanking_moves_nothing(code in code_with_version_lines()) {
            let out = blank_version_lines(&code);
            prop_assert_eq!(out.len(), code.len());
            prop_assert_eq!(newlines(&out), newlines(&code));
            for (before, after) in code.split('\n').zip(out.split('\n')) {
                if before.trim_ascii_start().starts_with("#version") {
                    prop_assert!(after.trim_ascii().is_empty(), "{:?} -> {:?}", before, after);
                } else {
                    prop_assert_eq!(before, after);
                }
            }
        }

        #[test]
        fn any_text_wraps_into_one_complete_shader(code in any::<String>()) {
            let fragment = Fragment::new(&code);
            prop_assert!(fragment.source.starts_with("#version 300 es\n"));
            let versions = fragment.source.lines().filter(|l| l.trim_ascii_start().starts_with("#version")).count();
            prop_assert_eq!(versions, 1);
            let code = blank_version_lines(&code);
            let wrapped = if fragment.format == Format::Twigl { zero_init(&code) } else { code };
            prop_assert!(fragment.source.contains(&wrapped));
        }
    }

    #[test]
    fn twigl_locals_start_at_zero_wherever_declared() {
        assert_eq!(zero_init("float a,b=1.,c;"), "float a=0.,b=1.,c=0.;");
        assert_eq!(
            zero_init("for(float i,e;i++<9.;){for(int j;j++<3;)e++;}"),
            "for(float i=0.,e=0.;i++<9.;){for(int j=0;j++<3;)e++;}"
        );
        assert_eq!(
            zero_init("vec2 p=r*mat2(8,-6,6,8),v;"),
            "vec2 p=r*mat2(8,-6,6,8),v=vec2(0);"
        );
        assert_eq!(zero_init("float a[3], b;"), "float a[3], b=0.;");
    }

    #[test]
    fn every_scalar_vector_and_matrix_type_has_a_zero() {
        assert_eq!(
            zero_init("uint u;bool q;ivec3 i;uvec2 n;bvec2 b;mat3 m;mat2x4 w;"),
            "uint u=0u;bool q=false;ivec3 i=ivec3(0);uvec2 n=uvec2(0);bvec2 b=bvec2(false);mat3 m=mat3(0);mat2x4 w=mat2x4(0);"
        );
    }

    #[test]
    fn only_uninitialized_declarations_change() {
        for code in [
            "o=vec4(float(i));",
            "precision highp float;",
            "float a[3], b=1.;",
            "struct S{float x;vec2 y;} s;",
            "// float z;\n/* int w; */",
            "#define F float y;\n  # define G int k;",
            "float x=c?a:b, y=f(1,2);",
            "float e=1e-3,g=2.5E+2;",
        ] {
            assert_eq!(zero_init(code), code, "{code:?}");
        }
    }

    #[test]
    fn only_twigl_is_zeroed() {
        assert!(
            Fragment::new("float a;o=vec4(a);")
                .source
                .contains("float a=0.;")
        );
        assert!(
            Fragment::new("void main(){float a;}")
                .source
                .contains("float a;")
        );
    }

    fn glsl_like() -> impl Strategy<Value = String> {
        let token = prop_oneof![
            Just("float "),
            Just("int "),
            Just("vec3 "),
            Just("mat2 "),
            Just("struct "),
            Just("a"),
            Just("b"),
            Just("1."),
            Just(","),
            Just(";"),
            Just("="),
            Just("("),
            Just(")"),
            Just("["),
            Just("]"),
            Just("{"),
            Just("}"),
            Just("#"),
            Just("//"),
            Just("/*"),
            Just("*/"),
            Just(" "),
            Just("\n"),
        ];
        prop::collection::vec(token, 0..40).prop_map(|tokens| tokens.concat())
    }

    proptest! {
        #[test]
        fn zeroing_keeps_every_line_and_settles(code in glsl_like()) {
            let zeroed = zero_init(&code);
            prop_assert_eq!(newlines(&zeroed).len(), newlines(&code).len());
            prop_assert_eq!(zero_init(&zeroed), zeroed);
        }

        #[test]
        fn fragcoord_uniforms_are_declared_exactly_once(
            declared in subsequence(FRAGCOORD_UNIFORMS.to_vec(), 0..=FRAGCOORD_UNIFORMS.len()),
            body in "[a-z0-9 =;.()+*]{0,40}",
        ) {
            assert_prelude_declares_each_uniform_once(Format::FragCoord, &declared, &format!("void main(){{{body}}}\n"));
        }

        #[test]
        fn shadertoy_uniforms_are_declared_exactly_once(
            declared in subsequence(SHADERTOY_UNIFORMS.to_vec(), 0..=SHADERTOY_UNIFORMS.len()),
            body in "[a-z0-9 =;.()+*]{0,40}",
        ) {
            assert_prelude_declares_each_uniform_once(Format::Shadertoy, &declared, &format!("void mainImage(out vec4 c, in vec2 p){{{body}}}\n"));
        }
    }
}
