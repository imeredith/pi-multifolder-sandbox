/**
 * Pi + Gondolin Sandbox with multi-workspace mount support
 *
 * Reads a `.pi-workspace` file from the project root and mounts additional
 * host directories into the VM alongside the default `/workspace` mount.
 *
 * `.pi-workspace` format (JSON):
 *   {
 *     "mounts": [
 *       { "hostPath": "~/personal/other-project", "mountPath": "/other-project" },
 *       { "hostPath": "/home/user/shared-libs", "mountPath": "/shared-libs" }
 *     ]
 *   }
 *
 * `mounts` may also be an object map of host paths to guest mount paths.
 * The default `/workspace` mount (project root) is always added.
 *
 * How to run:
 *   pi -e /absolute/path/to/pi-gondolin-workspace.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  type BashOperations,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type EditOperations,
  type ReadOperations,
  type WriteOperations,
} from "@mariozechner/pi-coding-agent";

import { RealFSProvider, VM } from "@earendil-works/gondolin";

const GUEST_WORKSPACE = "/workspace";
const CONFIG_FILE = ".pi-workspace";

interface PiWorkspaceConfig {
  mounts: WorkspaceMount[];
}

interface WorkspaceMount {
  hostPath: string;
  mountPath: string;
}

function loadConfig(localCwd: string): PiWorkspaceConfig {
  const configPath = path.join(localCwd, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return { mounts: [] };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return normalizeConfig(JSON.parse(raw), configPath);
  } catch (err) {
    throw new Error(`Failed to load ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function normalizeConfig(value: unknown, configPath: string): PiWorkspaceConfig {
  if (!value || typeof value !== "object") {
    throw new Error("config must be a JSON object");
  }

  const rawMounts = (value as { mounts?: unknown }).mounts;
  if (rawMounts === undefined) return { mounts: [] };

  if (Array.isArray(rawMounts)) {
    return {
      mounts: rawMounts.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          throw new Error(`mounts[${index}] must be an object`);
        }
        const mount = entry as { hostPath?: unknown; mountPath?: unknown; guestPath?: unknown };
        const mountPath = mount.mountPath ?? mount.guestPath;
        if (typeof mount.hostPath !== "string" || mount.hostPath.length === 0) {
          throw new Error(`mounts[${index}].hostPath must be a non-empty string`);
        }
        if (typeof mountPath !== "string" || mountPath.length === 0) {
          throw new Error(`mounts[${index}].mountPath must be a non-empty string`);
        }
        return validateMount({ hostPath: mount.hostPath, mountPath }, configPath);
      }),
    };
  }

  if (typeof rawMounts === "object" && rawMounts !== null) {
    return {
      mounts: Object.entries(rawMounts as Record<string, unknown>).map(([hostPath, mountPath]) => {
        if (typeof mountPath !== "string" || mountPath.length === 0) {
          throw new Error(`mount path for ${hostPath} must be a non-empty string`);
        }
        return validateMount({ hostPath, mountPath }, configPath);
      }),
    };
  }

  throw new Error("mounts must be either an object map or an array");
}

function validateMount(mount: WorkspaceMount, configPath: string): WorkspaceMount {
  if (!mount.mountPath.startsWith("/")) {
    throw new Error(`${configPath}: mountPath must be absolute: ${mount.mountPath}`);
  }
  if (mount.mountPath === GUEST_WORKSPACE) {
    throw new Error(`${configPath}: do not configure ${GUEST_WORKSPACE}; it is mounted automatically`);
  }
  return mount;
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function resolveHostPath(localCwd: string, hostPath: string): string {
  return path.resolve(localCwd, expandHome(hostPath));
}

function shQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

type PathMapper = (localPath: string) => string;

function buildPathMappers(
  localCwd: string,
  config: PiWorkspaceConfig,
): PathMapper[] {
  // Default workspace mapper (handles CWD -> /workspace)
  const cwdMapper = (localPath: string): string => {
    const rel = path.relative(localCwd, localPath);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      const posixRel = rel.split(path.sep).join(path.posix.sep);
      return posixRel === "" ? GUEST_WORKSPACE : path.posix.join(GUEST_WORKSPACE, posixRel);
    }
    return ""; // not under cwd
  };

  // Extra mount mappers
  const extraMappers: PathMapper[] = [];
  for (const { hostPath, mountPath } of config.mounts) {
    const resolvedHost = resolveHostPath(localCwd, hostPath);
    const resolvedWithSep = resolvedHost.endsWith(path.sep) ? resolvedHost : resolvedHost + path.sep;
    extraMappers.push((localPath: string) => {
      if (localPath === resolvedHost || localPath.startsWith(resolvedWithSep)) {
        const rel = path.relative(resolvedHost, localPath);
        const posixRel = rel.split(path.sep).join(path.posix.sep);
        return posixRel === "" ? mountPath : path.posix.join(mountPath, posixRel);
      }
      return "";
    });
  }

  return [cwdMapper, ...extraMappers];
}

function toGuestPath(mappers: PathMapper[], localPath: string): string {
  for (const mapper of mappers) {
    const result = mapper(localPath);
    if (result !== "") return result;
  }
  throw new Error(`path not in any mounted workspace: ${localPath}`);
}

function createGondolinReadOps(vm: VM, mappers: PathMapper[]): ReadOperations {
  return {
    readFile: async (p) => {
      const guestPath = toGuestPath(mappers, p);
      const r = await vm.exec(["/bin/cat", guestPath]);
      if (!r.ok) {
        throw new Error(`cat failed (${r.exitCode}): ${r.stderr}`);
      }
      return r.stdoutBuffer;
    },
    access: async (p) => {
      const guestPath = toGuestPath(mappers, p);
      const r = await vm.exec([
        "/bin/sh",
        "-lc",
        `test -r ${shQuote(guestPath)}`,
      ]);
      if (!r.ok) {
        throw new Error(`not readable: ${p}`);
      }
    },
    detectImageMimeType: async (p) => {
      const guestPath = toGuestPath(mappers, p);
      try {
        const r = await vm.exec([
          "/bin/sh",
          "-lc",
          `file --mime-type -b ${shQuote(guestPath)}`,
        ]);
        if (!r.ok) return null;
        const m = r.stdout.trim();
        return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
          m,
        )
          ? m
          : null;
      } catch {
        return null;
      }
    },
  };
}

function createGondolinWriteOps(vm: VM, mappers: PathMapper[]): WriteOperations {
  return {
    writeFile: async (p, content) => {
      const guestPath = toGuestPath(mappers, p);
      const dir = path.posix.dirname(guestPath);

      const b64 = Buffer.from(content, "utf8").toString("base64");
      const script = [
        `set -eu`,
        `mkdir -p ${shQuote(dir)}`,
        `echo ${shQuote(b64)} | base64 -d > ${shQuote(guestPath)}`,
      ].join("\n");

      const r = await vm.exec(["/bin/sh", "-lc", script]);
      if (!r.ok) {
        throw new Error(`write failed (${r.exitCode}): ${r.stderr}`);
      }
    },
    mkdir: async (dir) => {
      const guestDir = toGuestPath(mappers, dir);
      const r = await vm.exec(["/bin/mkdir", "-p", guestDir]);
      if (!r.ok) {
        throw new Error(`mkdir failed (${r.exitCode}): ${r.stderr}`);
      }
    },
  };
}

function createGondolinEditOps(vm: VM, mappers: PathMapper[]): EditOperations {
  const r = createGondolinReadOps(vm, mappers);
  const w = createGondolinWriteOps(vm, mappers);
  return { readFile: r.readFile, access: r.access, writeFile: w.writeFile };
}

function sanitizeEnv(
  env?: NodeJS.ProcessEnv,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function createGondolinBashOps(vm: VM, localCwd: string, mappers: PathMapper[]): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      const guestCwd = toGuestPath(mappers, cwd);

      const ac = new AbortController();
      const onAbort = () => ac.abort();
      signal?.addEventListener("abort", onAbort, { once: true });

      let timedOut = false;
      const timer =
        timeout && timeout > 0
          ? setTimeout(() => {
              timedOut = true;
              ac.abort();
            }, timeout * 1000)
          : undefined;

      try {
        const proc = vm.exec(["/bin/bash", "-lc", command], {
          cwd: guestCwd,
          signal: ac.signal,
          env: sanitizeEnv(env),
          stdout: "pipe",
          stderr: "pipe",
        });

        for await (const chunk of proc.output()) {
          onData(chunk.data);
        }

        const r = await proc;
        return { exitCode: r.exitCode };
      } catch (err) {
        if (signal?.aborted) throw new Error("aborted");
        if (timedOut) throw new Error(`timeout:${timeout}`);
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

export default function (pi: ExtensionAPI) {
  const localCwd = process.cwd();
  const config = loadConfig(localCwd);
  const mappers = buildPathMappers(localCwd, config);

  const localRead = createReadTool(localCwd);
  const localWrite = createWriteTool(localCwd);
  const localEdit = createEditTool(localCwd);
  const localBash = createBashTool(localCwd);

  let vm: VM | null = null;
  let vmStarting: Promise<VM> | null = null;

  async function ensureVm(ctx?: ExtensionContext) {
    if (vm) return vm;
    if (vmStarting) return vmStarting;

    vmStarting = (async () => {
      const mountList = [`${GUEST_WORKSPACE} <- ${localCwd}`];
      for (const { hostPath, mountPath } of config.mounts) {
        mountList.push(`${mountPath} <- ${resolveHostPath(localCwd, hostPath)}`);
      }

      ctx?.ui.setStatus(
        "gondolin",
        ctx.ui.theme.fg("accent", `Gondolin: starting (${mountList.join(", ")})`),
      );

      const mounts: Record<string, RealFSProvider> = {
        [GUEST_WORKSPACE]: new RealFSProvider(localCwd),
      };
      for (const { hostPath, mountPath } of config.mounts) {
        const resolvedHost = resolveHostPath(localCwd, hostPath);
        mounts[mountPath] = new RealFSProvider(resolvedHost);
      }

      const created = await VM.create({
        vfs: { mounts },
      });

      vm = created;
      ctx?.ui.setStatus(
        "gondolin",
        ctx.ui.theme.fg("accent", `Gondolin: running`),
      );
      ctx?.ui.notify(
        `Gondolin VM ready. Mounts: ${mountList.join(", ")}`,
        "info",
      );
      return created;
    })();

    return vmStarting;
  }

  pi.on("session_start", async (_event, ctx) => {
    await ensureVm(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!vm) return;
    ctx.ui.setStatus(
      "gondolin",
      ctx.ui.theme.fg("muted", "Gondolin: stopping"),
    );
    try {
      await vm.close();
    } finally {
      vm = null;
      vmStarting = null;
    }
  });

  pi.registerTool({
    ...localRead,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createReadTool(localCwd, {
        operations: createGondolinReadOps(activeVm, mappers),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localWrite,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createWriteTool(localCwd, {
        operations: createGondolinWriteOps(activeVm, mappers),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localEdit,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createEditTool(localCwd, {
        operations: createGondolinEditOps(activeVm, mappers),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localBash,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createBashTool(localCwd, {
        operations: createGondolinBashOps(activeVm, localCwd, mappers),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.on("user_bash", (_event, ctx) => {
    if (!vm) return;
    return { operations: createGondolinBashOps(vm, localCwd, mappers) };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    await ensureVm(ctx);
    const mounts = [`/workspace (mounted from ${localCwd})`];
    for (const { hostPath, mountPath } of config.mounts) {
      const resolvedHost = resolveHostPath(localCwd, hostPath);
      mounts.push(`${mountPath} (mounted from ${resolvedHost})`);
    }
    const mountInfo = mounts.join("\n- ");

    const modified = event.systemPrompt.replace(
      `Current working directory: ${localCwd}`,
      `Current working directory: /workspace (Gondolin VM)\n\nMounted directories:\n- ${mountInfo}`,
    );
    return { systemPrompt: modified };
  });
}
