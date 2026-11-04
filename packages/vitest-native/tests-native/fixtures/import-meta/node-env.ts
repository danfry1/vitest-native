// Required through Node (jest.requireActual): `import.meta.env` is Vite's, and fails by name.
export const mode: string = import.meta.env.MODE;
