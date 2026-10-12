# frozen_string_literal: true

# Ruby exemplar: standard library only, no gems, entry guarded by __FILE__ == $0.
def summarize(text)
  words = text.split
  { count: words.size, distinct: words.uniq.size }
end

def main
  result = summarize($stdin.read)
  puts "words=#{result[:count]} distinct=#{result[:distinct]}"
end

main if __FILE__ == $0
