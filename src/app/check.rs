//! `--check`: render a shader offscreen and measure how it looks and what it
//! costs, without showing anything.

use std::{path::Path, time::Duration};

use crate::domain::{
    Size,
    stats::FrameStats,
    uniforms::{Date, Frame, Uniforms},
};
use crate::ports::{Gpu, Target};

pub const THUMBNAIL: Size = Size::new(640, 360);
const BENCHMARK: Size = Size::new(1920, 1080);
const BENCHMARK_FRAMES: u32 = 8;
/// Seconds between the two frames compared for motion.
const MOTION_SPAN: f64 = 1.5;
const FRAME_RATE: f32 = 60.0;

#[derive(Debug, Clone, PartialEq)]
pub struct Sample {
    /// The thumbnail: RGBA, bottom row first.
    pub pixels: Vec<u8>,
    pub stats: FrameStats,
    /// Time per frame at 1920x1080.
    pub cost: Duration,
}

/// Renders `program` at `at` seconds: a thumbnail, its stats against a frame
/// rendered 1.5 s later, and the cost of a 1080p frame. `now` reads a
/// monotonic clock.
pub fn sample<G: Gpu>(
    gpu: &mut G,
    program: &G::Program,
    at: f64,
    date: Date,
    mut now: impl FnMut() -> Duration,
) -> Sample {
    let mut snapshot = |time: f64| {
        draw(gpu, program, THUMBNAIL, time, frame_at(time), date);
        gpu.read_pixels()
    };
    let first = snapshot(at);
    let second = snapshot(at + MOTION_SPAN);
    let stats = FrameStats::measure(&first, &second);

    // One frame to warm up, then time a few.
    draw(gpu, program, BENCHMARK, at, 0, date);
    gpu.finish();
    let start = now();
    for i in 1..=BENCHMARK_FRAMES {
        draw(
            gpu,
            program,
            BENCHMARK,
            at + f64::from(i) / f64::from(FRAME_RATE),
            i,
            date,
        );
    }
    gpu.finish();
    let cost = now().saturating_sub(start) / BENCHMARK_FRAMES;

    Sample {
        pixels: first,
        stats,
        cost,
    }
}

/// The frame number `time` seconds in. Float-to-int casts saturate, so times
/// before the start are frame 0.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "saturating is what's wanted"
)]
fn frame_at(time: f64) -> u32 {
    (time * f64::from(FRAME_RATE)) as u32
}

fn draw<G: Gpu>(gpu: &mut G, program: &G::Program, size: Size, time: f64, index: u32, date: Date) {
    let frame = Frame {
        size,
        time,
        delta: f64::from(FRAME_RATE).recip(),
        index,
        date,
        refresh_rate: FRAME_RATE,
    };
    gpu.draw(program, &Uniforms::new(&frame), Target::Offscreen(size));
}

impl Sample {
    /// The report under the "OK" line, for a thumbnail written to `thumbnail`.
    #[must_use]
    pub fn describe(&self, thumbnail: &Path, at: f64) -> String {
        let FrameStats {
            brightness,
            white,
            black,
            motion,
        } = self.stats;
        let ms = self.cost.as_secs_f64() * 1e3;
        format!(
            "  thumbnail:  {} (t={at:.1}s, {THUMBNAIL})\n\
             \x20 brightness: mean {brightness:.2}, white {:.1}%, black {:.1}%\n\
             \x20 motion:     {motion:.3} (mean change over {MOTION_SPAN}s)\n\
             \x20 cost:       {ms:.1} ms/frame at {BENCHMARK}",
            thumbnail.display(),
            white * 100.0,
            black * 100.0,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::fake::FakeScreen;
    use crate::domain::uniforms::Slot;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    #[test]
    fn samples_a_thumbnail_pair_then_times_1080p_frames() {
        let bytes = THUMBNAIL.area() * 4;
        let mut gpu = FakeScreen::new(Size::new(1, 1));
        gpu.frames.extend([vec![255; bytes], vec![0; bytes]]);
        let mut clock = [ms(5), ms(85)].into_iter();
        let date = Date {
            year: 2026,
            ..Date::default()
        };

        let sample = sample(&mut gpu, &7, 4.0, date, || {
            clock.next().expect("the clock is read twice")
        });

        assert_eq!(sample.pixels, vec![255; bytes]);
        assert_eq!(
            (sample.stats.white, sample.stats.black, sample.stats.motion),
            (1.0, 0.0, 1.0)
        );
        assert_eq!(sample.cost, ms(10));
        assert_eq!(gpu.finished, 2);

        let targets: Vec<Target> = gpu.draws.iter().map(|d| d.target).collect();
        assert_eq!(targets[..2], [Target::Offscreen(THUMBNAIL); 2]);
        assert_eq!(targets[2..], [Target::Offscreen(BENCHMARK); 9]);
        let frames: Vec<f32> = gpu
            .draws
            .iter()
            .map(|d| d.uniforms.get(Slot::Frame)[0])
            .collect();
        assert_eq!(
            frames,
            [240.0, 330.0, 0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
        );
        let times: Vec<f64> = gpu
            .draws
            .iter()
            .map(|d| f64::from(d.uniforms.get(Slot::Time)[0]))
            .collect();
        assert_eq!(times[..3], [4.0, 5.5, 4.0]);
        assert!(
            (times[10] - (4.0 + 8.0 / 60.0)).abs() < 1e-6,
            "{}",
            times[10]
        );
        for draw in &gpu.draws {
            assert_eq!(draw.program, 7);
            assert!((f64::from(draw.uniforms.get(Slot::TimeDelta)[0]) - 1.0 / 60.0).abs() < 1e-7);
            assert_eq!(draw.uniforms.get(Slot::RefreshRate), [60.0]);
            assert_eq!(draw.uniforms.get(Slot::Date)[0], 2026.0);
        }
        assert_eq!(
            gpu.draws[0].uniforms.get(Slot::Resolution),
            [640.0, 360.0, 1.0]
        );
        assert_eq!(
            gpu.draws[2].uniforms.get(Slot::Resolution),
            [1920.0, 1080.0, 1.0]
        );
    }

    #[test]
    fn frames_count_from_the_start_at_60_fps() {
        assert_eq!(frame_at(1.5), 90);
        assert_eq!(frame_at(-1.0), 0);
    }

    #[test]
    fn the_report_reads_like_the_helper_expects() {
        let sample = Sample {
            pixels: Vec::new(),
            stats: FrameStats {
                brightness: 0.091,
                white: 0.0005,
                black: 0.26,
                motion: 0.0614,
            },
            cost: Duration::from_micros(300),
        };
        assert_eq!(
            sample.describe(Path::new("/tmp/t.png"), 4.0),
            "  thumbnail:  /tmp/t.png (t=4.0s, 640x360)\n  \
             brightness: mean 0.09, white 0.1%, black 26.0%\n  \
             motion:     0.061 (mean change over 1.5s)\n  \
             cost:       0.3 ms/frame at 1920x1080"
        );
    }
}
