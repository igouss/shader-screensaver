//! Local wall-clock time for the date uniforms.

use chrono::{Datelike, Local, Timelike};

use crate::domain::uniforms::Date;

#[must_use]
pub fn local_date() -> Date {
    date_of(&Local::now())
}

fn date_of<T: Datelike + Timelike>(time: &T) -> Date {
    Date {
        year: time.year(),
        month: time.month0(),
        day: time.day(),
        seconds: f64::from(time.num_seconds_from_midnight()) + f64::from(time.nanosecond()) / 1e9,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn months_count_from_zero_and_seconds_from_midnight() {
        let time = NaiveDate::from_ymd_opt(2026, 9, 13)
            .unwrap()
            .and_hms_milli_opt(1, 2, 3, 500)
            .unwrap();
        assert_eq!(
            date_of(&time),
            Date {
                year: 2026,
                month: 8,
                day: 13,
                seconds: 3723.5
            }
        );
    }

    #[test]
    fn the_local_date_is_in_range() {
        let date = local_date();
        assert!(date.year >= 2026);
        assert!(date.month < 12);
        assert!((1..=31).contains(&date.day));
        assert!((0.0..86_402.0).contains(&date.seconds));
    }
}
