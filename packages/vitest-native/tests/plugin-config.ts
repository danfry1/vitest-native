import type { ConfigEnv, Plugin, UserConfig } from "vite";

/** Invoke either spelling of Vite's ordered config hook in focused plugin tests. */
export async function runPluginConfig(
  plugin: Plugin,
  config: UserConfig = {},
  env: ConfigEnv = { command: "serve", mode: "test" },
): Promise<any> {
  const hook = plugin.config;
  if (hook === undefined) throw new Error("plugin has no config hook");
  const handler = typeof hook === "function" ? hook : hook.handler;
  return handler.call({} as never, config, env);
}
