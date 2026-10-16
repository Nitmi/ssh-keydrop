import { bindings, defineConfig } from "cf/config";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// The deployment button rewrites the template's Worker name before building.
// Keep cf aligned with that name rather than deploying a second Worker.
const template = JSON.parse(readFileSync(new NodeURL("./wrangler.jsonc", import.meta.url), "utf8"));

export default defineConfig({
	worker: {
		name: template.name,
		compatibilityDate: template.compatibility_date,
		entrypoint,
		workersDev: true,
		env: {
			SSH_PUBLIC_KEYS: bindings.secret(),
		},
	},
});
