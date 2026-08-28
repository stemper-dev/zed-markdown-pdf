// Ambient declarations for CJS modules without bundled TypeScript types.
// Mirrors the pattern used by ThomasLatham/markdown-pdf-plus.

declare module "*.json" {
  const value: unknown;
  export default value;
}

declare module "markdown-it-highlightjs" {
  import type { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<{
    hljs?: unknown;
    auto?: boolean;
    code?: boolean;
    inline?: boolean;
    register?: Record<string, unknown>;
    ignoreIllegals?: boolean;
  }>;
  export default plugin;
}

declare module "markdown-it-task-lists" {
  import type { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<{
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }>;
  export default plugin;
}

declare module "markdown-it-texmath" {
  import type { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<{
    engine?: unknown;
    delimiters?: "dollars" | "brackets" | "gitlab" | "julia" | "kramdown" | "beg_end";
    katexOptions?: Record<string, unknown>;
  }>;
  export default plugin;
}

declare module "markdown-it-footnote" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
