//! The screensaver loop, one frame at a time: input, shader switching,
//! drawing and pacing.

use std::{error::Error, fmt, ops::ControlFlow, path::PathBuf, time::Duration};

use super::load;
use crate::domain::{
    controls::{Controls, Response, StopReason, Switch},
    pacing::{AdaptiveScale, FpsMeter, FrameBudget, render_scale, render_size},
    playlist::{Direction, Playlist},
    uniforms::{Date, Frame, Uniforms},
};
use crate::ports::{Event, Gpu, Presence, Report, Screen, Target};

/// Shortest and longest time per shader in the cycle viewer, in seconds.
const MIN_INTERVAL: f64 = 0.5;
const MAX_INTERVAL: f64 = 86_400.0;

#[derive(Debug, Clone, PartialEq)]
pub struct Options {
    /// Time per shader in the cycle viewer; `None` runs the screensaver.
    pub cycle: Option<Duration>,
    /// Fraction of the window's pixel size to render at.
    pub scale: f32,
    /// Frame-rate cap; 0 leaves it to vsync.
    pub max_fps: f64,
    /// Report the frame rate every second.
    pub show_fps: bool,
}

impl Options {
    /// From command-line values, which are clamped rather than rejected.
    #[must_use]
    pub fn new(cycle_seconds: Option<f64>, scale: f32, max_fps: f64, show_fps: bool) -> Self {
        let interval = |s: f64| {
            if s.is_nan() {
                MIN_INTERVAL
            } else {
                s.clamp(MIN_INTERVAL, MAX_INTERVAL)
            }
        };
        Self {
            cycle: cycle_seconds.map(|s| Duration::from_secs_f64(interval(s))),
            scale: render_scale(scale),
            max_fps,
            show_fps,
        }
    }
}

/// None of the shaders could be loaded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NoUsableShader;

impl fmt::Display for NoUsableShader {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("no usable shader found")
    }
}

impl Error for NoUsableShader {}

pub struct Screensaver<S: Screen, P, R> {
    // Declared before `screen` so it's dropped while the GL context exists.
    program: S::Program,
    screen: S,
    presence: P,
    report: R,
    playlist: Playlist<PathBuf>,
    showing: PathBuf,
    controls: Controls,
    budget: FrameBudget,
    scale: AdaptiveScale,
    fps: Option<FpsMeter>,
    refresh_rate: f32,
    started: Duration,
    shader_started: Duration,
    last_frame: Duration,
    frame: u32,
}

impl<S: Screen, P: Presence, R: Report> Screensaver<S, P, R> {
    /// Opens the first of `shaders` that compiles.
    ///
    /// # Errors
    ///
    /// [`NoUsableShader`] if none of them loads.
    pub fn start(
        mut screen: S,
        presence: P,
        mut report: R,
        shaders: Vec<PathBuf>,
        options: &Options,
        refresh_rate: f32,
        now: Duration,
    ) -> Result<Self, NoUsableShader> {
        let mut playlist = Playlist::new(shaders);
        let (program, showing) =
            open(&mut screen, &mut report, &mut playlist, None).ok_or(NoUsableShader)?;
        let budget = FrameBudget::new(f64::from(refresh_rate), options.max_fps);
        Ok(Self {
            program,
            screen,
            presence,
            report,
            playlist,
            showing,
            controls: options
                .cycle
                .map_or_else(Controls::screensaver, |interval| {
                    Controls::cycle(interval, now)
                }),
            scale: AdaptiveScale::new(options.scale, budget.min_fps(), now),
            budget,
            fps: options.show_fps.then(|| FpsMeter::new(now)),
            refresh_rate,
            started: now,
            shader_started: now,
            last_frame: now,
            frame: 0,
        })
    }

    /// One pass of the loop at `now`: handles input, switches shader when
    /// due, and draws. Breaks with the reason to stop.
    pub fn frame(&mut self, now: Duration, date: Date) -> ControlFlow<StopReason> {
        let mut elapsed = now.saturating_sub(self.shader_started);
        self.handle_input(now, elapsed)?;
        if let Some(switch) = self.controls.take_switch(now) {
            self.switch(switch, now)?;
            elapsed = Duration::ZERO;
        }
        self.draw(now, elapsed, date);
        ControlFlow::Continue(())
    }

    /// How long to wait after a frame that took `spent`, to honour the
    /// frame-rate cap.
    pub fn pause_after(&self, spent: Duration) -> Option<Duration> {
        self.budget.pause_after(spent)
    }

    /// Records why the screensaver stopped, and after how long.
    pub fn stopped(&mut self, now: Duration, reason: StopReason) {
        self.report.report(Event::Stopped {
            after: now.saturating_sub(self.started),
            reason,
        });
    }

    fn handle_input(&mut self, now: Duration, elapsed: Duration) -> ControlFlow<StopReason> {
        let mut stop = None;
        while let Some(input) = self.screen.poll_input() {
            let event = match self.controls.handle(input, now, elapsed) {
                None => continue,
                Some(Response::Stop(reason)) => {
                    stop = Some(reason);
                    continue;
                }
                Some(Response::Paused) => Event::Paused(self.showing.clone()),
                Some(Response::Resumed) => Event::Resumed(self.showing.clone()),
                Some(Response::Interval(interval)) => Event::Interval {
                    interval,
                    path: self.showing.clone(),
                },
            };
            self.report.report(event);
        }
        if self.controls.focus_check_due(now) && !self.presence.should_stay() {
            stop = Some(StopReason::FocusLeft);
        }
        stop.map_or(ControlFlow::Continue(()), ControlFlow::Break)
    }

    fn switch(&mut self, switch: Switch, now: Duration) -> ControlFlow<StopReason> {
        if switch.delete {
            self.report.report(Event::Deleted(self.showing.clone()));
            self.playlist.remove_current();
        }
        let Some((program, path)) = open(
            &mut self.screen,
            &mut self.report,
            &mut self.playlist,
            Some(switch.direction),
        ) else {
            return ControlFlow::Break(StopReason::NoShadersLeft);
        };
        self.program = program;
        self.showing = path;
        // Each shader starts at time 0 with a fresh frame-rate budget.
        self.shader_started = now;
        self.last_frame = now;
        self.frame = 0;
        self.scale.restart(now);
        ControlFlow::Continue(())
    }

    fn draw(&mut self, now: Duration, elapsed: Duration, date: Date) {
        let window = self.screen.pixel_size();
        let render = render_size(window, self.scale.scale());
        let uniforms = Uniforms::new(&Frame {
            size: render,
            time: elapsed.as_secs_f64(),
            delta: now.saturating_sub(self.last_frame).as_secs_f64(),
            index: self.frame,
            date,
            refresh_rate: self.refresh_rate,
        });
        self.last_frame = now;
        self.screen
            .draw(&self.program, &uniforms, Target::Window { render, window });
        self.screen.present();
        self.frame = self.frame.wrapping_add(1);

        if let Some(fps) = self.scale.frame_done(now, elapsed) {
            self.report.report(Event::ScaleDropped {
                fps,
                scale: self.scale.scale(),
            });
        }
        if let Some(fps) = self.fps.as_mut().and_then(|meter| meter.frame_done(now)) {
            self.report.report(Event::FrameRate {
                render,
                window,
                fps,
            });
        }
    }
}

/// Opens the next shader that loads (the first one, or the nearest in
/// `direction`), reporting those skipped and the one shown.
fn open<G: Gpu, R: Report>(
    gpu: &mut G,
    report: &mut R,
    playlist: &mut Playlist<PathBuf>,
    direction: Option<Direction>,
) -> Option<(G::Program, PathBuf)> {
    let try_load = |path: &PathBuf| match load(gpu, path) {
        Ok((program, format)) => Some((program, format, path.clone())),
        Err(error) => {
            report.report(Event::Rejected {
                path: path.clone(),
                error: error.to_string(),
            });
            None
        }
    };
    let (program, format, path) = match direction {
        None => playlist.open_first(try_load),
        Some(direction) => playlist.step(direction, try_load),
    }?;
    let (position, total) = playlist.position();
    report.report(Event::Showing {
        path: path.clone(),
        format,
        position,
        total,
    });
    Some((program, path))
}

#[cfg(test)]
mod tests;
