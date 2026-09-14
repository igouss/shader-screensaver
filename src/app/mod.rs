//! What the binary does, on top of the ports: run the screensaver or the
//! cycle viewer, or check a shader offscreen.

pub mod check;
pub mod screensaver;

#[cfg(test)]
mod fake;

use std::{error::Error, fmt, fs, io, path::Path};

use crate::domain::source::{Format, Fragment};
use crate::ports::Gpu;

/// Why a shader file couldn't be turned into a program.
#[derive(Debug)]
pub enum LoadError {
    Read(io::Error),
    /// The driver's compile or link log.
    Build(String),
}

impl fmt::Display for LoadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read(e) => write!(f, "cannot read: {e}"),
            Self::Build(log) => f.write_str(log),
        }
    }
}

impl Error for LoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Read(e) => Some(e),
            Self::Build(_) => None,
        }
    }
}

/// Reads a shader file, wraps it in its format's prelude and compiles it.
///
/// # Errors
///
/// [`LoadError::Read`] if the file can't be read, [`LoadError::Build`] with
/// the driver's log if it doesn't compile.
pub fn load<G: Gpu>(gpu: &mut G, path: &Path) -> Result<(G::Program, Format), LoadError> {
    let code = fs::read(path).map_err(LoadError::Read)?;
    let fragment = Fragment::new(&String::from_utf8_lossy(&code));
    let program = gpu.compile(&fragment.source).map_err(LoadError::Build)?;
    Ok((program, fragment.format))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Size;
    use fake::{BROKEN, FakeScreen, write_shaders};

    #[test]
    fn loading_wraps_the_code_for_its_format() {
        let dir = tempfile::tempdir().unwrap();
        let code = "void main(){fragColor=vec4(1);}";
        let paths = write_shaders(dir.path(), &[("a.frag", code)]);
        let mut gpu = FakeScreen::new(Size::new(1, 1));
        let (program, format) = load(&mut gpu, &paths[0]).unwrap();
        assert_eq!((program, format), (0, Format::FragCoord));
        assert_eq!(gpu.compiled, [Fragment::new(code).source]);
    }

    #[test]
    fn unreadable_files_say_so() {
        let dir = tempfile::tempdir().unwrap();
        let error = load(
            &mut FakeScreen::new(Size::new(1, 1)),
            &dir.path().join("missing.frag"),
        )
        .unwrap_err();
        assert!(matches!(error, LoadError::Read(_)));
        assert!(error.to_string().starts_with("cannot read: "), "{error}");
        assert!(error.source().is_some());
    }

    #[test]
    fn compile_errors_carry_the_driver_log() {
        let dir = tempfile::tempdir().unwrap();
        let paths = write_shaders(dir.path(), &[("broken.frag", BROKEN)]);
        let error = load(&mut FakeScreen::new(Size::new(1, 1)), &paths[0]).unwrap_err();
        assert_eq!(error.to_string(), "compile failed:\n0:1: BROKEN");
        assert!(error.source().is_none());
    }

    #[test]
    fn stray_bytes_do_not_stop_a_shader_loading() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("latin1.frag");
        fs::write(&path, b"// caf\xe9\no=vec4(1);").unwrap();
        let (_, format) = load(&mut FakeScreen::new(Size::new(1, 1)), &path).unwrap();
        assert_eq!(format, Format::Twigl);
    }
}
