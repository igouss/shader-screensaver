//! twigl's uninitialized locals, given the explicit zeros WebGL implies.

use std::borrow::Cow;

use super::is_ident;

/// Gives each variable declared without an initializer an explicit zero, so
/// `float a, b=1.;` becomes `float a=0., b=1.;`. twigl runs in WebGL, which
/// zeroes a local every time its declaration runs; Mesa's `glsl_zero_init`
/// zeroes it once, on entry to main, so a `for(int j;...)` nested in another
/// loop would only loop on the first pass. Arrays, struct members, comments
/// and preprocessor lines are left alone, and nothing moves to another line.
pub(super) fn zero_init(code: &str) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn newlines(s: &str) -> Vec<usize> {
        s.match_indices('\n').map(|(i, _)| i).collect()
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
    }
}
