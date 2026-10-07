<!--
Rsbuild bug report: https://github.com/web-infra-dev/rsbuild/issues/new?template=bug-report.en-US.yml
Paste each section below into the matching field of the form.
-->

# Title

[Bug]: `dev.lazyCompilation` drops `with { type: "json" }` import attributes, so `Rule.with` matches the wrong rule

# Version

```sh
  System:
    OS: macOS 26.5.2
    CPU: (14) arm64 Apple M4 Pro
    Memory: 180.34 MB / 48.00 GB
    Shell: 5.9 - /bin/zsh
  Browsers:
    Chrome: 155.0.8059.39
    Firefox: 157.0
    Safari: 26.5.2
  npmPackages:
    @rsbuild/core: 2.2.12 => 2.2.12
```

`@rspack/core` 2.2.8 (bundled with `@rsbuild/core` 2.2.12).

# Details

With `dev.lazyCompilation: { imports: true }`, a module loaded via

```js
import("./data/a.json", { with: { type: "json" } });
```

is built as if it had no import attributes. It matches a `Rule.with: { type: { not: "json" } }` rule instead of the
`Rule.with: { type: "json" }` rule. With lazy compilation disabled, the same code builds without errors.

Config:

```js
dev: { lazyCompilation: { imports: true, entries: false } },
tools: {
    rspack: (config) => {
        config.module.rules = [{
            oneOf: [
                { with: { type: "json" }, type: "json" },
                { test: /\.json$/, with: { type: { not: "json" } }, use: ["./plainLoader.cjs"] },
            ],
        }];
    },
},
```

`plainLoader.cjs` emits a `PLAIN-JSON-REJECTED <resource>` error, so it should never run: every import in `src/index.js`
has `with { type: "json" }`. Both a static specifier and a context module are affected:

```js
import("./data/a.json", { with: { type: "json" } });          // static specifier
import(`./data/${key}.json`, { with: { type: "json" } });     // context module, key = "b"
```

**Expected:** both imports match the `with: { type: "json" }` rule and load the JSON, the same as without `lazyCompilation`.

**Actual:** the initial compile succeeds and emits the `!lazy-compilation-proxy` modules. When the proxies are activated,
the rebuild sends the real modules through `plainLoader.cjs`:

```
start   build started...
error   Build errors:
File: ./src/data/a.json:1:1
  × Module Error (from .../plainLoader.cjs):
  │ PLAIN-JSON-REJECTED .../src/data/a.json
Import traces (entry → error):
  ./src/index.js
  ./src/data/a.json ×

File: ./src/data/b.json:1:1
  × Module Error (from .../plainLoader.cjs):
  │ PLAIN-JSON-REJECTED .../src/data/b.json
Import traces (entry → error):
  ./src/index.js
  ./src/data|lazy|/^\.\/.*\.json$/|groupOptions: {}|strict namespace object|importAttributes: {"type":"json"}|importPhase: evaluation
  ./src/data/b.json ×
```

The context module still carries `importAttributes: {"type":"json"}`, and the proxy id is
`lazy-compilation-proxy|json|.../src/data/a.json`. So the attributes seem to get lost on the dependency from the
lazy-compilation proxy to the original module, and `Rule.with` is evaluated against empty attributes. This may belong
in Rspack; feel free to transfer.

# Reproduce link

https://github.com/Paca-Vaca/rspack-lazy-json-repro

# Reproduce Steps

1. `npm install`
2. `npm run dev` and open http://localhost:3000: error overlay, and the build errors above in the terminal.
3. Control: `npm run dev:no-lazy` and open http://localhost:3000: `{"static": {"value":"a"}, "context": {"value":"b"}}`.
