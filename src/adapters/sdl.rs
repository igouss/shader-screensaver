//! The Screen port on SDL3: a fullscreen (or hidden) window with an OpenGL
//! ES 3.0 context.

use std::{ffi::c_void, ptr};

use sdl3::{
    event::{Event, WindowEvent},
    keyboard::Keycode,
    video::{GLContext, GLProfile, SwapInterval, Window},
};

use super::gl::{Gles, Program};
use crate::domain::{
    Size,
    controls::{Input, Key},
    uniforms::Uniforms,
};
use crate::ports::{Gpu, Screen, Target};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Visibility {
    Fullscreen,
    /// For offscreen work; a context still needs a window.
    Hidden,
}

pub struct SdlScreen {
    // Fields drop in order: GL objects before the context, the context before
    // the window.
    gpu: Gles,
    _context: GLContext,
    window: Window,
    events: sdl3::EventPump,
    _video: sdl3::VideoSubsystem,
    _sdl: sdl3::Sdl,
}

impl SdlScreen {
    /// Opens the window. `app_id` becomes the Wayland app id, which
    /// Omarchy's window rules and the focus check match on.
    ///
    /// # Errors
    ///
    /// SDL's or the driver's message if the window, the OpenGL ES 3.0
    /// context or the renderer can't be set up.
    pub fn open(app_id: &str, visibility: Visibility) -> Result<Self, String> {
        sdl3::hint::set("SDL_APP_ID", app_id);
        sdl3::set_app_metadata(
            Some("Shader Screensaver"),
            Some(env!("CARGO_PKG_VERSION")),
            Some(app_id),
        )
        .map_err(|e| e.to_string())?;
        let sdl = sdl3::init().map_err(|e| e.to_string())?;
        let video = sdl.video().map_err(|e| e.to_string())?;

        let attributes = video.gl_attr();
        attributes.set_context_profile(GLProfile::GLES);
        attributes.set_context_version(3, 0);
        attributes.set_alpha_size(0);
        attributes.set_depth_size(0);
        attributes.set_double_buffer(true);

        let mut builder = video.window("Shader Screensaver", 1280, 720);
        builder.opengl();
        match visibility {
            Visibility::Fullscreen => builder.fullscreen().borderless(),
            Visibility::Hidden => builder.hidden(),
        };
        let window = builder.build().map_err(|e| e.to_string())?;
        let context = window.gl_create_context().map_err(|e| e.to_string())?;
        if visibility == Visibility::Fullscreen {
            // Best effort: without vsync the frame cap still applies.
            let _ = video.gl_set_swap_interval(SwapInterval::VSync);
            sdl.mouse().show_cursor(false);
        }

        // SAFETY: the context was just made current on this thread, and the
        // field order keeps it alive until the renderer is gone.
        let gpu = unsafe {
            let gl = glow::Context::from_loader_function(|name| {
                video
                    .gl_get_proc_address(name)
                    .map_or(ptr::null(), |f| f as *const c_void)
            });
            Gles::new(gl)?
        };
        let events = sdl.event_pump().map_err(|e| e.to_string())?;
        Ok(Self {
            gpu,
            _context: context,
            window,
            events,
            _video: video,
            _sdl: sdl,
        })
    }

    /// The display's refresh rate, 60 Hz when unknown.
    #[must_use]
    pub fn refresh_rate(&self) -> f32 {
        self.window
            .get_display()
            .and_then(|display| display.get_mode())
            .map(|mode| mode.refresh_rate)
            .ok()
            .filter(|&rate| rate > 0.0)
            .unwrap_or(60.0)
    }
}

impl Gpu for SdlScreen {
    type Program = Program;

    fn compile(&mut self, fragment: &str) -> Result<Program, String> {
        self.gpu.compile(fragment)
    }

    fn draw(&mut self, program: &Program, uniforms: &Uniforms, target: Target) {
        self.gpu.draw(program, uniforms, target);
    }

    fn read_pixels(&mut self) -> Vec<u8> {
        self.gpu.read_pixels()
    }

    fn finish(&mut self) {
        self.gpu.finish();
    }
}

impl Screen for SdlScreen {
    fn poll_input(&mut self) -> Option<Input> {
        std::iter::from_fn(|| self.events.poll_event()).find_map(|event| input(&event))
    }

    fn pixel_size(&self) -> Size {
        let (width, height) = self.window.size_in_pixels();
        Size::new(width, height)
    }

    fn present(&mut self) {
        self.window.gl_swap_window();
    }
}

fn input(event: &Event) -> Option<Input> {
    Some(match event {
        Event::Quit { .. } => Input::CloseRequested,
        Event::KeyDown {
            keycode,
            repeat: false,
            ..
        } => Input::Key(keycode.map_or(Key::Other, key)),
        Event::MouseButtonDown { .. } | Event::MouseWheel { .. } | Event::FingerDown { .. } => {
            Input::Pointer
        }
        Event::MouseMotion { xrel, yrel, .. } => Input::PointerMotion {
            dx: *xrel,
            dy: *yrel,
        },
        Event::Window {
            win_event: WindowEvent::FocusLost,
            ..
        } => Input::FocusLost,
        Event::Window {
            win_event: WindowEvent::FocusGained,
            ..
        } => Input::FocusGained,
        _ => return None,
    })
}

fn key(keycode: Keycode) -> Key {
    match keycode {
        Keycode::Escape => Key::Escape,
        Keycode::Space => Key::Space,
        Keycode::Left => Key::Left,
        Keycode::Right => Key::Right,
        // Letter and digit keycodes are their lowercase ASCII characters.
        other => char::from_u32(other.to_ll().0)
            .filter(char::is_ascii_alphanumeric)
            .map_or(Key::Other, Key::Char),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_map_to_what_the_viewer_understands() {
        assert_eq!(key(Keycode::Escape), Key::Escape);
        assert_eq!(key(Keycode::Space), Key::Space);
        assert_eq!(key(Keycode::Left), Key::Left);
        assert_eq!(key(Keycode::Right), Key::Right);
        assert_eq!(key(Keycode::Q), Key::Char('q'));
        assert_eq!(key(Keycode::D), Key::Char('d'));
        assert_eq!(key(Keycode::_0), Key::Char('0'));
        assert_eq!(key(Keycode::_9), Key::Char('9'));
    }

    #[test]
    fn other_keys_are_just_keys() {
        for keycode in [
            Keycode::F1,
            Keycode::Kp5,
            Keycode::Return,
            Keycode::Minus,
            Keycode::Up,
        ] {
            assert_eq!(key(keycode), Key::Other, "{keycode:?}");
        }
    }
}
