# Pi Multidirectory Workspace Sandbox

This repository contains a Pi extension that runs the Gondolin VM with
multi-directory workspace mount support for local tools.

## Features

- Loads `.pi-workspace` from the project root to mount additional host directories.
- Keeps the current project mounted at `/workspace` automatically.
- Ships a skill to manage mount settings: `skills/update-workspace`.

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

## `.pi-workspace` format

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

`hostPath` can also be absolute or relative to the project root.
`mountPath` must be absolute POSIX-style (for example `/shared-libs`).

## Scripts and build

This package currently has no custom scripts in `package.json`.
Use the TypeScript compiler directly if you need a quick check:

```bash
tsc
```

## Project files

- `pi-gondolin-workspace.ts` – extension entrypoint
- `.pi-workspace` – mount configuration (create when needed)
- `skills/update-workspace/SKILL.md` – skill guide for managing mounts
