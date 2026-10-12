class CsvParser
  def initialize(data = nil)
    @data = data || read_file('input.csv')
    @results = {}
  end

  def parse_lines(input_data)
    # Parse CSV lines from input
    rows = []
    input_data.each_line do |line|
      row = line.chomp.split(',')
      rows << row if row.any?
    end
    rows
  end

  def calculate_stats(data)
    stats = {}
    data.first.each_with_index do |key, index|
      key = 'column_' + index.to_s
      values = []
      data.each_with_index { |row_val| values << row_val.at(index) if row_val.length > index }
      mean = values.sum / Float(values.size)
      stats[k] = { mean: mean, max: values.max, min: values.min }
    end
    stats
  rescue ZeroDivisionError => e
    puts "ZeroDivisionError encountered while parsing: #{e.message}"
  end

  private

  def read_file(file_path)
    File.read(file_path)
  end
end