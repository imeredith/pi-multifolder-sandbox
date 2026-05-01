---
name: update-workspace
description: Add, remove, or modify mounted directories in the Gondolin VM workspace configuration (.pi-workspace). Use when asked to mount additional host directories into the sandbox VM.
---

# Update Workspace Mounts

This skill manages the `.pi-workspace` JSON config file in the current project root. That file controls which host directories are mounted into the Gondolin micro-VM.

## Config File

- Location: `.pi-workspace` in the current project root
- Preferred format:
  ```json
  {
    "mounts": [
      {
        "hostPath": "~/personal/other-project",
        "mountPath": "/other-project"
      }
    ]
  }
  ```
- `hostPath` can be absolute, start with `~/`, or be relative to the project root
- `mountPath` is the guest-side POSIX mount path, for example `/other-project` or `/shared-libs`
- Object map format is also supported: `{ "mounts": { "~/personal/other-project": "/other-project" } }`
- The project root is always mounted automatically at `/workspace`

## Operations

### Add A Mount

```jsonc
// .pi-workspace
{
  "mounts": [
    { "hostPath": "~/personal/other-project", "mountPath": "/other-project" },
    { "hostPath": "../shared-libs", "mountPath": "/shared-libs" }
  ]
}
```

### Remove A Mount

Delete the entry from `mounts`. If `mounts` becomes empty, leave it as `[]` or remove the key entirely.

### Rename A Mount Path

Update the value, which is the guest path, for an existing host path key.

## Rules

1. Host paths that are not absolute are resolved relative to the project root at runtime
2. Guest paths must be absolute POSIX paths starting with `/`
3. Do not add `/workspace` as a mount because it is always present automatically
4. Validate JSON after editing to avoid parse errors
5. Restart Pi for mount changes to take effect because the VM is created at session startup
