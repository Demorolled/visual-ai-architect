"""toolchains — run VACA's *own* per-language compile gates from Python.

The commands here are the same commands `backend/src/sandbox/nonTsCompileGate.ts`
runs when VACA gates a generated project:

    go      go build ./...
    python  python3 -m py_compile <each file>
    rust    rustc --crate-type lib --emit=metadata <entry>
    c       gcc -fsyntax-only -std=c11 <each file>
    cpp     g++ -fsyntax-only -std=c++17 <each file>
    java    javac -d <classes> <files>
    csharp  dotnet build   (csc fallback)
    swift   swiftc -typecheck <files>
    kotlin  kotlinc <files> -d <out.jar>
    php     php -l <each file>
    ruby    ruby -c <each file>
    js      node --check <each file>
    ts      tsc --noEmit   (VACA's primary gate; lives outside nonTsCompileGate)

Keeping the command list in one place means the exemplar verifier and the model
probe are held to exactly the standard VACA holds generated code to.

An unavailable toolchain is reported as such and is NEVER counted as a pass —
the same rule the gate itself states ("unverified is never clean").
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TSC = REPO_ROOT / "node_modules" / ".bin" / "tsc"

# VACA's GATE_LANGUAGES plus TypeScript (gated by tsc, not by the non-TS gate).
GATED_LANGUAGES = [
    "typescript", "javascript", "python", "go", "rust", "java",
    "csharp", "swift", "kotlin", "php", "ruby", "c", "cpp",
]

# Candidate executables in priority order, mirroring TOOLCHAINS in the gate.
BINS: dict[str, list[str]] = {
    "go": ["go"],
    "python": ["python3", "python"],
    "rust": ["rustc"],
    "c": ["gcc", "clang", "cc"],
    "cpp": ["g++", "clang++", "c++"],
    "java": ["javac"],
    "csharp": ["dotnet", "csc", "mcs"],
    "swift": ["swiftc"],
    "kotlin": ["kotlinc", "kotlinc-jvm"],
    "php": ["php"],
    "ruby": ["ruby"],
    "javascript": ["node", "nodejs"],
    "typescript": [str(TSC)] if TSC.exists() else ["tsc"],
}

INSTALL_HINT = {
    "go": "sudo apt-get install -y golang-go",
    "rust": "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
    "csharp": "sudo apt-get install -y dotnet-sdk-8.0",
    "kotlin": "sudo snap install kotlin --classic",
    "swift": "https://www.swift.org/install/linux/",
    "java": "sudo apt-get install -y openjdk-17-jdk-headless",
    "python": "sudo apt-get install -y python3",
    "c": "sudo apt-get install -y build-essential",
    "cpp": "sudo apt-get install -y build-essential",
    "php": "sudo apt-get install -y php-cli",
    "ruby": "sudo apt-get install -y ruby-full",
    "javascript": "sudo apt-get install -y nodejs",
    "typescript": "npm install (typescript in node_modules)",
}


@dataclass
class CheckResult:
    language: str
    available: bool
    clean: bool
    command: str = ""
    output: str = ""

    def as_dict(self) -> dict:
        return {
            "language": self.language,
            "available": self.available,
            "clean": self.clean,
            "command": self.command,
            "output": self.output[-4000:],
        }


def binary_for(language: str) -> str | None:
    """First executable on PATH for this language, or None when unavailable."""
    for cand in BINS.get(language, []):
        if cand.startswith("/"):
            if Path(cand).exists():
                return cand
        elif shutil.which(cand):
            return cand
    return None


def available(language: str) -> bool:
    return binary_for(language) is not None


def availability() -> dict[str, dict]:
    out = {}
    for lang in GATED_LANGUAGES:
        binpath = binary_for(lang)
        out[lang] = {
            "available": binpath is not None,
            "binary": binpath,
            "install": INSTALL_HINT.get(lang, ""),
        }
    return out


def _run(argv: list[str], cwd: Path, timeout: int = 180) -> tuple[int, str]:
    try:
        p = subprocess.run(
            argv, cwd=str(cwd), capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        return 124, f"TIMEOUT after {timeout}s"
    except FileNotFoundError as exc:
        return 127, f"not found: {exc}"
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def _stage(files: dict[str, str], workdir: Path) -> None:
    for rel, code in files.items():
        dest = workdir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(code, encoding="utf-8")


def _entry_guess(files: dict[str, str], language: str) -> str:
    """Prefer main.* / the file that declares the entry point, else the first."""
    names = list(files)
    preferred = {
        "rust": ("main.rs",),
        "swift": ("main.swift",),
        "kotlin": ("main.kt",),
        "java": tuple(n for n in names if n.endswith(".java")),
        "csharp": ("Program.cs",),
        "go": tuple(n for n in names if n.endswith(".go")),
    }.get(language, ("main.py", "main.ts", "index.ts", "main.mjs", "index.js"))
    for p in preferred:
        if p in files:
            return p
    for n in names:
        if n.lower().startswith("main."):
            return n
    return names[0]


def check(language: str, files: dict[str, str], timeout: int = 180) -> CheckResult:
    """Gate a set of generated files with the real toolchain."""
    if not files:
        return CheckResult(language, available(language), False, "", "no files")

    binpath = binary_for(language)
    if binpath is None:
        return CheckResult(
            language, False, False, "", f"toolchain not installed ({language})"
        )

    with tempfile.TemporaryDirectory(prefix=f"vaca-{language}-") as tmp:
        work = Path(tmp)
        _stage(files, work)
        argv, cwd = _plan(language, binpath, files, work)
        code, out = _run(argv, cwd, timeout=timeout)

    return CheckResult(language, True, code == 0, " ".join(argv), out)


def _plan(language: str, binpath: str, files: dict[str, str], work: Path) -> tuple[list[str], Path]:
    """The exact argv + cwd for one language, mirroring the TS gate."""
    if language == "go":
        # The gate generates a go.mod and builds the whole module.
        name = _go_module_name(work)
        (work / "go.mod").write_text(f"module {name}\n\ngo 1.21\n", encoding="utf-8")
        return [binpath, "build", "./..."], work

    if language == "python":
        return [binpath, "-m", "py_compile", *files.keys()], work

    if language == "rust":
        entry = _entry_guess(files, language)
        return [binpath, "--crate-type", "lib", "--emit=metadata", entry], work

    if language == "c":
        return [binpath, "-fsyntax-only", "-std=c11", *files.keys()], work

    if language == "cpp":
        return [binpath, "-fsyntax-only", "-std=c++17", *files.keys()], work

    if language == "java":
        classes = work / "classes"
        classes.mkdir(exist_ok=True)
        return [binpath, "-d", str(classes), *files.keys()], work

    if language == "csharp":
        if Path(binpath).name.startswith("dotnet"):
            (work / "gate.csproj").write_text(
                '<Project Sdk="Microsoft.NET.Sdk">\n'
                "  <PropertyGroup>\n"
                "    <OutputType>Exe</OutputType>\n"
                "    <TargetFramework>net8.0</TargetFramework>\n"
                "    <Nullable>disable</Nullable>\n"
                "  </PropertyGroup>\n"
                "</Project>\n",
                encoding="utf-8",
            )
            return [binpath, "build", "--nologo", "-v", "quiet"], work
        return [binpath, "-target:library", *files.keys()], work

    if language == "swift":
        # One module: main.swift carries top-level code, so -typecheck only.
        return [binpath, "-typecheck", *files.keys()], work

    if language == "kotlin":
        out_jar = work / "out.jar"
        return [binpath, *files.keys(), "-d", str(out_jar)], work

    if language == "php":
        # php -l takes one file; the dispatcher below handles multiples.
        return [binpath, "-l", files and _entry_guess(files, language)], work

    if language == "ruby":
        return [binpath, "-c", _entry_guess(files, language)], work

    if language == "javascript":
        return [binpath, "--check", _entry_guess(files, language)], work

    if language == "typescript":
        # Generated TS is Node code, so `node:*` and `process` must resolve the
        # way they do in a real project: point tsc at this repo's @types.
        type_roots = REPO_ROOT / "node_modules" / "@types"
        compiler = {
            "target": "es2022",
            "module": "nodenext",
            "moduleResolution": "nodenext",
            "strict": True,
            "noEmit": True,
            "skipLibCheck": True,
        }
        if (type_roots / "node").is_dir():
            compiler["typeRoots"] = [str(type_roots)]
            compiler["types"] = ["node"]
        (work / "tsconfig.json").write_text(
            json.dumps({"compilerOptions": compiler, "include": list(files.keys())}, indent=2),
            encoding="utf-8",
        )
        return [binpath, "--noEmit", "-p", str(work)], work

    raise ValueError(f"no gate plan for language {language!r}")


def _go_module_name(work: Path) -> str:
    import re

    return re.sub(r"[^a-z0-9]+", "-", work.name.lower()).strip("-") or "untitled"


def check_all(files_by_language: dict[str, dict[str, str]]) -> dict[str, CheckResult]:
    return {lang: check(lang, files) for lang, files in files_by_language.items()}


def run_program(language: str, files: dict[str, str], stdin_text: str = "",
                timeout: int = 120) -> tuple[bool, str]:
    """Actually EXECUTE a single-file program and return (ok, stdout|error).

    Compiling is not the same as being right: the exemplars are checked this way
    so a syntactically valid but wrong program cannot pass as ground truth.
    """
    binpath = binary_for(language)
    if binpath is None:
        return False, f"toolchain not installed ({language})"

    with tempfile.TemporaryDirectory(prefix=f"vaca-run-{language}-") as tmp:
        work = Path(tmp)
        _stage(files, work)
        try:
            argv, _ = _runtime_plan(language, binpath, files, work)
        except ValueError as exc:
            return False, str(exc)
        try:
            p = subprocess.run(
                argv, cwd=str(work), input=stdin_text,
                capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return False, f"TIMEOUT after {timeout}s"
        except FileNotFoundError as exc:
            return False, f"not found: {exc}"
    out = (p.stdout or "") + (p.stderr or "")
    return p.returncode == 0, out.strip()


def _runtime_plan(language: str, binpath: str, files: dict[str, str],
                  work: Path) -> tuple[list[str], Path]:
    if language == "python":
        return [binpath, _entry_guess(files, language)], work
    if language == "javascript":
        return [binpath, _entry_guess(files, language)], work
    if language == "php":
        return [binpath, _entry_guess(files, language)], work
    if language == "ruby":
        return [binpath, _entry_guess(files, language)], work
    if language == "c":
        exe = work / "prog"
        cmd = [binpath, "-std=c11", "-O0", "-o", str(exe), *files.keys()]
        p = subprocess.run(cmd, cwd=str(work), capture_output=True, text=True, timeout=180)
        if p.returncode != 0:
            raise ValueError(f"build failed: {(p.stdout + p.stderr)[:400]}")
        return [str(exe)], work
    if language == "cpp":
        exe = work / "prog"
        cmd = [binpath, "-std=c++17", "-O0", "-o", str(exe), *files.keys()]
        p = subprocess.run(cmd, cwd=str(work), capture_output=True, text=True, timeout=180)
        if p.returncode != 0:
            raise ValueError(f"build failed: {(p.stdout + p.stderr)[:400]}")
        return [str(exe)], work
    if language == "java":
        classes = work / "classes"
        classes.mkdir(exist_ok=True)
        p = subprocess.run(
            [binpath, "-d", str(classes), *files.keys()],
            cwd=str(work), capture_output=True, text=True, timeout=180,
        )
        if p.returncode != 0:
            raise ValueError(f"javac failed: {(p.stdout + p.stderr)[:400]}")
        cls = _entry_guess(files, language)[:-5]
        return ["java", "-cp", str(classes), cls], work
    if language == "swift":
        exe = work / "prog"
        p = subprocess.run(
            [binpath, "-o", str(exe), *files.keys()],
            cwd=str(work), capture_output=True, text=True, timeout=240,
        )
        if p.returncode != 0:
            raise ValueError(f"swiftc failed: {(p.stdout + p.stderr)[:400]}")
        return [str(exe)], work
    if language == "typescript":
        # Node 22.6+ strips types, so a generated .ts file runs directly.
        return ["node", _entry_guess(files, language)], work
    if language == "go":
        name = _go_module_name(work)
        (work / "go.mod").write_text(f"module {name}\n\ngo 1.21\n", encoding="utf-8")
        return [binpath, "run", "."], work
    if language == "kotlin":
        raise ValueError(
            "kotlin is compile-verified only on this machine (no `kotlin` launcher)"
        )
    raise ValueError(f"cannot execute {language} on this machine")
