//! The binary end to end. Tests marked ignored need a display and a GPU:
//! run them with `cargo test -- --ignored`.

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};

fn run(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_shader-screensaver"))
        .args(args)
        .output()
        .expect("the binary runs")
}

fn collection() -> Vec<PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
    let mut shaders: Vec<PathBuf> = fs::read_dir(dir)
        .expect("the repo has a shaders directory")
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|ext| ext == "frag" || ext == "glsl")
        })
        .collect();
    shaders.sort();
    shaders
}

#[test]
fn unknown_options_are_usage_errors() {
    let output = run(&["--bogus"]);
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("Usage:"));
}

#[test]
fn thumbnails_need_check() {
    assert_eq!(run(&["--thumb", "out.png"]).status.code(), Some(2));
}

#[test]
fn check_and_cycle_do_not_mix() {
    assert_eq!(
        run(&["--check", "a.frag", "--cycle", "3"]).status.code(),
        Some(2)
    );
}

#[test]
#[ignore = "needs a display and a GPU"]
fn every_shader_in_the_collection_compiles() {
    let failures: Vec<String> = collection()
        .iter()
        .filter_map(|path| {
            let output = run(&["--check", path.to_str().unwrap()]);
            (!output.status.success()).then(|| {
                format!(
                    "{}: {}",
                    path.display(),
                    String::from_utf8_lossy(&output.stderr)
                )
            })
        })
        .collect();
    assert!(failures.is_empty(), "{failures:#?}");
}

#[test]
#[ignore = "needs a display and a GPU"]
fn check_reports_stats_and_writes_a_thumbnail() {
    let dir = tempfile::tempdir().unwrap();
    let thumb = dir.path().join("t.png");
    let shader = &collection()[0];
    let output = run(&[
        "--check",
        shader.to_str().unwrap(),
        "--thumb",
        thumb.to_str().unwrap(),
    ]);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8(output.stdout).unwrap();
    let lines: Vec<&str> = stdout.lines().collect();
    assert!(lines[0].ends_with("format)"), "{stdout}");
    for (line, label) in lines[1..]
        .iter()
        .zip(["thumbnail:", "brightness:", "motion:", "cost:"])
    {
        assert!(line.trim_start().starts_with(label), "{stdout}");
    }
    assert!(fs::read(&thumb).unwrap().starts_with(b"\x89PNG\r\n\x1a\n"));
}

#[test]
#[ignore = "needs a display and a GPU"]
fn broken_shaders_fail_the_check_with_the_driver_log() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("broken.frag");
    fs::write(&path, "void main(){ fragColor = nope; }").unwrap();
    let output = run(&["--check", path.to_str().unwrap()]);
    assert_eq!(output.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("compile failed"), "{stderr}");
    assert!(
        !stderr.contains("glsl_zero_init"),
        "Mesa's notice is silenced: {stderr}"
    );
}
