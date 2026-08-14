/**
 * UIVerse Scraper — Parse all 3,800+ UIVerse components into structured UI patterns.
 *
 * This script scans data/galaxy/ (the cloned uiverse-io/galaxy repo), analyzes
 * each HTML component to detect its type, colors, structure, and style tags,
 * then caches everything into data/ui-patterns/patterns.json for the gui_builder
 * tool to reference.
 *
 * Run: npx tsx scripts/scrape-uiverse-patterns.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const GALAXY_DIR = path.join(PROJECT_ROOT, 'data', 'galaxy');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'ui-patterns');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'patterns.json');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UiPattern {
  id: string;
  type: string;           // button, card, input, checkbox, toggle, radio, form, loader, notification, tooltip, pattern
  category: string;       // action, display, input, toggle, feedback, decorative
  subType?: string;       // e.g. "primary-button", "text-input", "pill-button"
  source: string;         // UIVerse author/source identifier
  colors: {
    primary?: string;
    background?: string;
    text?: string;
    accent?: string;
    border?: string;
  };
  htmlSnippet: string;    // First 1000 chars of the component's HTML/CSS
  hasAnimation: boolean;
  hasIcon: boolean;
  styleTags: string[];    // Design style descriptors
  tags: string[];         // Searchable keywords
}

export interface UiPatternCollection {
  totalPatterns: number;
  patternsByType: Record<string, UiPattern[]>;
  allPatterns: UiPattern[];
  generatedAt: string;
}

// ─── Type / Category Mappings ───────────────────────────────────────────────

const FOLDER_TYPE_MAP: Record<string, { type: string; category: string }> = {
  'Buttons': { type: 'button', category: 'action' },
  'Cards': { type: 'card', category: 'display' },
  'Inputs': { type: 'input', category: 'input' },
  'Checkboxes': { type: 'checkbox', category: 'toggle' },
  'Toggle-switches': { type: 'toggle', category: 'toggle' },
  'Radio-buttons': { type: 'radio', category: 'toggle' },
  'Forms': { type: 'form', category: 'input' },
  'loaders': { type: 'loader', category: 'feedback' },
  'Notifications': { type: 'notification', category: 'feedback' },
  'Tooltips': { type: 'tooltip', category: 'feedback' },
  'Patterns': { type: 'pattern', category: 'decorative' },
};

// ─── Color / Style Detection ────────────────────────────────────────────────

// Common CSS color hex patterns
const COLOR_REGEX = /#[0-9a-fA-F]{3,8}/g;

// Style indicator keywords in HTML/CSS
const STYLE_INDICATORS: Array<{ keyword: string; tag: string }> = [
  { keyword: 'border-radius: 50', tag: 'pill-shaped' },
  { keyword: 'border-radius: 999', tag: 'pill-shaped' },
  { keyword: 'box-shadow', tag: 'shadow' },
  { keyword: 'gradient', tag: 'gradient' },
  { keyword: 'linear-gradient', tag: 'gradient' },
  { keyword: 'neon', tag: 'neon' },
  { keyword: 'glow', tag: 'glow' },
  { keyword: 'glass', tag: 'glassmorphism' },
  { keyword: 'backdrop-filter: blur', tag: 'glassmorphism' },
  { keyword: 'blur(', tag: 'glassmorphism' },
  { keyword: 'outline', tag: 'outlined' },
  { keyword: 'transform: rotate', tag: 'animated' },
  { keyword: 'transform: scale', tag: 'animated' },
  { keyword: 'transition:', tag: 'animated' },
  { keyword: '@keyframes', tag: 'keyframe-animated' },
  { keyword: 'animation:', tag: 'animated' },
  { keyword: 'minimal', tag: 'minimal' },
  { keyword: 'material', tag: 'material-design' },
  { keyword: 'tailwind', tag: 'tailwind' },
  { keyword: 'flex', tag: 'flexbox' },
  { keyword: 'grid', tag: 'grid' },
  { keyword: 'dark ', tag: 'dark-theme' },
  { keyword: '#1a', tag: 'dark-theme' },
  { keyword: '#2d', tag: 'dark-theme' },
];

// Sub-type detection rules
const SUBTYPE_RULES: Array<{ keyword: string; type: string; subType: string }> = [
  { keyword: 'primary', type: 'button', subType: 'primary-button' },
  { keyword: 'secondary', type: 'button', subType: 'secondary-button' },
  { keyword: 'outline', type: 'button', subType: 'outline-button' },
  { keyword: 'ghost', type: 'button', subType: 'ghost-button' },
  { keyword: 'icon', type: 'button', subType: 'icon-button' },
  { keyword: 'circle', type: 'button', subType: 'circle-button' },
  { keyword: 'pill', type: 'button', subType: 'pill-button' },
  { keyword: 'gradient', type: 'button', subType: 'gradient-button' },
  { keyword: 'profile', type: 'card', subType: 'profile-card' },
  { keyword: 'pricing', type: 'card', subType: 'pricing-card' },
  { keyword: 'product', type: 'card', subType: 'product-card' },
  { keyword: 'stat', type: 'card', subType: 'stat-card' },
];

// ─── Main Scraper ───────────────────────────────────────────────────────────

function extractColors(html: string): UiPattern['colors'] {
  const colors: UiPattern['colors'] = {};
  const hexMatches = html.match(COLOR_REGEX) || [];
  const uniqueHexes = [...new Set(hexMatches)].slice(0, 8);

  // Heuristic: first non-black/white color is "primary"
  for (const hex of uniqueHexes) {
    const lower = hex.toLowerCase();
    if (lower === '#fff' || lower === '#ffffff' || lower === '#000' || lower === '#000000' || lower === '#f0f0f0' || lower === '#e0e0e0') continue;
    if (!colors.primary) {
      colors.primary = hex;
    } else if (!colors.background && hex.length >= 6) {
      colors.background = hex;
    } else if (!colors.accent) {
      colors.accent = hex;
    }
  }

  return colors;
}

function detectStyles(html: string): string[] {
  const tags = new Set<string>();
  const lower = html.toLowerCase();

  for (const indicator of STYLE_INDICATORS) {
    if (lower.includes(indicator.keyword)) {
      tags.add(indicator.tag);
    }
  }

  return [...tags];
}

function detectSubType(type: string, html: string): string | undefined {
  const lower = html.toLowerCase();
  for (const rule of SUBTYPE_RULES) {
    if (rule.type === type && lower.includes(rule.keyword)) {
      return rule.subType;
    }
  }
  return undefined;
}

function extractTags(type: string, html: string, styleTags: string[], fileName: string): string[] {
  const tags = new Set<string>();
  tags.add(type);
  styleTags.forEach(t => tags.add(t));

  // Add keywords from the file name
  const nameParts = fileName.replace('.html', '').split(/[-_]+/);
  nameParts.forEach(p => {
    if (p.length > 3 && !['html'].includes(p)) {
      tags.add(p.toLowerCase());
    }
  });

  // Detect interaction keywords
  const lower = html.toLowerCase();
  if (lower.includes('hover')) tags.add('hover-effect');
  if (lower.includes('click')) tags.add('click-effect');
  if (lower.includes('focus')) tags.add('focus-state');
  if (lower.includes('active')) tags.add('active-state');
  if (lower.includes('disabled')) tags.add('disabled-state');
  if (lower.includes('svg')) tags.add('svg');
  if (lower.includes('<path')) tags.add('svg-icon');
  if (lower.includes('<i class')) tags.add('icon-font');

  // Detect responsive
  if (lower.includes('@media')) tags.add('responsive');

  return [...tags];
}

function extractAuthor(html: string): string {
  // Extract from UIVerse comment header
  const commentMatch = html.match(/<!--\s*.*Uiverse\.?io\s*.*-->\s*\n?<!--\s*.*by\s+([^\s<]+)/i);
  if (commentMatch) return commentMatch[1].trim();

  const linkMatch = html.match(/href="https:\/\/uiverse\.io\/([^"\s/]+)/i);
  if (linkMatch) return linkMatch[1];

  return 'community';
}

function hasAnimation(html: string): boolean {
  return html.includes('@keyframes') ||
         html.includes('animation:') ||
         html.includes('transition: all') ||
         html.includes('hover');
}

function hasIcon(html: string): boolean {
  return html.includes('<svg') ||
         html.includes('<i class="') ||
         html.includes('<img') ||
         html.includes('<path');
}

function scrapeFolder(folderName: string): UiPattern[] {
  const folderPath = path.join(GALAXY_DIR, folderName);
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return [];

  const typeDef = FOLDER_TYPE_MAP[folderName];
  if (!typeDef) return [];

  const files = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.html'))
    .sort(() => Math.random() - 0.5); // shuffle to get variety

  const patterns: UiPattern[] = [];

  for (const file of files) {
    try {
      const filePath = path.join(folderPath, file);
      const html = fs.readFileSync(filePath, 'utf-8');
      if (html.length < 50) continue; // Skip tiny files

      const colors = extractColors(html);
      const styleTags = detectStyles(html);
      const tags = extractTags(typeDef.type, html, styleTags, file);
      const subType = detectSubType(typeDef.type, html);
      const author = extractAuthor(html);
      const anim = hasAnimation(html);
      const icon = hasIcon(html);

      // Store a truncated HTML snippet (first 1200 chars max)
      const htmlSnippet = html.slice(0, 1200).trim();

      patterns.push({
        id: `${typeDef.type}_${file.replace('.html', '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`,
        type: typeDef.type,
        category: typeDef.category,
        subType,
        source: author,
        colors,
        htmlSnippet,
        hasAnimation: anim,
        hasIcon: icon,
        styleTags,
        tags,
      });
    } catch (err) {
      // Skip files that can't be read
    }
  }

  return patterns;
}

function scrapeAll(): UiPatternCollection {
  const folders = Object.keys(FOLDER_TYPE_MAP);
  const patternsByType: Record<string, UiPattern[]> = {};
  const allPatterns: UiPattern[] = [];

  for (const folder of folders) {
    console.log(`  [${folder}] Scraping...`);
    const patterns = scrapeFolder(folder);
    const type = FOLDER_TYPE_MAP[folder].type;

    if (!patternsByType[type]) patternsByType[type] = [];
    patternsByType[type].push(...patterns);
    allPatterns.push(...patterns);

    console.log(`    → ${patterns.length} ${type} patterns found`);
  }

  return {
    totalPatterns: allPatterns.length,
    patternsByType,
    allPatterns,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Entry Point ────────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  UIVerse UI Pattern Scraper                 ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log();

  if (!fs.existsSync(GALAXY_DIR)) {
    console.error(`❌ Galaxy directory not found at: ${GALAXY_DIR}`);
    console.error('   Run: git clone https://github.com/uiverse-io/galaxy.git data/galaxy');
    process.exit(1);
  }

  console.log(`📁 Scanning: ${GALAXY_DIR}`);
  console.log();

  const result = scrapeAll();

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write the output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');

  console.log();
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Scrape Complete                            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Total patterns scraped: ${result.totalPatterns}`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`  Size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)} MB`);
  console.log();

  // Print breakdown
  console.log('  Breakdown by type:');
  for (const [type, patterns] of Object.entries(result.patternsByType)) {
    console.log(`    ${type.padEnd(15)} ${patterns.length}`);
  }
}

main();
