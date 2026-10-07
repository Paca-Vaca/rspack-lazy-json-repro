import path from "node:path";
import { defineConfig } from "@rsbuild/core";

// `NO_LAZY=1 rsbuild dev` disables lazy compilation (the control case).
const lazy = !process.env.NO_LAZY;

export default defineConfig({
    source: { entry: { index: "./src/index.js" } },
    dev: {
        lazyCompilation: lazy ? { imports: true, entries: false } : false,
    },
    tools: {
        rspack: (config) => {
            // Rules depend on the import attributes of the request:
            //   import("./x.json", { with: { type: "json" } }) -> parsed as JSON
            //   import("./x.json")                             -> plainLoader, which reports an error
            config.module.rules = [{
                oneOf: [
                    { with: { type: "json" }, type: "json" },
                    {
                        test: /\.json$/,
                        with: { type: { not: "json" } },
                        use: [{ loader: path.resolve(import.meta.dirname, "plainLoader.cjs") }],
                    },
                ],
            }];
        },
    },
});
