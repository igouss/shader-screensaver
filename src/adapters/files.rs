//! Where things live on disk: the shader collection and the state directory.

use std::{
    env,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

use crate::domain::playlist::shuffle;

/// The shaders a `--shader` argument names: a file names itself; a directory,
/// its visible `*.frag` and `*.glsl` files, shuffled with `rng`. Anything
/// unreadable names none.
pub fn shaders_in(path: &Path, rng: &mut fastrand::Rng) -> Vec<PathBuf> {
    if !path.is_dir() {
        return if path.exists() {
            vec![path.to_path_buf()]
        } else {
            Vec::new()
        };
    }
    let Ok(entries) = fs::read_dir(path) else {
        return Vec::new();
    };
    let mut shaders: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|p| is_shader_file(p))
        .collect();
    shuffle(&mut shaders, rng);
    shaders
}

fn is_shader_file(path: &Path) -> bool {
    let visible = path
        .file_name()
        .is_some_and(|name| !name.as_encoded_bytes().starts_with(b"."));
    let shader = path
        .extension()
        .is_some_and(|ext| ext == "frag" || ext == "glsl");
    visible && shader && path.is_file()
}

/// `$XDG_CONFIG_HOME/shader-screensaver/shaders`, the default collection.
#[must_use]
pub fn default_shader_dir() -> PathBuf {
    app_dir(
        env::var_os("XDG_CONFIG_HOME"),
        env::var_os("HOME"),
        ".config",
    )
    .join("shaders")
}

/// `$XDG_STATE_HOME/shader-screensaver`, created if missing.
#[must_use]
pub fn state_dir() -> PathBuf {
    let dir = app_dir(
        env::var_os("XDG_STATE_HOME"),
        env::var_os("HOME"),
        ".local/state",
    );
    // Best effort: a missing state directory only loses the `current` file.
    let _ = fs::create_dir_all(&dir);
    dir
}

/// `<base>/shader-screensaver`, where base is the XDG variable if it's set to
/// an absolute path (as the spec requires), else `$HOME/<fallback>`.
fn app_dir(xdg: Option<OsString>, home: Option<OsString>, fallback: &str) -> PathBuf {
    let base = xdg
        .map(PathBuf::from)
        .filter(|base| base.is_absolute())
        .unwrap_or_else(|| PathBuf::from(home.unwrap_or_default()).join(fallback));
    base.join("shader-screensaver")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(paths: &[PathBuf]) -> Vec<&str> {
        paths
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect()
    }

    #[test]
    fn a_directory_yields_its_visible_shader_files() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["a.frag", "b.glsl", "notes.txt", ".hidden.frag", "frag"] {
            fs::write(dir.path().join(name), "").unwrap();
        }
        fs::create_dir(dir.path().join("sub.frag")).unwrap();

        let mut found = shaders_in(dir.path(), &mut fastrand::Rng::with_seed(7));
        found.sort();
        assert_eq!(names(&found), ["a.frag", "b.glsl"]);
    }

    #[test]
    fn a_seed_fixes_the_order() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..12 {
            fs::write(dir.path().join(format!("{i:02}.frag")), "").unwrap();
        }
        let order = |seed| shaders_in(dir.path(), &mut fastrand::Rng::with_seed(seed));
        assert_eq!(order(3), order(3));
        assert_ne!(order(3), order(4));
    }

    #[test]
    fn a_file_yields_itself_whatever_its_name() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("paste.txt");
        fs::write(&path, "").unwrap();
        assert_eq!(shaders_in(&path, &mut fastrand::Rng::new()), [path]);
    }

    #[test]
    fn a_missing_path_yields_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            shaders_in(&dir.path().join("gone"), &mut fastrand::Rng::new()),
            Vec::<PathBuf>::new()
        );
    }

    #[test]
    fn the_real_directories_are_named_for_the_app() {
        assert!(default_shader_dir().ends_with("shader-screensaver/shaders"));
        // Creates the state directory if this machine lacks one, as the
        // screensaver would.
        let state = state_dir();
        assert!(state.ends_with("shader-screensaver"));
        assert!(state.is_dir());
    }

    #[test]
    fn xdg_directories_win_over_home() {
        assert_eq!(
            app_dir(Some("/xdg".into()), Some("/home/u".into()), ".config"),
            Path::new("/xdg/shader-screensaver")
        );
    }

    #[test]
    fn unset_empty_or_relative_xdg_directories_fall_back_to_home() {
        for xdg in [None, Some("".into()), Some("relative".into())] {
            assert_eq!(
                app_dir(xdg, Some("/home/u".into()), ".local/state"),
                Path::new("/home/u/.local/state/shader-screensaver")
            );
        }
    }
}
