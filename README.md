# rspack `lazyCompilation` drops `with { type: "json" }` import attributes

With `lazyCompilation: { imports: true }`, a module loaded via

```js
import("./strings/ar.json", { with: { type: "json" } });
```

is built **as if it had no import attributes**. It matches a `Rule.with: { type: { not: "json" } }` rule
instead of the `Rule.with: { type: "json" }` rule. With lazy compilation disabled, the same code builds without errors.

Versions: `@rsbuild/core` 2.2.12, `@rspack/core` 2.2.8 (latest at the time of writing).

## Reproduce

```sh
npm install
npm run repro              # headless: exits 1, "BUG REPRODUCED"
NO_LAZY=1 npm run repro    # control: lazy compilation off, exits 0
```

`scripts/repro.mjs` starts the Rsbuild dev server. It then does what the browser's lazy-compilation client does when the page
runs the dynamic imports: it POSTs the proxy module ids to `/_rspack/lazy/trigger`. Then it prints the errors of the resulting compile.

Or in a browser:

```sh
npm run dev           # open http://localhost:3000 -> error overlay + build errors in the terminal
npm run dev:no-lazy   # open http://localhost:3000 -> {"static": {"hello":"ar"}, "context": {"hello":"ar"}}
```

## Setup

[`rsbuild.config.mjs`](./rsbuild.config.mjs) routes `.json` modules by import attributes:

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

[`plainLoader.cjs`](./plainLoader.cjs) emits a `PLAIN-JSON-REJECTED <resource>` error. It should never run, because every
import in [`src/index.js`](./src/index.js) has `with { type: "json" }`:

```js
import("./strings/ar.json", { with: { type: "json" } });            // static specifier
import(`./strings/${locale}.json`, { with: { type: "json" } });     // context module
```

## Expected

Both imports match the `with: { type: "json" }` rule and load the JSON, the same as without `lazyCompilation`.

## Actual

The initial compile succeeds and emits the `!lazy-compilation-proxy` modules. When the proxies are activated, the
rebuild sends the real modules through `plainLoader.cjs`. This happens for both the static import and the context module:

```
start   build started...
error   Build errors:
File: ./src/strings/ar.json:1:1
  × Module Error (from .../plainLoader.cjs):
  │ PLAIN-JSON-REJECTED .../src/strings/ar.json
Import traces (entry → error):
  ./src/index.js
  ./src/strings/ar.json ×

File: ./src/strings/en.json:1:1
  × Module Error (from .../plainLoader.cjs):
  │ PLAIN-JSON-REJECTED .../src/strings/en.json
Import traces (entry → error):
  ./src/index.js
  ./src/strings|lazy|/^\.\/.*\.json$/|groupOptions: {}|strict namespace object|importAttributes: {"type":"json"}|importPhase: evaluation
  ./src/strings/en.json ×
```

The context module still carries `importAttributes: {"type":"json"}`, and the proxy id is
`lazy-compilation-proxy|json|.../src/strings/ar.json`. The import attributes seem to get lost on the dependency from the
lazy-compilation proxy to the original module, so `Rule.with` is evaluated against empty attributes.
