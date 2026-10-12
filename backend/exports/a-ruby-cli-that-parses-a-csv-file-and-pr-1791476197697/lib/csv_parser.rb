class CsvParser  
  def initialize(input: nil)    
    @input = input    
  end  
  
  def header_row?      
    return false if lines.nil?
    return true if valid_header_size?
  end  
  
private
   
  def csv_rows=(data)
    file_rows = File.readlines(data, 'r') rescue []
    file_rows&.map { |row| row.split(',').map(&:strip) }
  end
    
end