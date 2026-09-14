//! shader-screensaver: fullscreen GLSL screensaver for Omarchy.
//!
//! Shows the first shader that compiles from the --shader arguments: files
//! are tried in the order given, directories contribute their *.frag / *.glsl
//! files in random order. Defaults to ~/.config/shader-screensaver/shaders/.
//! Exits on keyboard/mouse input, or when focus leaves the screensaver (e.g.
//! the session locks). --cycle N steps through the playlist, N seconds per
//! shader, driven by keys instead, and reports each step on stdout. --check
//! compiles a shader offscreen and, with --thumb, renders a PNG thumbnail and
//! reports brightness, motion and cost.

use std::{
    env,
    ops::ControlFlow,
    path::{Path, PathBuf},
    process::ExitCode,
    thread,
    time::Instant,
};

use clap::Parser;
use shader_screensaver::{
    adapters::{
        clock, files,
        hyprland::Hyprland,
        journal::Journal,
        sdl::{SdlScreen, Visibility},
        siblings, stdio, thumbnail,
    },
    app::{
        self, check,
        screensaver::{Options, Screensaver},
    },
};

#[derive(Debug, Parser)]
#[command(version, about = "Fullscreen GLSL shader screensaver for Omarchy")]
struct Cli {
    /// Shader file, or directory of *.frag / *.glsl files (shuffled); repeatable, tried in order
    #[arg(long = "shader", value_name = "FILE|DIR")]
    shaders: Vec<PathBuf>,

    /// Fraction of the screen's pixel size to render at (0.1-1)
    #[arg(long, value_name = "FRACTION", default_value_t = 1.0)]
    scale: f32,

    /// Frame-rate cap; 0 leaves it to the display's refresh rate
    #[arg(long, value_name = "N", default_value_t = 0.0)]
    max_fps: f64,

    /// Seed for shuffling directories, so every monitor gets the same order
    #[arg(long, value_name = "N")]
    seed: Option<u64>,

    /// Wayland app id of the window
    #[arg(long, value_name = "ID", default_value = "org.omarchy.screensaver")]
    app_id: String,

    /// Append the run log, and anything else on stderr, to FILE
    #[arg(long, value_name = "FILE")]
    log: Option<PathBuf>,

    /// Print the frame rate every second
    #[arg(long)]
    fps: bool,

    /// Step through the playlist, SECONDS per shader, driven by keys
    #[arg(long, value_name = "SECONDS", conflicts_with = "check")]
    cycle: Option<f64>,

    /// Compile FILE offscreen, then exit
    #[arg(long, value_name = "FILE")]
    check: Option<PathBuf>,

    /// With --check: also render a PNG thumbnail and report brightness, motion and cost
    #[arg(long, value_name = "OUT.png", requires = "check")]
    thumb: Option<PathBuf>,

    /// With --thumb: the shader time to render the thumbnail at
    #[arg(long, value_name = "SECONDS", default_value_t = 4.0)]
    time: f64,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    // Pasted code relies on uninitialized locals being zero, as in WebGL.
    // Twigl code gets explicit zeros where each variable is declared (see
    // source.rs); for the other formats, ask Mesa, which zeroes a local once
    // on entry to its function rather than every time its declaration runs.
    if env::var_os("glsl_zero_init").is_none() {
        // SAFETY: no other threads exist yet.
        unsafe { env::set_var("glsl_zero_init", "true") };
    }
    if let Some(log) = &cli.log
        && let Err(e) = stdio::redirect_stderr(log)
    {
        eprintln!("shader-screensaver: --log: {e}");
    }

    let result = match &cli.check {
        Some(path) => run_check(path, cli.thumb.as_deref(), cli.time),
        None => run_screensaver(cli),
    };
    result.unwrap_or_else(|e| {
        eprintln!("shader-screensaver: {e}");
        ExitCode::FAILURE
    })
}

fn open_screen(app_id: &str, visibility: Visibility) -> Result<SdlScreen, String> {
    stdio::silence_stderr(|| SdlScreen::open(app_id, visibility))
        .map_err(|e| format!("cannot create a GL window: {e}"))
}

fn run_check(path: &Path, thumb: Option<&Path>, at: f64) -> Result<ExitCode, String> {
    let mut screen = open_screen("shader-screensaver-check", Visibility::Hidden)?;
    let (program, format) = match app::load(&mut screen, path) {
        Ok(loaded) => loaded,
        Err(e) => {
            eprintln!("shader-screensaver: {}: {e}", path.display());
            return Ok(ExitCode::FAILURE);
        }
    };
    println!("{}: OK ({format} format)", path.display());
    let Some(thumb) = thumb else {
        return Ok(ExitCode::SUCCESS);
    };

    let clock = Instant::now();
    let sample = check::sample(&mut screen, &program, at, clock::local_date(), || {
        clock.elapsed()
    });
    thumbnail::write_png(thumb, &sample.pixels, check::THUMBNAIL)
        .map_err(|e| format!("cannot write {}: {e}", thumb.display()))?;
    println!("{}", sample.describe(thumb, at));
    Ok(ExitCode::SUCCESS)
}

fn run_screensaver(cli: Cli) -> Result<ExitCode, String> {
    let options = Options::new(cli.cycle, cli.scale, cli.max_fps, cli.fps);
    let screen = open_screen(&cli.app_id, Visibility::Fullscreen)?;
    let refresh_rate = screen.refresh_rate();

    // The playlist keeps the order given: the launcher puts never-shown and
    // long-unseen shaders first and passes the same arguments to every monitor.
    let sources = if cli.shaders.is_empty() {
        vec![files::default_shader_dir()]
    } else {
        cli.shaders
    };
    let mut rng = cli
        .seed
        .map_or_else(fastrand::Rng::new, fastrand::Rng::with_seed);
    let shaders = sources
        .iter()
        .flat_map(|source| files::shaders_in(source, &mut rng))
        .collect();
    let journal = Journal::new(files::state_dir().join("current"), options.cycle.is_some());

    let clock = Instant::now();
    let presence = Hyprland::new(cli.app_id);
    let mut saver = Screensaver::start(
        screen,
        presence,
        journal,
        shaders,
        &options,
        refresh_rate,
        clock.elapsed(),
    )
    .map_err(|e| e.to_string())?;
    let reason = loop {
        let now = clock.elapsed();
        if let ControlFlow::Break(reason) = saver.frame(now, clock::local_date()) {
            break reason;
        }
        if let Some(pause) = saver.pause_after(clock.elapsed().saturating_sub(now)) {
            thread::sleep(pause);
        }
    };
    saver.stopped(clock.elapsed(), reason);
    drop(saver);
    siblings::terminate_siblings();
    Ok(ExitCode::SUCCESS)
}
