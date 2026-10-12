using System;
using System.Collections.Generic;

// C# exemplar: System namespaces only, no NuGet, entry point is
// static void Main(string[] args) on class Program.
class Program
{
    static void Main(string[] args)
    {
        string text = Console.In.ReadToEnd();
        char[] separators = new[] { ' ', '\t', '\r', '\n' };
        string[] words = text.Split(separators, StringSplitOptions.RemoveEmptyEntries);
        var distinct = new HashSet<string>(words);

        Console.WriteLine($"words={words.Length} distinct={distinct.Count}");
    }
}
