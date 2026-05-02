---
name: pi-cmd
description: Add, remove, or modify explicit host commands in .pi-workspace that Pi may run outside the Gondolin VM/container.
---

# Pi Host Commands

This skill manages the `hostCommands` section of the `.pi-workspace` JSON config file in the current project root. These commands are allowed to run on the host, outside the Gondolin VM/container, while all other bash commands continue to run inside the VM.

## Schema Validation

Before editing `.pi-workspace`, download and use the JSON schema to validate it:

- Raw schema URL: `https://raw.githubusercontent.com/imeredith/pi-multifolder-sandbox/main/pi-workspace.schema.json`

If creating a new `.pi-workspace`, include:

```json
{
  "$schema": "https://raw.githubusercontent.com/imeredith/pi-multifolder-sandbox/main/pi-workspace.schema.json"
}
```

Validate the final JSON against the downloaded schema when possible, and always parse it as JSON after edits.

## Config File

- Location: `.pi-workspace` in the current project root
- Preferred format:
  ```json
  {
    "hostCommands": [
      "docker",
      { "command": "gh auth", "match": "prefix" }
    ]
  }
  ```
- Preserve other top-level `.pi-workspace` keys, such as `mounts`
- `localCommands` and `outsideVmCommands` are accepted aliases, but prefer `hostCommands`

## Match Modes

- `"name"`: match the first shell command word. This is the default for single-word strings like `"docker"`.
- `"prefix"`: match commands that start with the configured prefix. This is the default for multi-word strings like `"gh auth"`.
- `"exact"`: match the full command exactly.

## Operations

### Add Host Commands

```jsonc
// .pi-workspace
{
  "hostCommands": [
    "docker",
    "open",
    { "command": "gh auth", "match": "prefix" },
    { "command": "security find-generic-password", "match": "prefix" }
  ]
}
```

### Remove Host Commands

Delete the relevant entry from `hostCommands`. If it becomes empty, leave it as `[]` or remove the key entirely.

### Change Match Mode

Convert a string entry to an object when an explicit match mode is needed:

```json
{ "command": "docker compose", "match": "prefix" }
```

## Rules

1. Only add commands the user explicitly asks to allow outside the VM/container
2. Prefer narrow entries, for example `"gh auth"` with `"prefix"` instead of all `"gh"` commands
3. Do not add broad shells or interpreters like `bash`, `sh`, `zsh`, `node`, or `python` unless the user explicitly confirms the risk
4. Preserve unrelated `.pi-workspace` fields when editing
5. Validate JSON after editing to avoid parse errors
6. Restart Pi for command routing changes to take effect because `.pi-workspace` is loaded at extension startup
