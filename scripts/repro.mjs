// Headless reproduction: starts the Rsbuild dev server, then does what the browser's
// lazy-compilation client would do when the page runs `import(...)`: POSTs the proxy
// module ids to the lazy-compilation trigger endpoint. Prints the errors of every compile.
//
//   node scripts/repro.mjs           # lazy compilation on  -> errors (bug)
//   NO_LAZY=1 node scripts/repro.mjs # lazy compilation off -> no errors (expected)
import { createRequire } from "node:module";
import { createRsbuild, loadConfig, version as rsbuildVersion } from "@rsbuild/core";

const require = createRequire(import.meta.url);
const rspackVersion = require(require.resolve("@rspack/core/package.json", {
    paths: [require.resolve("@rsbuild/core")],
})).version;
const lazy = !process.env.NO_LAZY;

console.log(`@rsbuild/core ${rsbuildVersion}, @rspack/core ${rspackVersion}, lazyCompilation: ${lazy}\n`);

const { content: config } = await loadConfig({ cwd: process.cwd() });
const rsbuild = await createRsbuild({
    cwd: process.cwd(),
    rsbuildConfig: { ...config, server: { ...config.server, port: 3399, printUrls: false } },
});

let compileCount = 0;
const allErrors = [];
let onCompile = () => {};
rsbuild.onAfterDevCompile(({ stats }) => {
    compileCount++;
    const errors = stats.toJson({ all: false, errors: true }).errors.map((e) => e.message);
    console.log(`compile #${compileCount}: ${errors.length ? `${errors.length} error(s)` : "ok"}`);
    allErrors.push(...errors);
    onCompile();
});
const nextCompile = (ms = 10_000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a compile")), ms);
    onCompile = () => { clearTimeout(timer); resolve(); };
});

const firstCompile = nextCompile();
const { server, port } = await rsbuild.startDevServer();
await firstCompile;

if (lazy) {
    const base = `http://localhost:${port}`;
    const text = async (url) => {
        const res = await fetch(base + url);
        if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
        return res.text();
    };

    // Collect the lazy-compilation proxy chunks referenced by the entry...
    const entry = await text("/static/js/index.js");
    const proxyChunks = [...new Set(entry.match(/[\w-]+_lazy-compilation-proxy(?=")/g))];
    // ...and the module ids + trigger URL each proxy sends via `activate()`.
    let triggerUrl;
    const activeModules = [];
    for (const chunk of proxyChunks) {
        const code = await text(`/static/js/async/${chunk}.js`);
        triggerUrl ??= decodeURIComponent(code.match(/var __resourceQuery = "\?([^"]+)"/)[1]);
        activeModules.push(...[...code.matchAll(/var data = "([^"]+)"/g)].map((m) => m[1]));
    }
    console.log(`\nactivating ${activeModules.length} lazy module(s) via POST ${triggerUrl}:`);
    for (const m of activeModules) console.log(`    ${m}`);
    console.log();

    const lazyCompile = nextCompile();
    const res = await fetch(base + triggerUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: activeModules.join("\n"),
    });
    if (!res.ok) throw new Error(`POST ${triggerUrl} -> ${res.status}`);
    await lazyCompile;
}

await server.close();

const rejected = [...new Set(allErrors.flatMap((e) => e.match(/(?<=PLAIN-JSON-REJECTED )\S+/g) ?? []))];
console.log(rejected.length
    ? `\nBUG REPRODUCED: imported with { type: "json" }, but matched the rule for imports WITHOUT it:\n${rejected.map((r) => `    ${r}`).join("\n")}`
    : allErrors.length
        ? `\nUnexpected errors (see above).`
        : `\nOK: all imports with { type: "json" } matched the \`with: { type: "json" }\` rule.`);
process.exit(allErrors.length ? 1 : 0);
