// `?raw` imports (skill markdown, bundled as plain text) return the file's
// contents as a string — see next.config.ts for the webpack/Turbopack rules
// that make the suffix resolve.
declare module "*?raw" {
  const content: string;
  export default content;
}
