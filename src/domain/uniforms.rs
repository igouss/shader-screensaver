//! The values behind every uniform name the three formats use, computed once
//! per frame.

use std::slice;

use super::Size;

/// What a uniform receives. Several names share one slot, e.g. `t`, `u_time`
/// and `iTime`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Slot {
    Resolution,
    Time,
    TimeDelta,
    Frame,
    /// twigl's `m`, normalised.
    Mouse,
    /// FragCoord's `u_mouse`, in pixels.
    MousePixels,
    /// Shadertoy's `iMouse`.
    ShadertoyMouse,
    Drag,
    Scroll,
    Date,
    RefreshRate,
    Recursion,
    MaxRecursion,
    ColorGamut,
    CameraPosition,
    CameraDirection,
    CameraView,
}

impl Slot {
    /// The slot behind a uniform name, if it's one the renderer feeds.
    #[must_use]
    pub fn for_name(name: &str) -> Option<Self> {
        Some(match name {
            "r" | "u_resolution" | "iResolution" => Self::Resolution,
            "t" | "u_time" | "iTime" => Self::Time,
            "u_time_delta" | "iTimeDelta" => Self::TimeDelta,
            "f" | "u_frame" | "iFrame" => Self::Frame,
            "m" => Self::Mouse,
            "u_mouse" => Self::MousePixels,
            "iMouse" => Self::ShadertoyMouse,
            "u_drag" => Self::Drag,
            "u_scroll" => Self::Scroll,
            "u_date" | "iDate" => Self::Date,
            "u_refresh_rate" | "iFrameRate" => Self::RefreshRate,
            "u_recursion" => Self::Recursion,
            "u_max_recursion" => Self::MaxRecursion,
            "u_color_gamut" => Self::ColorGamut,
            "u_camera_pos" => Self::CameraPosition,
            "u_camera_dir" => Self::CameraDirection,
            "u_camera_view" => Self::CameraView,
            _ => return None,
        })
    }
}

/// Local wall-clock time, as the date uniforms want it.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Date {
    pub year: i32,
    /// 0-11, as in Shadertoy's `iDate`.
    pub month: u32,
    /// 1-31.
    pub day: u32,
    /// Seconds since local midnight.
    pub seconds: f64,
}

/// What one frame's uniforms are computed from.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frame {
    /// Render size in pixels.
    pub size: Size,
    /// Seconds since the shader started.
    pub time: f64,
    /// Seconds since the previous frame.
    pub delta: f64,
    /// Frames drawn since the shader started.
    pub index: u32,
    pub date: Date,
    pub refresh_rate: f32,
}

// There is no pointer or camera input: the pointer rests at the centre and
// FragCoord's camera sits at (0,0,3) looking down -z.
const MOUSE: [f32; 2] = [0.5, 0.5];
const ZEROS: [f32; 4] = [0.0; 4];
const ONE: [f32; 1] = [1.0];
const CAMERA_POSITION: [f32; 3] = [0.0, 0.0, 3.0];
const CAMERA_DIRECTION: [f32; 3] = [0.0, 0.0, -1.0];
#[rustfmt::skip]
const CAMERA_VIEW: [f32; 16] = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, -3.0, 1.0,
];

/// One frame's uniform values.
#[derive(Debug, Clone, PartialEq)]
pub struct Uniforms {
    resolution: [f32; 3],
    time: f32,
    delta: f32,
    frame: f32,
    mouse_pixels: [f32; 4],
    date: [f32; 4],
    refresh_rate: f32,
}

impl Uniforms {
    #[must_use]
    #[expect(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        reason = "GLSL uniforms are f32; sizes, dates and frame counts fit its mantissa for days"
    )]
    pub fn new(frame: &Frame) -> Self {
        let (width, height) = (frame.size.width as f32, frame.size.height as f32);
        let date = frame.date;
        Self {
            resolution: [width, height, 1.0],
            time: frame.time as f32,
            delta: frame.delta as f32,
            frame: frame.index as f32,
            mouse_pixels: [width * 0.5, height * 0.5, -1.0, -1.0],
            date: [
                date.year as f32,
                date.month as f32,
                date.day as f32,
                date.seconds as f32,
            ],
            refresh_rate: frame.refresh_rate,
        }
    }

    /// The slot's components.
    #[must_use]
    pub fn get(&self, slot: Slot) -> &[f32] {
        match slot {
            Slot::Resolution => &self.resolution,
            Slot::Time => slice::from_ref(&self.time),
            Slot::TimeDelta => slice::from_ref(&self.delta),
            Slot::Frame => slice::from_ref(&self.frame),
            Slot::Mouse => &MOUSE,
            Slot::MousePixels => &self.mouse_pixels,
            Slot::ShadertoyMouse => &ZEROS,
            Slot::Drag => &ZEROS[..2],
            Slot::Scroll | Slot::Recursion | Slot::ColorGamut => &ZEROS[..1],
            Slot::Date => &self.date,
            Slot::RefreshRate => slice::from_ref(&self.refresh_rate),
            Slot::MaxRecursion => &ONE,
            Slot::CameraPosition => &CAMERA_POSITION,
            Slot::CameraDirection => &CAMERA_DIRECTION,
            Slot::CameraView => &CAMERA_VIEW,
        }
    }

    /// The slot's components padded with zeros to a mat4's 16, so a uniform
    /// declared with more components than the slot has reads zeros.
    #[must_use]
    pub fn padded(&self, slot: Slot) -> [f32; 16] {
        let mut out = [0.0; 16];
        let values = self.get(slot);
        out[..values.len()].copy_from_slice(values);
        out
    }
}

#[cfg(test)]
#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "expected values are computed the way the uniforms are"
)]
mod tests {
    use super::*;
    use crate::domain::source::Format;
    use proptest::prelude::*;

    const ALIASES: &[(&str, Slot)] = &[
        ("r", Slot::Resolution),
        ("u_resolution", Slot::Resolution),
        ("iResolution", Slot::Resolution),
        ("t", Slot::Time),
        ("u_time", Slot::Time),
        ("iTime", Slot::Time),
        ("u_time_delta", Slot::TimeDelta),
        ("iTimeDelta", Slot::TimeDelta),
        ("f", Slot::Frame),
        ("u_frame", Slot::Frame),
        ("iFrame", Slot::Frame),
        ("m", Slot::Mouse),
        ("u_mouse", Slot::MousePixels),
        ("iMouse", Slot::ShadertoyMouse),
        ("u_drag", Slot::Drag),
        ("u_scroll", Slot::Scroll),
        ("u_date", Slot::Date),
        ("iDate", Slot::Date),
        ("u_refresh_rate", Slot::RefreshRate),
        ("iFrameRate", Slot::RefreshRate),
        ("u_recursion", Slot::Recursion),
        ("u_max_recursion", Slot::MaxRecursion),
        ("u_color_gamut", Slot::ColorGamut),
        ("u_camera_pos", Slot::CameraPosition),
        ("u_camera_dir", Slot::CameraDirection),
        ("u_camera_view", Slot::CameraView),
    ];

    const SLOTS: [Slot; 17] = [
        Slot::Resolution,
        Slot::Time,
        Slot::TimeDelta,
        Slot::Frame,
        Slot::Mouse,
        Slot::MousePixels,
        Slot::ShadertoyMouse,
        Slot::Drag,
        Slot::Scroll,
        Slot::Date,
        Slot::RefreshRate,
        Slot::Recursion,
        Slot::MaxRecursion,
        Slot::ColorGamut,
        Slot::CameraPosition,
        Slot::CameraDirection,
        Slot::CameraView,
    ];

    fn frame(size: Size, time: f64, index: u32) -> Frame {
        Frame {
            size,
            time,
            delta: 1.0 / 60.0,
            index,
            date: Date::default(),
            refresh_rate: 60.0,
        }
    }

    fn sample() -> Uniforms {
        Uniforms::new(&Frame {
            size: Size::new(800, 600),
            time: 2.5,
            delta: 0.25,
            index: 7,
            date: Date {
                year: 2026,
                month: 8,
                day: 13,
                seconds: 3661.5,
            },
            refresh_rate: 144.0,
        })
    }

    #[test]
    fn every_alias_maps_to_its_slot() {
        for &(name, slot) in ALIASES {
            assert_eq!(Slot::for_name(name), Some(slot), "{name}");
        }
    }

    #[test]
    fn other_names_are_not_fed() {
        for name in ["", "time", "R", "u_resolution2", "iresolution", "u_time "] {
            assert_eq!(Slot::for_name(name), None, "{name:?}");
        }
    }

    #[test]
    fn every_prelude_uniform_gets_enough_components() {
        let uniforms = sample();
        for format in [Format::Twigl, Format::FragCoord, Format::Shadertoy] {
            for &(ty, name) in format.prelude_uniforms() {
                let slot = Slot::for_name(name).unwrap_or_else(|| panic!("{name} has no slot"));
                let needed = match ty {
                    "float" | "int" => 1,
                    "vec2" => 2,
                    "vec3" => 3,
                    "vec4" => 4,
                    "mat4" => 16,
                    other => panic!("unexpected type {other}"),
                };
                assert!(uniforms.get(slot).len() >= needed, "{name}");
            }
        }
    }

    #[test]
    fn frame_values_come_from_the_frame() {
        let uniforms = sample();
        assert_eq!(uniforms.get(Slot::Resolution), [800.0, 600.0, 1.0]);
        assert_eq!(uniforms.get(Slot::Time), [2.5]);
        assert_eq!(uniforms.get(Slot::TimeDelta), [0.25]);
        assert_eq!(uniforms.get(Slot::Frame), [7.0]);
        assert_eq!(uniforms.get(Slot::MousePixels), [400.0, 300.0, -1.0, -1.0]);
        assert_eq!(uniforms.get(Slot::Date), [2026.0, 8.0, 13.0, 3661.5]);
        assert_eq!(uniforms.get(Slot::RefreshRate), [144.0]);
    }

    #[test]
    fn inputs_that_do_not_exist_hold_still() {
        let uniforms = sample();
        assert_eq!(uniforms.get(Slot::Mouse), [0.5, 0.5]);
        assert_eq!(uniforms.get(Slot::ShadertoyMouse), [0.0; 4]);
        assert_eq!(uniforms.get(Slot::Drag), [0.0; 2]);
        for slot in [Slot::Scroll, Slot::Recursion, Slot::ColorGamut] {
            assert_eq!(uniforms.get(slot), [0.0], "{slot:?}");
        }
        assert_eq!(uniforms.get(Slot::MaxRecursion), [1.0]);
        assert_eq!(uniforms.get(Slot::CameraPosition), [0.0, 0.0, 3.0]);
        assert_eq!(uniforms.get(Slot::CameraDirection), [0.0, 0.0, -1.0]);
        let view = uniforms.get(Slot::CameraView);
        assert_eq!(view.len(), 16);
        assert_eq!(
            [view[0], view[5], view[10], view[15]],
            [1.0; 4],
            "identity rotation"
        );
        assert_eq!(view[14], -3.0, "moves the scene away from the camera");
        assert_eq!(view.iter().filter(|&&v| v != 0.0).count(), 5);
    }

    #[test]
    fn padding_fills_with_zeros() {
        let uniforms = sample();
        let padded = uniforms.padded(Slot::Resolution);
        assert_eq!(padded[..3], [800.0, 600.0, 1.0]);
        assert!(padded[3..].iter().all(|&v| v == 0.0));
        assert_eq!(uniforms.padded(Slot::CameraView), CAMERA_VIEW);
    }

    proptest! {
        #[test]
        fn resolution_and_pointer_follow_the_render_size(width in 1u32..10_000, height in 1u32..10_000, time in 0.0f64..1e6, index: u32) {
            let uniforms = Uniforms::new(&frame(Size::new(width, height), time, index));
            let (w, h) = (width as f32, height as f32);
            prop_assert_eq!(uniforms.get(Slot::Resolution), &[w, h, 1.0][..]);
            prop_assert_eq!(uniforms.get(Slot::MousePixels), &[w / 2.0, h / 2.0, -1.0, -1.0][..]);
            prop_assert_eq!(uniforms.get(Slot::Time), &[time as f32][..]);
            prop_assert_eq!(uniforms.get(Slot::Frame), &[index as f32][..]);
        }

        #[test]
        fn padded_values_start_with_the_slot(slot in prop::sample::select(SLOTS.to_vec()), width in 1u32..4096, height in 1u32..4096) {
            let uniforms = Uniforms::new(&frame(Size::new(width, height), 1.0, 1));
            let values = uniforms.get(slot);
            let padded = uniforms.padded(slot);
            prop_assert_eq!(&padded[..values.len()], values);
            prop_assert!(padded[values.len()..].iter().all(|&v| v == 0.0));
        }
    }
}
