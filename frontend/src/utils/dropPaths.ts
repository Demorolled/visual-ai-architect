/**
 * dropPaths — recover the real on-disk paths a drop carried.
 *
 * Deep Scan analyses a PATH. With one, REA reads the artifact itself — a folder,
 * a binary, an APK — and nothing is copied. Without one the scan falls back to a
 * text-only staged copy, which cannot carry a binary at all, so every `.class`,
 * image or archive in a dropped folder is left behind. A path is therefore worth
 * chasing before giving up on it.
 *
 * `DataTransferItem.getAsFile()` is the documented route to a File and, in
 * Electron, to its path through the preload bridge. It is not always the route
 * that works: a dropped FOLDER, and items some drag libraries synthesise, can
 * hand back a File that resolves to no path even though the drag carried a
 * usable one in `dataTransfer.files`. So the file list is consulted whenever the
 * item route comes up short.
 *
 * The resolver is injected (the app passes `window.veronica.getPathForFile`,
 * a plain browser has none and passes a function that returns '') so this stays
 * pure here and testable without a DOM. The caller MUST invoke it while the drop
 * event is still being handled: a DataTransfer is only readable then.
 */

/** The slice of DataTransferItem this needs. */
export interface DropItemLike {
  kind: string;
  getAsFile: () => File | null;
}

/**
 * The real paths a drop carried, deduped, in drop order.
 *
 * The item route is tried first. Only when it failed to resolve EVERY dropped
 * file is the file list consulted — and then its paths are merged in rather than
 * replacing anything, so an unresolved file still counts. That matters: the
 * caller treats one path as "scan this artifact in place" and anything else as
 * "scan a staged copy", so a two-file drop must never be able to masquerade as
 * the single path of whichever file happened to resolve.
 */
export function dropRealPaths(
  items: ArrayLike<DropItemLike>,
  files: ArrayLike<File>,
  resolvePath: (file: File) => string
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  const add = (raw: unknown): void => {
    const p = typeof raw === 'string' ? raw : '';
    if (!p || seen.has(p)) return;
    seen.add(p);
    paths.push(p);
  };

  // A file that cannot be asked for a path — or that throws when asked — is not
  // a path, and must not abort the rest of the drop.
  const resolve = (file: File | null | undefined): void => {
    if (!file) return;
    try {
      add(resolvePath(file));
    } catch {
      /* unusable item */
    }
  };

  let fileItems = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || item.kind !== 'file') continue;
    fileItems += 1;
    try {
      resolve(item.getAsFile());
    } catch {
      /* unusable item */
    }
  }

  if (paths.length < fileItems) {
    for (let i = 0; i < files.length; i++) resolve(files[i]);
  }

  return paths;
}
