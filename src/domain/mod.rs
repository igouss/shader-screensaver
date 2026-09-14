//! The screensaver's rules as plain data and functions, free of SDL, OpenGL
//! and the file system.

pub mod controls;
pub mod pacing;
pub mod playlist;
pub mod source;
pub mod stats;
pub mod uniforms;

use std::fmt;

/// A size in pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

impl Size {
    #[must_use]
    pub const fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }

    /// Number of pixels.
    #[must_use]
    pub const fn area(self) -> usize {
        self.width as usize * self.height as usize
    }
}

impl fmt::Display for Size {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}x{}", self.width, self.height)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn area_multiplies_without_overflowing_u32() {
        assert_eq!(Size::new(640, 360).area(), 230_400);
        assert_eq!(Size::new(u32::MAX, 2).area(), 2 * u32::MAX as usize);
    }

    #[test]
    fn displays_as_width_by_height() {
        assert_eq!(Size::new(1920, 1080).to_string(), "1920x1080");
    }
}
