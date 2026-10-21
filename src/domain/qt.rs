//! Rewrites a complete GLSL ES 3.00 fragment (see `source`) into the
//! Vulkan-style GLSL 4.40 that Qt's `qsb` compiles for a QML `ShaderEffect`,
//! so the lock screen can draw the same shaders the screensaver does.
//!
//! Qt wants every non-opaque uniform in one std140 block at binding 0 that
//! starts with `qt_Matrix` and `qt_Opacity`, an explicit output location, and
//! hands out `gl_FragCoord` in window coordinates whose y axis depends on the
//! graphics API. So the loose uniforms move into that block, where the
//! `ShaderEffect` feeds them by name; `gl_FragCoord` becomes a variable worked
//! out from `qt_TexCoord0` and the item's size in pixels; and the shader's own
//! `main` is renamed and called from a new one.

use std::fmt::{self, Write as _};

use super::source::word_positions;

/// Size in pixels of the area the shader covers; the `ShaderEffect` feeds it.
pub const SIZE_UNIFORM: &str = "ss_size";
const FRAG_COORD: &str = "ss_frag_coord";
const SHADER_MAIN: &str = "ss_main";
const PRECISIONS: [&str; 3] = ["lowp", "mediump", "highp"];

/// Why a shader can't run in a `ShaderEffect`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QtError {
    /// A texture uniform, which nothing would feed.
    Sampler(String),
    /// A uniform declaration this rewrite doesn't understand: one with an
    /// initializer, a block, or one split over several lines.
    Uniform(String),
    /// No `out vec4` to write the colour to.
    NoOutput,
}

impl fmt::Display for QtError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sampler(line) => write!(f, "texture uniforms are not supported: {line}"),
            Self::Uniform(line) => write!(f, "unsupported uniform declaration: {line}"),
            Self::NoOutput => f.write_str("no `out vec4` colour output"),
        }
    }
}

impl std::error::Error for QtError {}

/// The Qt `ShaderEffect` version of `source`, a complete GLSL ES 3.00
/// fragment as `Fragment::new` builds it. Lines from `#line 1` on keep their
/// numbers, so `qsb` errors still point at the original code.
///
/// # Errors
///
/// When the shader declares something a `ShaderEffect` can't provide.
pub fn qt_source(source: &str) -> Result<String, QtError> {
    let mut members = Vec::new();
    let mut output = None;
    let mut body = String::with_capacity(source.len());
    for line in source.split_inclusive('\n') {
        let text = line.strip_suffix('\n').unwrap_or(line);
        let newline = &line[text.len()..];
        let trimmed = text.trim_ascii();
        if trimmed.starts_with("#version") {
            body.push_str(newline);
        } else if let Some(rest) = strip_keyword(trimmed, "uniform") {
            members.extend(uniform_members(rest).ok_or_else(|| error_for(trimmed))?);
            body.push_str(newline);
        } else if let Some(name) = output.is_none().then(|| output_name(trimmed)).flatten() {
            output = Some(name);
            body.push_str(newline);
        } else {
            body.push_str(line);
        }
    }
    let output = output.ok_or(QtError::NoOutput)?;
    let body = rename_word(
        &rename_word(&body, "gl_FragCoord", FRAG_COORD),
        "main",
        SHADER_MAIN,
    );

    let mut out = String::with_capacity(body.len() + 512);
    let w = &mut out;
    // Writing to a String cannot fail.
    let _ = writeln!(w, "#version 440");
    let _ = writeln!(w, "layout(location = 0) in vec2 qt_TexCoord0;");
    let _ = writeln!(w, "layout(location = 0) out vec4 {output};");
    let _ = writeln!(w, "layout(std140, binding = 0) uniform ss_uniforms {{");
    let _ = writeln!(w, "  mat4 qt_Matrix;");
    let _ = writeln!(w, "  float qt_Opacity;");
    let _ = writeln!(w, "  vec2 {SIZE_UNIFORM};");
    for member in &members {
        let _ = writeln!(w, "  {member};");
    }
    let _ = writeln!(w, "}};");
    let _ = writeln!(w, "vec4 {FRAG_COORD};");
    out.push_str(&body);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    // Qt's texture coordinates start at the top left; GL's window
    // coordinates, which the shaders expect, at the bottom left.
    let _ = writeln!(out, "void main() {{");
    let _ = writeln!(
        out,
        "  {FRAG_COORD} = vec4(qt_TexCoord0.x * {SIZE_UNIFORM}.x, (1.0 - qt_TexCoord0.y) * {SIZE_UNIFORM}.y, 0.5, 1.0);"
    );
    let _ = writeln!(out, "  {SHADER_MAIN}();");
    let _ = writeln!(out, "}}");
    Ok(out)
}

fn error_for(line: &str) -> QtError {
    let ty = strip_keyword(line, "uniform")
        .and_then(|rest| {
            rest.split_ascii_whitespace()
                .find(|w| !PRECISIONS.contains(w))
        })
        .unwrap_or_default();
    if is_texture(ty) {
        QtError::Sampler(line.to_owned())
    } else {
        QtError::Uniform(line.to_owned())
    }
}

fn is_texture(ty: &str) -> bool {
    ["sampler", "isampler", "usampler", "image", "texture"]
        .iter()
        .any(|prefix| ty.starts_with(prefix))
}

/// `rest` with the keyword `word` stripped from its start, if it starts with it.
fn strip_keyword<'a>(line: &'a str, word: &str) -> Option<&'a str> {
    line.strip_prefix(word)
        .filter(|rest| rest.starts_with(|c: char| c.is_ascii_whitespace()))
}

/// Block members for the declarators after `uniform`, e.g. `highp vec2 a, b[2];`
/// gives `vec2 a` and `vec2 b[2]`. None for anything else, textures included.
fn uniform_members(rest: &str) -> Option<Vec<String>> {
    let rest = rest
        .split_once("//")
        .map_or(rest, |(code, _)| code)
        .trim_ascii_end();
    let declaration = rest.strip_suffix(';')?;
    if declaration.contains([';', '=', '{', '}', '(']) {
        return None;
    }
    let mut words = declaration
        .split_ascii_whitespace()
        .skip_while(|w| PRECISIONS.contains(w));
    let ty = words.next()?;
    if !ty.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') || is_texture(ty) {
        return None;
    }
    let names = words.collect::<Vec<_>>().join(" ");
    let members = names
        .split(',')
        .map(str::trim_ascii)
        .map(|name| (!name.is_empty()).then(|| format!("{ty} {name}")))
        .collect::<Option<Vec<_>>>()?;
    (!members.is_empty()).then_some(members)
}

/// The name in a colour output declaration: `out vec4 o;`, optionally with a
/// `layout(...)` and a precision.
fn output_name(line: &str) -> Option<&str> {
    let line = match line.strip_prefix("layout") {
        Some(rest) => rest
            .trim_ascii_start()
            .strip_prefix('(')?
            .split_once(')')?
            .1
            .trim_ascii_start(),
        None => line,
    };
    let rest = strip_keyword(line, "out")?;
    let mut words = rest
        .strip_suffix(';')?
        .split_ascii_whitespace()
        .skip_while(|w| PRECISIONS.contains(w));
    let (ty, name) = (words.next()?, words.next()?);
    let identifier = name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_');
    (ty == "vec4" && identifier && words.next().is_none()).then_some(name)
}

/// `s` with every whole-word `from` replaced by `to`.
fn rename_word(s: &str, from: &str, to: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut copied = 0;
    for at in word_positions(s, from) {
        out.push_str(&s[copied..at]);
        out.push_str(to);
        copied = at + from.len();
    }
    out.push_str(&s[copied..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::source::Fragment;
    use proptest::prelude::*;

    fn qt(code: &str) -> String {
        qt_source(&Fragment::new(code).source).unwrap()
    }

    fn block(out: &str) -> &str {
        let start = out.find("uniform ss_uniforms {").unwrap();
        &out[start..start + out[start..].find("};").unwrap()]
    }

    #[test]
    fn twigl_uniforms_move_into_the_block() {
        let out = qt("o=vec4(FC.xy/r,t,1);");
        assert!(out.starts_with("#version 440\n"));
        let block = block(&out);
        for member in [
            "mat4 qt_Matrix;",
            "float qt_Opacity;",
            "vec2 ss_size;",
            "vec2 r;",
            "float t;",
            "float s;",
        ] {
            assert!(block.contains(member), "{member} missing from {block}");
        }
        assert!(!out.contains("uniform vec2 r;"));
        assert!(out.contains("layout(location = 0) out vec4 o;"));
    }

    #[test]
    fn frag_coord_and_main_are_rewired() {
        let out = qt("void main() { fragColor = vec4(gl_FragCoord.xy / u_resolution, 0, 1); }");
        assert!(word_positions(&out, "gl_FragCoord").next().is_none());
        assert!(out.contains("void ss_main() { fragColor = vec4(ss_frag_coord.xy"));
        assert_eq!(out.matches("void main()").count(), 1);
        assert!(out.trim_end().ends_with("ss_main();\n}"));
    }

    #[test]
    fn shadertoy_main_image_keeps_its_name() {
        let out =
            qt("void mainImage(out vec4 c, in vec2 p) { c = vec4(p / iResolution.xy, 0, 1); }");
        assert!(out.contains("void mainImage("));
        assert!(out.contains("mainImage(fragColor, ss_frag_coord.xy);"));
        assert!(block(&out).contains("vec3 iResolution;"));
    }

    #[test]
    fn declared_uniforms_and_outputs_are_taken_over() {
        let code = "out vec4 color;\nuniform highp float u_time, u_speed; // speed\nuniform vec3 k[2];\nvoid main() { color = vec4(u_time); }";
        let out = qt(code);
        let block = block(&out);
        for member in ["float u_time;", "float u_speed;", "vec3 k[2];"] {
            assert!(block.contains(member), "{member} missing from {block}");
        }
        assert!(out.contains("layout(location = 0) out vec4 color;"));
        assert_eq!(out.matches("out vec4 color;").count(), 1);
    }

    #[test]
    fn textures_and_initialized_uniforms_are_refused() {
        let sampler = qt_source(&Fragment::new("uniform sampler2D tex;\nvoid main() {}").source);
        assert!(matches!(sampler, Err(QtError::Sampler(_))), "{sampler:?}");
        let initialized = qt_source(&Fragment::new("uniform float k = 1.;\nvoid main() {}").source);
        assert!(
            matches!(initialized, Err(QtError::Uniform(_))),
            "{initialized:?}"
        );
        assert_eq!(
            qt_source("#version 300 es\nvoid main() {}\n"),
            Err(QtError::NoOutput)
        );
    }

    #[test]
    fn output_declarations_are_recognised_exactly() {
        assert_eq!(output_name("out vec4 o;"), Some("o"));
        assert_eq!(
            output_name("layout(location = 0) out highp vec4 fragColor;"),
            Some("fragColor")
        );
        assert_eq!(output_name("out vec4 c,"), None);
        assert_eq!(output_name("out vec3 c;"), None);
        assert_eq!(output_name("outer vec4 c;"), None);
        assert_eq!(output_name("out vec4 frag_color;"), Some("frag_color"));
        assert_eq!(output_name("out vec4 c[2];"), None);
    }

    #[test]
    fn uniform_types_must_be_identifiers() {
        assert_eq!(
            uniform_members("my_t a, b;"),
            Some(vec!["my_t a".to_owned(), "my_t b".to_owned()])
        );
        assert_eq!(uniform_members("vec2* a;"), None);
    }

    #[test]
    fn errors_name_the_offending_line() {
        assert_eq!(
            QtError::Sampler("uniform sampler2D t;".into()).to_string(),
            "texture uniforms are not supported: uniform sampler2D t;"
        );
        assert_eq!(
            QtError::Uniform("uniform float k = 1.;".into()).to_string(),
            "unsupported uniform declaration: uniform float k = 1.;"
        );
        assert_eq!(QtError::NoOutput.to_string(), "no `out vec4` colour output");
    }

    #[test]
    fn rename_keeps_longer_words() {
        assert_eq!(
            rename_word("main mainImage _main main()", "main", "m"),
            "m mainImage _main m()"
        );
    }

    fn after_line_directive(s: &str) -> usize {
        s[s.find("#line 1\n").unwrap()..].lines().count()
    }

    proptest! {
        #[test]
        fn code_keeps_its_line_numbers(code in "[a-z0-9_ .;=(){}/\n]{0,80}") {
            let fragment = Fragment::new(&code);
            if let Ok(out) = qt_source(&fragment.source) {
                // The new main() is four lines past the original code.
                prop_assert_eq!(after_line_directive(&out), after_line_directive(&fragment.source) + 4);
                prop_assert!(out.starts_with("#version 440\n"));
                prop_assert!(word_positions(&out, "gl_FragCoord").next().is_none());
                prop_assert_eq!(out.matches("uniform ").count(), 1);
            }
        }
    }
}
