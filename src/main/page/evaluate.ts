import type { WebContents } from 'electron';

/**
 * Runs `fn` inside the page and resolves with its (awaited) result.
 *
 * `fn` is shipped as source text, so it must be self-contained: no closures over main-process
 * values and no imports. Pass data through `args`, which must be JSON-serialisable. This keeps
 * page-side code typed and linted instead of living in string literals.
 */
export async function evaluate<Args extends readonly unknown[], Result>(
  contents: WebContents,
  fn: (...args: Args) => Result,
  ...args: Args
): Promise<Awaited<Result>> {
  const source = `(${fn.toString()})(...${JSON.stringify(args)})`;
  return (await contents.executeJavaScript(source, true)) as Awaited<Result>;
}
