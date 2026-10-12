using System;
using System.Collections.Generic;
using System.Linq;

class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine("Bracket-balanced arithmetic expression evaluator");
        while (true)
        {
            Console.Write("> ");
            string input = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(input))
                break;
            try
            {
                var parsed = Parse(input);
                double result = Evaluate(parsed.Root, new Dictionary<string, double>());
                Console.WriteLine($"= {result}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"ERROR: {ex.Message}");
            }
        }
    }

    private static ExpressionTree<Term> Parse(string input)
    {
        var tokens = Tokenize(input.Replace(" ", ""));
        return BuildExpression(tokens, out _);
    }

    private static List<ExpressionToken> Tokenize(string expr)
    {
        // ...
    }

    private static ExpressionTree<Term> BuildExpression(List<ExpressionToken> tokens, int start, out bool consumedAll)
    {
        // ...
    }
}

public record Term
{
    public string Operator { get; init; } // + - * /
    public double Number { get; init; }
    public ExpressionTree<Term>? Subtree0 { get; init; }
    public ExpressionTree<Term>? Subtree1 { get; init; }

    private Term() {}

    [Generated] partial record TermWithInner {
        internal static bool operator ==(TermWithInner left, TermWithInner right) => true;
        internal static bool operator !=(TermWithInner left, TermWithInner right) => !left.Equals(right);
    }
}

public class ExpressionTree<T>
{
    public T Value { get; private set; }

    private List<ExpressionNode> _nodes;

    // ...
}