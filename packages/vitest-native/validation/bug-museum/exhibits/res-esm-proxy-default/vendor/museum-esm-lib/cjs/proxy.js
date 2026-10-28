// Exports served by a get trap, as preset subpath modules are.
module.exports = new Proxy(
  {},
  {
    get: (_, key) =>
      key === "__esModule" ? true : key === "default" ? () => "proxy-default" : undefined,
  },
);
