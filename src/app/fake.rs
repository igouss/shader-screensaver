//! Test doubles for the ports.

use std::{
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
};

use crate::domain::{Size, controls::Input, uniforms::Uniforms};
use crate::ports::{Event, Gpu, Report, Screen, Target};

/// Shader code containing this fails to compile.
pub const BROKEN: &str = "BROKEN";

#[derive(Debug, Clone, PartialEq)]
pub struct Draw {
    pub program: usize,
    pub uniforms: Uniforms,
    pub target: Target,
}

/// A GPU and window that record what they're asked to do. Programs are
/// indices into `compiled`.
#[derive(Debug)]
pub struct FakeScreen {
    pub size: Size,
    pub inputs: VecDeque<Input>,
    pub compiled: Vec<String>,
    pub draws: Vec<Draw>,
    pub presented: usize,
    pub finished: usize,
    /// What successive `read_pixels` calls return.
    pub frames: VecDeque<Vec<u8>>,
}

impl FakeScreen {
    pub fn new(size: Size) -> Self {
        Self {
            size,
            inputs: VecDeque::new(),
            compiled: Vec::new(),
            draws: Vec::new(),
            presented: 0,
            finished: 0,
            frames: VecDeque::new(),
        }
    }
}

impl Gpu for FakeScreen {
    type Program = usize;

    fn compile(&mut self, fragment: &str) -> Result<usize, String> {
        if fragment.contains(BROKEN) {
            return Err(format!("compile failed:\n0:1: {BROKEN}"));
        }
        self.compiled.push(fragment.to_owned());
        Ok(self.compiled.len() - 1)
    }

    fn draw(&mut self, program: &usize, uniforms: &Uniforms, target: Target) {
        self.draws.push(Draw {
            program: *program,
            uniforms: uniforms.clone(),
            target,
        });
    }

    fn read_pixels(&mut self) -> Vec<u8> {
        self.frames.pop_front().unwrap_or_default()
    }

    fn finish(&mut self) {
        self.finished += 1;
    }
}

impl Screen for FakeScreen {
    fn poll_input(&mut self) -> Option<Input> {
        self.inputs.pop_front()
    }

    fn pixel_size(&self) -> Size {
        self.size
    }

    fn present(&mut self) {
        self.presented += 1;
    }
}

impl Report for Vec<Event> {
    fn report(&mut self, event: Event) {
        self.push(event);
    }
}

/// Writes (file name, code) pairs into `dir`, returning their paths.
pub fn write_shaders(dir: &Path, shaders: &[(&str, &str)]) -> Vec<PathBuf> {
    shaders
        .iter()
        .map(|(name, code)| {
            let path = dir.join(name);
            fs::write(&path, code).expect("temp dir is writable");
            path
        })
        .collect()
}
