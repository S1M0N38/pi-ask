# @eko24ive/pi-ask

`@eko24ive/pi-ask` is a **pi package** that adds an interactive `ask_user` clarification tool.

It lets an agent pause, ask structured questions in a terminal UI, and continue with normalized answers instead of guessing.

## Install

```bash
pi install npm:@eko24ive/pi-ask
```

You can also install from git:

```bash
pi install git:github.com/eko24ive/pi-ask
```

## Use

After installation, the package registers one tool: `ask_user`.

Use it when the agent needs structured clarification before proceeding.
Use `type: "preview"` when an option needs a dedicated preview pane.

### Example agent instruction

```text
When requirements are ambiguous or user preferences materially affect implementation,
call `ask_user` instead of guessing.

Ask 1-3 concise questions.
Use short tab labels.
Prefer 2-4 options per question.
Include descriptions for each option.
Use `type: "single"` unless multiple options can genuinely apply.
Use `type: "multi"` only when the user may need to select several answers.
Use `type: "preview"` when an option needs a preview panel.
After answers are returned, continue the task using those answers explicitly.
```

## Tool input

`ask_user` accepts:

```ts
{
  title?: string,
  questions: [
    {
      id: string,
      label?: string,
      prompt: string,
      type?: "single" | "multi" | "preview",
      required?: boolean,
      options: [
        {
          value: string,
          label: string,
          description?: string,
          preview?: string
        }
      ]
    }
  ]
}
```

### Example tool call payload

```json
{
  "title": "Implementation preferences",
  "questions": [
    {
      "id": "style",
      "label": "Style",
      "prompt": "How should I frame the next prompt?",
      "type": "single",
      "options": [
        {
          "value": "minimal",
          "label": "Minimal",
          "description": "A short, direct question with few options."
        },
        {
          "value": "balanced",
          "label": "Balanced",
          "description": "A standard prompt with a bit more context."
        },
        {
          "value": "rich",
          "label": "Rich",
          "description": "A more descriptive prompt with extra detail."
        }
      ]
    },
    {
      "id": "frameworks",
      "label": "Frontend",
      "prompt": "Which frontend frameworks have you used?",
      "type": "multi",
      "options": [
        { "value": "react", "label": "React", "description": "Most popular UI library" },
        { "value": "vue", "label": "Vue", "description": "Progressive framework for building UIs" },
        { "value": "svelte", "label": "Svelte", "description": "Compiler-based approach" }
      ]
    }
  ]
}
```

## Features

`ask_user` currently supports:

- tabbed multi-question flow
- single-select questions
- multi-select questions
- preview questions with a dedicated preview pane
- free-form answers via an inline `Type your own` option that turns into an embedded editor when selected
- per-question notes via `Ctrl+N`
- per-option notes via `N`
- full inline rendering of saved notes
- number-key quick selection
- final submit/review page
- transcript rendering for call/result rows

### Result shape notes

The returned `details.answers[questionId]` object may include:

```ts
{
  values: string[]
  labels: string[]
  indices: number[]
  customText?: string
  note?: string
  optionNotes?: Record<string, string>
}
```

Behavior:

- question-level notes are submitted whenever authored
- option notes can be authored for any active option during the UI flow
- only notes for currently selected options are included in the submitted result
- deselecting an option keeps its note in UI state, so re-selecting it restores the note
- empty note text clears the note
- when the free-form option is selected, it becomes an inline input row with the selected-tab background style spanning the full width
- while editing a note or free-form answer, `Up` / `Down` save the draft and move navigation instead of being trapped by the editor
- `Space` toggles the active option on single-select questions too, but does not auto-advance

## Local development

### Run locally in pi

```bash
pi -e ./src/index.ts
```

### Install dependencies

```bash
pnpm install
```

### Development commands

```bash
pnpm format
pnpm lint
pnpm check
pnpm typecheck
pnpm test
```

### Commit workflow

This repo uses `lefthook`, Commitizen, conventional commitlint, and semantic-release.

Recommended flow:

```bash
pnpm commit
```

## Project layout

- `src/` — TypeScript extension implementation
- `tests/` — behavior-focused tests
- `docs/` — small docs set for contract and architecture

## Documentation

Docs stay intentionally small:

- `docs/README.md` — index
- `docs/contract.md` — external behavior
- `docs/architecture.md` — module boundaries and invariants
