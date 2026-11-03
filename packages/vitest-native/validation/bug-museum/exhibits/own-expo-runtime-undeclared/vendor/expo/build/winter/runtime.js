// SDK 58's shape: ES module syntax beside Metro's `require`, extensionless imports,
// in a package without "type": "module". Only a compiled copy runs under Node.
import "./setup";

globalThis.__museumExpoRuntime = require("./value").value;
