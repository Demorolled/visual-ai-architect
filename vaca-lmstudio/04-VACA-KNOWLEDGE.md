# VACA - Knowledge Base (JSON)

This file bundles documents from the VACA project (~/Desktop/visual-ai-architect).

---



## ===== FILE: knowledge/patterns.json =====

[
  {
    "category": "architecture",
    "lastUsed": "2026-08-17T18:13:23.597Z",
    "title": "a todo cli app - Full architecture",
    "code": "export interface Task {\n  id: string;\n  title: string;\n  done: boolean;\n}\n\nexport class TaskStore {\n  private tasks: Task[] = [];\n  add(task: Task): void {\n    this.tasks.push(task);\n  }\n  list(): Task[] {\n    return [...this.tasks];\n  }\n}\n",
    "description": "Complete project architecture for a todo cli app with 1 nodes targeting linux",
    "tags": [
      "architecture",
      "linux",
      "logic"
    ],
    "projectId": "write_1786990403595",
    "targetOS": "linux",
    "nodeType": "master",
    "language": "mixed",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1786990403597_7zf6h6",
    "usageCount": 0,
    "createdAt": "2026-08-17T18:13:23.597Z"
  },
  {
    "category": "architecture",
    "lastUsed": "2026-08-17T18:13:23.601Z",
    "title": "a helper app - Full architecture",
    "code": "export interface Task {\n  id: string;\n  title: string;\n  done: boolean;\n}\n\nexport class TaskStore {\n  private tasks: Task[] = [];\n  add(task: Task): void {\n    this.tasks.push(task);\n  }\n  list(): Task[] {\n    return [...this.tasks];\n  }\n}\n",
    "description": "Complete project architecture for a helper app with 1 nodes targeting linux",
    "tags": [
      "architecture",
      "linux",
      "logic"
    ],
    "projectId": "write_1786990403601",
    "targetOS": "linux",
    "nodeType": "master",
    "language": "mixed",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1786990403601_san7vg",
    "usageCount": 0,
    "createdAt": "2026-08-17T18:13:23.601Z"
  },
  {
    "category": "architecture",
    "lastUsed": "2026-08-17T18:13:23.604Z",
    "title": "Test Project - Full architecture",
    "code": "export interface Task {\n  id: string;\n  title: string;\n  done: boolean;\n}\n\nexport class TaskStore {\n  private tasks: Task[] = [];\n  add(task: Task): void {\n    this.tasks.push(task);\n  }\n  list(): Task[] {\n    return [...this.tasks];\n  }\n}\n",
    "description": "Complete project architecture for Test Project with 1 nodes targeting linux",
    "tags": [
      "architecture",
      "linux",
      "logic"
    ],
    "projectId": "proj_test",
    "targetOS": "linux",
    "nodeType": "master",
    "language": "mixed",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1786990403604_mdkhkb",
    "usageCount": 0,
    "createdAt": "2026-08-17T18:13:23.604Z"
  },
  {
    "category": "architecture",
    "lastUsed": "2026-08-17T18:13:23.605Z",
    "title": "Test Project - Full architecture",
    "code": "export interface Task {\n  id: string;\n  title: string;\n  done: boolean;\n}\n\nexport class TaskStore {\n  private tasks: Task[] = [];\n  add(task: Task): void {\n    this.tasks.push(task);\n  }\n  list(): Task[] {\n    return [...this.tasks];\n  }\n}\n",
    "description": "Complete project architecture for Test Project with 1 nodes targeting linux",
    "tags": [
      "architecture",
      "linux",
      "logic"
    ],
    "projectId": "proj_test",
    "targetOS": "linux",
    "nodeType": "master",
    "language": "mixed",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1786990403605_40n2zf",
    "usageCount": 0,
    "createdAt": "2026-08-17T18:13:23.605Z"
  },
  {
    "category": "architecture",
    "lastUsed": "2026-08-17T18:13:23.606Z",
    "title": "Test Project - Full architecture",
    "code": "export interface Task {\n  id: string;\n  title: string;\n  done: boolean;\n}\n\nexport class TaskStore {\n  private tasks: Task[] = [];\n  add(task: Task): void {\n    this.tasks.push(task);\n  }\n  list(): Task[] {\n    return [...this.tasks];\n  }\n}\n",
    "description": "Complete project architecture for Test Project with 1 nodes targeting linux",
    "tags": [
      "architecture",
      "linux",
      "logic"
    ],
    "projectId": "proj_test",
    "targetOS": "linux",
    "nodeType": "master",
    "language": "mixed",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1786990403606_d29w98",
    "usageCount": 0,
    "createdAt": "2026-08-17T18:13:23.606Z"
  },
  {
    "category": "code_pattern",
    "title": "code_review_mini — development tool",
    "code": "// Tool: code_review_mini\n// Category: development\n// Risk: low\n// Review source code for bugs, security issues, performance problems, and style improvements using AI",
    "description": "Review source code for bugs, security issues, performance problems, and style improvements using AI",
    "tags": [
      "code_review_mini",
      "development",
      "low",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060139_bggp5w",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.139Z",
    "lastUsed": "2026-08-20T00:17:40.139Z"
  },
  {
    "category": "code_pattern",
    "title": "doc_writer_mini — development tool",
    "code": "// Tool: doc_writer_mini\n// Category: development\n// Risk: low\n// Generate documentation (JSDoc, comments, markdown, or README) from source code using AI",
    "description": "Generate documentation (JSDoc, comments, markdown, or README) from source code using AI",
    "tags": [
      "doc_writer_mini",
      "development",
      "low",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060140_yavfbq",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.140Z",
    "lastUsed": "2026-08-20T00:17:40.140Z"
  },
  {
    "category": "code_pattern",
    "title": "test_writer_mini — testing tool",
    "code": "// Tool: test_writer_mini\n// Category: testing\n// Risk: low\n// Generate unit tests for source code using AI (Vitest, Jest, pytest, etc.)",
    "description": "Generate unit tests for source code using AI (Vitest, Jest, pytest, etc.)",
    "tags": [
      "test_writer_mini",
      "testing",
      "low",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060142_pkrvc8",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.142Z",
    "lastUsed": "2026-08-20T00:17:40.142Z"
  },
  {
    "category": "code_pattern",
    "title": "refactor_mini — development tool",
    "code": "// Tool: refactor_mini\n// Category: development\n// Risk: medium\n// Analyze and suggest refactoring improvements for code using AI",
    "description": "Analyze and suggest refactoring improvements for code using AI",
    "tags": [
      "refactor_mini",
      "development",
      "medium",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060142_89ogto",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.142Z",
    "lastUsed": "2026-08-20T00:17:40.142Z"
  },
  {
    "category": "code_pattern",
    "title": "explain_code_mini — development tool",
    "code": "// Tool: explain_code_mini\n// Category: development\n// Risk: low\n// Explain source code in plain language using AI at different detail levels",
    "description": "Explain source code in plain language using AI at different detail levels",
    "tags": [
      "explain_code_mini",
      "development",
      "low",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060142_a3rgh9",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.142Z",
    "lastUsed": "2026-08-20T00:17:40.142Z"
  },
  {
    "category": "code_pattern",
    "title": "json_query — data tool",
    "code": "// Tool: json_query\n// Category: data\n// Risk: readonly\n// Query and extract values from JSON using dot-notation path (e.g., \"users.0.name\")",
    "description": "Query and extract values from JSON using dot-notation path (e.g., \"users.0.name\")",
    "tags": [
      "json_query",
      "data",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060143_9u7bzs",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.143Z",
    "lastUsed": "2026-08-20T00:17:40.143Z"
  },
  {
    "category": "code_pattern",
    "title": "csv_parse — data tool",
    "code": "// Tool: csv_parse\n// Category: data\n// Risk: readonly\n// Parse CSV text into structured JSON array of objects",
    "description": "Parse CSV text into structured JSON array of objects",
    "tags": [
      "csv_parse",
      "data",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060143_apaend",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.143Z",
    "lastUsed": "2026-08-20T00:17:40.143Z"
  },
  {
    "category": "code_pattern",
    "title": "json_to_csv — data tool",
    "code": "// Tool: json_to_csv\n// Category: data\n// Risk: readonly\n// Convert a JSON array of objects to CSV format",
    "description": "Convert a JSON array of objects to CSV format",
    "tags": [
      "json_to_csv",
      "data",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060143_sp7f0r",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.143Z",
    "lastUsed": "2026-08-20T00:17:40.143Z"
  },
  {
    "category": "code_pattern",
    "title": "data_validate — data tool",
    "code": "// Tool: data_validate\n// Category: data\n// Risk: readonly\n// Validate data against a simple JSON schema (check required fields, types, and patterns)",
    "description": "Validate data against a simple JSON schema (check required fields, types, and patterns)",
    "tags": [
      "data_validate",
      "data",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060144_9xzhu0",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.144Z",
    "lastUsed": "2026-08-20T00:17:40.144Z"
  },
  {
    "category": "code_pattern",
    "title": "http_request — network tool",
    "code": "// Tool: http_request\n// Category: network\n// Risk: medium\n// Make HTTP requests to test and interact with API endpoints",
    "description": "Make HTTP requests to test and interact with API endpoints",
    "tags": [
      "http_request",
      "network",
      "medium",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060144_vdsyxn",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.144Z",
    "lastUsed": "2026-08-20T00:17:40.144Z"
  },
  {
    "category": "code_pattern",
    "title": "url_analyze — network tool",
    "code": "// Tool: url_analyze\n// Category: network\n// Risk: readonly\n// Parse, analyze, and validate a URL into its components",
    "description": "Parse, analyze, and validate a URL into its components",
    "tags": [
      "url_analyze",
      "network",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060144_lgop9a",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.144Z",
    "lastUsed": "2026-08-20T00:17:40.144Z"
  },
  {
    "category": "code_pattern",
    "title": "git_status — development tool",
    "code": "// Tool: git_status\n// Category: development\n// Risk: readonly\n// Get the current git repository status (branch, changed files, staged/unstaged)",
    "description": "Get the current git repository status (branch, changed files, staged/unstaged)",
    "tags": [
      "git_status",
      "development",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060145_d0l0rh",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.145Z",
    "lastUsed": "2026-08-20T00:17:40.145Z"
  },
  {
    "category": "code_pattern",
    "title": "git_log — development tool",
    "code": "// Tool: git_log\n// Category: development\n// Risk: readonly\n// Get recent git commit history with hashes, authors, dates, and messages",
    "description": "Get recent git commit history with hashes, authors, dates, and messages",
    "tags": [
      "git_log",
      "development",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060145_w6v05z",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.145Z",
    "lastUsed": "2026-08-20T00:17:40.145Z"
  },
  {
    "category": "code_pattern",
    "title": "uuid_gen — utility tool",
    "code": "// Tool: uuid_gen\n// Category: utility\n// Risk: readonly\n// Generate one or more UUID v4 identifiers",
    "description": "Generate one or more UUID v4 identifiers",
    "tags": [
      "uuid_gen",
      "utility",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060145_blcdmj",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.145Z",
    "lastUsed": "2026-08-20T00:17:40.145Z"
  },
  {
    "category": "code_pattern",
    "title": "hash_text — utility tool",
    "code": "// Tool: hash_text\n// Category: utility\n// Risk: readonly\n// Generate cryptographic hash (MD5, SHA1, SHA256) of text input",
    "description": "Generate cryptographic hash (MD5, SHA1, SHA256) of text input",
    "tags": [
      "hash_text",
      "utility",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060145_ou1jnh",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.145Z",
    "lastUsed": "2026-08-20T00:17:40.145Z"
  },
  {
    "category": "code_pattern",
    "title": "system_info — monitoring tool",
    "code": "// Tool: system_info\n// Category: monitoring\n// Risk: readonly\n// Get system information (OS, CPU cores, memory usage, uptime)",
    "description": "Get system information (OS, CPU cores, memory usage, uptime)",
    "tags": [
      "system_info",
      "monitoring",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060146_1tu7fc",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.146Z",
    "lastUsed": "2026-08-20T00:17:40.146Z"
  },
  {
    "category": "code_pattern",
    "title": "network_info — monitoring tool",
    "code": "// Tool: network_info\n// Category: monitoring\n// Risk: readonly\n// Get network interface information (interfaces, IP addresses, MACs)",
    "description": "Get network interface information (interfaces, IP addresses, MACs)",
    "tags": [
      "network_info",
      "monitoring",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060146_46zvua",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.146Z",
    "lastUsed": "2026-08-20T00:17:40.146Z"
  },
  {
    "category": "code_pattern",
    "title": "design_search — design tool",
    "code": "// Tool: design_search\n// Category: design\n// Risk: readonly\n// Search the design library for existing designs matching a query or tags",
    "description": "Search the design library for existing designs matching a query or tags",
    "tags": [
      "design_search",
      "design",
      "readonly",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060148_prnkid",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.148Z",
    "lastUsed": "2026-08-20T00:17:40.148Z"
  },
  {
    "category": "code_pattern",
    "title": "design_template — design tool",
    "code": "// Tool: design_template\n// Category: design\n// Risk: low\n// Generate a design template suggestion (node types, connections) for an app idea using AI",
    "description": "Generate a design template suggestion (node types, connections) for an app idea using AI",
    "tags": [
      "design_template",
      "design",
      "low",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060148_khf55k",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.148Z",
    "lastUsed": "2026-08-20T00:17:40.148Z"
  },
  {
    "category": "code_pattern",
    "title": "diagram_flow — diagram tool",
    "code": "// Tool: diagram_flow\n// Category: diagram\n// Risk: low\n// Generate Mermaid.js flow/sequence/class/mindmap diagram markup from a text description using AI",
    "description": "Generate Mermaid.js flow/sequence/class/mindmap diagram markup from a text description using AI",
    "tags": [
      "diagram_flow",
      "diagram",
      "low",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060148_nin5v3",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.148Z",
    "lastUsed": "2026-08-20T00:17:40.148Z"
  },
  {
    "category": "code_pattern",
    "title": "notify_send — notification tool",
    "code": "// Tool: notify_send\n// Category: notification\n// Risk: low\n// Send a desktop notification (uses notify-send on Linux, terminal bell as fallback)",
    "description": "Send a desktop notification (uses notify-send on Linux, terminal bell as fallback)",
    "tags": [
      "notify_send",
      "notification",
      "low",
      "tool",
      "auto-registered"
    ],
    "nodeType": "tool",
    "language": "typescript",
    "targetOS": "linux",
    "projectId": "tool-system",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185060148_eju8z5",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:17:40.148Z",
    "lastUsed": "2026-08-20T00:17:40.148Z"
  },
  {
    "category": "code_pattern",
    "title": "main.go - logic pattern",
    "code": "package main\n\ntype Config struct {\n\tBoardSize    int\n\tThemeColors string\n}",
    "description": "A logic node implementation for a simple countdown timer web app. Language: go, OS: linux",
    "tags": [
      "logic",
      "go",
      "linux",
      "main.go"
    ],
    "projectId": "bc17b437-fbbb-4761-8b1f-9ddacf0cf0a1",
    "targetOS": "linux",
    "nodeType": "logic",
    "language": "go",
    "success": true,
    "qualityScore": 5,
    "id": "pat_1787185355180_sf7d3g",
    "usageCount": 0,
    "createdAt": "2026-08-20T00:22:35.180Z",
    "lastUsed": "2026-08-20T00:22:35.180Z"
  }
]

## ===== FILE: knowledge/rnn-model.json =====



## ===== FILE: knowledge/sheet-meta.json =====

{
  "currentSheet": 2
}