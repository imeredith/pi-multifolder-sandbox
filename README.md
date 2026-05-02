# Pi Multidirectory Workspace Sandbox

This repository contains a Pi extension that runs the Gondolin VM with
multi-directory workspace mount support for local tools.

## Features

- Loads `.pi-workspace` from the project root to mount additional host directories.
- Keeps the current project mounted at `/workspace` automatically.
- Ships skills to manage mount settings and host command allow-lists: `skills/pi-workpace` and `skills/pi-cmd`.

## Install

Install locally for development:

```bash
npm install
```

Install globally from GitHub:

```bash
npm install -g git+https://github.com/imeredith/pi-multifolder-sandbox.git
```

## Configure in global Pi config

After installing globally, register the package in your global Pi config file.
On most systems this is `~/.pi/config.json`.

```json
{
  "extensions": ["pi-multifolder-sandbox"],
  "skills": ["pi-multifolder-sandbox"]
}
```

If your config file already contains existing entries, merge `pi-multifolder-sandbox`
into your current `extensions` and `skills` arrays.

Use your package/repo name as published in `package.json` if you rename it later.

## Run

Start Pi with this extension file:

```bash
pi -e /absolute/path/to/pi-gondolin-workspace.ts
```

## Custom Gondolin image

See `CUSTOM_IMAGE.md` for building and selecting a custom Gondolin image with a larger root filesystem or extra packages.

## `.pi-workspace` format

Schema: `https://raw.githubusercontent.com/imeredith/pi-multifolder-sandbox/main/pi-workspace.schema.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/imeredith/pi-multifolder-sandbox/main/pi-workspace.schema.json",
  "mounts": [
    {
      "hostPath": "~/personal/other-project",
      "mountPath": "/other-project"
    }
  ],
  "hostCommands": [
    "docker",
    { "command": "gh auth", "match": "prefix" }
  ]
}
```

`hostPath` can also be absolute or relative to the project root.
`mountPath` must be absolute POSIX-style (for example `/shared-libs`).

`hostCommands` lists explicit commands that are allowed to run on the host outside the Gondolin VM/container. All other bash commands run inside the VM.

## Example workspace configs

Example `.pi-workspace` files are available in `examples/workspaces/`:

- `basic-mounts.json` – mount additional host directories into the VM
- `host-commands.json` – allow selected commands to run on the host
- `full.json` – mounts plus host command routing
- `object-map-mounts.json` – legacy object-map mount format

Copy one to `.pi-workspace` and adjust paths/commands for your project.

## Scripts and build

Run tests, including schema validation for all workspace examples:

```bash
npm test
```

Use the TypeScript compiler directly if you need a quick check:

```bash
tsc
```

## Project files

- `pi-gondolin-workspace.ts` – extension entrypoint
- `.pi-workspace` – mount and host command configuration (create when needed)
- `pi-workspace.schema.json` – JSON schema for `.pi-workspace`
- `examples/workspaces/*.json` – sample `.pi-workspace` configurations
- `tests/pi-workspace-schema.test.mjs` – schema/example validation tests
- `skills/pi-workpace/SKILL.md` – skill guide for managing mounts
- `skills/pi-cmd/SKILL.md` – skill guide for managing host-side command allow-lists
