//! Pointing the process's stderr elsewhere: at the run log, or at nothing
//! while Mesa announces its settings.

use std::{
    fs::{File, OpenOptions},
    io,
    path::Path,
};

/// Sends everything written to stderr, by this process and the libraries in
/// it, to the end of `path`.
///
/// # Errors
///
/// If `path` can't be opened for appending, or stderr can't be replaced.
pub fn redirect_stderr(path: &Path) -> io::Result<()> {
    let log = OpenOptions::new().create(true).append(true).open(path)?;
    rustix::stdio::dup2_stderr(&log)?;
    Ok(())
}

/// Runs `f` with stderr pointed at /dev/null. Mesa announces the
/// `glsl_zero_init` override on stderr while a context is created; this keeps
/// that notice out of logs and check output.
pub fn silence_stderr<T>(f: impl FnOnce() -> T) -> T {
    let saved = rustix::io::dup(io::stderr()).ok();
    if let Ok(null) = File::options().write(true).open("/dev/null") {
        let _ = rustix::stdio::dup2_stderr(&null);
    }
    let result = f();
    if let Some(saved) = saved {
        let _ = rustix::stdio::dup2_stderr(&saved);
    }
    result
}
