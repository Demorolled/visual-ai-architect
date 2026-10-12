use std::collections::HashMap;

fn read_file(path: &str) -> Result<String, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    Ok(content)
}

fn count_words(text: &str) -> HashMap<&'_ str, u32> {
    let mut counts = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    counts
}

fn top_words<'a>(counts: &'a HashMap<&'a str, u32>, n: usize) -> Vec<(&'a str, u32)> {
    let mut sorted_counts: Vec<_> = counts.iter().collect();
    sorted_counts.sort_by_key(|(_, &v)| std::cmp::Reverse(v));
    sorted_counts.into_iter().take(n).map(|(&k, &v)| (k, v)).collect()
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let text = read_file("input.txt")?;
    let counts = count_words(&text);
    let top_words = top_words(&counts, 10);
    for (word, count) in top_words {
        println!("{}: {}", word, count);
    }
    Ok(())
}

fn main() {
    if let Err(err) = run() {
        eprintln!("ERROR: {:?}", err);
        std::process::exit(1)
    }
}