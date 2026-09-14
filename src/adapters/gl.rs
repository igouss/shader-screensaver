//! The GPU port on OpenGL ES 3 through glow: compiles shaders and draws the
//! fullscreen triangle.
//!
//! Every glow call is unsafe because it goes straight to the driver; they are
//! sound as long as the context the renderer was created with is current on
//! this thread, which [`Gles::new`] requires of its caller.

use std::rc::Rc;

use glow::HasContext;

use crate::domain::{
    Size,
    source::VERTEX_SHADER,
    uniforms::{Slot, Uniforms},
};
use crate::ports::{Gpu, Target};

/// A linked program, and the uniforms it uses that the renderer feeds.
#[derive(Debug)]
pub struct Program {
    gl: Rc<glow::Context>,
    raw: glow::Program,
    bindings: Vec<Binding>,
}

impl Drop for Program {
    fn drop(&mut self) {
        // SAFETY: see the module docs.
        unsafe { self.gl.delete_program(self.raw) };
    }
}

#[derive(Debug)]
struct Binding {
    slot: Slot,
    location: glow::UniformLocation,
    kind: Kind,
}

/// The uniform types the renderer uploads; others are left alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Float,
    Vec2,
    Vec3,
    Vec4,
    Int,
    Mat4,
}

impl Kind {
    const fn of(gl_type: u32) -> Option<Self> {
        Some(match gl_type {
            glow::FLOAT => Self::Float,
            glow::FLOAT_VEC2 => Self::Vec2,
            glow::FLOAT_VEC3 => Self::Vec3,
            glow::FLOAT_VEC4 => Self::Vec4,
            glow::INT => Self::Int,
            glow::FLOAT_MAT4 => Self::Mat4,
            _ => return None,
        })
    }
}

/// Offscreen colour buffer, for scaled-down rendering and read-back.
#[derive(Debug)]
struct Offscreen {
    framebuffer: glow::Framebuffer,
    texture: glow::Texture,
    size: Size,
}

#[derive(Debug)]
pub struct Gles {
    gl: Rc<glow::Context>,
    vertex_shader: glow::Shader,
    vertex_array: glow::VertexArray,
    offscreen: Option<Offscreen>,
}

impl Gles {
    /// Sets up what every draw shares: the vertex shader and a vertex array.
    ///
    /// # Errors
    ///
    /// The driver's log if the vertex shader doesn't compile, or GL's error
    /// if it can't create a vertex array.
    ///
    /// # Safety
    ///
    /// `gl` must belong to a context that stays current on this thread for as
    /// long as the renderer and the programs it compiles live.
    pub unsafe fn new(gl: glow::Context) -> Result<Self, String> {
        let gl = Rc::new(gl);
        // SAFETY: the caller guarantees a current context.
        unsafe {
            let vertex_shader = compile_stage(&gl, glow::VERTEX_SHADER, VERTEX_SHADER)
                .map_err(|log| format!("vertex shader: {log}"))?;
            let vertex_array = gl.create_vertex_array()?;
            gl.bind_vertex_array(Some(vertex_array));
            Ok(Self {
                gl,
                vertex_shader,
                vertex_array,
                offscreen: None,
            })
        }
    }

    /// The offscreen framebuffer, (re)allocated at `size` when that changed.
    fn offscreen(&mut self, size: Size) -> glow::Framebuffer {
        let gl = &self.gl;
        // SAFETY: see the module docs.
        unsafe {
            let target = self.offscreen.get_or_insert_with(|| Offscreen {
                framebuffer: gl
                    .create_framebuffer()
                    .expect("GL can create a framebuffer"),
                texture: gl.create_texture().expect("GL can create a texture"),
                size: Size::new(0, 0),
            });
            if target.size != size {
                let (width, height) = gl_size(size);
                gl.bind_texture(glow::TEXTURE_2D, Some(target.texture));
                gl.tex_image_2d(
                    glow::TEXTURE_2D,
                    0,
                    glow::RGBA8.cast_signed(),
                    width,
                    height,
                    0,
                    glow::RGBA,
                    glow::UNSIGNED_BYTE,
                    glow::PixelUnpackData::Slice(None),
                );
                gl.tex_parameter_i32(
                    glow::TEXTURE_2D,
                    glow::TEXTURE_MIN_FILTER,
                    glow::LINEAR.cast_signed(),
                );
                gl.tex_parameter_i32(
                    glow::TEXTURE_2D,
                    glow::TEXTURE_MAG_FILTER,
                    glow::LINEAR.cast_signed(),
                );
                gl.bind_framebuffer(glow::FRAMEBUFFER, Some(target.framebuffer));
                gl.framebuffer_texture_2d(
                    glow::FRAMEBUFFER,
                    glow::COLOR_ATTACHMENT0,
                    glow::TEXTURE_2D,
                    Some(target.texture),
                    0,
                );
                target.size = size;
            }
            target.framebuffer
        }
    }
}

impl Drop for Gles {
    fn drop(&mut self) {
        // SAFETY: see the module docs.
        unsafe {
            if let Some(offscreen) = self.offscreen.take() {
                self.gl.delete_framebuffer(offscreen.framebuffer);
                self.gl.delete_texture(offscreen.texture);
            }
            self.gl.delete_vertex_array(self.vertex_array);
            self.gl.delete_shader(self.vertex_shader);
        }
    }
}

impl Gpu for Gles {
    type Program = Program;

    fn compile(&mut self, fragment: &str) -> Result<Program, String> {
        let gl = &self.gl;
        // SAFETY: see the module docs.
        unsafe {
            let fragment_shader = compile_stage(gl, glow::FRAGMENT_SHADER, fragment)?;
            let raw = match gl.create_program() {
                Ok(raw) => raw,
                Err(e) => {
                    gl.delete_shader(fragment_shader);
                    return Err(e);
                }
            };
            gl.attach_shader(raw, self.vertex_shader);
            gl.attach_shader(raw, fragment_shader);
            gl.link_program(raw);
            gl.detach_shader(raw, self.vertex_shader);
            gl.detach_shader(raw, fragment_shader);
            gl.delete_shader(fragment_shader);

            // Owned from here on, so every exit deletes it.
            let mut program = Program {
                gl: Rc::clone(gl),
                raw,
                bindings: Vec::new(),
            };
            if !gl.get_program_link_status(raw) {
                return Err(format!("link failed:\n{}", gl.get_program_info_log(raw)));
            }
            program.bindings = bindings(gl, raw);
            Ok(program)
        }
    }

    fn draw(&mut self, program: &Program, uniforms: &Uniforms, target: Target) {
        let (framebuffer, size) = match target {
            Target::Window { render, window } if render == window => (None, window),
            Target::Window { render: size, .. } | Target::Offscreen(size) => {
                (Some(self.offscreen(size)), size)
            }
        };
        let gl = &self.gl;
        let (width, height) = gl_size(size);
        // SAFETY: see the module docs.
        unsafe {
            gl.use_program(Some(program.raw));
            for binding in &program.bindings {
                upload(gl, binding, &uniforms.padded(binding.slot));
            }
            gl.bind_framebuffer(glow::FRAMEBUFFER, framebuffer);
            gl.viewport(0, 0, width, height);
            gl.color_mask(true, true, true, true);
            gl.clear_color(0.0, 0.0, 0.0, 1.0);
            gl.clear(glow::COLOR_BUFFER_BIT);
            // Keep alpha opaque whatever the shader writes, so the window
            // never shows through.
            gl.color_mask(true, true, true, false);
            gl.draw_arrays(glow::TRIANGLES, 0, 3);
            gl.color_mask(true, true, true, true);

            if let (Target::Window { window, .. }, Some(framebuffer)) = (target, framebuffer) {
                let (window_width, window_height) = gl_size(window);
                gl.bind_framebuffer(glow::READ_FRAMEBUFFER, Some(framebuffer));
                gl.bind_framebuffer(glow::DRAW_FRAMEBUFFER, None);
                gl.blit_framebuffer(
                    0,
                    0,
                    width,
                    height,
                    0,
                    0,
                    window_width,
                    window_height,
                    glow::COLOR_BUFFER_BIT,
                    glow::LINEAR,
                );
            }
        }
    }

    fn read_pixels(&mut self) -> Vec<u8> {
        let Some(offscreen) = &self.offscreen else {
            return Vec::new();
        };
        let mut pixels = vec![0; offscreen.size.area() * 4];
        let (width, height) = gl_size(offscreen.size);
        // SAFETY: see the module docs.
        unsafe {
            self.gl
                .bind_framebuffer(glow::READ_FRAMEBUFFER, Some(offscreen.framebuffer));
            self.gl.read_pixels(
                0,
                0,
                width,
                height,
                glow::RGBA,
                glow::UNSIGNED_BYTE,
                glow::PixelPackData::Slice(Some(&mut pixels)),
            );
        }
        pixels
    }

    fn finish(&mut self) {
        // SAFETY: see the module docs.
        unsafe { self.gl.finish() };
    }
}

fn gl_size(size: Size) -> (i32, i32) {
    let clamp = |n: u32| i32::try_from(n).unwrap_or(i32::MAX);
    (clamp(size.width), clamp(size.height))
}

/// Compiles one shader stage; the error is the compile log.
unsafe fn compile_stage(
    gl: &glow::Context,
    stage: u32,
    source: &str,
) -> Result<glow::Shader, String> {
    // SAFETY: the caller has a current context.
    unsafe {
        let shader = gl.create_shader(stage)?;
        gl.shader_source(shader, source);
        gl.compile_shader(shader);
        if gl.get_shader_compile_status(shader) {
            return Ok(shader);
        }
        let log = gl.get_shader_info_log(shader);
        gl.delete_shader(shader);
        Err(format!("compile failed:\n{log}"))
    }
}

/// The active uniforms of `program` that the renderer feeds.
unsafe fn bindings(gl: &glow::Context, program: glow::Program) -> Vec<Binding> {
    // SAFETY: the caller has a current context.
    unsafe {
        (0..gl.get_active_uniforms(program))
            .filter_map(|index| {
                let uniform = gl.get_active_uniform(program, index)?;
                let slot = Slot::for_name(&uniform.name)?;
                let kind = Kind::of(uniform.utype)?;
                let location = gl.get_uniform_location(program, &uniform.name)?;
                Some(Binding {
                    slot,
                    location,
                    kind,
                })
            })
            .collect()
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "int uniforms (frame counters) hold whole numbers"
)]
unsafe fn upload(gl: &glow::Context, binding: &Binding, values: &[f32; 16]) {
    let location = Some(&binding.location);
    // SAFETY: the caller has a current context and the program in use.
    unsafe {
        match binding.kind {
            Kind::Float => gl.uniform_1_f32(location, values[0]),
            Kind::Vec2 => gl.uniform_2_f32_slice(location, &values[..2]),
            Kind::Vec3 => gl.uniform_3_f32_slice(location, &values[..3]),
            Kind::Vec4 => gl.uniform_4_f32_slice(location, &values[..4]),
            Kind::Int => gl.uniform_1_i32(location, values[0] as i32),
            Kind::Mat4 => gl.uniform_matrix_4_f32_slice(location, false, values),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uploads_the_types_the_formats_declare() {
        let kinds = [
            glow::FLOAT,
            glow::FLOAT_VEC2,
            glow::FLOAT_VEC3,
            glow::FLOAT_VEC4,
            glow::INT,
            glow::FLOAT_MAT4,
        ]
        .map(Kind::of);
        assert_eq!(
            kinds,
            [
                Kind::Float,
                Kind::Vec2,
                Kind::Vec3,
                Kind::Vec4,
                Kind::Int,
                Kind::Mat4
            ]
            .map(Some)
        );
        assert_eq!(Kind::of(glow::UNSIGNED_INT), None);
        assert_eq!(Kind::of(glow::SAMPLER_2D), None);
    }

    #[test]
    fn sizes_beyond_i32_are_clamped() {
        assert_eq!(gl_size(Size::new(1920, 1080)), (1920, 1080));
        assert_eq!(gl_size(Size::new(u32::MAX, 0)), (i32::MAX, 0));
    }
}
