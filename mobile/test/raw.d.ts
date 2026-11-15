// Vitest (Vite) can import a file's text with `?raw`. Used by tests that check
// source or config text; the app itself never imports this way.
declare module '*?raw' {
  const text: string;
  export default text;
}
