/* Validates every record (schema, references, sources). Exit code 1 on errors — run in CI. */
import { getAll, getIssues, statusCounts } from "../lib/content/repository";

const issues = getIssues();
const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");
for (const i of errors) console.error(`ERROR   ${i.recordId}: ${i.message}`);
for (const i of warnings) console.warn(`warning ${i.recordId}: ${i.message}`);
console.log(`\n${getAll().length} records · ${errors.length} errors · ${warnings.length} warnings`);
console.log("status:", statusCounts());
process.exit(errors.length ? 1 : 0);
