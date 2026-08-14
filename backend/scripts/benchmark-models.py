#!/usr/bin/env python3
"""
Model Benchmark: Qwen2.5-Coder 0.5B vs 1.5B vs 7B
Compares code generation speed and quality across varying file complexities.

Usage: python3 benchmark-models.py
"""

import json
import time
import urllib.request
import urllib.error
import sys
import re
from dataclasses import dataclass
from typing import Optional

# ── Model Config ──
MODELS = {
    "0.5B (CPU)": {
        "base_url": "http://127.0.0.1:11436",
        "model": "qwen2.5-coder:0.5b",
    },
    "1.5B (GPU)": {
        "base_url": "http://127.0.0.1:11434",
        "model": "qwen2.5-coder:1.5b",
    },
    "7B (GPU)": {
        "base_url": "http://127.0.0.1:11434",
        "model": "qwen2.5-7b-instruct-uncensored",
    },
}

# ── Test Prompts (varied complexity) ──
BENCHMARKS = [
    {
        "id": "01-types",
        "label": "Type Definitions",
        "complexity": "simple",
        "prompt": """Generate TypeScript type definitions for a user management system.
Include types for: User, UserRole (Admin, Editor, Viewer), CreateUserDto, UpdateUserDto, UserFilter.
Use interfaces and enums where appropriate. Return ONLY valid TypeScript code, no explanations.""",
    },
    {
        "id": "02-css",
        "label": "CSS Styles",
        "complexity": "simple",
        "prompt": """Generate CSS for a dark-mode admin dashboard sidebar.
Include: sidebar container (280px, dark bg #1a1a2e), nav items with hover states, 
active item indicator, collapsible sections, smooth transitions.
Use CSS variables for colors. Return ONLY valid CSS, no explanations.""",
    },
    {
        "id": "03-api",
        "label": "Express API Handler",
        "complexity": "medium",
        "prompt": """Generate a Node.js Express route handler for a task management API.
Include endpoints: GET /tasks (list with pagination), POST /tasks (create), 
PUT /tasks/:id (update), DELETE /tasks/:id (soft delete).
Each endpoint should have input validation, error handling, and proper HTTP status codes.
Use async/await. Return ONLY valid TypeScript code, no explanations.""",
    },
    {
        "id": "04-utility",
        "label": "Data Transformation",
        "complexity": "medium",
        "prompt": """Generate a Python utility module for data transformation.
Include functions: 
- flatten_dict(d, parent_key='', sep='.') - flattens nested dicts
- group_by(iterable, key_fn) - groups items by a key function
- chunk_list(lst, chunk_size) - splits list into chunks
- merge_dicts(*dicts, strategy='overwrite') - merges multiple dicts
Each function should have proper type hints, docstrings, and edge case handling.
Return ONLY valid Python code, no explanations.""",
    },
    {
        "id": "05-chess",
        "label": "Chess Move Validator",
        "complexity": "complex",
        "prompt": """Generate a TypeScript chess move validator class.
Implement: board representation (8x8 array), piece placement, 
move validation for all pieces (pawn, rook, knight, bishop, queen, king),
check detection, checkmate detection, en passant, castling.
Include proper error handling and type definitions.
Focus on the core logic - board state management and legal move generation.
Return ONLY valid TypeScript code, no explanations.""",
    },
    {
        "id": "06-database",
        "label": "Database Repository",
        "complexity": "complex",
        "prompt": """Generate a TypeScript database repository class using SQLite.
Implement a UserRepository with:
- constructor(db: Database) - takes a sqlite3 Database instance
- create(user: CreateUserDto): Promise<User> - inserts with password hashing (bcrypt)
- findById(id: number): Promise<User | null> - fetches by primary key
- findByEmail(email: string): Promise<User | null> - fetches by unique email
- update(id: number, data: UpdateUserDto): Promise<User> - partial update
- delete(id: number): Promise<void> - soft delete with deletedAt timestamp
- list(filter: UserFilter): Promise<{users: User[], total: number}> - paginated list with search
Include proper TypeScript types, error handling, parameterized queries, and transaction support.
Return ONLY valid TypeScript code, no explanations.""",
    },
]


def call_ollama(base_url: str, model: str, prompt: str, max_tokens: int = 2048) -> tuple[Optional[str], float, float]:
    """Call Ollama generate API and return (response_text, time_to_first_token_s, total_time_s)."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.2,
            "stop": ["<|im_end|>", "<|endoftext|>"],
        }
    }

    url = f"{base_url}/api/generate"
    data = json.dumps(payload).encode()

    req = urllib.request.Request(url, data, {"Content-Type": "application/json"})
    
    full_text = ""
    first_token = None
    start_time = time.time()
    
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            buffer = ""
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buffer += chunk.decode()
                
                # Process complete lines (SSE format)
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line or line.startswith(":"):
                        continue
                    if line.startswith("data: "):
                        line = line[6:]
                    try:
                        obj = json.loads(line)
                        token = obj.get("response", "")
                        full_text += token
                        if first_token is None and token.strip():
                            first_token = time.time()
                        if obj.get("done"):
                            break
                    except json.JSONDecodeError:
                        pass
                    
    except urllib.error.HTTPError as e:
        return None, 0, 0
    except Exception as e:
        return None, 0, 0

    total_time = time.time() - start_time
    ttft = (first_token - start_time) if first_token else total_time
    
    return full_text.strip(), round(ttft, 3), round(total_time, 3)


def evaluate_quality(text: str, benchmark_id: str) -> dict:
    """Evaluate generated code quality."""
    if not text:
        return {"score": 0, "has_code": False, "syntax_valid": False, "issues": ["Empty response"]}
    
    issues = []
    score = 100
    
    # Has code content
    has_code = len(text) > 50
    
    # Check for code fences (shouldn't have them per instructions, but common)
    has_fences = "```" in text
    if has_fences:
        issues.append("Wrapped in markdown fences")
        score -= 10
    
    # Check for explanatory text (not just code)
    has_explanation = any(phrase in text.lower() for phrase in [
        "here", "here's", "this code", "the code", "explanation", 
        "note:", "this function", "this class", "above code"
    ])
    if has_explanation:
        issues.append("Contains explanatory text")
        score -= 5
    
    # Language-specific syntax checks
    lang = "typescript" if benchmark_id in ("01-types", "03-api", "05-chess", "06-database") else \
           "css" if benchmark_id == "02-css" else "python"
    
    syntax_valid = True
    
    if lang == "typescript":
        # Check for valid TypeScript constructs
        exports = len(re.findall(r'\bexport\s+(?:function|class|interface|type|const|enum|default)\b', text))
        if exports == 0:
            syntax_valid = False
            issues.append("No exports found")
            score -= 20
        
        # Check for function definitions
        funcs = len(re.findall(r'\b(?:async\s+)?function\b|\b=>\s*{', text))
        if funcs == 0 and benchmark_id in ("03-api", "05-chess", "06-database"):
            syntax_valid = False
            issues.append("No function definitions found")
            score -= 15
    
    elif lang == "css":
        # Check for valid CSS
        selectors = len(re.findall(r'[.#a-zA-Z][^{]*\{', text))
        if selectors == 0:
            syntax_valid = False
            issues.append("No CSS selectors found")
            score -= 20
        
        props = len(re.findall(r'[a-z-]+\s*:', text))
        if props == 0:
            syntax_valid = False
            issues.append("No CSS properties found")
            score -= 15
    
    elif lang == "python":
        # Check for valid Python
        defs = len(re.findall(r'^def |^async def |^class ', text, re.MULTILINE))
        if defs == 0:
            syntax_valid = False
            issues.append("No function/class definitions found")
            score -= 20
        
        docstrings = len(re.findall(r'"""', text))
        if docstrings == 0:
            issues.append("Missing docstrings")
            score -= 5
    
    # Length check
    if len(text) < 100:
        issues.append(f"Very short output ({len(text)} chars)")
        score -= 20
    elif len(text) > 10000:
        issues.append(f"Unusually long ({len(text)} chars)")
        score -= 5
    
    score = max(0, min(100, score))
    
    return {
        "score": score,
        "has_code": has_code,
        "syntax_valid": syntax_valid,
        "issues": issues,
        "lines": text.count("\n") + 1,
        "chars": len(text),
        "exports": len(re.findall(r'\bexport\b', text)) if lang == "typescript" else 0,
        "functions": len(re.findall(r'\bdef |\bfunction\b|^class ', text, re.MULTILINE)),
    }


def print_separator(char="=", width=100):
    print(char * width)


def print_row(cols, widths):
    """Print a formatted table row."""
    parts = []
    for i, col in enumerate(cols):
        w = widths[i]
        s = str(col)[:w]
        parts.append(s.ljust(w))
    print(" | ".join(parts))


def main():
    print_separator("=")
    print("  🏋️  MODEL BENCHMARK: Qwen2.5-Coder 0.5B vs 1.5B vs 7B")
    print_separator("=")
    print(f"  CPU Instance: http://127.0.0.1:11436")
    print(f"  GPU Instance: http://127.0.0.1:11434")
    print(f"  Tests:        {len(BENCHMARKS)} varied file types")
    print(f"  Models:       {', '.join(MODELS.keys())}")
    print_separator("=")
    
    all_results = {}
    
    for model_name, model_config in MODELS.items():
        print(f"\n  🔍 Testing {model_name}...")
        
        # Warmup: small prompt to load model into memory
        warmup = call_ollama(model_config["base_url"], model_config["model"], 
                            "Generate a 1-line TypeScript function that adds two numbers.", 100)
        if warmup[0] is None:
            print(f"  ⚠️  {model_name} FAILED - skipping")
            continue
        
        results = []
        for bench in BENCHMARKS:
            sys.stdout.write(f"    [{bench['id']}] {bench['label']} ({bench['complexity']:>7})... ")
            sys.stdout.flush()
            
            text, ttft, total = call_ollama(model_config["base_url"], model_config["model"], bench["prompt"])
            
            if text is None:
                print("❌ FAILED")
                continue
            
            quality = evaluate_quality(text, bench["id"])
            
            print(f"✓ {total:.1f}s (ttft: {ttft:.2f}s, {quality['chars']} chars, score: {quality['score']})")
            
            results.append({
                "benchmark": bench["id"],
                "label": bench["label"],
                "complexity": bench["complexity"],
                "time_seconds": total,
                "time_to_first_token": ttft,
                "chars": quality["chars"],
                "lines": quality["lines"],
                "quality_score": quality["score"],
                "syntax_valid": quality["syntax_valid"],
                "issues": quality["issues"],
            })
        
        all_results[model_name] = results
        print(f"  ✅ {model_name} complete ({len(results)}/{len(BENCHMARKS)} tests)")
    
    # ── Summary Table ──
    print("\n\n")
    print_separator("━")
    print("  📊 BENCHMARK RESULTS SUMMARY")
    print_separator("━")
    
    cols = ["Model", "Benchmark", "Complexity", "Time (s)", "TTFT (s)", "Chars", "Score", "Valid"]
    widths = [16, 26, 10, 10, 10, 8, 8, 8]
    print_row(cols, widths)
    print_row(["-" * w for w in widths], widths)
    
    for model_name in sorted(all_results.keys(), key=lambda x: {"0.5B (CPU)": 0, "1.5B (GPU)": 1, "7B (GPU)": 2}.get(x, 99)):
        for r in all_results[model_name]:
            print_row([
                model_name,
                r["label"],
                r["complexity"],
                f'{r["time_seconds"]:.1f}',
                f'{r["time_to_first_token"]:.2f}',
                str(r["chars"]),
                str(r["quality_score"]),
                "✅" if r["syntax_valid"] else "⚠️",
            ], widths)
    
    # ── Aggregated Stats ──
    print("\n\n")
    print_separator("━")
    print("  📈 AGGREGATED STATISTICS")
    print_separator("━")
    
    agg_cols = ["Model", "Avg Time", "Avg TTFT", "Avg Chars", "Avg Score", "Valid %"]
    agg_widths = [16, 12, 12, 12, 12, 10]
    print_row(agg_cols, agg_widths)
    print_row(["-" * w for w in agg_widths], widths)
    
    for model_name in sorted(all_results.keys(), key=lambda x: {"0.5B (CPU)": 0, "1.5B (GPU)": 1, "7B (GPU)": 2}.get(x, 99)):
        results = all_results[model_name]
        if not results:
            continue
        avg_time = sum(r["time_seconds"] for r in results) / len(results)
        avg_ttft = sum(r["time_to_first_token"] for r in results) / len(results)
        avg_chars = sum(r["chars"] for r in results) / len(results)
        avg_score = sum(r["quality_score"] for r in results) / len(results)
        valid_pct = sum(1 for r in results if r["syntax_valid"]) / len(results) * 100
        
        print_row([
            model_name,
            f'{avg_time:.1f}s',
            f'{avg_ttft:.2f}s',
            f'{avg_chars:.0f}',
            f'{avg_score:.0f}',
            f'{valid_pct:.0f}%',
        ], agg_widths)
    
    # ── Speedup Analysis ──
    print("\n\n")
    print_separator("━")
    print("  ⚡ SPEEDUP ANALYSIS (vs 7B baseline)")
    print_separator("━")
    
    speed_cols = ["Complexity", "0.5B vs 7B", "1.5B vs 7B", "0.5B vs 1.5B"]
    speed_widths = [14, 14, 14, 14]
    print_row(speed_cols, speed_widths)
    print_row(["-" * w for w in speed_widths], speed_widths)
    
    for complexity in ["simple", "medium", "complex"]:
        seven_b_times = [r["time_seconds"] for model in all_results.get("7B (GPU)", []) 
                         for r in all_results["7B (GPU)"] if r["complexity"] == complexity]
        half_b_times = [r["time_seconds"] for model in all_results.get("0.5B (CPU)", [])
                        for r in all_results.get("0.5B (CPU)", []) if r["complexity"] == complexity]
        one5_b_times = [r["time_seconds"] for model in all_results.get("1.5B (GPU)", [])
                        for r in all_results.get("1.5B (GPU)", []) if r["complexity"] == complexity]
        
        avg_7b = sum(seven_b_times) / len(seven_b_times) if seven_b_times else 0
        avg_05b = sum(half_b_times) / len(half_b_times) if half_b_times else 0
        avg_15b = sum(one5_b_times) / len(one5_b_times) if one5_b_times else 0
        
        speedup_05 = f'{avg_7b / avg_05b:.1f}x faster' if avg_05b > 0 else 'N/A'
        speedup_15 = f'{avg_7b / avg_15b:.1f}x faster' if avg_15b > 0 else 'N/A'
        speedup_05_vs_15 = f'{avg_15b / avg_05b:.1f}x faster' if avg_05b > 0 and avg_15b > 0 else 'N/A'
        
        print_row([complexity, speedup_05, speedup_15, speedup_05_vs_15], speed_widths)
    
    # ── Quality Analysis ──
    print("\n\n")
    print_separator("━")
    print("  🎯 QUALITY ANALYSIS (lower score = issues found)")
    print_separator("━")
    
    qual_cols = ["Model", "Avg Score", "Complex Score Δ", "Issues Found"]
    qual_widths = [16, 12, 18, 30]
    print_row(qual_cols, qual_widths)
    print_row(["-" * w for w in qual_widths], qual_widths)
    
    for model_name in sorted(all_results.keys(), key=lambda x: {"0.5B (CPU)": 0, "1.5B (GPU)": 1, "7B (GPU)": 2}.get(x, 99)):
        results = all_results.get(model_name, [])
        if not results:
            continue
        
        avg_score = sum(r["quality_score"] for r in results) / len(results)
        
        simple_scores = [r["quality_score"] for r in results if r["complexity"] == "simple"]
        complex_scores = [r["quality_score"] for r in results if r["complexity"] == "complex"]
        avg_simple = sum(simple_scores) / len(simple_scores) if simple_scores else 0
        avg_complex = sum(complex_scores) / len(complex_scores) if complex_scores else 0
        score_delta = f'{avg_simple:.0f}→{avg_complex:.0f} ({int(avg_complex - avg_simple):+d})'
        
        all_issues = [i for r in results for i in r["issues"]]
        top_issues = ", ".join(sorted(set(all_issues))[:3])
        
        print_row([model_name, f'{avg_score:.0f}', score_delta, top_issues[:28]], qual_widths)
    
    # ── Recommendations ──
    print("\n\n")
    print_separator("━")
    print("  💡 RECOMMENDATIONS")
    print_separator("━")
    
    # Analyze results to generate recommendations
    if "0.5B (CPU)" in all_results and "1.5B (GPU)" in all_results and "7B (GPU)" in all_results:
        half_b = all_results["0.5B (CPU)"]
        one5_b = all_results["1.5B (GPU)"]
        seven_b = all_results["7B (GPU)"]
        
        simple_half = [r for r in half_b if r["complexity"] == "simple"]
        simple_15 = [r for r in one5_b if r["complexity"] == "simple"]
        complex_7 = [r for r in seven_b if r["complexity"] == "complex"]
        
        avg_time_05_simple = sum(r["time_seconds"] for r in simple_half) / len(simple_half) if simple_half else 999
        avg_time_15_simple = sum(r["time_seconds"] for r in simple_15) / len(simple_15) if simple_15 else 999
        avg_time_7_complex = sum(r["time_seconds"] for r in complex_7) / len(complex_7) if complex_7 else 999
        avg_score_7_complex = sum(r["quality_score"] for r in complex_7) / len(complex_7) if complex_7 else 0
        avg_score_05_simple = sum(r["quality_score"] for r in simple_half) / len(simple_half) if simple_half else 0
        
        print(f"\n  0.5B for config/assets: {avg_time_05_simple:.1f}s avg (score: {avg_score_05_simple:.0f})")
        print(f"  1.5B for simple logic: {avg_time_15_simple:.1f}s avg")
        print(f"  7B for complex logic: {avg_time_7_complex:.1f}s avg (score: {avg_score_7_complex:.0f})")
        
        if avg_time_05_simple < 10 and avg_score_05_simple >= 60:
            print(f"\n  ✅ 0.5B is suitable for config/CSS/simple files")
        else:
            print(f"\n  ⚠️ 0.5B may be too weak for reliable code generation")
        
        total_simple = sum(
            sum(1 for r in all_results.get(m, []) if r["complexity"] == "simple" and r["syntax_valid"])
            for m in ["0.5B (CPU)"]
        )
        total_simple_count = sum(
            sum(1 for r in all_results.get(m, []) if r["complexity"] == "simple")
            for m in ["0.5B (CPU)"]
        )
        if total_simple_count > 0:
            pct = total_simple / total_simple_count * 100
            print(f"  0.5B syntax validity on simple tasks: {pct:.0f}%")
    
    print(f"\n")
    print_separator("=")
    print("  Benchmark complete!")
    print_separator("=")


if __name__ == "__main__":
    main()
