/*
 * Command-Line Tool: Swift Word Reverser v0.1
 *
 * The Swift word reverser helps you reverse the order of words in a string quickly and easily.
 *
 *              COMMANDS:
 *                 usage                   Displays this information screen (default).
 *                 <string>                Reverse the words in a specific string.
 *                 version                 Show the current tool version (e.g., \(Config.version)).
 */

import Foundation

// MARK: Configuration
private struct Config {
    static let version = "0.1"
}

// MARK: Global State (none)

// MARK: Types and Functions

/// Reverse the words in a given string.
///
/// Input: String with spaces separating words.
/// Output: String with word ord...