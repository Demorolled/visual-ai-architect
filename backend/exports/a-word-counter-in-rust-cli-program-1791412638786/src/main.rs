#[macro_use]
extern crate clap;

// mod word_counter;
use std::fs::File;
use std::io::{BufRead, BufReader};
use clap::{Command};

fn main() {
    let matches = Command::new("word-counter")
        .arg(Command::argument().long("file").required(true))
        .get_matches();
    
    match run(matches) {
        Ok(_) => println!("Done!"),
        Err(e) => eprintln!("{}", e),
    }
}

fn run(matches: clap::ArgMatches<'_>) -> Result<(), Box<dyn std::error::Error>> {
    let filename = matches.value_of("FILE").unwrap_or("-");
    
    let file = if filename == "-" { File::open("/dev/stdin") } else { File::open(filename) };
    
    let reader = BufReader::new(file?);
    
    for line in reader.lines() {
        let line_str = line?;
        println!("{}", word_counter::count_words(&line_str));
    }
    Ok(())
}