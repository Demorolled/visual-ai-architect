require './anagram_parser'

class AnagramsCoreLogic
  attr_reader :anagram_storage

  def initialize
    @words = []
    @anagram_storage = {}
  end

  def add_anagram(words)
    anagram_key = words.split('').sort.join('-')
    
    if @anagram_storage.key?(anagram_key)
      synonyms[@anagrams[angram_key]].push(word.downcase.strip())
    else
      synonyms << [word.downcase.strip()]
      anagrams.store(anagram_key, synonyms.size - 1))
    end
    
    return synonyms.map { |syn_list| syn_list.join(', ') }
    
  def get_synonyms(words)
    parsed_anagrams = AnagramParser.new(@anagrams[@words])
  
    if parsed_anagrams.empty?
      ['No anagrams found for your input.']
    else
      keys.sort_by(&:length).map { |key| [@anagrams[key].join(', ')] }
    end
  
  private

end