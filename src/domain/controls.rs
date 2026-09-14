//! What input means. In the screensaver any deliberate input dismisses it;
//! the cycle viewer maps keys to commands instead.

use std::{fmt, mem, time::Duration};

use super::playlist::Direction;

/// Input from the window, key repeats already dropped.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Input {
    CloseRequested,
    Key(Key),
    /// A click, scroll or touch.
    Pointer,
    PointerMotion {
        dx: f32,
        dy: f32,
    },
    FocusLost,
    FocusGained,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Key {
    Escape,
    Space,
    Left,
    Right,
    /// A letter or digit key, as its lowercase character.
    Char(char),
    Other,
}

/// Why the screensaver stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    WindowClosed,
    KeyPress,
    Quit,
    ClickOrScroll,
    MouseMoved,
    FocusLeft,
    NoShadersLeft,
}

impl fmt::Display for StopReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::WindowClosed => "window closed",
            Self::KeyPress => "key press",
            Self::Quit => "quit",
            Self::ClickOrScroll => "click or scroll",
            Self::MouseMoved => "mouse moved",
            Self::FocusLeft => "focus left the screensaver or the session locked",
            Self::NoShadersLeft => "no shaders left",
        })
    }
}

/// What the loop has to act on after an input.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Response {
    Stop(StopReason),
    Paused,
    Resumed,
    /// Seconds per shader changed.
    Interval(Duration),
}

/// A shader change the cycle viewer is due for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Switch {
    /// Delete the shader on screen first.
    pub delete: bool,
    pub direction: Direction,
}

/// Keys and clicks are ignored this soon after the window maps.
const ARMED_AFTER: Duration = Duration::from_millis(500);
/// Pointer motion is ignored for longer, while the pointer settles.
const MOTION_ARMED_AFTER: Duration = Duration::from_millis(1500);
/// Pointer travel, in pixels, that counts as moving the mouse rather than jitter.
const MOTION_THRESHOLD: f32 = 24.0;
/// Focus loss is acted on only if it lasts this long: while instances launch
/// on several monitors, focus hops between outputs before all have mapped.
const FOCUS_GRACE: Duration = Duration::from_millis(1500);

#[derive(Debug, Clone)]
pub struct Controls {
    mode: Mode,
    focus_check_at: Option<Duration>,
}

#[derive(Debug, Clone)]
enum Mode {
    /// With the pointer travel so far.
    Screensaver {
        motion: f32,
    },
    Cycle(Cycle),
}

#[derive(Debug, Clone)]
struct Cycle {
    interval: Duration,
    paused: bool,
    advance_at: Duration,
    delete: bool,
    direction: Option<Direction>,
}

impl Controls {
    /// Any key, click or real pointer motion dismisses the screensaver.
    #[must_use]
    pub const fn screensaver() -> Self {
        Self {
            mode: Mode::Screensaver { motion: 0.0 },
            focus_check_at: None,
        }
    }

    /// The cycle viewer, moving on every `interval` from `now`.
    #[must_use]
    pub fn cycle(interval: Duration, now: Duration) -> Self {
        let cycle = Cycle {
            interval,
            paused: false,
            advance_at: now + interval,
            delete: false,
            direction: None,
        };
        Self {
            mode: Mode::Cycle(cycle),
            focus_check_at: None,
        }
    }

    /// Reacts to one input at `now`, `elapsed` into the current shader.
    pub fn handle(&mut self, input: Input, now: Duration, elapsed: Duration) -> Option<Response> {
        match input {
            Input::CloseRequested => Some(Response::Stop(StopReason::WindowClosed)),
            Input::FocusLost => {
                self.focus_check_at = Some(now + FOCUS_GRACE);
                None
            }
            Input::FocusGained => {
                self.focus_check_at = None;
                None
            }
            _ => match &mut self.mode {
                Mode::Screensaver { motion } => {
                    dismissal(motion, input, elapsed).map(Response::Stop)
                }
                Mode::Cycle(cycle) => cycle.handle(input, now),
            },
        }
    }

    /// Whether a focus loss has lasted long enough to ask if the screensaver
    /// should still run. True once per loss.
    pub fn focus_check_due(&mut self, now: Duration) -> bool {
        let due = self.focus_check_at.is_some_and(|at| now >= at);
        if due {
            self.focus_check_at = None;
        }
        due
    }

    /// The shader change due at `now`, if any: one the keys asked for, or the
    /// next shader once the interval ran out.
    pub fn take_switch(&mut self, now: Duration) -> Option<Switch> {
        match &mut self.mode {
            Mode::Cycle(cycle) => cycle.take_switch(now),
            Mode::Screensaver { .. } => None,
        }
    }
}

/// Whether an input dismisses the screensaver, `elapsed` after it started.
fn dismissal(motion: &mut f32, input: Input, elapsed: Duration) -> Option<StopReason> {
    let armed = elapsed > ARMED_AFTER;
    match input {
        Input::Key(_) if armed => Some(StopReason::KeyPress),
        Input::Pointer if armed => Some(StopReason::ClickOrScroll),
        Input::PointerMotion { dx, dy } if elapsed > MOTION_ARMED_AFTER => {
            *motion += dx.abs() + dy.abs();
            (*motion > MOTION_THRESHOLD).then_some(StopReason::MouseMoved)
        }
        _ => None,
    }
}

impl Cycle {
    fn handle(&mut self, input: Input, now: Duration) -> Option<Response> {
        let Input::Key(key) = input else { return None };
        match key {
            Key::Escape | Key::Char('q') => Some(Response::Stop(StopReason::Quit)),
            Key::Space => {
                self.paused = !self.paused;
                self.restart(now);
                Some(if self.paused {
                    Response::Paused
                } else {
                    Response::Resumed
                })
            }
            Key::Char(digit @ '0'..='9') => {
                // 1-9 seconds per shader; 0 means 10.
                let seconds = digit.to_digit(10).filter(|&n| n > 0).unwrap_or(10);
                self.interval = Duration::from_secs(seconds.into());
                self.paused = false;
                self.restart(now);
                Some(Response::Interval(self.interval))
            }
            Key::Char('d') => {
                self.delete = true;
                None
            }
            Key::Right | Key::Char('n') => {
                self.direction = Some(Direction::Next);
                None
            }
            Key::Left | Key::Char('p') => {
                self.direction = Some(Direction::Previous);
                None
            }
            _ => None,
        }
    }

    fn restart(&mut self, now: Duration) {
        self.advance_at = now + self.interval;
    }

    fn take_switch(&mut self, now: Duration) -> Option<Switch> {
        let due = !self.paused && now >= self.advance_at;
        if !(self.delete || self.direction.is_some() || due) {
            return None;
        }
        self.restart(now);
        Some(Switch {
            delete: mem::take(&mut self.delete),
            direction: self.direction.take().unwrap_or(Direction::Next),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Direction::{Next, Previous};
    use proptest::collection::vec;
    use proptest::prelude::*;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    fn key(c: char) -> Input {
        Input::Key(Key::Char(c))
    }

    fn viewer() -> Controls {
        Controls::cycle(Duration::from_secs(3), Duration::ZERO)
    }

    #[expect(
        clippy::unnecessary_wraps,
        reason = "reads like the value it's compared with"
    )]
    fn switch(delete: bool, direction: Direction) -> Option<Switch> {
        Some(Switch { delete, direction })
    }

    #[test]
    fn keys_and_clicks_are_ignored_for_the_first_half_second() {
        let mut controls = Controls::screensaver();
        assert_eq!(
            controls.handle(Input::Key(Key::Other), ms(400), ms(400)),
            None
        );
        assert_eq!(controls.handle(Input::Pointer, ms(500), ms(500)), None);
    }

    #[test]
    fn then_they_dismiss_the_screensaver() {
        let mut controls = Controls::screensaver();
        assert_eq!(
            controls.handle(Input::Key(Key::Space), ms(501), ms(501)),
            Some(Response::Stop(StopReason::KeyPress))
        );
        assert_eq!(
            controls.handle(Input::Pointer, ms(501), ms(501)),
            Some(Response::Stop(StopReason::ClickOrScroll))
        );
    }

    #[test]
    fn arming_goes_by_time_on_the_current_shader() {
        let mut controls = Controls::screensaver();
        assert_eq!(controls.handle(Input::Pointer, ms(9000), ms(100)), None);
    }

    #[test]
    fn closing_the_window_always_stops() {
        for mut controls in [Controls::screensaver(), viewer()] {
            assert_eq!(
                controls.handle(Input::CloseRequested, ms(0), ms(0)),
                Some(Response::Stop(StopReason::WindowClosed))
            );
        }
    }

    #[test]
    fn pointer_motion_must_add_up_to_more_than_24_pixels() {
        let mut controls = Controls::screensaver();
        let mut moved =
            |dx, dy| controls.handle(Input::PointerMotion { dx, dy }, ms(2000), ms(2000));
        assert_eq!(moved(10.0, -10.0), None);
        assert_eq!(moved(-4.0, 0.0), None);
        assert_eq!(
            moved(0.0, 0.5),
            Some(Response::Stop(StopReason::MouseMoved))
        );
    }

    #[test]
    fn pointer_motion_while_settling_is_forgotten() {
        let mut controls = Controls::screensaver();
        assert_eq!(
            controls.handle(
                Input::PointerMotion { dx: 100.0, dy: 0.0 },
                ms(1500),
                ms(1500)
            ),
            None
        );
        assert_eq!(
            controls.handle(
                Input::PointerMotion { dx: 24.0, dy: 0.0 },
                ms(1501),
                ms(1501)
            ),
            None
        );
    }

    #[test]
    fn lost_focus_is_checked_after_a_grace_period() {
        let mut controls = Controls::screensaver();
        assert_eq!(controls.handle(Input::FocusLost, ms(1000), ms(1000)), None);
        assert!(!controls.focus_check_due(ms(2499)));
        assert!(controls.focus_check_due(ms(2500)));
        assert!(!controls.focus_check_due(ms(9000)), "checked once");
    }

    #[test]
    fn regaining_focus_cancels_the_check() {
        let mut controls = viewer();
        controls.handle(Input::FocusLost, ms(1000), ms(1000));
        assert_eq!(
            controls.handle(Input::FocusGained, ms(1200), ms(1200)),
            None
        );
        assert!(!controls.focus_check_due(ms(5000)));
    }

    #[test]
    fn the_viewer_ignores_the_pointer_and_other_keys() {
        let mut controls = viewer();
        assert_eq!(controls.handle(Input::Pointer, ms(5000), ms(5000)), None);
        assert_eq!(
            controls.handle(
                Input::PointerMotion {
                    dx: 900.0,
                    dy: 900.0
                },
                ms(5000),
                ms(5000)
            ),
            None
        );
        for input in [Input::Key(Key::Other), key('x')] {
            assert_eq!(controls.handle(input, ms(5000), ms(5000)), None);
        }
        assert_eq!(
            controls.take_switch(ms(5000)),
            switch(false, Next),
            "only the interval ran out"
        );
    }

    #[test]
    fn q_and_escape_quit_the_viewer_at_once() {
        for input in [key('q'), Input::Key(Key::Escape)] {
            assert_eq!(
                viewer().handle(input, ms(0), ms(0)),
                Some(Response::Stop(StopReason::Quit))
            );
        }
    }

    #[test]
    fn the_viewer_moves_on_when_the_interval_runs_out() {
        let mut controls = viewer();
        assert_eq!(controls.take_switch(ms(2999)), None);
        assert_eq!(controls.take_switch(ms(3000)), switch(false, Next));
        assert_eq!(controls.take_switch(ms(5999)), None);
        assert_eq!(controls.take_switch(ms(6000)), switch(false, Next));
    }

    #[test]
    fn arrows_and_letters_pick_a_direction() {
        for (input, direction) in [
            (Input::Key(Key::Right), Next),
            (key('n'), Next),
            (Input::Key(Key::Left), Previous),
            (key('p'), Previous),
        ] {
            let mut controls = viewer();
            assert_eq!(controls.handle(input, ms(10), ms(10)), None);
            assert_eq!(
                controls.take_switch(ms(10)),
                switch(false, direction),
                "{input:?}"
            );
            assert_eq!(controls.take_switch(ms(11)), None);
        }
    }

    #[test]
    fn deleting_moves_on_the_way_asked() {
        let mut controls = viewer();
        controls.handle(key('d'), ms(10), ms(10));
        assert_eq!(controls.take_switch(ms(10)), switch(true, Next));
        controls.handle(key('d'), ms(20), ms(20));
        controls.handle(Input::Key(Key::Left), ms(20), ms(20));
        assert_eq!(controls.take_switch(ms(20)), switch(true, Previous));
        assert_eq!(controls.take_switch(ms(30)), None);
    }

    #[test]
    fn a_switch_restarts_the_interval() {
        let mut controls = viewer();
        controls.handle(Input::Key(Key::Right), ms(2000), ms(2000));
        controls.take_switch(ms(2000));
        assert_eq!(controls.take_switch(ms(4999)), None);
        assert_eq!(controls.take_switch(ms(5000)), switch(false, Next));
    }

    #[test]
    fn space_pauses_and_resumes() {
        let mut controls = viewer();
        assert_eq!(
            controls.handle(Input::Key(Key::Space), ms(1000), ms(1000)),
            Some(Response::Paused)
        );
        assert_eq!(controls.take_switch(ms(60_000)), None);
        assert_eq!(
            controls.handle(Input::Key(Key::Space), ms(60_000), ms(60_000)),
            Some(Response::Resumed)
        );
        assert_eq!(controls.take_switch(ms(62_999)), None);
        assert_eq!(controls.take_switch(ms(63_000)), switch(false, Next));
    }

    #[test]
    fn keys_still_switch_while_paused() {
        let mut controls = viewer();
        controls.handle(Input::Key(Key::Space), ms(1000), ms(1000));
        controls.handle(Input::Key(Key::Right), ms(2000), ms(2000));
        assert_eq!(controls.take_switch(ms(2000)), switch(false, Next));
        assert_eq!(controls.take_switch(ms(60_000)), None, "still paused");
    }

    #[test]
    fn digits_set_the_interval() {
        let mut controls = viewer();
        assert_eq!(
            controls.handle(key('5'), ms(1000), ms(1000)),
            Some(Response::Interval(Duration::from_secs(5)))
        );
        assert_eq!(controls.take_switch(ms(5999)), None);
        assert_eq!(controls.take_switch(ms(6000)), switch(false, Next));
        assert_eq!(
            controls.handle(key('0'), ms(0), ms(0)),
            Some(Response::Interval(Duration::from_secs(10)))
        );
        assert_eq!(
            controls.handle(key('1'), ms(0), ms(0)),
            Some(Response::Interval(Duration::from_secs(1)))
        );
        assert_eq!(
            controls.handle(key('9'), ms(0), ms(0)),
            Some(Response::Interval(Duration::from_secs(9)))
        );
    }

    #[test]
    fn a_digit_resumes_a_paused_viewer() {
        let mut controls = viewer();
        controls.handle(Input::Key(Key::Space), ms(1000), ms(1000));
        controls.handle(key('2'), ms(10_000), ms(10_000));
        assert_eq!(controls.take_switch(ms(12_000)), switch(false, Next));
    }

    #[test]
    fn the_screensaver_never_switches() {
        let mut controls = Controls::screensaver();
        controls.handle(Input::Key(Key::Right), ms(100), ms(100));
        assert_eq!(controls.take_switch(ms(1_000_000)), None);
    }

    #[test]
    fn stop_reasons_read_like_the_run_log() {
        let reasons = [
            StopReason::WindowClosed,
            StopReason::KeyPress,
            StopReason::Quit,
            StopReason::ClickOrScroll,
            StopReason::MouseMoved,
            StopReason::FocusLeft,
            StopReason::NoShadersLeft,
        ]
        .map(|r| r.to_string());
        assert_eq!(
            reasons,
            [
                "window closed",
                "key press",
                "quit",
                "click or scroll",
                "mouse moved",
                "focus left the screensaver or the session locked",
                "no shaders left",
            ]
        );
    }

    fn any_key() -> impl Strategy<Value = Key> {
        prop_oneof![
            Just(Key::Escape),
            Just(Key::Space),
            Just(Key::Left),
            Just(Key::Right),
            any::<char>().prop_map(Key::Char),
            Just(Key::Other),
        ]
    }

    fn any_input() -> impl Strategy<Value = Input> {
        prop_oneof![
            Just(Input::CloseRequested),
            any_key().prop_map(Input::Key),
            Just(Input::Pointer),
            (-100f32..100.0, -100f32..100.0).prop_map(|(dx, dy)| Input::PointerMotion { dx, dy }),
            Just(Input::FocusLost),
            Just(Input::FocusGained),
        ]
    }

    proptest! {
        #[test]
        fn only_closing_the_window_stops_it_early(inputs in vec(any_input(), 0..20), at in 0u64..=500) {
            let mut controls = Controls::screensaver();
            for input in inputs {
                let expected = (input == Input::CloseRequested).then_some(Response::Stop(StopReason::WindowClosed));
                prop_assert_eq!(controls.handle(input, ms(at), ms(at)), expected);
            }
        }

        #[test]
        fn the_viewer_never_stops_for_the_pointer(dx in any::<f32>(), dy in any::<f32>(), at in any::<u32>()) {
            let mut controls = viewer();
            let now = ms(at.into());
            prop_assert_eq!(controls.handle(Input::Pointer, now, now), None);
            prop_assert_eq!(controls.handle(Input::PointerMotion { dx, dy }, now, now), None);
        }

        #[test]
        fn the_mouse_counts_as_moved_once_it_travels_far_enough(moves in vec((-10f32..10.0, -10f32..10.0), 1..30)) {
            let mut controls = Controls::screensaver();
            let mut travelled = 0.0f32;
            for (dx, dy) in moves {
                travelled += dx.abs() + dy.abs();
                let response = controls.handle(Input::PointerMotion { dx, dy }, ms(2000), ms(2000));
                prop_assert_eq!(response, (travelled > 24.0).then_some(Response::Stop(StopReason::MouseMoved)));
                if response.is_some() {
                    break;
                }
            }
        }

        #[test]
        fn a_switch_is_due_at_most_once_per_interval(checks in vec(0u64..10_000, 1..40)) {
            let mut controls = viewer();
            let mut now = 0;
            let mut last_switch = 0;
            for step in checks {
                now += step;
                if controls.take_switch(ms(now)).is_some() {
                    prop_assert!(now - last_switch >= 3000);
                    last_switch = now;
                } else {
                    prop_assert!(now - last_switch < 3000);
                }
            }
        }
    }
}
