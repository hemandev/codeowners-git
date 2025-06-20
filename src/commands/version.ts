import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

export function getVersion(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJson = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));
  return packageJson.version;
}