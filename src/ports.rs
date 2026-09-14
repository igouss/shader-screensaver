//! What the application needs from the outside world. The adapters implement
//! these with SDL3, OpenGL ES, Hyprland and the file system; tests use fakes.

use std::{path::PathBuf, time::Duration};

use crate::domain::{
    Size,
    controls::{Input, StopReason},
    source::Format,
    uniforms::Uniforms,
};

/// Where a frame is drawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    /// The window, rendered at `render` pixels and stretched to `window`.
    Window { render: Size, window: Size },
    /// An image kept on the GPU, read back with [`Gpu::read_pixels`].
    Offscreen(Size),
}

/// Compiles shaders and draws them.
pub trait Gpu {
    type Program;

    /// Compiles and links a complete fragment shader.
    ///
    /// # Errors
    ///
    /// The driver's compile or link log.
    fn compile(&mut self, fragment: &str) -> Result<Self::Program, String>;

    /// Draws one frame, keeping alpha opaque whatever the shader writes.
    fn draw(&mut self, program: &Self::Program, uniforms: &Uniforms, target: Target);

    /// RGBA pixels of the last offscreen frame, bottom row first.
    fn read_pixels(&mut self) -> Vec<u8>;

    /// Blocks until queued GPU work is done.
    fn finish(&mut self);
}

/// A fullscreen window: a GPU plus input and presentation.
pub trait Screen: Gpu {
    fn poll_input(&mut self) -> Option<Input>;

    fn pixel_size(&self) -> Size;

    /// Shows the frame drawn to the window.
    fn present(&mut self);
}

/// Whether the screensaver should keep running after its window lost focus.
pub trait Presence {
    fn should_stay(&mut self) -> bool;
}

impl<F: FnMut() -> bool> Presence for F {
    fn should_stay(&mut self) -> bool {
        self()
    }
}

/// Receives what happens, for the run log, the `current` file and the cycle
/// viewer's protocol.
pub trait Report {
    fn report(&mut self, event: Event);
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// A shader went on screen, `position` of the `total` still in the playlist.
    Showing {
        path: PathBuf,
        format: Format,
        position: usize,
        total: usize,
    },
    /// A shader couldn't be read or compiled, and was skipped.
    Rejected {
        path: PathBuf,
        error: String,
    },
    Paused(PathBuf),
    Resumed(PathBuf),
    /// The cycle viewer's time per shader changed.
    Interval {
        interval: Duration,
        path: PathBuf,
    },
    /// The user asked to delete the shader on screen.
    Deleted(PathBuf),
    /// The shader ran too slowly, so the render scale dropped.
    ScaleDropped {
        fps: f64,
        scale: f32,
    },
    /// The frame rate over the last second, for `--fps`.
    FrameRate {
        render: Size,
        window: Size,
        fps: f64,
    },
    Stopped {
        after: Duration,
        reason: StopReason,
    },
}
