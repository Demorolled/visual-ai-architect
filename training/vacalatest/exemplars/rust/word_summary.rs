use std::collections::HashSet;
use std::io::{self, Read};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;

    let words: Vec<&str> = input.split_whitespace().collect();
    let distinct: HashSet<&str> = words.iter().copied().collect();

    println!("words={} distinct={}", words.len(), distinct.len());
    Ok(())
}
