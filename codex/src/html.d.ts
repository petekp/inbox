// esbuild loads .html files as text.
declare module '*.html' {
  const text: string
  export default text
}
