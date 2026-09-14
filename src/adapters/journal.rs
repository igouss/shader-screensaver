//! The Report port for real: the run log on stderr (which `--log` points at
//! a file), the `current` file, and the cycle viewer's protocol on stdout.

use std::{fs, path::PathBuf};

use chrono::Local;

use crate::ports::{Event, Report};

#[derive(Debug)]
pub struct Journal {
    current: PathBuf,
    cycle: bool,
}

impl Journal {
    /// `current` is the file naming the shader on screen; `cycle` turns on
    /// the viewer protocol on stdout.
    #[must_use]
    pub const fn new(current: PathBuf, cycle: bool) -> Self {
        Self { current, cycle }
    }
}

impl Report for Journal {
    fn report(&mut self, event: Event) {
        if let Event::Showing { path, .. } = &event {
            // Best effort: only `screensaver-shaders last` reads it.
            let _ = fs::write(&self.current, format!("{}\n", path.display()));
        }
        if let Some(entry) = log_entry(&event) {
            eprintln!("{} {entry}", Local::now().format("%F %T"));
        }
        if let Some(diagnostic) = diagnostic(&event) {
            eprintln!("shader-screensaver: {diagnostic}");
        }
        if self.cycle
            && let Some(line) = protocol_line(&event)
        {
            println!("{line}");
        }
    }
}

/// Run log entries, after a timestamp. The rotation and
/// `screensaver-shaders history` parse the "showing" ones.
fn log_entry(event: &Event) -> Option<String> {
    match event {
        Event::Showing { path, format, .. } => {
            Some(format!("showing {} ({format} format)", path.display()))
        }
        Event::Stopped { after, reason } => Some(format!(
            "stopped after {:.0}s: {reason}",
            after.as_secs_f64()
        )),
        _ => None,
    }
}

/// Problems and measurements, after the program name.
fn diagnostic(event: &Event) -> Option<String> {
    match event {
        Event::Rejected { path, error } => Some(format!("{}: {error}", path.display())),
        Event::ScaleDropped { fps, scale } => {
            Some(format!("{fps:.1} fps, render scale -> {scale:.2}"))
        }
        Event::FrameRate {
            render,
            window,
            fps,
        } => Some(format!("{render} -> {window}  {fps:.1} fps")),
        _ => None,
    }
}

/// The cycle viewer's tab-separated protocol, read by `screensaver-shaders cycle`.
fn protocol_line(event: &Event) -> Option<String> {
    match event {
        Event::Showing {
            path,
            position,
            total,
            ..
        } => Some(format!("show\t{position}\t{total}\t{}", path.display())),
        Event::Paused(path) => Some(format!("paused\t{}", path.display())),
        Event::Resumed(path) => Some(format!("resumed\t{}", path.display())),
        Event::Interval { interval, path } => Some(format!(
            "interval\t{:.0}\t{}",
            interval.as_secs_f64(),
            path.display()
        )),
        Event::Deleted(path) => Some(format!("delete\t{}", path.display())),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Size, controls::StopReason, source::Format};
    use std::time::Duration;

    fn showing() -> Event {
        Event::Showing {
            path: "/s/aurora.frag".into(),
            format: Format::FragCoord,
            position: 2,
            total: 9,
        }
    }

    fn all_events() -> Vec<Event> {
        vec![
            showing(),
            Event::Rejected {
                path: "/s/bad.frag".into(),
                error: "compile failed:\nERROR: 0:3: x".into(),
            },
            Event::Paused("/s/a.frag".into()),
            Event::Resumed("/s/a.frag".into()),
            Event::Interval {
                interval: Duration::from_secs(7),
                path: "/s/a.frag".into(),
            },
            Event::Deleted("/s/a.frag".into()),
            Event::ScaleDropped {
                fps: 12.345,
                scale: 0.7,
            },
            Event::FrameRate {
                render: Size::new(960, 540),
                window: Size::new(1920, 1080),
                fps: 59.94,
            },
            Event::Stopped {
                after: Duration::from_millis(65_400),
                reason: StopReason::KeyPress,
            },
        ]
    }

    #[test]
    fn the_run_log_records_showings_and_stops() {
        let entries: Vec<String> = all_events().iter().filter_map(log_entry).collect();
        assert_eq!(
            entries,
            [
                "showing /s/aurora.frag (fragcoord format)",
                "stopped after 65s: key press"
            ]
        );
    }

    #[test]
    fn diagnostics_cover_rejections_and_frame_rates() {
        let lines: Vec<String> = all_events().iter().filter_map(diagnostic).collect();
        assert_eq!(
            lines,
            [
                "/s/bad.frag: compile failed:\nERROR: 0:3: x",
                "12.3 fps, render scale -> 0.70",
                "960x540 -> 1920x1080  59.9 fps",
            ]
        );
    }

    #[test]
    fn the_viewer_protocol_is_tab_separated() {
        let lines: Vec<String> = all_events().iter().filter_map(protocol_line).collect();
        assert_eq!(
            lines,
            [
                "show\t2\t9\t/s/aurora.frag",
                "paused\t/s/a.frag",
                "resumed\t/s/a.frag",
                "interval\t7\t/s/a.frag",
                "delete\t/s/a.frag",
            ]
        );
    }

    #[test]
    fn showing_a_shader_names_it_in_the_current_file() {
        let dir = tempfile::tempdir().unwrap();
        let current = dir.path().join("current");
        let mut journal = Journal::new(current.clone(), false);
        journal.report(Event::Deleted("/s/a.frag".into()));
        assert!(!current.exists());
        journal.report(showing());
        assert_eq!(fs::read_to_string(&current).unwrap(), "/s/aurora.frag\n");
    }
}
