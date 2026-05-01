declare module "markmap/lib/parse.markdown" {
  function parse(markdown: string): unknown;
  export = parse;
}

declare module "markmap/lib/transform.headings" {
  function transform(data: unknown): unknown;
  export = transform;
}

declare module "markmap/lib/view.mindmap" {
  interface MarkmapInstance {
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    setData: (data: unknown, opts?: object) => void;
    setOptions: (opts: object) => void;
    卸载?: () => void;
  }
  function Markmap(
    selector: string | SVGSVGElement,
    opts?: object,
    data?: unknown
  ): MarkmapInstance;
  export = Markmap;
}

declare module "d3" {
  export = d3;
}

declare namespace d3 {
  // Minimal d3 namespace - enough for markmap
}

declare module "markmap/lib/d3-flextree" {
  const _default: unknown;
  export = _default;
}
