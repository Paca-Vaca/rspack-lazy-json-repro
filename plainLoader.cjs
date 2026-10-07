// Only reached when a `.json` request has NO `with { type: "json" }` import attribute.
// In this repro every import has the attribute, so this loader must never run.
module.exports = function () {
    this.emitError(new Error("PLAIN-JSON-REJECTED " + this.resource));
    return "export default 'PLAIN-REJECTED'";
};
