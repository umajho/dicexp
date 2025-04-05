import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solidPlugin from "vite-plugin-solid";
// import devtools from 'solid-devtools/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    /*
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
    // devtools(),
    solidPlugin(),
  ],
  optimizeDeps: {
    exclude: ["ankor", "@rolludejo/internal-web-shared"],
  },
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
  },
});
