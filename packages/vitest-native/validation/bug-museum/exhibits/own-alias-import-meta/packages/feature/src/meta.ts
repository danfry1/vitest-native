// import.meta is a SyntaxError once Node's loader compiles this file to CommonJS.
export const metaUrlType: string = typeof import.meta.url;
