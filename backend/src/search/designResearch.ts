/**
 * Design Research Service
 * ========================
 *
 * Orchestrates three search sources to find reference designs and apps
 * similar to the user's request:
 *
 * 1. Web Search (via WebSearchService / Tavily or DuckDuckGo)
 * 2. GitHub Search (via GitHub API)
 * 3. OpenSourceAlternative.to (via custom scraper)
 *
 * The combined results are formatted as context for the LLM to use as
 * reference when generating the app architecture.
 */

import { getSearchService, WebSearchService } from './webSearch.js';
import {
  searchOpenSourceAlt,
  formatOpenSourceAltForContext,
  OpenSourceAltSearchResult,
} from './opensourceAltSearch.js';

// ─── Types ─────────────────────────────────────────────────────────────

export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string;
  stars: number;
  url: string;
  language: string | null;
  topics: string[];
  license: string | null;
}

export interface DesignResearchResult {
  /** Formatted text context for LLM consumption */
  context: string;
  /** Structured web search results */
  webResults: {
    title: string;
    url: string;
    content: string;
  }[];
  /** Structured GitHub results */
  githubResults: GitHubRepo[];
  /** Structured OpenSourceAlternative.to results */
  altResults: OpenSourceAltSearchResult;
  /** Count of total reference sources found */
  totalReferences: number;
}

// ─── GitHub Search ─────────────────────────────────────────────────────

/**
 * Search GitHub for repositories related to the user's app goal.
 * Uses the public GitHub search API (no auth required for basic search).
 */
async function searchGitHub(
  goal: string,
  maxResults: number = 5
): Promise<GitHubRepo[]> {
  try {
    // Search repo names and descriptions for the goal — simpler query without
    // restrictive language filters gives more comprehensive results
    const query = encodeURIComponent(`${goal} in:name,description`);
    const response = await fetch(
      `https://api.github.com/search/repositories?q=${query}&sort=stars&per_page=${maxResults}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VisualAIArchitect/1.0',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      console.warn(
        `[designResearch] GitHub API returned ${response.status}`
      );
      return [];
    }

    const data: any = await response.json();
    return (data.items || []).slice(0, maxResults).map((repo: any) => ({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description || '',
      stars: repo.stargazers_count,
      url: repo.html_url,
      language: repo.language || null,
      topics: repo.topics || [],
      license: repo.license?.spdx_id || null,
    }));
  } catch (err: any) {
    console.warn('[designResearch] GitHub search error:', err.message);
    return [];
  }
}

// ─── Format Helpers ────────────────────────────────────────────────────

/**
 * Format GitHub results as text for LLM context.
 */
function formatGitHubForContext(repos: GitHubRepo[]): string {
  if (repos.length === 0) return '';

  const lines: string[] = [
    `\n🐙 Similar Open-Source Projects on GitHub:`,
    `   Found ${repos.length} relevant repositories:\n`,
  ];

  for (const repo of repos) {
    lines.push(`   • ${repo.full_name}`);
    lines.push(`     Description: ${repo.description || 'N/A'}`);
    lines.push(`     ⭐ ${repo.stars.toLocaleString()} stars`);
    lines.push(`     URL: ${repo.url}`);
    if (repo.language) lines.push(`     Language: ${repo.language}`);
    if (repo.topics.length > 0)
      lines.push(`     Topics: ${repo.topics.slice(0, 5).join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format web search results as text for LLM context.
 */
function formatWebForContext(
  results: { title: string; url: string; content: string }[]
): string {
  if (results.length === 0) return '';

  const lines: string[] = [
    `\n🌐 Web Search Results for Similar Apps:`,
    `   Found ${results.length} relevant articles/pages:\n`,
  ];

  for (const result of results) {
    lines.push(`   • ${result.title}`);
    lines.push(`     URL: ${result.url}`);
    lines.push(
      `     Summary: ${result.content.substring(0, 400)}${result.content.length > 400 ? '...' : ''}`
    );
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Main Research Function ────────────────────────────────────────────

/**
 * Perform comprehensive design research for the user's app idea.
 * Searches the web, GitHub, and opensourcealternative.to in parallel,
 * then formats everything as a single context string for the LLM.
 *
 * @param goal - The user's app description / goal
 * @param searchService - Optional WebSearchService instance
 * @param maxResults - Max results per source
 * @returns Combined research result with context and structured data
 */
export async function researchDesign(
  goal: string,
  searchService?: WebSearchService,
  maxResults: number = 5
): Promise<DesignResearchResult> {
  const webResults: { title: string; url: string; content: string }[] = [];
  const searchSvc = searchService || getSearchService();

  // Run all three searches in parallel
  const [webSearchResult, githubRepos, altResult] = await Promise.all([
    // 1. Web search
    (async () => {
      try {
        const query = `best open source ${goal} app similar projects`;
        const response = await searchSvc.search({ query, maxResults: maxResults + 2 });
        return response.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        }));
      } catch (err: any) {
        console.warn('[designResearch] Web search error:', err.message);
        return [];
      }
    })(),

    // 2. GitHub search
    searchGitHub(goal, maxResults),

    // 3. OpenSourceAlternative.to search
    searchOpenSourceAlt(goal, maxResults),
  ]);

  // Build combined context string
  const parts: string[] = [
    `📋 DESIGN RESEARCH REPORT`,
    `=======================`,
    `Research performed for: "${goal}"`,
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatWebForContext(webSearchResult),
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatGitHubForContext(githubRepos),
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatOpenSourceAltForContext(altResult),
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ];

  const context = parts.filter((p) => p).join('\n');

  const totalReferences =
    webSearchResult.length + githubRepos.length + altResult.totalFound;

  return {
    context,
    webResults: webSearchResult,
    githubResults: githubRepos,
    altResults: altResult,
    totalReferences,
  };
}
