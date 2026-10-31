// The source this build was made from. Every version that goes online must have its source in the
// public repo (GPL), so the start page links to this exact commit. vite.config.ts fills both in from
// git; a build without git (a downloaded zip of the source) leaves them empty and the line is hidden.
declare const __MPMB_WEB_COMMIT__: string;
declare const __MPMB_WEB_COMMIT_DATE__: string;

export const BUILD = {
  /** Full commit hash, or '' when unknown. */
  commit: __MPMB_WEB_COMMIT__,
  /** Commit date as YYYY-MM-DD, or ''. */
  date: __MPMB_WEB_COMMIT_DATE__,
};

export const SOURCE_URL = 'https://github.com/Remph/mpmb-web';

/** The source tree of this build on GitHub, or the repo when the commit is unknown. */
export function sourceUrl(commit: string): string {
  return commit ? `${SOURCE_URL}/tree/${commit}` : SOURCE_URL;
}
