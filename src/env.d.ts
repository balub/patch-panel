/// <reference types="chrome" />
/// <reference types="vite/client" />

declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module '*.yaml?raw' {
  const content: string;
  export default content;
}
