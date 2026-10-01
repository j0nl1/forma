import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
const queues = new Map();
export function sourceTransaction(file, operation) {
  const previous = queues.get(file) || Promise.resolve();
  const task = previous.then(operation);
  const settled = task.catch(() => {});
  queues.set(file, settled);
  settled.then(() => {
    if (queues.get(file) === settled) queues.delete(file);
  });
  return task;
}
export async function replaceSource(file, before, after) {
  const ensurePath = async () => {
    if (
      (await fs.realpath(file)) !== file ||
      (await fs.realpath(path.dirname(file))) !== path.dirname(file)
    )
      throw new Error("Source path changed");
  };
  await ensurePath();
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const stat = await fs.stat(file);
    await fs.writeFile(temporary, after, { mode: stat.mode });
    await ensurePath();
    if ((await fs.readFile(file, "utf8")) !== before) {
      const error = new Error(
        "Source changed while preparing this save. Reload before editing.",
      );
      error.status = 409;
      throw error;
    }
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
