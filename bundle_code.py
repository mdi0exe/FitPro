#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bundle_code.py — every source file of this project in ONE readable text file.

Why: feeding a whole project to another AI (or a reviewer) is painful when the
code is spread across dozens of files. This script walks the repository, skips
build output / dependencies / binaries, and writes a single UTF-8 `.txt` with:

    * a header (project stats, estimated token count)
    * a directory tree of what was included
    * a table of contents with per-file line counts
    * every file, in a language-tagged code fence

Usage
-----
    python bundle_code.py                        # -> project-code-dump.txt
    python bundle_code.py -o review.txt
    python bundle_code.py --root . --max-file-kb 256
    python bundle_code.py --include-lock         # also dump package-lock.json
    python bundle_code.py --list                 # only show what would be included
    python bundle_code.py --stdout               # print instead of writing a file

No third-party dependencies — standard library only.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# --------------------------------------------------------------------------- #
# What to include / skip
# --------------------------------------------------------------------------- #

# Extensions treated as source text.
TEXT_EXTENSIONS: set[str] = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".rs", ".toml", ".json", ".json5", ".jsonc",
    ".css", ".scss", ".html", ".htm", ".svg",
    ".yml", ".yaml", ".md", ".txt",
    ".py", ".sh", ".bat", ".ps1",
    ".sql", ".graphql",
}

# Files without a (useful) extension that still matter.
EXTRA_FILENAMES: set[str] = {
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
    ".npmrc",
    "Dockerfile",
    "Makefile",
    "Procfile",
}

# Never walk into these (build output, dependencies, binaries, editor state).
SKIP_DIRS: set[str] = {
    "node_modules", "dist", "build", "target", "gen",
    ".git", ".hg", ".svn", ".github/cache",
    ".workbuddy-ai", ".idea", ".vscode", "__pycache__",
    ".venv", "venv", "env", ".mypy_cache", ".pytest_cache",
    "shots", "artifacts", "coverage", ".next", ".svelte-kit",
    "android-sdk", "android-dl",
}

# Individual files that are noise for a code review (huge, generated or binary).
SKIP_FILES: set[str] = {
    # Huge, generated, or the bundler itself (which is not part of the app).
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock",
    "bundle_code.py", "project-code-dump.txt",
}

# Extensions we never read, even if they slip through the directory filter.
BINARY_EXTENSIONS: set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".icns",
    ".apk", ".aab", ".jar", ".zip", ".gz", ".tar", ".7z", ".rar",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".so", ".dll", ".dylib", ".exe", ".bin", ".wasm",
    ".mp4", ".mp3", ".pdf", ".lockb",
}

LANG_BY_EXT: dict[str, str] = {
    ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx",
    ".mjs": "js", ".cjs": "js",
    ".rs": "rust", ".toml": "toml",
    ".json": "json", ".json5": "json5", ".jsonc": "jsonc",
    ".css": "css", ".scss": "scss",
    ".html": "html", ".htm": "html", ".svg": "svg",
    ".yml": "yaml", ".yaml": "yaml",
    ".md": "markdown", ".txt": "text",
    ".py": "python", ".sh": "bash", ".bat": "bat", ".ps1": "powershell",
    ".sql": "sql", ".graphql": "graphql",
}

LANG_BY_NAME: dict[str, str] = {
    ".gitignore": "gitignore",
    ".gitattributes": "gitattributes",
    ".editorconfig": "editorconfig",
    ".npmrc": "ini",
    "Dockerfile": "dockerfile",
    "Makefile": "makefile",
    "Cargo.lock": "toml",
    "Procfile": "text",
}

# Files that deserve to be shown first: they explain the project.
PRIORITY_FILES: tuple[str, ...] = ("README.md", "package.json", "src-tauri/Cargo.toml")

SEPARATOR = "=" * 78


# --------------------------------------------------------------------------- #
# Data
# --------------------------------------------------------------------------- #

@dataclass
class SourceFile:
    """One included file with everything the dump needs."""

    rel: str          # posix-style path relative to the project root
    text: str         # decoded content
    lines: int
    size: int         # bytes

    @property
    def language(self) -> str:
        name = self.rel.rsplit("/", 1)[-1]
        if name in LANG_BY_NAME:
            return LANG_BY_NAME[name]
        suffix = Path(name).suffix.lower()
        return LANG_BY_EXT.get(suffix, "")


# --------------------------------------------------------------------------- #
# Collection
# --------------------------------------------------------------------------- #

def should_skip_dir(name: str) -> bool:
    return name in SKIP_DIRS or name.startswith(".tmp")


def is_candidate(path: Path, include_lock: bool) -> bool:
    name = path.name

    if path.suffix.lower() in BINARY_EXTENSIONS:
        return False
    if name in SKIP_FILES:
        if not (include_lock and name in {"package-lock.json", "Cargo.lock"}):
            return False
    if name.startswith(".") and name not in EXTRA_FILENAMES:
        return False

    return path.suffix.lower() in TEXT_EXTENSIONS or name in EXTRA_FILENAMES


def collect(root: Path, include_lock: bool, max_bytes: int) -> tuple[list[SourceFile], list[str]]:
    """Return (included files, notes about skipped files)."""
    files: list[SourceFile] = []
    notes: list[str] = []

    for path in sorted(root.rglob("*"), key=lambda p: str(p).lower()):
        if not path.is_file():
            continue

        rel_parts = path.relative_to(root).parts
        if any(should_skip_dir(part) for part in rel_parts[:-1]):
            continue
        if not is_candidate(path, include_lock):
            continue

        rel = path.relative_to(root).as_posix()
        size = path.stat().st_size

        if size > max_bytes:
            notes.append(f"{rel} — skipped, {size / 1024:.0f} KB > limit")
            continue

        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            notes.append(f"{rel} — skipped, not valid UTF-8")
            continue
        except OSError as error:
            notes.append(f"{rel} — skipped, {error}")
            continue

        if "\x00" in text:
            notes.append(f"{rel} — skipped, looks binary")
            continue

        files.append(
            SourceFile(
                rel=rel,
                text=text if text.endswith("\n") else text + "\n",
                lines=text.count("\n") + (0 if text.endswith("\n") else 1),
                size=size,
            )
        )

    # README / manifests first, then alphabetical.
    def sort_key(item: SourceFile) -> tuple[int, str]:
        if item.rel in PRIORITY_FILES:
            return (PRIORITY_FILES.index(item.rel), item.rel.lower())
        return (len(PRIORITY_FILES), item.rel.lower())

    files.sort(key=sort_key)
    return files, notes


def git_info(root: Path, included: set[str]) -> dict[str, str]:
    """Branch / commit / dirty state, so the dump is traceable to a revision.

    Only files that actually appear in the bundle count as "changed", so
    unrelated local edits do not make the dump look dirty.
    Silently returns `{}` when git is missing or the folder is not a repo.
    """

    def run(*args: str) -> str:
        try:
            result = subprocess.run(
                ["git", "-C", str(root), *args],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            return ""
        return result.stdout.strip() if result.returncode == 0 else ""

    branch = run("rev-parse", "--abbrev-ref", "HEAD")
    if not branch:
        return {}

    commit = run("log", "-1", "--pretty=%h %s")

    dirty: list[str] = []
    for line in run("status", "--porcelain").splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        if " -> " in path:  # renames show as "old -> new"
            path = path.split(" -> ")[-1]
        path = path.strip('"').replace("\\", "/")
        if path in included:
            dirty.append(path)

    info = {"branch": branch, "commit": commit}
    info["state"] = f"{len(dirty)} uncommitted change(s)" if dirty else "clean"
    return info


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

def render_tree(paths: list[str]) -> str:
    """ASCII tree of the included files."""
    tree: dict[str, dict] = {}
    for rel in paths:
        node = tree
        for part in rel.split("/"):
            node = node.setdefault(part, {})

    lines: list[str] = []

    def walk(node: dict[str, dict], prefix: str) -> None:
        entries = sorted(node.items(), key=lambda item: (not item[1], item[0].lower()))
        for index, (name, child) in enumerate(entries):
            last = index == len(entries) - 1
            lines.append(f"{prefix}{'└── ' if last else '├── '}{name}{'/' if child else ''}")
            if child:
                walk(child, prefix + ("    " if last else "│   "))

    walk(tree, "")
    return "\n".join(lines)


def human_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.2f} MB"


def build_bundle(root: Path, files: list[SourceFile], notes: list[str]) -> str:
    total_bytes = sum(item.size for item in files)
    total_lines = sum(item.lines for item in files)
    generated = datetime.now().strftime("%Y-%m-%d %H:%M")

    out: list[str] = []
    add = out.append

    # ---------------------------------------------------------------- header
    add(SEPARATOR)
    add(" PROJECT CODE DUMP")
    add(f" Project : {root.name}")
    add(f" Root    : {root}")
    add(f" Created : {generated}")
    git = git_info(root, {item.rel for item in files})
    if git:
        add(f" Revision: {git['branch']} @ {git['commit']} ({git['state']})")
    add(f" Files   : {len(files)}    Lines: {total_lines:,}    Size: {human_size(total_bytes)}")
    add(f" Tokens  : ~{total_bytes // 4:,} (rough estimate, chars / 4)")
    add(SEPARATOR)
    add("")
    add(" HOW TO READ THIS FILE")
    add(" ---------------------")
    add(" Every file below is introduced by a header line with its relative path")
    add(" and line count, followed by a language-tagged fenced code block.")
    add(" Files are ordered: README/manifests first, then alphabetically.")
    add(" Generated output, dependencies and binaries were excluded.")
    add("")
    add(" PROJECT AT A GLANCE")
    add(" -------------------")
    add(" Tauri v2 (Android + Desktop) fitness tracker.")
    add(" Backend: Rust (src-tauri/src) — models, atomic JSON storage, IPC commands.")
    add(" Frontend: Vite + TypeScript + Tailwind, 100% Persian RTL UI (src/).")
    add(" CI: GitHub Actions (.github/workflows) builds a debug Android APK for")
    add("     armv7 by default (Rust debug symbols stripped) and uploads it as an")
    add("     artifact. It rasterises src-tauri/icons/icon.svg into every mipmap.")
    add(" Assets: public/sounds/*.mp3 are studio alerts bundled offline into the")
    add("     APK; src/lib/timer.ts plays them via Web Audio (no synthesis).")
    add(" Native: tauri-plugin-notification posts water/rest alerts to the Android")
    add("     status bar (src/lib/notify.ts, channel fitpro-alerts, High).")
    add(" Calendar: activityHistory snapshots (DailyActivity) drive a Sat-Fri week")
    add("     view in src/components/weeklyActivity.ts, shown on two tabs.")
    add("")

    # ------------------------------------------------------------------ tree
    add(" DIRECTORY TREE (included files only)")
    add(" ------------------------------------")
    for line in render_tree([item.rel for item in files]).splitlines():
        add(" " + line)
    add("")

    # ------------------------------------------------------------------- toc
    add(" TABLE OF CONTENTS")
    add(" -----------------")
    width = max((len(item.rel) for item in files), default=10)
    width = min(width, 62)
    for index, item in enumerate(files, start=1):
        dots = "." * max(3, width - len(item.rel) + 3)
        add(f" {index:>2}. {item.rel} {dots} {item.lines:>4} lines")
    add("")

    if notes:
        add(" SKIPPED")
        add(" -------")
        for note in notes:
            add(f" - {note}")
        add("")

    # --------------------------------------------------------------- content
    for index, item in enumerate(files, start=1):
        add(SEPARATOR)
        add(f" FILE {index}/{len(files)}: {item.rel}")
        add(f" {item.lines} lines · {human_size(item.size)}")
        add(SEPARATOR)
        # Use a longer fence when the file itself contains ``` (e.g. README),
        # so the outer block never closes early.
        ticks = "````" if "```" in item.text else "```"
        add(f"{ticks}{item.language}")
        add(item.text.rstrip("\n"))
        add(ticks)
        add("")

    add(SEPARATOR)
    add(" END OF DUMP")
    add(SEPARATOR)

    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bundle every source file of this project into one .txt file.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("-r", "--root", default=None, help="project root (default: script directory)")
    parser.add_argument("-o", "--output", default="project-code-dump.txt", help="output file")
    parser.add_argument("--max-file-kb", type=int, default=512, help="skip files bigger than this")
    parser.add_argument("--include-lock", action="store_true", help="also include package-lock.json")
    parser.add_argument("--list", action="store_true", help="list files without writing anything")
    parser.add_argument("--stdout", action="store_true", help="print the bundle instead of writing it")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent

    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 1

    files, notes = collect(root, args.include_lock, args.max_file_kb * 1024)
    if not files:
        print("error: nothing to bundle — check --root and the skip lists", file=sys.stderr)
        return 1

    if args.list:
        for item in files:
            print(f"{item.lines:>6}  {human_size(item.size):>9}  {item.rel}")
        print(f"\n{len(files)} files, {sum(i.lines for i in files):,} lines")
        return 0

    bundle = build_bundle(root, files, notes)

    if args.stdout:
        sys.stdout.write(bundle)
        return 0

    output = Path(args.output)
    if not output.is_absolute():
        output = root / output
    output.write_text(bundle, encoding="utf-8", newline="\n")

    print(f"wrote {output}")
    print(f"  {len(files)} files · {sum(i.lines for i in files):,} lines · {human_size(len(bundle.encode('utf-8')))}")
    if notes:
        print(f"  {len(notes)} file(s) skipped (see the SKIPPED section in the dump)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
