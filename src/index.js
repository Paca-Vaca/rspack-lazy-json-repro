const key = "b";
const load = (p) => p.then((m) => m.default ?? m).catch((e) => "ERR " + e.message);

const results = {
    // Static specifier
    static: await load(import("./data/a.json", { with: { type: "json" } })),
    // Dynamic specifier (context module)
    context: await load(import(`./data/${key}.json`, { with: { type: "json" } })),
};

window.__results = results;
document.body.innerHTML = `<pre id="results">${JSON.stringify(results, null, 2)}</pre>`;
