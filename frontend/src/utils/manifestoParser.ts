/**
 * Manifesto Parser & Serializer
 * ==============================
 *
 * Parses the Design Manifesto Markdown into structured section data
 * that can be rendered with interactive UI controls (toggle buttons,
 * text fields, etc.), and serializes back to Markdown for saving.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface ManifestoCheckbox {
  type: 'checkbox';
  checked: boolean;
  text: string;        // full display text (after checkbox marker)
  checkedText: string; // label when checked
  uncheckedText: string; // description when unchecked
}

export interface ManifestoTextField {
  type: 'textfield';
  label: string;       // the bold heading (e.g. "Your architectural principles:")
  content: string;
  placeholder: string;
}

export interface ManifestoListItem {
  type: 'list-item';
  number: number;
  text: string;
  label: string;
  description: string;
}

export interface ManifestoSubheading {
  type: 'subheading';
  text: string;
}

export interface ManifestoStatement {
  type: 'statement';
  content: string;
}

export interface ManifestoVision {
  type: 'vision';
  content: string;
}

export type ManifestoItem = ManifestoCheckbox | ManifestoTextField | ManifestoListItem | ManifestoSubheading | ManifestoStatement | ManifestoVision;

export interface ManifestoSection {
  id: string;
  title: string;
  emoji: string;
  items: ManifestoItem[];
}

export interface ManifestoData {
  sections: ManifestoSection[];
}

// ─── Parser ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractEmoji(title: string): string {
  const match = title.match(/^([\p{Emoji}]+)/u);
  return match ? match[1].trim() : '';
}

/**
 * Parse markdown manifesto content into structured ManifestoData.
 */
export function parseManifesto(markdown: string): ManifestoData {
  const sections: ManifestoSection[] = [];
  const lines = markdown.split('\n');
  let currentSection: ManifestoSection | null = null;
  let pendingTextLabel: string | null = null;
  let pendingTextLines: string[] = [];
  let pendingListNumber = 0;
  const listSectionLabels = ['Languages', 'Frameworks', 'Databases', 'Infrastructure'];

  function flushPendingText() {
    if (pendingTextLabel && pendingTextLines.length > 0) {
      const content = pendingTextLines.join('\n').trim();
      if (content && currentSection) {
        currentSection.items.push({
          type: 'textfield',
          label: pendingTextLabel,
          content,
          placeholder: `Write your ${pendingTextLabel.toLowerCase()} here...`,
        });
      }
    }
    pendingTextLabel = null;
    pendingTextLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Detect section headers: ## N. Title
    const sectionMatch = trimmed.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (sectionMatch) {
      flushPendingText();
      const title = sectionMatch[2].trim();
      currentSection = {
        id: slugify(title),
        title,
        emoji: extractEmoji(title),
        items: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) continue;

    // Skip separators, blockquotes, code fences, tables
    if (
      trimmed.startsWith('---') ||
      trimmed.startsWith('>') ||
      trimmed.startsWith('```') ||
      trimmed.startsWith('|')
    ) {
      flushPendingText();
      continue;
    }

    // Checkbox: - [x] or - [ ]
    const checkboxMatch = trimmed.match(/^-\s+\[([ x])\]\s*(.+)$/);
    if (checkboxMatch) {
      flushPendingText();
      const checked = checkboxMatch[1] === 'x';
      const text = checkboxMatch[2].trim();
      // Split into bold label and description
      const boldMatch = text.match(/^\*\*(.+?)\*\*(?:\s*[—–-]\s*(.+))?$/);
      const label = boldMatch ? boldMatch[1] : text;
      const description = boldMatch && boldMatch[2] ? boldMatch[2].trim() : '';
      currentSection.items.push({
        type: 'checkbox',
        checked,
        text,
        checkedText: label,
        uncheckedText: description || label,
      });
      continue;
    }

    // List items: 1. **Label** — Description
    const listMatch = trimmed.match(/^(\d+)\.\s+\*\*(.+?)\*\*(?:\s*[—–-]\s*(.+))?$/);
    if (listMatch) {
      flushPendingText();
      pendingListNumber = parseInt(listMatch[1]);
      currentSection.items.push({
        type: 'list-item',
        number: pendingListNumber,
        text: trimmed,
        label: listMatch[2].trim(),
        description: listMatch[3] ? listMatch[3].trim() : '',
      });
      continue;
    }

    // Bold label with colon: **Something:** content
    const boldLabelMatch = trimmed.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (boldLabelMatch) {
      flushPendingText();
      const label = boldLabelMatch[1].trim();
      const after = boldLabelMatch[2].trim();

      // Check if this is a section-level label with a sub-list
      const isListSection = listSectionLabels.some(ls => label.toLowerCase().includes(ls.toLowerCase()));

      if (isListSection && after) {
        // It's a sub-list section label with content on same line
        currentSection.items.push({
          type: 'statement',
          content: trimmed,
        });
      } else if (after) {
        // Single line text field
        currentSection.items.push({
          type: 'textfield',
          label: `${label}:`,
          content: after,
          placeholder: `Write your ${label.toLowerCase()} here...`,
        });
      } else {
        // Multi-line text field starting
        pendingTextLabel = `${label}:`;
        pendingTextLines = [];
      }
      continue;
    }

    // Naming conventions sub-list (lines with `camelCase`)
    const namingMatch = trimmed.match(/^-\s+(.+?):\s+(.+)$/);
    if (namingMatch) {
      currentSection.items.push({
        type: 'statement',
        content: trimmed,
      });
      continue;
    }

    // Checkbox sub-headings like "**Naming conventions:**" inside a section
    const subBoldMatch = trimmed.match(/^\*\*(.+?)\*\*$/);
    if (subBoldMatch) {
      flushPendingText();
      currentSection.items.push({
        type: 'subheading',
        text: subBoldMatch[1],
      });
      continue;
    }

    // Accumulate text lines if we have a pending text label
    if (pendingTextLabel) {
      if (trimmed) {
        pendingTextLines.push(trimmed);
      }
      continue;
    }

    // Blank lines and remaining text — skip non-content lines
    if (trimmed) {
      currentSection.items.push({
        type: 'statement',
        content: trimmed,
      });
    }
  }

  flushPendingText();

  // Post-process: detect vision in the last section
  for (const section of sections) {
    if (section.id === 'your-vision-statement') {
      // Collect all statement items as vision content
      const visionParts: string[] = [];
      const nonVision: ManifestoItem[] = [];
      for (const item of section.items) {
        if (item.type === 'statement' || item.type === 'textfield') {
          visionParts.push((item as any).content || (item as any).content || '');
        } else {
          nonVision.push(item);
        }
      }
      if (visionParts.length > 0) {
        section.items = [
          ...nonVision,
          { type: 'vision', content: visionParts.join('\n').trim() },
        ];
      }
    }
  }

  return { sections };
}

// ─── Serializer ────────────────────────────────────────────────────────────

/**
 * Serialize ManifestoData back into markdown for saving.
 */
export function serializeManifesto(data: ManifestoData): string {
  const parts: string[] = [];

  parts.push('# 🎨 Veronica — Design Manifesto');
  parts.push('');
  parts.push('> **Edit this file to teach the app YOUR vision. Every architecture plan and code generation will use this as context.**');
  parts.push('');
  parts.push('---');
  parts.push('');

  let sectionNum = 0;
  for (const section of data.sections) {
    sectionNum++;
    parts.push(`## ${sectionNum}. ${section.title}`);
    parts.push('');

    for (const item of section.items) {
      switch (item.type) {
        case 'checkbox':
          parts.push(`- [${item.checked ? 'x' : ' '}] ${item.text}`);
          break;

        case 'textfield': {
          // Split label back: "Your architectural principles:" without the colon in bold
          const labelClean = item.label.endsWith(':') ? item.label.slice(0, -1) : item.label;
          parts.push(`**${labelClean}:**`);
          parts.push('');
          if (item.content) {
            // If multi-paragraph, add blank lines between
            const paragraphs = item.content.split('\n').filter(p => p.trim());
            for (const para of paragraphs) {
              parts.push(para);
              parts.push('');
            }
          }
          parts.push('');
          break;
        }

        case 'list-item':
          parts.push(`${item.number}. **${item.label}**${item.description ? ` — ${item.description}` : ''}`);
          break;

        case 'subheading':
          parts.push(`**${item.text}**`);
          parts.push('');
          break;

        case 'statement':
          parts.push(item.content);
          parts.push('');
          break;

        case 'vision': {
          if (item.content) {
            parts.push(`> *${item.content}*`);
            parts.push('');
          }
          break;
        }
      }
    }

    if (sectionNum < data.sections.length) {
      parts.push('---');
      parts.push('');
    }
  }

  return parts.join('\n');
}

// ─── Utility: Get section emoji color ─────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  'architectural-philosophy': '#4ade80',
  'code-style-conventions': '#60a5fa',
  'preferred-technologies': '#a78bfa',
  'design-principles': '#fbbf24',
  'quality-standards': '#f472b6',
  'anti-patterns-pet-peeves': '#f87171',
  'project-structure-preferences': '#00d9ff',
  'communication-preferences': '#34d399',
  'your-vision-statement': '#f59e0b',
};

export function getSectionColor(id: string): string {
  return SECTION_COLORS[id] || '#666';
}

const SECTION_HEADER_TEMPLATES: Record<string, { emoji: string; title: string; subtitle: string }> = {
  'architectural-philosophy': {
    emoji: '🏗️',
    title: 'Architectural Philosophy',
    subtitle: 'How you think about software architecture — monolith vs microservices, layering, and node granularity',
  },
  'code-style-conventions': {
    emoji: '✍️',
    title: 'Code Style & Conventions',
    subtitle: 'Functional vs OOP, naming, type annotations, error handling preferences',
  },
  'preferred-technologies': {
    emoji: '🛠️',
    title: 'Preferred Technologies',
    subtitle: 'Languages, frameworks, databases, and infrastructure you prefer',
  },
  'design-principles': {
    emoji: '⚖️',
    title: 'Design Principles',
    subtitle: 'YAGNI, DRY, KISS, SOLID — the rules you live by',
  },
  'quality-standards': {
    emoji: '🌟',
    title: 'Quality Standards',
    subtitle: 'Your quality bar — types, tests, error handling, security',
  },
  'anti-patterns-pet-peeves': {
    emoji: '🚫',
    title: 'Anti-Patterns & Pet Peeves',
    subtitle: 'Things you NEVER want the AI to generate',
  },
  'project-structure-preferences': {
    emoji: '📁',
    title: 'Project Structure Preferences',
    subtitle: 'Feature-based vs type-based, flat vs nested organization',
  },
  'communication-preferences': {
    emoji: '📝',
    title: 'Communication Preferences',
    subtitle: 'How you want the AI to communicate with you',
  },
  'your-vision-statement': {
    emoji: '🎯',
    title: 'Your Vision Statement',
    subtitle: 'Your overarching vision for the software you build',
  },
};

export function getSectionTemplate(id: string) {
  return SECTION_HEADER_TEMPLATES[id] || { emoji: '📋', title: id, subtitle: '' };
}
