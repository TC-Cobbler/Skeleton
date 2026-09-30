import { randomBytes } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Write a file so watchers only ever see the old or the new content. A plain
 * writeFile truncates first, and Vite can read the empty file in between: it then
 * serves an empty module, React Fast Refresh gives up ("export removed") and the
 * canvas stops updating. So: write a temp file beside the target, then rename it over.
 */
export async function writeFileAtomic(target: string, content: string): Promise<void> {
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.skeleton-${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(temp, content, "utf8");
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch((cleanup: unknown) => {
      if ((cleanup as NodeJS.ErrnoException).code !== "ENOENT") console.error(`[editor] couldn't remove ${temp}`, cleanup);
    });
    throw error;
  }
}
