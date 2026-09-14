//! Fullscreen GLSL shader screensaver for Omarchy (Hyprland).
//!
//! Laid out as ports and adapters: [`domain`] holds the rules as plain data
//! and functions, [`ports`] names what the application needs from outside,
//! [`app`] runs the screensaver and the offscreen check against those ports,
//! and [`adapters`] implement them with SDL3, OpenGL ES, Hyprland and the
//! file system.

pub mod adapters;
pub mod app;
pub mod domain;
pub mod ports;
