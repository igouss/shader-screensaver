//! Writes rendered frames as PNG thumbnails.

use std::{
    fs::File,
    io::{self, BufWriter, Write},
    path::Path,
};

use crate::domain::Size;

/// Writes an RGBA frame as read back from OpenGL (bottom row first) as an
/// RGB PNG.
///
/// # Errors
///
/// If the file can't be created or written.
pub fn write_png(path: &Path, rgba: &[u8], size: Size) -> io::Result<()> {
    let mut out = BufWriter::new(File::create(path)?);
    let mut encoder = png::Encoder::new(&mut out, size.width, size.height);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(io::Error::other)?;
    writer
        .write_image_data(&top_down_rgb(rgba, size))
        .map_err(io::Error::other)?;
    writer.finish().map_err(io::Error::other)?;
    out.flush()
}

/// Flips bottom-up RGBA rows into top-down RGB rows.
fn top_down_rgb(rgba: &[u8], size: Size) -> Vec<u8> {
    let stride = size.width as usize * 4;
    if stride == 0 {
        return Vec::new();
    }
    rgba.chunks_exact(stride)
        .rev()
        .flat_map(|row| row.as_chunks::<4>().0.iter().flat_map(|pixel| &pixel[..3]))
        .copied()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use std::io::BufReader;

    #[test]
    fn rows_flip_and_alpha_goes() {
        #[rustfmt::skip]
        let rgba = [
            1, 2, 3, 4,     5, 6, 7, 8,     // bottom row
            9, 10, 11, 12,  13, 14, 15, 16, // top row
        ];
        assert_eq!(
            top_down_rgb(&rgba, Size::new(2, 2)),
            [9, 10, 11, 13, 14, 15, 1, 2, 3, 5, 6, 7]
        );
    }

    #[test]
    fn an_empty_frame_has_no_rows() {
        assert_eq!(top_down_rgb(&[], Size::new(0, 3)), Vec::<u8>::new());
    }

    #[test]
    fn unwritable_paths_are_reported() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write_png(&dir.path().join("missing/t.png"), &[0; 4], Size::new(1, 1)).is_err());
    }

    fn frame() -> impl Strategy<Value = (Size, Vec<u8>)> {
        (1u32..24, 1u32..24).prop_flat_map(|(w, h)| {
            (
                Just(Size::new(w, h)),
                prop::collection::vec(any::<u8>(), Size::new(w, h).area() * 4),
            )
        })
    }

    proptest! {
        #[test]
        fn each_pixel_lands_mirrored_vertically((size, rgba) in frame()) {
            let rgb = top_down_rgb(&rgba, size);
            prop_assert_eq!(rgb.len(), size.area() * 3);
            let (w, h) = (size.width as usize, size.height as usize);
            for y in 0..h {
                for x in 0..w {
                    let from = ((h - 1 - y) * w + x) * 4;
                    let to = (y * w + x) * 3;
                    prop_assert_eq!(&rgb[to..to + 3], &rgba[from..from + 3]);
                }
            }
        }

        #[test]
        fn pngs_decode_to_the_flipped_frame((size, rgba) in frame()) {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("t.png");
            write_png(&path, &rgba, size).unwrap();

            let decoder = png::Decoder::new(BufReader::new(File::open(&path).unwrap()));
            let mut reader = decoder.read_info().unwrap();
            let mut decoded = vec![0; reader.output_buffer_size().unwrap()];
            let info = reader.next_frame(&mut decoded).unwrap();
            prop_assert_eq!((info.width, info.height), (size.width, size.height));
            prop_assert_eq!(info.color_type, png::ColorType::Rgb);
            prop_assert_eq!(&decoded[..info.buffer_size()], &top_down_rgb(&rgba, size)[..]);
        }
    }
}
