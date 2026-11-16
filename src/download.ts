// Saving a file the app made (a backup, a filled PDF, a copy of the Lager) through a link the browser downloads.

/** How long a download's address stays valid. */
const REVOKE_AFTER_MS = 60_000;

export function download(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The download has started from the link; the address can go once the browser took it.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
