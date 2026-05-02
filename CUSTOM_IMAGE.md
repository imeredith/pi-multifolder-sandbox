# Custom Gondolin Image

This extension can use a custom Gondolin guest image instead of Gondolin's default image. Use this when you need a larger root filesystem or extra packages such as Rust, Cargo, Node, Python, or other Alpine packages.

## Build Requirements

On macOS, install the image build tools:

```bash
brew install zig@0.15 lz4 e2fsprogs
```

Docker or Podman may also be required for some custom build options.

## Configure The Image

Edit `build-config.json`. Packages installed into the root filesystem are listed under `alpine.rootfsPackages`.

Example package entries for Rust:

```json
"rootfsPackages": [
  "linux-virt",
  "rng-tools",
  "bash",
  "ca-certificates",
  "curl",
  "nodejs",
  "npm",
  "rust",
  "cargo",
  "uv",
  "python3",
  "openssh"
]
```

The root filesystem size is controlled by `rootfs.sizeMb`:

```json
"rootfs": {
  "label": "gondolin-root",
  "sizeMb": 4096
}
```

Increase `sizeMb` if package installs or workloads run out of disk space.

## Build The Image

From this repository, run:

```bash
npx gondolin build --config build-config.json --output ~/.pi-image.img
```

The output path is an asset directory, not a single disk image file. It contains files such as `manifest.json`, `rootfs.ext4`, `initramfs.cpio.lz4`, and kernel artifacts.

Optional verification:

```bash
npx gondolin build --verify ~/.pi-image.img
```

## Use The Image In This Extension

Set the image path in the extension config file:

```toml
# ~/.config/pi-multifolder-sandbox/config.toml
image = "/Users/ivan/.pi-image.img"
```

The extension also accepts a Gondolin image selector or build ID:

```toml
image = "807272fc-ea12-5693-8123-fedca05f603e"
```

Restart Pi after changing this file. The extension reads the config when it starts the VM.

## Fall Back To The Default Image

To use Gondolin's default image again, remove the `image` line, comment it out, or set it to an empty string:

```toml
image = ""
```

If `image` is unset or blank, the extension does not pass an image override to Gondolin.

## Quick Rebuild Flow

After changing `build-config.json`:

```bash
npx gondolin build --config build-config.json --output ~/.pi-image.img
npx gondolin build --verify ~/.pi-image.img
```

Then restart Pi so the next VM uses the rebuilt assets.
