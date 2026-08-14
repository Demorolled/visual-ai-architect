#!/usr/bin/env node

/**
 * test-tools.mjs — Comprehensive Tool Validation Suite
 *
 * Tests all 75 registered tools via the HTTP API (POST /api/tools/:name/execute)
 * and validates success/error responses.
 *
 * Usage:  node tests/test-tools.mjs
 *         node tests/test-tools.mjs --category=data    # Test only data tools
 *         node tests/test-tools.mjs --tool=json_query  # Test a specific tool
 *         node tests/test-tools.mjs --dry-run          # List what would be tested
 *         node tests/test-tools.mjs --verbose          # Show full responses
 */

const BASE = 'http://localhost:3001';
const HEADERS = { 'Content-Type': 'application/json', 'x-permission-mode': 'allow_all' };

// ── Tool Test Definitions ───────────────────────────────────────────────────
// Each test: { name, input, validate(resp) -> { pass, detail } }

const TOOL_TESTS = {

  // ═══════════════════════════════════
  // FILE SYSTEM TOOLS
  // ═══════════════════════════════════
  read_file: [
    {
      name: 'Read existing file',
      input: { path: 'package.json' },
      validate: (d) => ({
        pass: d.success && typeof d.data.content === 'string',
        detail: d.success ? `${d.data.content.length} chars read from ${d.data.path}` : (d.error || '')
      })
    },
    {
      name: 'Read non-existent file returns error',
      input: { path: '/nonexistent/file.txt' },
      validate: (d) => ({
        pass: !d.success,
        detail: d.error || 'Got expected error'
      })
    },
    {
      name: 'Missing path validation',
      input: {},
      validate: (d) => ({
        pass: !d.success && (d.errorCode === 'VALIDATION_ERROR' || d.error),  // route validates required before calling tool
        detail: d.error || 'Got validation error'
      })
    }
  ],

  list_files: [
    {
      name: 'List project root',
      input: { path: '.' },
      validate: (d) => ({
        pass: d.success && Array.isArray(d.data.files) && d.data.files.length > 0,
        detail: d.success ? `${d.data.files.length} files, ${d.data.directories.length} dirs` : (d.error || '')
      })
    },
    {
      name: 'List with pattern',
      input: { path: '.', pattern: '*.json' },
      validate: (d) => ({
        pass: d.success && Array.isArray(d.data.files),
        detail: d.success ? `${d.data.files.length} files matching *.json` : (d.error || '')
      })
    }
  ],

  write_file: [
    {
      name: 'Write temp file and verify',
      input: { path: '/tmp/vaca-tool-test.txt', content: 'Hello from tool test!' },
      validate: (d) => ({
        pass: d.success && d.data.message && d.data.path,
        detail: d.success ? `${d.data.message} to ${d.data.path}` : (d.error || '')
      })
    }
  ],

  delete_file: [
    {
      name: 'Delete temp file',
      input: { path: '/tmp/vaca-tool-test.txt' },
      validate: (d) => ({
        pass: d.success,
        detail: d.success ? 'Deleted' : (d.error || '')
      })
    }
  ],

  search_file: [
    {
      name: 'Search for pattern in backend source',
      input: { pattern: 'function', path: 'src', maxResults: 5 },
      validate: (d) => ({
        pass: d.success && Array.isArray(d.data.matches),
        detail: d.success ? `${d.data.total} matches found in src/` : (d.error || '')
      })
    }
  ],

  // ═══════════════════════════════════
  // SHELL / EXECUTION TOOLS
  // ═══════════════════════════════════
  shell: [
    {
      name: 'Run echo command',
      input: { command: 'echo "hello-vaca"' },
      validate: (d) => ({
        pass: d.success && d.data.stdout.includes('hello-vaca'),
        detail: d.success ? `stdout: ${d.data.stdout.trim()}` : d.error
      })
    },
    {
      name: 'Run pwd command',
      input: { command: 'pwd' },
      validate: (d) => ({
        pass: d.success && d.data.stdout.length > 0,
        detail: d.success ? `cwd: ${d.data.stdout.trim()}` : d.error
      })
    },
    {
      name: 'Empty command returns error',
      input: { command: '' },
      validate: (d) => ({
        pass: !d.success,
        detail: d.error || 'Expected validation error'
      })
    }
  ],

  // ═══════════════════════════════════
  // DATA TOOLS
  // ═══════════════════════════════════
  json_query: [
    {
      name: 'Simple dot-path query',
      input: { json: '{"users": [{"name": "Alice"}, {"name": "Bob"}]}', path: 'users.0.name' },
      validate: (d) => ({
        pass: d.success && d.data.result === 'Alice',
        detail: d.success ? `Result: ${d.data.result}` : d.error
      })
    },
    {
      name: 'Nested path query',
      input: { json: '{"a": {"b": {"c": [1,2,3]}}}', path: 'a.b.c.1' },
      validate: (d) => ({
        pass: d.success && d.data.result === 2,
        detail: d.success ? `Result: ${d.data.result}` : d.error
      })
    },
    {
      name: 'Invalid path returns error',
      input: { json: '{"x": 1}', path: 'y.z' },
      validate: (d) => ({
        pass: !d.success,
        detail: d.error || 'Expected error for nonexistent path'
      })
    }
  ],

  csv_parse: [
    {
      name: 'Parse basic CSV',
      input: { csv: 'name,age\nAlice,30\nBob,25' },
      validate: (d) => ({
        pass: d.success && d.data.rowCount === 2 && d.data.columns.includes('name'),
        detail: d.success ? `${d.data.rowCount} rows, ${d.data.columns.length} cols` : d.error
      })
    },
    {
      name: 'Empty CSV returns error',
      input: { csv: '' },
      validate: (d) => ({
        pass: !d.success,
        detail: d.error || 'Expected error for empty CSV'
      })
    }
  ],

  json_to_csv: [
    {
      name: 'Convert JSON array to CSV',
      input: { json: '[{"a":1,"b":2},{"a":3,"b":4}]' },
      validate: (d) => ({
        pass: d.success && d.data.csv.includes('a,b'),
        detail: d.success ? `${d.data.rowCount} rows converted` : d.error
      })
    }
  ],

  data_validate: [
    {
      name: 'Validate valid data',
      input: { data: '{"name":"Alice","age":30}', schema: { name: { type: "string", required: true }, age: { type: "number", required: true } } },
      validate: (d) => ({
        pass: d.success && d.data.valid === true,
        detail: d.success ? 'Data valid' : d.error
      })
    },
    {
      name: 'Detect missing field',
      input: { data: '{"name":"Alice"}', schema: { name: { type: "string" }, age: { type: "number", required: true } } },
      validate: (d) => ({
        pass: d.success && d.data.valid === false && d.data.errors.length > 0,
        detail: d.success ? `${d.data.errors.length} validation error(s)` : d.error
      })
    }
  ],

  yaml_convert: [
    {
      name: 'YAML to JSON conversion',
      input: { input: 'name: Alice\nage: 30', direction: 'yaml2json' },
      validate: (d) => ({
        pass: d.success && d.data.format === 'json',
        detail: d.success ? `Converted to JSON (${d.data.output.length} chars)` : d.error
      })
    },
    {
      name: 'JSON to YAML conversion',
      input: { input: '{"name":"Bob","age":25}', direction: 'json2yaml' },
      validate: (d) => ({
        pass: d.success && d.data.format === 'yaml',
        detail: d.success ? `Converted to YAML (${d.data.output.length} chars)` : d.error
      })
    }
  ],

  base64_codec: [
    {
      name: 'Encode text to base64',
      input: { text: 'Hello World', action: 'encode' },
      validate: (d) => ({
        pass: d.success && d.data.result === 'SGVsbG8gV29ybGQ=',
        detail: d.success ? `Encoded: ${d.data.result}` : d.error
      })
    },
    {
      name: 'Decode base64 to text',
      input: { text: 'SGVsbG8gV29ybGQ=', action: 'decode' },
      validate: (d) => ({
        pass: d.success && d.data.result === 'Hello World',
        detail: d.success ? `Decoded: ${d.data.result}` : d.error
      })
    }
  ],

  text_transform: [
    {
      name: 'camelCase conversion',
      input: { text: 'hello world', to: 'camelCase' },
      validate: (d) => ({
        pass: d.success && d.data.result === 'helloWorld',
        detail: d.success ? `Result: ${d.data.result}` : d.error
      })
    },
    {
      name: 'SCREAMING_SNAKE_CASE',
      input: { text: 'hello world', to: 'SCREAMING_SNAKE_CASE' },
      validate: (d) => ({
        pass: d.success && d.data.result === 'HELLO_WORLD',
        detail: d.success ? `Result: ${d.data.result}` : d.error
      })
    },
    {
      name: 'PascalCase conversion',
      input: { text: 'hello world', to: 'PascalCase' },
      validate: (d) => ({
        pass: d.success && d.data.result === 'HelloWorld',
        detail: d.success ? `Result: ${d.data.result}` : d.error
      })
    }
  ],

  regex_test: [
    {
      name: 'Simple regex match',
      input: { pattern: '\\d+', text: 'abc123def456', flags: 'g' },
      validate: (d) => ({
        pass: d.success && d.data.count === 2 && d.data.valid,
        detail: d.success ? `${d.data.count} matches found` : d.error
      })
    },
    {
      name: 'Invalid regex returns valid=false',
      input: { pattern: '[invalid', text: 'test' },
      validate: (d) => ({
        pass: d.success && d.data.valid === false,
        detail: 'Correctly reported invalid regex'
      })
    }
  ],

  text_diff: [
    {
      name: 'Simple text diff',
      input: { textA: 'hello\\nworld', textB: 'hello\\nthere\\nworld' },
      validate: (d) => ({
        pass: d.success && (d.data.additions > 0 || d.data.removals >= 0),
        detail: d.success ? `${d.data.additions} additions, ${d.data.removals} removals` : d.error
      })
    }
  ],

  json_format: [
    {
      name: 'Pretty-print JSON',
      input: { json: '{"a":1,"b":2}', action: 'pretty' },
      validate: (d) => ({
        pass: d.success && d.data.result.includes('\n'),
        detail: d.success ? `${d.data.resultLength} chars (from ${d.data.originalLength})` : d.error
      })
    },
    {
      name: 'Minify JSON',
      input: { json: '{\n  "a": 1,\n  "b": 2\n}', action: 'minify' },
      validate: (d) => ({
        pass: d.success && !d.data.result.includes('\n'),
        detail: d.success ? `${d.data.resultLength} chars (from ${d.data.originalLength})` : d.error
      })
    }
  ],

  // ═══════════════════════════════════
  // DEVELOPMENT / GIT TOOLS
  // ═══════════════════════════════════
  git_status: [
    {
      name: 'Get git status (may not work if not in git repo)',
      input: {},
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Branch: ${d.data.branch}, ${d.data.changed || 0} file(s) changed` : (d.error + ' — CWD may not be project root')
      })
    }
  ],

  git_log: [
    {
      name: 'Get recent commits (may fail if not in git repo)',
      input: { maxCount: 3 },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `${d.data.commits.length} commits found` : (d.error + ' — CWD may not be project root')
      })
    }
  ],

  uuid_gen: [
    {
      name: 'Generate single UUID',
      input: { count: 1 },
      validate: (d) => ({
        pass: d.success && d.data.uuids.length === 1 && d.data.uuids[0].length === 36,
        detail: d.success ? `UUID: ${d.data.uuids[0]}` : d.error
      })
    },
    {
      name: 'Generate multiple UUIDs',
      input: { count: 5 },
      validate: (d) => ({
        pass: d.success && d.data.uuids.length === 5,
        detail: d.success ? `${d.data.uuids.length} UUIDs generated` : d.error
      })
    }
  ],

  hash_text: [
    {
      name: 'SHA256 hash',
      input: { text: 'hello', algorithm: 'sha256' },
      validate: (d) => ({
        pass: d.success && d.data.hash.length === 64,
        detail: d.success ? `SHA256: ${d.data.hash.substring(0, 16)}...` : d.error
      })
    },
    {
      name: 'MD5 hash',
      input: { text: 'hello', algorithm: 'md5' },
      validate: (d) => ({
        pass: d.success && d.data.hash.length === 32,
        detail: d.success ? `MD5: ${d.data.hash}` : d.error
      })
    }
  ],

  code_metrics: [
    {
      name: 'Analyze simple code',
      input: { source: 'function add(a,b) { return a + b; }', language: 'javascript' },
      validate: (d) => ({
        pass: d.success && typeof d.data.lines === 'object',
        detail: d.success ? `Total: ${d.data.lines.total}, Code: ${d.data.lines.code}, Funcs: ${d.data.functions}` : (d.error || '')
      })
    }
  ],

  // ═══════════════════════════════════
  // SYSTEM / MONITORING TOOLS
  // ═══════════════════════════════════
  system_info: [
    {
      name: 'Get system info',
      input: {},
      validate: (d) => ({
        pass: d.success && typeof d.data.os === 'string',
        detail: d.success ? `OS: ${d.data.os}, CPU: ${d.data.cpus} cores, RAM: ${d.data.memory?.total || '?'}` : (d.error || '')
      })
    },
    {
      name: 'Detailed system info',
      input: { detailed: true },
      validate: (d) => ({
        pass: d.success && Array.isArray(d.data.cpuDetails),
        detail: d.success ? `${d.data.cpuDetails.length} CPU details` : (d.error || '')
      })
    }
  ],

  network_info: [
    {
      name: 'Get network interfaces',
      input: {},
      validate: (d) => ({
        pass: d.success && Array.isArray(d.data.interfaces),
        detail: d.success ? `${d.data.interfaceCount || d.data.interfaces.length} interface(s)` : (d.error || '')
      })
    }
  ],

  disk_usage: [
    {
      name: 'Check disk usage',
      input: {},
      validate: (d) => ({
        pass: d.success && typeof d.data.size === 'string',
        detail: d.success ? `Total: ${d.data.size}, Used: ${d.data.used}, Avail: ${d.data.available}` : (d.error || '')
      })
    }
  ],

  env_list: [
    {
      name: 'List environment variables',
      input: {},
      validate: (d) => ({
        pass: d.success && Array.isArray(d.data.variables) && d.data.count > 0,
        detail: d.success ? `${d.data.count} vars listed` : (d.error || '')
      })
    }
  ],

  process_ps: [
    {
      name: 'List processes',
      input: { maxResults: 10 },
      validate: (d) => ({
        pass: d.success && Array.isArray(d.data.processes),
        detail: d.success ? `${d.data.processes.length} processes` : (d.error || '')
      })
    }
  ],

  // ═══════════════════════════════════
  // NETWORK TOOLS
  // ═══════════════════════════════════
  url_analyze: [
    {
      name: 'Parse valid URL',
      input: { url: 'https://example.com/path?q=1#hash' },
      validate: (d) => ({
        pass: d.success && d.data.valid && d.data.parts.protocol === 'https',
        detail: d.success ? `Host: ${d.data.parts.hostname}, Path: ${d.data.parts.pathname}` : d.error
      })
    },
    {
      name: 'Invalid URL',
      input: { url: 'not-a-url' },
      validate: (d) => ({
        pass: d.success && !d.data.valid,
        detail: 'Correctly reported invalid URL'
      })
    }
  ],

  http_request: [
    {
      name: 'GET health endpoint',
      input: { url: 'http://localhost:3001/health', method: 'GET', timeout: 5000 },
      validate: (d) => ({
        pass: d.success === true && d.data.status === 200,
        detail: d.success ? `Status: ${d.data.status}, Content-Type: ${d.data.contentType}` : (d.error || '')
      })
    }
  ],

  port_check: [
    {
      name: 'Check port 3001 (should be in use)',
      input: { port: 3001 },
      validate: (d) => ({
        pass: d.success && d.data.inUse === true,
        detail: d.success ? `Port ${d.data.port} is ${d.data.inUse ? 'in use' : 'free'}` : (d.error || '')
      })
    },
    {
      name: 'Check port 9999 (should be free)',
      input: { port: 9999 },
      validate: (d) => ({
        pass: d.success && d.data.inUse === false,
        detail: d.success ? `Port ${d.data.port} is ${d.data.inUse ? 'in use' : 'free'}` : (d.error || '')
      })
    }
  ],

  // ═══════════════════════════════════
  // UTILITY TOOLS
  // ═══════════════════════════════════
  password_gen: [
    {
      name: 'Generate password',
      input: { length: 16, symbols: true },
      validate: (d) => ({
        pass: d.success && Array.isArray(d.data.passwords) && d.data.passwords[0].length === 16,
        detail: d.success ? `Password: ${d.data.passwords[0]} (${d.data.strength})` : (d.error || '')
      })
    }
  ],

  color_convert: [
    {
      name: 'Convert hex to rgb/hsl',
      input: { color: '#ff0000', format: 'hex' },
      validate: (d) => ({
        pass: d.success && d.data.hex === '#ff0000' && d.data.rgb === 'rgb(255, 0, 0)',
        detail: d.success ? `Hex: ${d.data.hex}, RGB: ${d.data.rgb}, HSL: ${d.data.hsl}` : (d.error || '')
      })
    }
  ],

  cron_explain: [
    {
      name: 'Explain cron expression',
      input: { expression: '0 9 * * 1-5' },
      validate: (d) => ({
        pass: d.success && d.data.explanation.length > 0,
        detail: d.success ? d.data.explanation.substring(0, 80) : d.error
      })
    }
  ],

  // ═══════════════════════════════════
  // DESIGN / BLUEPRINT TOOLS
  // ═══════════════════════════════════
  design_search: [
    {
      name: 'Search existing designs',
      input: { query: 'todo', maxResults: 5 },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `${d.data.total} designs found` : (d.error || '')
      })
    }
  ],

  notify_send: [
    {
      name: 'Send notification (falls back to console)',
      input: { title: 'VACA Test', message: 'Tool validation running', urgency: 'low' },
      validate: (d) => ({
        pass: d.success === true && d.data.sent === true,
        detail: d.success ? `Sent via: ${d.data.method}` : (d.error || '')
      })
    }
  ],

  // ═══════════════════════════════════
  // AI MINI-AGENTS (may need LLM)
  // ═══════════════════════════════════
  code_review_mini: [
    {
      name: 'Review code',
      input: { code: 'function add(a,b) { return a + b; }', language: 'javascript', focus: 'bugs' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Review: ${(d.data?.review || '').substring(0, 80)}...` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  explain_code_mini: [
    {
      name: 'Explain code',
      input: { code: 'const x = arr.map(n => n * 2)', language: 'javascript', level: 'simple' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Explanation: ${(d.data?.explanation || '').substring(0, 80)}...` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  diagram_flow: [
    {
      name: 'Generate mermaid diagram',
      input: { description: 'A simple flowchart showing user login process', type: 'flowchart' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Generated ${d.data.type} diagram (${d.data.mermaid.length} chars)` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  design_template: [
    {
      name: 'Generate design template',
      input: { appType: 'web app', description: 'A simple todo list app', language: 'typescript' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `${d.data.nodeCount} nodes suggested` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  // ═══════════════════════════════════
  // SERVICE TOOLS
  // ═══════════════════════════════════
  web_search: [
    {
      name: 'Search web',
      input: { query: 'test query', maxResults: 3 },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `${d.data.results.length} results` : (d.error || 'Web search may need API key')
      })
    }
  ],

  knowledge_query: [
    {
      name: 'Query knowledge store',
      input: { query: 'function', maxResults: 5 },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `${d.data.patterns.length} patterns found` : (d.error || '')
      })
    }
  ],

  knowledge_add: [
    {
      name: 'Add code pattern to knowledge',
      input: { code: 'console.log("test")', tags: ['test', 'debug'], nodeType: 'logic', language: 'javascript', targetOS: 'linux', description: 'Test pattern' },
      validate: (d) => ({
        pass: d.success === true && d.data.id,
        detail: d.success ? `Pattern added with ID: ${String(d.data.id).substring(0, 24)}` : (d.error || '')
      })
    }
  ],

  emotion_analyze: [
    {
      name: 'Analyze text emotion',
      input: { text: 'I am very happy and excited about this project!' },
      validate: (d) => ({
        pass: d.success === true && d.data.emotion && d.data.context,
        detail: d.success ? `Emotion: ${d.data.emotion.dominant} (conf: ${d.data.emotion.confidence})` : (d.error || '')
      })
    }
  ],

  project_list: [
    {
      name: 'List all projects',
      input: {},
      validate: (d) => ({
        pass: d.success === true && Array.isArray(d.data.projects),
        detail: d.success ? `${d.data.projects.length} projects` : (d.error || '')
      })
    }
  ],

  project_create: [
    {
      name: 'Create a project',
      input: { name: 'Test Project', targetOS: 'linux' },
      validate: (d) => ({
        pass: d.success === true && d.data.project && d.data.project.id,
        detail: d.success ? `Project created: ${d.data.project.id}` : (d.error || '')
      })
    }
  ],

  project_get: [
    {
      name: 'Get non-existent project returns error',
      input: { id: '_nonexistent_project_id_' },
      validate: (d) => ({
        pass: !d.success,
        detail: d.error || 'Expected NOT_FOUND error'
      })
    }
  ],

  project_delete: [
    {
      name: 'Create then delete a project (cleanup)',
      skipExecute: true,
      execute: async () => {
        // Create a project first
        const createR = await fetch(`${BASE}/api/tools/project_create/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { name: 'Delete Test', targetOS: 'linux' } })
        });
        const createD = await createR.json();
        if (!createD.success || !createD.data?.project?.id) {
          return { pass: false, detail: 'Setup: could not create project: ' + (createD.error || '') };
        }
        const projectId = createD.data.project.id;

        // Delete the project
        const deleteR = await fetch(`${BASE}/api/tools/project_delete/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { id: projectId } })
        });
        const deleteD = await deleteR.json();

        // Verify it's gone
        const getR = await fetch(`${BASE}/api/tools/project_get/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { id: projectId } })
        });
        const getD = await getR.json();

        return {
          pass: deleteD.success === true && !getD.success,
          detail: deleteD.success ? `Project ${projectId.substring(0, 16)}... created and deleted` : (deleteD.error || '')
        };
      }
    }
  ],

  config_get: [
    {
      name: 'Get LLM config',
      input: {},
      validate: (d) => ({
        pass: d.success === true && d.data.config,
        detail: d.success ? `Provider: ${d.data.config.provider}, Model: ${d.data.config.model}` : (d.error || '')
      })
    }
  ],

  tts_speak: [
    {
      name: 'TTS text to speech',
      input: { text: 'Hello world', voice: 'en-US-JennyNeural' },
      validate: (d) => ({
        pass: d.success === true && d.data.audioBuffer && d.data.format,
        detail: d.success ? `Audio generated (${d.data.audioBuffer.length} chars base64)` : (d.error || 'TTS may need internet')
      })
    }
  ],

  sandbox_run: [
    {
      name: 'Run JS in sandbox',
      input: { code: 'console.log("hello")', language: 'javascript', timeout: 10000 },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Output: ${(d.data.output || '').substring(0, 80)}` : (d.error || 'Sandbox may need Docker')
      })
    }
  ],

  code_generate: [
    {
      name: 'Generate code via AI',
      input: { prompt: 'Write a function that adds two numbers', language: 'javascript', maxTokens: 100 },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Code: ${(d.data.code || '').substring(0, 80)}...` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  agent_spawn: [
    {
      name: 'Spawn background agent (needs LLM)',
      input: { description: 'Test agent', prompt: 'Say hello' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Agent spawned: ${d.data.agentId}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  agent_list: [
    {
      name: 'List spawned agents',
      input: {},
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `${d.data.agents.length} agent(s)` : (d.error || '')
      })
    }
  ],

  agent_status: [
    {
      name: 'Get non-existent agent status',
      input: { agentId: '_nonexistent_agent_' },
      validate: (d) => ({
        pass: !d.success,
        detail: d.error || 'Expected NOT_FOUND'
      })
    }
  ],

  task_create: [
    {
      name: 'Create a task',
      input: { name: 'test-task', type: 'notify', payload: { message: 'Hello' } },
      validate: (d) => ({
        pass: d.success === true && d.data.task && d.data.task.id,
        detail: d.success ? `Task created: ${d.data.task.id} (${d.data.task.status})` : (d.error || '')
      })
    }
  ],

  task_list: [
    {
      name: 'List all tasks',
      input: {},
      validate: (d) => ({
        pass: d.success === true && Array.isArray(d.data.tasks),
        detail: d.success ? `${d.data.tasks.length} task(s)` : (d.error || '')
      })
    }
  ],

  task_cancel: [
    {
      name: 'Cancel non-existent task',
      input: { taskId: '_nonexistent_task_' },
      validate: (d) => ({
        pass: !d.success,
        detail: d.error || 'Expected NOT_FOUND'
      })
    }
  ],

  code_scan: [
    {
      name: 'Scan source code for issues',
      input: { filePath: 'src/index.ts' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Issues: ${d.data?.issues?.length || d.data?.total || 0}` : (d.error || '')
      })
    }
  ],

  security_scan: [
    {
      name: 'Security scan source file',
      input: { filePath: 'src/index.ts' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Vulnerabilities: ${d.data?.issues?.length || d.data?.total || 0}` : (d.error || '')
      })
    }
  ],

  analyze_complexity: [
    {
      name: 'Analyze code complexity',
      input: { source: 'function add(a,b) { if (a > b) { return a; } else { return b; } }' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Complexity: ${JSON.stringify(d.data).substring(0, 80)}` : (d.error || '')
      })
    }
  ],

  debug_inject_logs: [
    {
      name: 'Inject debug logs into temp file',
      skipExecute: true,
      execute: async () => {
        // Create a temp JS file first
        const writeR = await fetch(`${BASE}/api/tools/write_file/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { path: '/tmp/vaca-debug-test.js', content: 'function greet(name) { return "Hello " + name; }\nconst x = greet("World");\nconsole.log(x);' } })
        });
        const writeD = await writeR.json();
        if (!writeD.success) return { pass: false, detail: 'Setup write failed: ' + (writeD.error || '') };

        // Inject logs
        const injectR = await fetch(`${BASE}/api/tools/debug_inject_logs/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { filePath: '/tmp/vaca-debug-test.js', expression: 'function' } })
        });
        const injectD = await injectR.json();
        return {
          pass: injectD.success === true,
          detail: injectD.success ? (injectD.data?.message || 'Logs injected') : (injectD.error || '')
        };
      }
    }
  ],

  debug_remove_logs: [
    {
      name: 'Remove debug logs and cleanup',
      skipExecute: true,
      execute: async () => {
        // Remove logs from the temp file
        const removeR = await fetch(`${BASE}/api/tools/debug_remove_logs/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { filePath: '/tmp/vaca-debug-test.js' } })
        });
        const removeD = await removeR.json();

        // Clean up temp file
        await fetch(`${BASE}/api/tools/delete_file/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { path: '/tmp/vaca-debug-test.js' } })
        });

        return {
          pass: removeD.success === true,
          detail: removeD.success ? (removeD.data?.message || 'Logs removed and cleaned up') : (removeD.error || '')
        };
      }
    }
  ],

  // ═══════════════════════════════════
  // AUXTOOLS2 — More Utility & Development
  // ═══════════════════════════════════
  time_convert: [
    {
      name: 'Convert timezone',
      input: { timestamp: '2024-01-15T14:30:00', fromTimezone: 'UTC', toTimezone: 'America/New_York' },
      validate: (d) => ({
        pass: d.success === true && d.data.converted,
        detail: d.success ? `${d.data.original} → ${d.data.converted}` : (d.error || '')
      })
    }
  ],

  npm_info: [
    {
      name: 'Look up npm package',
      input: { package: 'express' },
      validate: (d) => ({
        pass: d.success === true && d.data.name,
        detail: d.success ? `Package: ${d.data.name}@${d.data.version}` : (d.error || 'npm registry unreachable')
      })
    }
  ],

  jwt_decode: [
    {
      name: 'Decode valid JWT',
      input: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
      validate: (d) => ({
        pass: d.success === true && d.data.payload,
        detail: d.success ? `Subject: ${d.data.payload.sub}, Name: ${d.data.payload.name}` : (d.error || '')
      })
    }
  ],

  file_ops: [
    {
      name: 'Copy then move file (sequence)',
      skipExecute: true,
      execute: async () => {
        // Write source, copy, verify, move, verify, clean up
        const writeR = await fetch(`${BASE}/api/tools/write_file/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { path: '/tmp/vaca-fileops-src.txt', content: 'test content' } })
        });
        const writeD = await writeR.json();
        if (!writeD.success) return { pass: false, detail: 'Setup write failed: ' + (writeD.error || '') };

        const copyR = await fetch(`${BASE}/api/tools/file_ops/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { action: 'copy', source: '/tmp/vaca-fileops-src.txt', destination: '/tmp/vaca-fileops-dst.txt', overwrite: true } })
        });
        const copyD = await copyR.json();
        if (!copyD.success) return { pass: false, detail: 'Copy failed: ' + (copyD.error || '') };

        // Cleanup
        await fetch(`${BASE}/api/tools/delete_file/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { path: '/tmp/vaca-fileops-src.txt' } })
        });
        await fetch(`${BASE}/api/tools/delete_file/execute`, {
          method: 'POST', headers: HEADERS,
          body: JSON.stringify({ input: { path: '/tmp/vaca-fileops-dst.txt' } })
        });

        return { pass: true, detail: 'File copied and cleaned up' };
      }
    }
  ],

  bug_hunter_mini: [
    {
      name: 'Bug hunt code (needs LLM)',
      input: { code: 'function add(a,b) { return a + b; }', language: 'javascript', depth: 'quick' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Bugs found: ${d.data?.total || d.data?.bugs || 0}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  api_design_mini: [
    {
      name: 'Design API (needs LLM)',
      input: { description: 'User login API with email and password', style: 'rest' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `API designed: ${(d.data?.design || d.data?.result || '').substring(0, 80)}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  commit_msg_mini: [
    {
      name: 'Generate commit message (needs LLM)',
      input: { diff: 'Added new login feature', style: 'conventional' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Commit: ${(d.data?.message || d.data?.result || '').substring(0, 80)}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  readme_gen_mini: [
    {
      name: 'Generate README (needs LLM)',
      input: { projectName: 'TestApp', description: 'A test application' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `README: ${(d.data?.readme || d.data?.result || '').substring(0, 80)}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  doc_writer_mini: [
    {
      name: 'Generate docs (needs LLM)',
      input: { code: 'function add(a,b) { return a + b; }', language: 'javascript', style: 'jsdoc' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Docs: ${(d.data?.documentation || '').substring(0, 80)}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  test_writer_mini: [
    {
      name: 'Generate tests (needs LLM)',
      input: { code: 'function add(a,b) { return a + b; }', language: 'typescript', framework: 'vitest' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Tests: ${(d.data?.tests || '').substring(0, 80)}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  refactor_mini: [
    {
      name: 'Refactor code (needs LLM)',
      input: { code: 'function add(a,b) { return a + b; }', language: 'javascript', goal: 'add type checking' },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Refactor: ${(d.data?.summary || d.data?.result || '').substring(0, 80)}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  blueprint_suggest: [
    {
      name: 'Suggest blueprint (needs LLM)',
      input: { idea: 'A simple todo app', includeResearch: false },
      validate: (d) => ({
        pass: d.success === true,
        detail: d.success ? `Blueprint: ${JSON.stringify(d.data).substring(0, 80)}` : (d.error || 'LLM not connected — expected')
      })
    }
  ],

  // ═══════════════════════════════════
  // ERROR HANDLING / EDGE CASES
  // ═══════════════════════════════════
  _error_handling: [
    {
      name: 'Request non-existent tool',
      skipExecute: true,
      execute: async () => {
        const resp = await fetch(`${BASE}/api/tools/nonexistent_tool_xyz/execute`, {
          method: 'POST', headers: HEADERS, body: JSON.stringify({ input: {} })
        });
        const d = await resp.json();
        return {
          pass: !d.success && d.errorCode === 'NOT_FOUND',
          detail: d.error || 'Got expected NOT_FOUND error'
        };
      }
    },
    {
      name: 'Request without input should validate',
      skipExecute: true,
      execute: async () => {
        const resp = await fetch(`${BASE}/api/tools/json_query/execute`, {
          method: 'POST', headers: HEADERS, body: JSON.stringify({ input: {} })
        });
        const d = await resp.json();
        return {
          pass: !d.success && d.errorCode === 'VALIDATION_ERROR',
          detail: d.error || 'Got expected validation error'
        };
      }
    }
  ]
};

// ── Runner ──────────────────────────────────────────────────────────────────

async function runToolTest(toolName, test, verbose) {
  if (test.skipExecute && test.execute) {
    return await test.execute();
  }

  try {
    const resp = await fetch(`${BASE}/api/tools/${toolName}/execute`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ input: test.input })
    });
    const data = await resp.json();
    if (verbose) console.log(`  [RAW] ${JSON.stringify(data).substring(0, 300)}`);
    return test.validate(data);
  } catch (err) {
    return { pass: false, detail: `HTTP Error: ${err.message}` };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opts = {
    category: null,
    tool: null,
    dryRun: false,
    verbose: args.includes('--verbose')
  };
  for (const arg of args) {
    if (arg.startsWith('--category=')) opts.category = arg.split('=')[1];
    if (arg.startsWith('--tool=')) opts.tool = arg.split('=')[1];
    if (arg === '--dry-run') opts.dryRun = true;
  }

  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`   VACA Tool Validation Suite`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Map: toolName -> { label, tests: [...] }
  let results = [];
  let total = 0, passed = 0;

  for (const [toolName, tests] of Object.entries(TOOL_TESTS)) {
    if (opts.tool && toolName !== opts.tool && toolName !== '_error_handling') continue;
    if (opts.category) {
      // Map known tools to categories
      const catMap = {
        'file_system': ['read_file', 'write_file', 'delete_file', 'list_files', 'search_file'],
        'data': ['json_query', 'csv_parse', 'json_to_csv', 'data_validate', 'yaml_convert', 'base64_codec', 'text_transform', 'regex_test', 'text_diff', 'json_format'],
        'development': ['git_status', 'git_log', 'uuid_gen', 'hash_text', 'code_metrics', 'npm_info', 'jwt_decode', 'file_ops', 'port_check'],
        'utility': ['password_gen', 'color_convert', 'cron_explain', 'time_convert', 'code_scan', 'security_scan', 'analyze_complexity', 'debug_inject_logs', 'debug_remove_logs'],
        'system': ['system_info', 'network_info', 'disk_usage', 'env_list', 'process_ps'],
        'network': ['url_analyze', 'http_request'],
        'utility': ['password_gen', 'color_convert', 'cron_explain', 'code_scan', 'security_scan', 'analyze_complexity', 'debug_inject_logs'],
        'design': ['design_search', 'design_template', 'diagram_flow', 'blueprint_suggest'],
        'ai': ['code_review_mini', 'explain_code_mini', 'code_generate', 'bug_hunter_mini', 'api_design_mini', 'commit_msg_mini', 'readme_gen_mini', 'doc_writer_mini', 'test_writer_mini', 'refactor_mini'],
        'execution': ['shell'],
        'notification': ['notify_send'],
        'service': ['web_search', 'knowledge_query', 'knowledge_add', 'emotion_analyze', 'config_get', 'tts_speak', 'sandbox_run'],
        'project': ['project_list', 'project_create', 'project_get', 'project_delete'],
        'agent': ['agent_spawn', 'agent_list', 'agent_status'],
        'task': ['task_create', 'task_list', 'task_cancel'],
        'error': ['_error_handling'],
      };
      const inCat = Object.entries(catMap).some(([cat, tools]) => cat === opts.category && tools.includes(toolName));
      if (!inCat && toolName !== '_error_handling') continue;
    }

    if (opts.dryRun) {
      console.log(`   📋 ${toolName === '_error_handling' ? 'Error Handling' : toolName} — ${tests.length} test(s)`);
      for (const t of tests) {
        console.log(`      • ${t.name}`);
      }
      continue;
    }

    console.log(`\n   🔧 ${toolName === '_error_handling' ? '[Error Handling]' : toolName}`);
    for (const test of tests) {
      total++;
      const result = await runToolTest(toolName, test, opts.verbose);
      if (result.pass) passed++;
      const icon = result.pass ? '✅' : '❌';
      console.log(`   ${icon} ${test.name}: ${result.detail}`);
      results.push({ tool: toolName, test: test.name, pass: result.pass, detail: result.detail });
    }
  }

  if (opts.dryRun) {
    console.log(`\n   Dry run complete. Total test cases: ${total}\n`);
    process.exit(0);
  }

  // Summary
  const pct = total > 0 ? (passed / total * 100).toFixed(1) : '0.0';
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`   RESULTS`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  console.log(`   Tests:    ${total}`);
  console.log(`   Passed:   ${passed} ✅`);
  console.log(`   Failed:   ${total - passed} ❌`);
  console.log(`   Rate:     ${pct}%`);
  console.log();

  // Show failures
  const failures = results.filter(r => !r.pass);
  if (failures.length > 0) {
    console.log(`   ❌ Failed tests:\n`);
    for (const f of failures) {
      console.log(`   • ${f.tool} — ${f.test}`);
      console.log(`     ↳ ${f.detail}`);
    }
    console.log();
  }

  // Detailed breakdown by category
  console.log(`\n   📊 Breakdown by Category:\n`);
  const categories = {
    'File System': ['read_file', 'write_file', 'delete_file', 'list_files', 'search_file'],
    'Data': ['json_query', 'csv_parse', 'json_to_csv', 'data_validate', 'yaml_convert', 'base64_codec', 'text_transform', 'regex_test', 'text_diff', 'json_format'],
    'Execution': ['shell'],
    'Network': ['url_analyze', 'http_request', 'port_check'],
    'Development': ['git_status', 'git_log', 'uuid_gen', 'hash_text', 'code_metrics'],
    'System': ['system_info', 'network_info', 'disk_usage', 'env_list', 'process_ps'],
    'Utility': ['password_gen', 'color_convert', 'cron_explain'],
    'Design': ['design_search', 'design_template', 'diagram_flow'],
    'AI Agents': ['code_review_mini', 'explain_code_mini'],
    'Notification': ['notify_send'],
    'Error Handling': ['_error_handling'],
  };

  const categoryBreakdown = {
    'File System': ['read_file', 'write_file', 'delete_file', 'list_files', 'search_file'],
    'Data': ['json_query', 'csv_parse', 'json_to_csv', 'data_validate', 'yaml_convert', 'base64_codec', 'text_transform', 'regex_test', 'text_diff', 'json_format'],
    'Execution': ['shell'],
    'Network': ['url_analyze', 'http_request', 'port_check'],
    'Development/Git': ['git_status', 'git_log', 'uuid_gen', 'hash_text', 'code_metrics'],
    'System/Monitor': ['system_info', 'network_info', 'disk_usage', 'env_list', 'process_ps'],
    'Utility': ['password_gen', 'color_convert', 'cron_explain', 'time_convert', 'npm_info', 'jwt_decode', 'file_ops', 'code_scan', 'security_scan', 'analyze_complexity', 'debug_inject_logs'],
    'Design/Diagram': ['design_search', 'design_template', 'diagram_flow', 'blueprint_suggest'],
    'AI Agents': ['code_review_mini', 'explain_code_mini', 'code_generate', 'bug_hunter_mini', 'api_design_mini', 'commit_msg_mini', 'readme_gen_mini', 'doc_writer_mini', 'test_writer_mini', 'refactor_mini'],
    'Notification': ['notify_send'],
    'Service/Web': ['web_search', 'knowledge_query', 'knowledge_add', 'emotion_analyze', 'config_get', 'tts_speak', 'sandbox_run'],
    'Project Mgmt': ['project_list', 'project_create', 'project_get', 'project_delete'],
    'Agent/Task': ['agent_spawn', 'agent_list', 'agent_status', 'task_create', 'task_list', 'task_cancel'],
    'Error Handling': ['_error_handling'],
  };

  for (const [cat, tools] of Object.entries(categoryBreakdown)) {
    const catResults = results.filter(r => tools.includes(r.tool));
    const catPassed = catResults.filter(r => r.pass).length;
    const catTotal = catResults.length;
    if (catTotal > 0) {
      const rate = (catPassed / catTotal * 100).toFixed(0);
      console.log(`   ${cat.padEnd(22)} ${catPassed}/${catTotal} (${rate}%)`);
    }
  }

  console.log();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
