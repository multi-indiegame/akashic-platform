import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..", "..");
const outDir = path.join(scriptDir, "dist");
const templatePath = path.join(
    rootDir,
    "schema",
    "http",
    "swagger-ui",
    "index.html",
);
const require = createRequire(import.meta.url);
const swaggerDistDir = path.dirname(
    require.resolve("swagger-ui-dist/package.json"),
);

const specs = [
    {
        name: "akashic-server",
        modulePath: path.join(
            rootDir,
            "akashic-server",
            "dist",
            "http",
            "openapi.js",
        ),
    },
    {
        name: "akashic-runner",
        modulePath: path.join(
            rootDir,
            "akashic-runner",
            "dist",
            "http",
            "openapi.js",
        ),
    },
    {
        name: "akashic-storage-public",
        modulePath: path.join(
            rootDir,
            "akashic-storage",
            "dist",
            "http",
            "openapi-public.js",
        ),
    },
    {
        name: "akashic-storage-admin",
        modulePath: path.join(
            rootDir,
            "akashic-storage",
            "dist",
            "http",
            "openapi-admin.js",
        ),
    },
    {
        name: "manager-server",
        modulePath: path.join(
            rootDir,
            "manager-server",
            "dist",
            "http",
            "openapi.js",
        ),
    },
    {
        name: "external-api",
        modulePath: path.join(
            rootDir,
            "external-api",
            "dist",
            "http",
            "openapi.js",
        ),
    },
];

await mkdir(outDir, { recursive: true });
await copyFile(templatePath, path.join(outDir, "index.html"));
await copyFile(
    path.join(swaggerDistDir, "swagger-ui.css"),
    path.join(outDir, "swagger-ui.css"),
);
await copyFile(
    path.join(swaggerDistDir, "swagger-ui-bundle.js"),
    path.join(outDir, "swagger-ui-bundle.js"),
);
await copyFile(
    path.join(swaggerDistDir, "swagger-ui-standalone-preset.js"),
    path.join(outDir, "swagger-ui-standalone-preset.js"),
);

for (const spec of specs) {
    const moduleUrl = pathToFileURL(spec.modulePath).href;
    const mod = await import(moduleUrl);
    const openapi = mod.openapi ?? mod.default?.openapi;
    if (!openapi) {
        throw new Error(`OpenAPI export not found: ${spec.modulePath}`);
    }
    const outPath = path.join(outDir, `${spec.name}.openapi.json`);
    await writeFile(outPath, JSON.stringify(openapi, null, 2));
}
