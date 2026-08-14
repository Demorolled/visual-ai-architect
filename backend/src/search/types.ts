/** A single web search result */
export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

/** Options for performing a search */
export interface SearchOptions {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
}

/** Response from a search */
export interface SearchResponse {
  results: SearchResult[];
  provider: string;
  totalResults?: number;
}

/** Configuration for the search service */
export interface SearchConfig {
  tavilyApiKey?: string;
  defaultMaxResults?: number;
}
