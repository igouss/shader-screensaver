//! Brightness and motion of rendered frames, so a shader can be judged
//! without looking at it.

/// Luma above this counts as white...
const WHITE: f64 = 0.9;
/// ...and below this as black.
const BLACK: f64 = 0.03;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct FrameStats {
    /// Mean luma of the first frame, 0-1.
    pub brightness: f64,
    /// Share of its pixels that are near white.
    pub white: f64,
    /// Share of its pixels that are near black.
    pub black: f64,
    /// Mean change of the colour channels between the two frames, 0-1.
    pub motion: f64,
}

impl FrameStats {
    /// Measures two RGBA frames of the same size, the second rendered a
    /// little later than the first.
    #[must_use]
    #[expect(
        clippy::cast_precision_loss,
        reason = "pixel counts are far below 2^52"
    )]
    pub fn measure(first: &[u8], second: &[u8]) -> Self {
        let (first, second) = (first.as_chunks::<4>().0, second.as_chunks::<4>().0);
        let pixels = first.len().min(second.len());
        if pixels == 0 {
            return Self::default();
        }
        let sums = first
            .iter()
            .zip(second)
            .fold(Self::default(), |sums, (&a, &b)| {
                let luma = luma(a);
                Self {
                    brightness: sums.brightness + luma,
                    white: sums.white + f64::from(u8::from(is_white(luma))),
                    black: sums.black + f64::from(u8::from(is_black(luma))),
                    motion: sums.motion + change(a, b),
                }
            });
        let n = pixels as f64;
        Self {
            brightness: sums.brightness / n,
            white: sums.white / n,
            black: sums.black / n,
            motion: sums.motion / n,
        }
    }
}

/// Rec. 709 luma of an RGBA pixel, 0-1.
fn luma([r, g, b, _]: [u8; 4]) -> f64 {
    let [r, g, b] = [r, g, b].map(f64::from);
    0.0722f64.mul_add(b, 0.7152f64.mul_add(g, 0.2126 * r)) / 255.0
}

const fn is_white(luma: f64) -> bool {
    luma > WHITE
}

const fn is_black(luma: f64) -> bool {
    luma < BLACK
}

/// Mean absolute change of the colour channels, 0-1; alpha is ignored.
fn change(a: [u8; 4], b: [u8; 4]) -> f64 {
    let total: u32 = a[..3]
        .iter()
        .zip(&b[..3])
        .map(|(x, y)| u32::from(x.abs_diff(*y)))
        .sum();
    f64::from(total) / (3.0 * 255.0)
}

#[cfg(test)]
#[expect(clippy::float_cmp, reason = "a still frame's motion is exactly zero")]
mod tests {
    use super::*;
    use proptest::collection::vec;
    use proptest::prelude::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-4
    }

    fn frame(pixels: &[[u8; 3]]) -> Vec<u8> {
        pixels
            .iter()
            .flat_map(|&[r, g, b]| [r, g, b, 255])
            .collect()
    }

    #[test]
    fn measures_brightness_coverage_and_motion() {
        let first = frame(&[[255, 255, 255], [0, 0, 0], [128, 128, 128], [255, 0, 0]]);
        let second = frame(&[[0, 0, 0]; 4]);
        let stats = FrameStats::measure(&first, &second);
        assert!(
            close(stats.brightness, (1.0 + 0.0 + 128.0 / 255.0 + 0.2126) / 4.0),
            "{stats:?}"
        );
        assert_eq!(stats.white, 0.25);
        assert_eq!(stats.black, 0.25);
        assert!(
            close(stats.motion, (1.0 + 0.0 + 128.0 / 255.0 + 1.0 / 3.0) / 4.0),
            "{stats:?}"
        );
    }

    #[test]
    fn white_and_black_have_thresholds() {
        let stats = FrameStats::measure(
            &frame(&[[230; 3], [229; 3], [7; 3], [8; 3]]),
            &frame(&[[0; 3]; 4]),
        );
        assert_eq!((stats.white, stats.black), (0.25, 0.25));
    }

    #[test]
    fn the_thresholds_themselves_are_neither_white_nor_black() {
        assert!(!is_white(WHITE) && is_white(WHITE + 1e-9));
        assert!(!is_black(BLACK) && is_black(BLACK - 1e-9));
    }

    #[test]
    fn green_weighs_most_in_brightness() {
        let stats = |rgb| FrameStats::measure(&frame(&[rgb]), &frame(&[rgb])).brightness;
        assert!(close(stats([255, 0, 0]), 0.2126));
        assert!(close(stats([0, 255, 0]), 0.7152));
        assert!(close(stats([0, 0, 255]), 0.0722));
    }

    #[test]
    fn alpha_is_not_motion() {
        let stats = FrameStats::measure(&[10, 20, 30, 0], &[10, 20, 30, 255]);
        assert_eq!(stats.motion, 0.0);
    }

    #[test]
    fn empty_frames_measure_zero() {
        assert_eq!(FrameStats::measure(&[], &[]), FrameStats::default());
    }

    fn frame_pair() -> impl Strategy<Value = (Vec<u8>, Vec<u8>)> {
        (1usize..64).prop_flat_map(|n| (vec(any::<u8>(), n * 4), vec(any::<u8>(), n * 4)))
    }

    proptest! {
        #[test]
        fn every_stat_is_a_fraction((a, b) in frame_pair()) {
            let stats = FrameStats::measure(&a, &b);
            for value in [stats.brightness, stats.white, stats.black, stats.motion] {
                prop_assert!((0.0..=1.0 + 1e-9).contains(&value), "{:?}", stats);
            }
            prop_assert!(stats.white + stats.black <= 1.0);
        }

        #[test]
        fn motion_is_symmetric_and_zero_for_a_still_frame((a, b) in frame_pair()) {
            prop_assert_eq!(FrameStats::measure(&a, &a).motion, 0.0);
            let there = FrameStats::measure(&a, &b).motion;
            let back = FrameStats::measure(&b, &a).motion;
            prop_assert!((there - back).abs() < 1e-12);
        }

        #[test]
        fn only_motion_depends_on_the_second_frame((a, b) in frame_pair()) {
            let moving = FrameStats::measure(&a, &b);
            let still = FrameStats::measure(&a, &a);
            prop_assert_eq!((moving.brightness, moving.white, moving.black), (still.brightness, still.white, still.black));
        }
    }
}
