import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

// FIXME: 不知为何 TypeScript（包括在 VSCode 里查看以及直接执行 `tsc --noEmit`
// 来检查类型）抱怨类型有问题，但测试实际可以正常执行。因为不是很重要，就先在
// tsconfig 里设置排除掉 `*.config.ts` 了。
export default defineConfig(({ mode }) => {
  // to test in server environment, run with "--mode ssr" or "--mode test:ssr" flag
  // loads only server.test.ts file
  const testSSR = mode === "test:ssr" || mode === "ssr";

  return {
    plugins: [
      solidPlugin({
        // https://github.com/solidjs/solid-refresh/issues/29
        hot: false,
        // For testing SSR we need to do a SSR JSX transform
        solid: { generate: testSSR ? "ssr" : "dom" },
      }),
    ],
    test: {
      watch: false,
      isolate: !testSSR,
      env: {
        NODE_ENV: testSSR ? "production" : "development",
        DEV: testSSR ? "" : "1",
        SSR: testSSR ? "1" : "",
        PROD: testSSR ? "1" : "",
      },
      environment: testSSR ? "node" : "jsdom",
      transformMode: { web: [/\.[jt]sx$/] },
      ...(testSSR
        ? {
          include: ["test/server.test.{ts,tsx}"],
        }
        : {
          include: ["test/*.test.{ts,tsx}"],
          exclude: ["test/server.test.{ts,tsx}"],
        }),
    },
    resolve: {
      conditions: testSSR ? ["node"] : ["browser", "development"],
    },
  };
});
