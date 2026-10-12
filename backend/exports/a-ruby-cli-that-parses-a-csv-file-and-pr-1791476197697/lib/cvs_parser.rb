require 'csv'
require 'fileutils'

module CsvParser
  def self.parse(file_path)
    begin
      stats = {}
      if File.exist?(file_path) && !File.directory?(file_path)
        CSV.foreach(file_path, headers: true, encoding: 'UTF-8') do |row|
          row.each { |key, value| (stats[key] ||= []) << value }
        end
        return stats unless stats.empty?
      else
        puts "ERROR: Unable to open '#{file_path}' for parsing."
      rescue StandardError => e
        puts "ERROR: Parsing failed for #{file_path} - #{e.message}"
      end
    end

    { success: false, error: 'Parse failed' }
  end
end