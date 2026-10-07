# rspack `lazyCompilation` drops `with { type: "json" }` import attributes

With `lazyCompilation: { imports: true }`, a module loaded via

```js
import("./data/a.json", { with: { type: "json" } });
```

is built **as if it had no import attributes**. It matches a `Rule.with: { type: { not: "json" } }` rule
instead of the `Rule.with: { type: "json" }` rule. With lazy compilation disabled, the same code builds without errors.

Versions: `@rsbuild/core` 2.2.12, `@rspack/core` 2.2.8 (latest at the time of writing).

## Reproduce

```sh
npm install
npm run dev           # open http://localhost:3000 -> error overlay + build errors in the terminal
npm run dev:no-lazy   # open http://localhost:3000 -> {"static": {"value":"a"}, "context": {"value":"b"}}
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
import("./data/a.json", { with: { type: "json" } });          // static specifier
import(`./data/${key}.json`, { with: { type: "json" } });     // context module, key = "b"
```

## Expected

Both imports match the `with: { type: "json" }` rule and load the JSON, the same as without `lazyCompilation`.

## Actual

The initial compile succeeds and emits the `!lazy-compilation-proxy` modules. When the proxies are activated, the
rebuild sends the real modules through `plainLoader.cjs`. This happens for both the static import and the context module:

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
`lazy-compilation-proxy|json|.../src/data/a.json`. The import attributes seem to get lost on the dependency from the
lazy-compilation proxy to the original module, so `Rule.with` is evaluated against empty attributes.
