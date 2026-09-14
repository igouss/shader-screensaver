//! The shaders to show, in order, and which of them are gone: deleted, or
//! failed to compile.

/// Which way to move through the playlist.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Next,
    Previous,
}

#[derive(Debug, Clone)]
pub struct Playlist<T> {
    entries: Vec<T>,
    gone: Vec<bool>,
    current: usize,
}

impl<T> Playlist<T> {
    #[must_use]
    pub fn new(entries: Vec<T>) -> Self {
        let gone = vec![false; entries.len()];
        Self {
            entries,
            gone,
            current: 0,
        }
    }

    /// The entry opened last (the first entry before any was opened).
    #[must_use]
    pub fn current(&self) -> Option<&T> {
        self.entries.get(self.current)
    }

    /// Opens the first entry that loads, in playlist order.
    pub fn open_first<P>(&mut self, load: impl FnMut(&T) -> Option<P>) -> Option<P> {
        self.open_from(0, Direction::Next, load)
    }

    /// Opens the nearest entry in `direction` that loads, wrapping around;
    /// the current entry is tried last.
    pub fn step<P>(
        &mut self,
        direction: Direction,
        load: impl FnMut(&T) -> Option<P>,
    ) -> Option<P> {
        let len = self.entries.len();
        if len == 0 {
            return None;
        }
        // open_from wraps it into range.
        let start = match direction {
            Direction::Next => self.current + 1,
            Direction::Previous => self.current + len - 1,
        };
        self.open_from(start, direction, load)
    }

    /// Marks the current entry gone, e.g. after its file was deleted.
    pub fn remove_current(&mut self) {
        if let Some(gone) = self.gone.get_mut(self.current) {
            *gone = true;
        }
    }

    /// The current entry's 1-based position among the entries not gone, and
    /// how many of those there are.
    #[must_use]
    pub fn position(&self) -> (usize, usize) {
        let live = |gone: &[bool]| gone.iter().filter(|&&gone| !gone).count();
        let through_current = self.gone.get(..=self.current).unwrap_or_default();
        (live(through_current), live(&self.gone))
    }

    /// Tries entries from `start` on, moving in `direction`. Those that fail
    /// to load are marked gone so they aren't retried.
    fn open_from<P>(
        &mut self,
        start: usize,
        direction: Direction,
        mut load: impl FnMut(&T) -> Option<P>,
    ) -> Option<P> {
        let len = self.entries.len();
        for n in 0..len {
            let i = match direction {
                Direction::Next => (start + n) % len,
                Direction::Previous => (start + len - n) % len,
            };
            if self.gone[i] {
                continue;
            }
            if let Some(opened) = load(&self.entries[i]) {
                self.current = i;
                return Some(opened);
            }
            self.gone[i] = true;
        }
        None
    }
}

/// Sorts `items`, then shuffles them with `rng`, so a seed always gives the
/// same order whatever order the items came in.
pub fn shuffle<T: Ord>(items: &mut [T], rng: &mut fastrand::Rng) {
    items.sort_unstable();
    rng.shuffle(items);
}

#[cfg(test)]
mod tests {
    use super::*;
    use Direction::{Next, Previous};
    use proptest::collection::vec;
    use proptest::prelude::*;

    /// Entries are (index, loads?).
    fn playlist(loadable: &[bool]) -> Playlist<(usize, bool)> {
        Playlist::new(loadable.iter().copied().enumerate().collect())
    }

    /// Loads entries marked loadable, recording every attempt.
    fn loader(tried: &mut Vec<usize>) -> impl FnMut(&(usize, bool)) -> Option<usize> {
        move |&(i, loads)| {
            tried.push(i);
            loads.then_some(i)
        }
    }

    fn open_first(list: &mut Playlist<(usize, bool)>) -> Option<usize> {
        list.open_first(|&(i, loads)| loads.then_some(i))
    }

    #[test]
    fn opens_the_first_entry_that_loads() {
        let mut list = playlist(&[false, false, true, true]);
        let mut tried = vec![];
        assert_eq!(list.open_first(loader(&mut tried)), Some(2));
        assert_eq!(tried, [0, 1, 2]);
        assert_eq!(list.current(), Some(&(2, true)));
        assert_eq!(list.position(), (1, 2));
    }

    #[test]
    fn failed_entries_are_not_retried() {
        let mut list = playlist(&[false, true, true]);
        open_first(&mut list);
        let mut tried = vec![];
        assert_eq!(list.step(Next, loader(&mut tried)), Some(2));
        assert_eq!(list.step(Next, loader(&mut tried)), Some(1));
        assert_eq!(tried, [2, 1]);
    }

    #[test]
    fn previous_wraps_around_to_the_end() {
        let mut list = playlist(&[true, true, true]);
        open_first(&mut list);
        let mut tried = vec![];
        assert_eq!(list.step(Previous, loader(&mut tried)), Some(2));
        assert_eq!(list.step(Previous, loader(&mut tried)), Some(1));
        assert_eq!(tried, [2, 1]);
        assert_eq!(list.position(), (2, 3));
    }

    #[test]
    fn the_current_entry_is_tried_last() {
        for (direction, order) in [(Next, [1, 2, 0]), (Previous, [2, 1, 0])] {
            let mut list = playlist(&[true, false, false]);
            open_first(&mut list);
            let mut tried = vec![];
            assert_eq!(list.step(direction, loader(&mut tried)), Some(0));
            assert_eq!(tried, order, "{direction:?}");
        }
    }

    #[test]
    fn removed_entries_are_skipped_and_not_counted() {
        let mut list = playlist(&[true, true, true]);
        open_first(&mut list);
        list.step(Next, |&(i, _)| Some(i));
        assert_eq!(list.position(), (2, 3));

        list.remove_current();
        let mut tried = vec![];
        assert_eq!(list.step(Next, loader(&mut tried)), Some(2));
        assert_eq!(list.position(), (2, 2));
        assert_eq!(list.step(Next, loader(&mut tried)), Some(0));
        assert_eq!(list.position(), (1, 2));
        assert_eq!(tried, [2, 0]);
    }

    #[test]
    fn removing_the_only_entry_leaves_nothing_to_open() {
        let mut list = playlist(&[true]);
        open_first(&mut list);
        list.remove_current();
        assert_eq!(list.step(Next, |&(i, _)| Some(i)), None);
        assert_eq!(list.position(), (0, 0));
    }

    #[test]
    fn nothing_opens_when_nothing_loads() {
        let mut list = playlist(&[false, false]);
        assert_eq!(open_first(&mut list), None);
        let mut tried = vec![];
        assert_eq!(list.step(Next, loader(&mut tried)), None);
        assert!(tried.is_empty(), "failures are remembered");
    }

    #[test]
    fn an_empty_playlist_opens_nothing() {
        let mut list = playlist(&[]);
        assert_eq!(open_first(&mut list), None);
        assert_eq!(list.step(Next, |&(i, _)| Some(i)), None);
        assert_eq!(list.step(Previous, |&(i, _)| Some(i)), None);
        assert_eq!(list.current(), None);
        assert_eq!(list.position(), (0, 0));
        list.remove_current();
    }

    #[test]
    fn shuffling_changes_the_order() {
        let sorted: Vec<u32> = (0..20).collect();
        let mut items = sorted.clone();
        shuffle(&mut items, &mut fastrand::Rng::with_seed(1));
        assert_ne!(items, sorted);
    }

    #[derive(Debug, Clone)]
    enum Op {
        Step(Direction),
        Remove,
    }

    fn op() -> impl Strategy<Value = Op> {
        prop_oneof![
            Just(Op::Step(Next)),
            Just(Op::Step(Previous)),
            Just(Op::Remove)
        ]
    }

    /// Reference behaviour: try `order`, skipping gone entries, marking
    /// failures gone, stopping at the first that loads.
    fn model_open(
        loadable: &[bool],
        gone: &mut [bool],
        order: impl Iterator<Item = usize>,
    ) -> (Option<usize>, Vec<usize>) {
        let mut tried = vec![];
        for i in order {
            if gone[i] {
                continue;
            }
            tried.push(i);
            if loadable[i] {
                return (Some(i), tried);
            }
            gone[i] = true;
        }
        (None, tried)
    }

    proptest! {
        #[test]
        fn behaves_like_the_model(loadable in vec(any::<bool>(), 0..10), ops in vec(op(), 0..20)) {
            let len = loadable.len();
            let mut list = playlist(&loadable);
            let mut gone = vec![false; len];

            let mut tried = vec![];
            let opened = list.open_first(loader(&mut tried));
            let (expected, expected_tried) = model_open(&loadable, &mut gone, 0..len);
            prop_assert_eq!(opened, expected);
            prop_assert_eq!(&tried, &expected_tried);
            let Some(mut current) = opened else { return Ok(()) };

            for op in ops {
                match op {
                    Op::Remove => {
                        list.remove_current();
                        gone[current] = true;
                    }
                    Op::Step(direction) => {
                        let order = (1..=len).map(|n| match direction {
                            Next => (current + n) % len,
                            Previous => (current + len - n) % len,
                        });
                        let mut tried = vec![];
                        let opened = list.step(direction, loader(&mut tried));
                        let (expected, expected_tried) = model_open(&loadable, &mut gone, order);
                        prop_assert_eq!(opened, expected);
                        prop_assert_eq!(&tried, &expected_tried);
                        if let Some(i) = opened {
                            current = i;
                        }
                    }
                }
                let live = |gone: &[bool]| gone.iter().filter(|&&g| !g).count();
                prop_assert_eq!(list.position(), (live(&gone[..=current]), live(&gone)));
            }
        }

        #[test]
        fn shuffling_is_a_permutation_fixed_by_the_seed(mut items in vec(any::<u16>(), 0..30), seed: u64) {
            let mut reversed: Vec<u16> = items.iter().rev().copied().collect();
            let mut sorted = items.clone();
            sorted.sort_unstable();

            shuffle(&mut items, &mut fastrand::Rng::with_seed(seed));
            shuffle(&mut reversed, &mut fastrand::Rng::with_seed(seed));
            prop_assert_eq!(&items, &reversed);
            items.sort_unstable();
            prop_assert_eq!(items, sorted);
        }
    }
}
