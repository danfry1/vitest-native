// Mocked with a factory by hot-automock-a and automocked by hot-automock-b; y.ts the
// other way round. Only that pair imports these two modules (see the probe files).
export const owner = (): string => "real-x";
