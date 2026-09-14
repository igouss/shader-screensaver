//! The frame-rate cap, and the lower render resolution slow shaders fall
//! back to.

use std::time::Duration;

use super::Size;

/// Adaptive scaling never goes below this fraction of the window...
const MIN_SCALE: f32 = 0.35;
/// ...and only lowers the scale while it is above this, so it settles there.
const LOWER_WHILE_ABOVE: f32 = 0.36;
/// Each slow measurement multiplies the scale by this.
const SCALE_STEP: f32 = 0.7;
/// A shader's frame rate isn't judged during its first second...
const WARM_UP: Duration = Duration::from_secs(1);
/// ...and after that over spans this long.
const MEASURE_SPAN: Duration = Duration::from_secs(2);
/// Too slow means below this share of the target frame rate: a softer image
/// beats a stuttering one.
const MIN_FPS_SHARE: f64 = 0.8;
/// Caps this close to the refresh rate are left to vsync.
const CAP_MARGIN: f64 = 0.5;

/// A render scale from the command line: 0.1-1, anything else meaning full
/// resolution.
#[must_use]
pub fn render_scale(requested: f32) -> f32 {
    if (0.1..=1.0).contains(&requested) {
        requested
    } else {
        1.0
    }
}

/// The pixel size to render a `window`-sized frame at, at least 1x1.
#[must_use]
#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "window sizes are far below 2^24 and scale is at most 1, so the result is exact enough and fits"
)]
pub fn render_size(window: Size, scale: f32) -> Size {
    let scaled = |pixels: u32| ((pixels as f32 * scale) as u32).max(1);
    Size::new(scaled(window.width), scaled(window.height))
}

/// How fast frames may come, and how slow is too slow.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FrameBudget {
    frame_time: Option<Duration>,
    min_fps: f64,
}

impl FrameBudget {
    /// For a display refreshing at `refresh_rate` Hz with an optional cap
    /// (`max_fps` > 0). Vsync alone covers caps the display can't beat anyway.
    #[must_use]
    pub fn new(refresh_rate: f64, max_fps: f64) -> Self {
        let capped = max_fps > 0.0 && max_fps < refresh_rate - CAP_MARGIN;
        let frame_rate = if capped { max_fps } else { refresh_rate };
        Self {
            frame_time: if capped {
                Duration::try_from_secs_f64(max_fps.recip()).ok()
            } else {
                None
            },
            min_fps: frame_rate * MIN_FPS_SHARE,
        }
    }

    /// Below this frame rate the render resolution drops.
    #[must_use]
    pub const fn min_fps(&self) -> f64 {
        self.min_fps
    }

    /// How long to hold back after a frame that took `spent`, to stay under
    /// the cap.
    #[must_use]
    pub fn pause_after(&self, spent: Duration) -> Option<Duration> {
        self.frame_time?
            .checked_sub(spent)
            .filter(|pause| !pause.is_zero())
    }
}

/// Lowers the render scale while a shader can't keep up: after a warm-up,
/// frames are counted over fixed spans, and each span slower than the minimum
/// frame rate takes the scale down a step.
#[derive(Debug, Clone)]
pub struct AdaptiveScale {
    initial: f32,
    scale: f32,
    min_fps: f64,
    span_start: Duration,
    frames: u32,
}

impl AdaptiveScale {
    #[must_use]
    pub const fn new(initial: f32, min_fps: f64, now: Duration) -> Self {
        Self {
            initial,
            scale: initial,
            min_fps,
            span_start: now,
            frames: 0,
        }
    }

    #[must_use]
    pub const fn scale(&self) -> f32 {
        self.scale
    }

    /// Starts over at the initial scale, for a new shader.
    pub const fn restart(&mut self, now: Duration) {
        self.scale = self.initial;
        self.span_start = now;
        self.frames = 0;
    }

    /// Counts a frame begun at `now`, `elapsed` into the shader. Returns the
    /// measured frame rate when it made the scale drop.
    pub fn frame_done(&mut self, now: Duration, elapsed: Duration) -> Option<f64> {
        self.frames += 1;
        if elapsed < WARM_UP {
            self.span_start = now;
            self.frames = 0;
            return None;
        }
        let span = now.saturating_sub(self.span_start);
        if span < MEASURE_SPAN {
            return None;
        }
        let fps = f64::from(self.frames) / span.as_secs_f64();
        self.span_start = now;
        self.frames = 0;
        let slow = fps < self.min_fps && self.scale > LOWER_WHILE_ABOVE;
        slow.then(|| {
            self.scale = (self.scale * SCALE_STEP).max(MIN_SCALE);
            fps
        })
    }
}

/// Frame rate over spans of about a second, for `--fps`.
#[derive(Debug, Clone)]
pub struct FpsMeter {
    span_start: Duration,
    frames: u32,
}

impl FpsMeter {
    #[must_use]
    pub const fn new(now: Duration) -> Self {
        Self {
            span_start: now,
            frames: 0,
        }
    }

    /// Counts a frame begun at `now`; returns the frame rate once a second.
    pub fn frame_done(&mut self, now: Duration) -> Option<f64> {
        self.frames += 1;
        let span = now.saturating_sub(self.span_start);
        if span < Duration::from_secs(1) {
            return None;
        }
        let fps = f64::from(self.frames) / span.as_secs_f64();
        self.span_start = now;
        self.frames = 0;
        Some(fps)
    }
}

#[cfg(test)]
#[expect(clippy::float_cmp, reason = "the values compared are exact")]
mod tests {
    use super::*;
    use proptest::collection::vec;
    use proptest::prelude::*;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    const NO_DROPS: [f64; 0] = [];

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    /// Runs frames every `every` ms from 0 through `until` ms, the shader
    /// having started at 0; returns the frame rates that made the scale drop.
    fn run(scale: &mut AdaptiveScale, every: usize, until: u64) -> Vec<f64> {
        (0..=until)
            .step_by(every)
            .filter_map(|at| scale.frame_done(ms(at), ms(at)))
            .collect()
    }

    #[test]
    fn scales_outside_the_range_mean_full_resolution() {
        for scale in [0.0, 0.09, 1.01, -1.0, f32::NAN, f32::INFINITY] {
            assert_eq!(render_scale(scale), 1.0, "{scale}");
        }
        for scale in [0.1, 0.5, 1.0] {
            assert_eq!(render_scale(scale), scale);
        }
    }

    #[test]
    fn render_size_truncates_but_never_reaches_zero() {
        assert_eq!(render_size(Size::new(1920, 1080), 0.5), Size::new(960, 540));
        assert_eq!(render_size(Size::new(1000, 3), 0.25), Size::new(250, 1));
        assert_eq!(render_size(Size::new(1, 1), 0.1), Size::new(1, 1));
        assert_eq!(render_size(Size::new(801, 601), 1.0), Size::new(801, 601));
    }

    #[test]
    fn a_cap_below_the_refresh_rate_holds_frames_back() {
        let budget = FrameBudget::new(144.0, 60.0);
        let frame = Duration::from_secs_f64(1.0 / 60.0);
        assert_eq!(budget.pause_after(ms(10)), frame.checked_sub(ms(10)));
        assert_eq!(budget.pause_after(frame), None);
        assert_eq!(budget.pause_after(ms(20)), None);
        assert_eq!(
            FrameBudget::new(60.0, 59.4).pause_after(Duration::ZERO),
            Some(Duration::from_secs_f64(1.0 / 59.4))
        );
    }

    #[test]
    fn vsync_covers_caps_the_display_cannot_beat() {
        for cap in [0.0, -5.0, 59.5, 60.0, 144.0, f64::NAN, f64::INFINITY] {
            assert_eq!(
                FrameBudget::new(60.0, cap).pause_after(Duration::ZERO),
                None,
                "{cap}"
            );
        }
    }

    #[test]
    fn too_slow_is_below_80_percent_of_the_target_rate() {
        assert!(close(FrameBudget::new(60.0, 0.0).min_fps(), 48.0));
        assert!(close(FrameBudget::new(144.0, 0.0).min_fps(), 115.2));
        assert!(
            close(FrameBudget::new(144.0, 60.0).min_fps(), 48.0),
            "the cap is the target"
        );
        assert!(close(FrameBudget::new(60.0, 25.0).min_fps(), 20.0));
    }

    #[test]
    fn fast_shaders_keep_their_scale() {
        let mut scale = AdaptiveScale::new(1.0, 48.0, Duration::ZERO);
        assert_eq!(run(&mut scale, 16, 10_000), NO_DROPS);
        assert_eq!(scale.scale(), 1.0);
    }

    #[test]
    fn slow_shaders_drop_after_the_warm_up_and_one_span() {
        let mut scale = AdaptiveScale::new(1.0, 20.0, Duration::ZERO);
        assert_eq!(run(&mut scale, 100, 2800), NO_DROPS);
        assert_eq!(scale.frame_done(ms(2900), ms(2900)), Some(10.0));
        assert_eq!(scale.scale(), 0.7);
    }

    #[test]
    fn exactly_the_minimum_frame_rate_is_fast_enough() {
        let mut scale = AdaptiveScale::new(1.0, 10.0, Duration::ZERO);
        assert_eq!(run(&mut scale, 100, 5000), NO_DROPS);
    }

    #[test]
    fn the_scale_bottoms_out() {
        let mut scale = AdaptiveScale::new(1.0, 20.0, Duration::ZERO);
        let drops = run(&mut scale, 1000, 60_000);
        assert_eq!(drops.len(), 3, "0.7, 0.49, then 0.35");
        assert_eq!(scale.scale(), MIN_SCALE);
    }

    #[test]
    fn restarting_restores_the_scale_and_the_warm_up() {
        let mut scale = AdaptiveScale::new(0.8, 20.0, Duration::ZERO);
        run(&mut scale, 1000, 10_000);
        assert!(scale.scale() < 0.8);

        scale.restart(ms(20_000));
        assert_eq!(scale.scale(), 0.8);
        for at in (20_000..=22_800).step_by(100) {
            assert_eq!(scale.frame_done(ms(at), ms(at - 20_000)), None, "{at}");
        }
        assert_eq!(scale.frame_done(ms(22_900), ms(2900)), Some(10.0));
        assert_eq!(scale.scale(), 0.8 * 0.7);
    }

    #[test]
    fn a_span_counts_frames_from_its_start() {
        let mut scale = AdaptiveScale::new(1.0, 20.0, Duration::ZERO);
        scale.restart(ms(1000));
        for at in (1000..3000).step_by(100) {
            assert_eq!(scale.frame_done(ms(at), ms(1500)), None);
        }
        assert_eq!(scale.frame_done(ms(3000), ms(1500)), Some(10.5));
    }

    #[test]
    fn low_starting_scales_never_drop() {
        let mut scale = AdaptiveScale::new(0.36, 20.0, Duration::ZERO);
        assert_eq!(run(&mut scale, 1000, 60_000), NO_DROPS);
    }

    #[test]
    fn the_fps_meter_reports_once_a_second() {
        let mut meter = FpsMeter::new(Duration::ZERO);
        let reports: Vec<(u64, f64)> = (0..=2400)
            .step_by(300)
            .filter_map(|at| meter.frame_done(ms(at)).map(|fps| (at, fps)))
            .collect();
        let expected = [(1200, 5.0 / 1.2), (2400, 4.0 / 1.2)];
        assert_eq!(reports.len(), expected.len());
        for ((at, fps), (want_at, want)) in reports.into_iter().zip(expected) {
            assert_eq!(at, want_at);
            assert!(close(fps, want), "{fps} at {at}");
        }
    }

    proptest! {
        #[test]
        fn any_budget_is_safe(refresh in any::<f64>(), cap in any::<f64>(), spent in any::<u64>()) {
            let budget = FrameBudget::new(refresh, cap);
            if let Some(pause) = budget.pause_after(Duration::from_nanos(spent)) {
                prop_assert!(!pause.is_zero());
            }
            if refresh.is_finite() && refresh > 0.0 {
                prop_assert!(budget.min_fps() <= refresh * MIN_FPS_SHARE);
            }
        }

        #[test]
        fn the_scale_only_falls_and_stays_in_bounds(initial in 0.1f32..=1.0, gaps in vec(1u64..400, 1..300)) {
            let mut scale = AdaptiveScale::new(initial, 20.0, Duration::ZERO);
            let mut now = Duration::ZERO;
            let mut last = initial;
            for gap in gaps {
                now += ms(gap);
                let dropped = scale.frame_done(now, now);
                let current = scale.scale();
                prop_assert!(current >= MIN_SCALE.min(initial));
                if let Some(fps) = dropped {
                    prop_assert!(fps < 20.0);
                    prop_assert!(current < last);
                } else {
                    prop_assert_eq!(current, last);
                }
                last = current;
            }
        }

        #[test]
        fn render_size_fits_the_window(width in 1u32..16_384, height in 1u32..16_384, scale in 0.1f32..=1.0) {
            let size = render_size(Size::new(width, height), scale);
            prop_assert!((1..=width).contains(&size.width));
            prop_assert!((1..=height).contains(&size.height));
        }
    }
}
