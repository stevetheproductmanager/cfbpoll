---
name: efficient-code
description: "Enforces token-efficient coding practices. Use this skill for ALL coding tasks: fixing bugs, implementing features, reviewing code, refactoring, debugging, answering code questions, or making any code change. Triggers on any request involving code in this project — even if the user doesn't mention efficiency. This is a behavioral constraint skill, not an optional tool."
---

# Efficient Coding

You are optimizing for high-quality code output with minimal token expenditure. Every tool call costs tokens and time. Before each tool call, ask: "Do I already have this information?" If yes, skip it.

## Core Rules

### Verify by reading code, not by viewing UI
Never open a browser, take screenshots, start dev servers, or use preview tools to verify code changes. The code is the source of truth. Read the edited code to confirm correctness, then report done. The user will test in the browser themselves.

### Read files surgically
- Never re-read a file already in your context window.
- When you know which lines matter, use `offset` and `limit` to read only that section.
- Never read an entire large file when you need one function or component.

### Go direct — no exploratory wandering
When the task names or implies specific files, go straight to them. Don't glob/grep the whole codebase "just to be sure" when you already know where the code lives. If you've worked in this codebase before, trust your knowledge of the structure.

### Skip ceremonial git commands
Don't run `git status`, `git log`, or `git diff` unless you're about to commit or the user asked for git information. These calls burn tokens for information you don't need.

### Act, don't narrate
Make edits directly. Don't write a paragraph explaining what you're about to do and then do it. The edit speaks for itself. One sentence of context before acting is the max.

### Minimize tool calls
- Batch independent reads/greps into parallel calls.
- Don't grep for something and then grep for a related thing in a second call — do both at once.
- Don't glob to find a file, then read it, when you can read it directly (if you know the path).
- One round of reading is enough. Don't make a second pass "to make sure."

### Code review: one pass, done
When reviewing code, read the diff or changed files once. Produce your findings. Don't re-read files, don't do multi-pass analysis, don't grep for usage patterns of every changed function. Focus on: correctness bugs, logic errors, security issues. Skip style nitpicks.

### No unnecessary comments in code
Don't add comments that describe what code does — the code does that. Only comment when the WHY would surprise a future reader: a workaround, a non-obvious constraint, a subtle invariant.

### Concise reporting
- Status updates: 1 sentence.
- Task completion: 1-3 sentences covering what changed and any important notes.
- No summaries of what you read. No restating the user's request back to them.
- No bullet-point recaps of your own edits — the user can see the diff.

## Anti-Patterns to Avoid

These are specific behaviors that waste tokens. Do not do them:

1. **Screenshot loops** — Taking a screenshot, seeing a CSS issue, taking another screenshot, tweaking, screenshotting again. Never start this loop.
2. **Exploratory grepping** — Running 5+ greps to "understand the codebase" before making a one-line fix.
3. **Re-reading after editing** — The Edit tool confirms success. Don't read the file again to verify.
4. **Reading package.json, config files, etc.** when the task doesn't involve them.
5. **Running the dev server** to check if a React component renders. Trust the JSX.
6. **Multiple git commands** before a simple edit. You don't need the commit history to fix a bug.
7. **Describing your plan** in 3 paragraphs before executing a 2-line change.

## Decision Framework

Before each tool call, run this check:

- **Do I already have this info?** → Skip the call.
- **Can I combine this with another call?** → Batch them.
- **Is this call necessary for the edit, or just for my comfort?** → If comfort, skip.
- **Am I about to read a whole file for one function?** → Use offset/limit.
- **Am I about to open a browser?** → Stop. Read the code instead.
