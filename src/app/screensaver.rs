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
mod tests {
    use super::*;
    use crate::app::fake::{BROKEN, FakeScreen, write_shaders};
    use crate::domain::{
        Size,
        controls::{Input, Key},
        source::Format,
        uniforms::Slot,
    };
    use std::{cell::Cell, fs, path::Path, rc::Rc};

    const WINDOW: Size = Size::new(800, 600);
    const GOOD: &str = "void main(){fragColor=vec4(1);}";
    const SCREENSAVER: Options = Options {
        cycle: None,
        scale: 1.0,
        max_fps: 0.0,
        show_fps: false,
    };

    type Saver<P> = Screensaver<FakeScreen, P, Vec<Event>>;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    fn cycle(seconds: u64) -> Options {
        Options {
            cycle: Some(Duration::from_secs(seconds)),
            ..SCREENSAVER
        }
    }

    fn stay() -> bool {
        true
    }

    fn good_shaders(dir: &Path, names: &[&str]) -> Vec<PathBuf> {
        let shaders: Vec<(&str, &str)> = names.iter().map(|&name| (name, GOOD)).collect();
        write_shaders(dir, &shaders)
    }

    fn start<P: Presence>(shaders: Vec<PathBuf>, options: &Options, presence: P) -> Saver<P> {
        Screensaver::start(
            FakeScreen::new(WINDOW),
            presence,
            Vec::new(),
            shaders,
            options,
            60.0,
            Duration::ZERO,
        )
        .unwrap_or_else(|e| panic!("{e}"))
    }

    /// Queues `inputs`, then runs a frame at `at` ms.
    fn frame<P: Presence>(
        saver: &mut Saver<P>,
        at: u64,
        inputs: &[Input],
    ) -> ControlFlow<StopReason> {
        saver.screen.inputs.extend(inputs);
        saver.frame(ms(at), Date::default())
    }

    fn showing(path: &Path, position: usize, total: usize) -> Event {
        Event::Showing {
            path: path.to_owned(),
            format: Format::FragCoord,
            position,
            total,
        }
    }

    fn last_draw<P>(saver: &Screensaver<FakeScreen, P, Vec<Event>>) -> &crate::app::fake::Draw {
        saver.screen.draws.last().expect("a frame was drawn")
    }

    #[test]
    fn starts_with_the_first_shader_that_compiles() {
        let dir = tempfile::tempdir().unwrap();
        let paths = write_shaders(
            dir.path(),
            &[("broken.frag", BROKEN), ("a.frag", GOOD), ("b.frag", GOOD)],
        );
        let saver = start(paths.clone(), &SCREENSAVER, stay);
        assert_eq!(
            saver.report,
            [
                Event::Rejected {
                    path: paths[0].clone(),
                    error: format!("compile failed:\n0:1: {BROKEN}")
                },
                showing(&paths[1], 1, 2),
            ]
        );
    }

    #[test]
    fn refuses_to_start_without_a_usable_shader() {
        let dir = tempfile::tempdir().unwrap();
        let mut paths = write_shaders(dir.path(), &[("broken.frag", BROKEN)]);
        paths.push(dir.path().join("missing.frag"));
        let started = Screensaver::start(
            FakeScreen::new(WINDOW),
            stay,
            Vec::new(),
            paths,
            &SCREENSAVER,
            60.0,
            Duration::ZERO,
        );
        assert!(matches!(started, Err(NoUsableShader)));
        assert_eq!(NoUsableShader.to_string(), "no usable shader found");
    }

    #[test]
    fn draws_every_frame_at_window_size_with_running_time() {
        let dir = tempfile::tempdir().unwrap();
        let mut saver = start(good_shaders(dir.path(), &["a.frag"]), &SCREENSAVER, stay);
        assert_eq!(frame(&mut saver, 0, &[]), ControlFlow::Continue(()));
        assert_eq!(frame(&mut saver, 20, &[]), ControlFlow::Continue(()));

        assert_eq!(saver.screen.presented, 2);
        let [first, second] = &saver.screen.draws[..] else {
            panic!("two frames")
        };
        assert_eq!(
            second.target,
            Target::Window {
                render: WINDOW,
                window: WINDOW
            }
        );
        assert_eq!(first.uniforms.get(Slot::Time), [0.0]);
        assert_eq!(second.uniforms.get(Slot::Time), [0.02]);
        assert_eq!(second.uniforms.get(Slot::TimeDelta), [0.02]);
        assert_eq!(second.uniforms.get(Slot::Frame), [1.0]);
        assert_eq!(second.uniforms.get(Slot::RefreshRate), [60.0]);
        assert_eq!(second.uniforms.get(Slot::Resolution), [800.0, 600.0, 1.0]);
    }

    #[test]
    fn frames_carry_the_date() {
        let dir = tempfile::tempdir().unwrap();
        let mut saver = start(good_shaders(dir.path(), &["a.frag"]), &SCREENSAVER, stay);
        let date = Date {
            year: 2026,
            month: 8,
            day: 13,
            seconds: 60.0,
        };
        let _ = saver.frame(ms(0), date);
        assert_eq!(
            last_draw(&saver).uniforms.get(Slot::Date),
            [2026.0, 8.0, 13.0, 60.0]
        );
    }

    #[test]
    fn a_key_dismisses_the_screensaver_once_armed() {
        let dir = tempfile::tempdir().unwrap();
        let mut saver = start(good_shaders(dir.path(), &["a.frag"]), &SCREENSAVER, stay);
        assert_eq!(
            frame(&mut saver, 100, &[Input::Key(Key::Other)]),
            ControlFlow::Continue(())
        );
        assert_eq!(
            frame(&mut saver, 600, &[Input::Key(Key::Other)]),
            ControlFlow::Break(StopReason::KeyPress)
        );
        assert_eq!(
            saver.screen.draws.len(),
            1,
            "nothing is drawn once stopping"
        );
    }

    #[test]
    fn every_queued_input_is_handled_before_drawing() {
        let dir = tempfile::tempdir().unwrap();
        let mut saver = start(good_shaders(dir.path(), &["a.frag"]), &SCREENSAVER, stay);
        let inputs = [
            Input::FocusGained,
            Input::FocusGained,
            Input::CloseRequested,
            Input::FocusGained,
        ];
        assert_eq!(
            frame(&mut saver, 0, &inputs),
            ControlFlow::Break(StopReason::WindowClosed)
        );
        assert!(saver.screen.inputs.is_empty());
    }

    #[test]
    fn lost_focus_stops_it_only_if_it_should_not_stay() {
        let stays = Rc::new(Cell::new(true));
        let asked = Rc::new(Cell::new(0));
        let presence = {
            let (stays, asked) = (Rc::clone(&stays), Rc::clone(&asked));
            move || {
                asked.set(asked.get() + 1);
                stays.get()
            }
        };
        let dir = tempfile::tempdir().unwrap();
        let mut saver = start(
            good_shaders(dir.path(), &["a.frag"]),
            &SCREENSAVER,
            presence,
        );

        assert_eq!(
            frame(&mut saver, 1000, &[Input::FocusLost]),
            ControlFlow::Continue(())
        );
        assert_eq!(frame(&mut saver, 2400, &[]), ControlFlow::Continue(()));
        assert_eq!(asked.get(), 0);
        assert_eq!(frame(&mut saver, 2500, &[]), ControlFlow::Continue(()));
        assert_eq!(asked.get(), 1);

        stays.set(false);
        assert_eq!(
            frame(&mut saver, 3000, &[Input::FocusLost]),
            ControlFlow::Continue(())
        );
        assert_eq!(
            frame(&mut saver, 4500, &[]),
            ControlFlow::Break(StopReason::FocusLeft)
        );
    }

    #[test]
    fn slow_shaders_drop_to_a_lower_resolution() {
        let dir = tempfile::tempdir().unwrap();
        let mut saver = start(good_shaders(dir.path(), &["a.frag"]), &SCREENSAVER, stay);
        for at in (0..=2900).step_by(100) {
            let _ = frame(&mut saver, at, &[]);
        }
        assert_eq!(
            saver.report.last(),
            Some(&Event::ScaleDropped {
                fps: 10.0,
                scale: 0.7
            })
        );

        let _ = frame(&mut saver, 3000, &[]);
        let render = render_size(WINDOW, 0.7);
        assert_eq!(
            last_draw(&saver).target,
            Target::Window {
                render,
                window: WINDOW
            }
        );
        let resolution: Vec<f64> = last_draw(&saver)
            .uniforms
            .get(Slot::Resolution)
            .iter()
            .copied()
            .map(f64::from)
            .collect();
        assert_eq!(
            resolution,
            [f64::from(render.width), f64::from(render.height), 1.0]
        );
    }

    #[test]
    fn fps_is_reported_every_second_when_asked() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag"]);
        for (show_fps, reports) in [(true, 1), (false, 0)] {
            let mut saver = start(
                paths.clone(),
                &Options {
                    show_fps,
                    ..SCREENSAVER
                },
                stay,
            );
            for at in (0..=1000).step_by(250) {
                let _ = frame(&mut saver, at, &[]);
            }
            let rates: Vec<&Event> = saver
                .report
                .iter()
                .filter(|e| matches!(e, Event::FrameRate { .. }))
                .collect();
            assert_eq!(rates.len(), reports);
            if show_fps {
                assert_eq!(
                    rates[0],
                    &Event::FrameRate {
                        render: WINDOW,
                        window: WINDOW,
                        fps: 5.0
                    }
                );
            }
        }
    }

    #[test]
    fn the_viewer_moves_on_each_interval_and_restarts_time() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag", "b.frag"]);
        let mut saver = start(paths.clone(), &cycle(3), stay);
        for at in (0..3000).step_by(16) {
            let _ = frame(&mut saver, at, &[]);
        }
        assert_eq!(
            saver.report.len(),
            1,
            "still on the first shader at 62.5 fps"
        );
        assert_eq!(last_draw(&saver).uniforms.get(Slot::Frame), [187.0]);

        let _ = frame(&mut saver, 3000, &[]);
        assert_eq!(saver.report.last(), Some(&showing(&paths[1], 2, 2)));
        assert_eq!(last_draw(&saver).program, 1);
        assert_eq!(last_draw(&saver).uniforms.get(Slot::Time), [0.0]);
        assert_eq!(last_draw(&saver).uniforms.get(Slot::TimeDelta), [0.0]);
        assert_eq!(last_draw(&saver).uniforms.get(Slot::Frame), [0.0]);

        let _ = frame(&mut saver, 3500, &[]);
        assert_eq!(last_draw(&saver).uniforms.get(Slot::Time), [0.5]);
    }

    #[test]
    fn a_new_shader_gets_its_scale_back() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag", "b.frag"]);
        let mut saver = start(paths, &cycle(10), stay);
        for at in (0..=3000).step_by(100) {
            let _ = frame(&mut saver, at, &[]);
        }
        assert_ne!(
            last_draw(&saver).target,
            Target::Window {
                render: WINDOW,
                window: WINDOW
            }
        );

        let _ = frame(&mut saver, 3100, &[Input::Key(Key::Right)]);
        assert_eq!(
            last_draw(&saver).target,
            Target::Window {
                render: WINDOW,
                window: WINDOW
            }
        );
    }

    #[test]
    fn deleting_reports_the_shader_and_moves_on() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag", "b.frag"]);
        let mut saver = start(paths.clone(), &cycle(3), stay);
        assert_eq!(
            frame(&mut saver, 1000, &[Input::Key(Key::Char('d'))]),
            ControlFlow::Continue(())
        );
        assert_eq!(
            saver.report[1..],
            [Event::Deleted(paths[0].clone()), showing(&paths[1], 1, 1)]
        );
    }

    #[test]
    fn deleting_the_last_shader_stops_the_viewer() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag"]);
        let mut saver = start(paths.clone(), &cycle(3), stay);
        assert_eq!(
            frame(&mut saver, 1000, &[Input::Key(Key::Char('d'))]),
            ControlFlow::Break(StopReason::NoShadersLeft)
        );
        assert_eq!(saver.report.last(), Some(&Event::Deleted(paths[0].clone())));
    }

    #[test]
    fn pausing_and_new_intervals_name_the_shader() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag"]);
        let mut saver = start(paths.clone(), &cycle(3), stay);
        let _ = frame(
            &mut saver,
            100,
            &[
                Input::Key(Key::Space),
                Input::Key(Key::Char('5')),
                Input::Key(Key::Space),
                Input::Key(Key::Space),
            ],
        );
        let a = paths[0].clone();
        assert_eq!(
            saver.report[1..],
            [
                Event::Paused(a.clone()),
                Event::Interval {
                    interval: Duration::from_secs(5),
                    path: a.clone()
                },
                Event::Paused(a.clone()),
                Event::Resumed(a),
            ]
        );
    }

    #[test]
    fn previous_wraps_to_the_end() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag", "b.frag", "c.frag"]);
        let mut saver = start(paths.clone(), &cycle(3), stay);
        let _ = frame(&mut saver, 100, &[Input::Key(Key::Left)]);
        assert_eq!(saver.report.last(), Some(&showing(&paths[2], 3, 3)));
    }

    #[test]
    fn a_shader_broken_since_the_start_is_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag", "b.frag", "c.frag"]);
        let mut saver = start(paths.clone(), &cycle(3), stay);
        fs::write(&paths[1], BROKEN).unwrap();
        let _ = frame(&mut saver, 100, &[Input::Key(Key::Right)]);
        assert!(matches!(&saver.report[1], Event::Rejected { path, .. } if *path == paths[1]));
        assert_eq!(saver.report[2], showing(&paths[2], 2, 2));
    }

    #[test]
    fn frames_are_held_back_to_the_cap() {
        let dir = tempfile::tempdir().unwrap();
        let paths = good_shaders(dir.path(), &["a.frag"]);
        let capped = start(
            paths.clone(),
            &Options {
                max_fps: 30.0,
                ..SCREENSAVER
            },
            stay,
        );
        assert_eq!(
            capped.pause_after(ms(10)),
            Duration::from_secs_f64(1.0 / 30.0).checked_sub(ms(10))
        );
        assert_eq!(capped.pause_after(ms(40)), None);
        assert_eq!(
            start(paths, &SCREENSAVER, stay).pause_after(Duration::ZERO),
            None
        );
    }

    #[test]
    fn stopping_records_how_long_it_ran() {
        let dir = tempfile::tempdir().unwrap();
        let mut saver = Screensaver::start(
            FakeScreen::new(WINDOW),
            stay,
            Vec::new(),
            good_shaders(dir.path(), &["a.frag"]),
            &SCREENSAVER,
            60.0,
            ms(400),
        )
        .unwrap_or_else(|e| panic!("{e}"));
        saver.stopped(ms(65_400), StopReason::KeyPress);
        assert_eq!(
            saver.report.last(),
            Some(&Event::Stopped {
                after: ms(65_000),
                reason: StopReason::KeyPress
            })
        );
    }

    #[test]
    fn options_clamp_command_line_values() {
        let interval = |seconds| Options::new(Some(seconds), 1.0, 0.0, false).cycle;
        assert_eq!(interval(3.0), Some(Duration::from_secs(3)));
        assert_eq!(interval(0.1), Some(ms(500)));
        assert_eq!(interval(f64::NAN), Some(ms(500)));
        assert_eq!(interval(f64::INFINITY), Some(Duration::from_secs(86_400)));
        assert_eq!(
            Options::new(None, 5.0, 60.0, true),
            Options {
                cycle: None,
                scale: 1.0,
                max_fps: 60.0,
                show_fps: true
            }
        );
        assert_eq!(Options::new(None, 0.5, 0.0, false).scale, 0.5);
    }
}
