# Argument Parser

require 'optparse'

module AnagramArgumentParser
 
def parse_arguments(args)
  options = {}
  opts = OptionParser.new do |opts|
    opts.banner = "Usage: ruby anagrams.rb your_sentence"
  
    opts.on('-w', '--word WORD', 'The word to check for synonyms.') do |v|
      options[:word] = v
    end
    
    opt.parse!(args)
    
    options.each do |k,v| puts "#{k}: #{v}" end
  end
  
return options
end

parse_arguments(ARGV) # Call parse_arguments with the ARGV argument list.
  
end