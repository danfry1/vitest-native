// A dynamic import whose specifier is only known at run time, relative to this file.
export const load = (name: string) => import(name);
