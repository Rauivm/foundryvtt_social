import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "scripts/main.ts",
  output: {
    file: "scripts/main.js",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    typescript({ tsconfig: "./tsconfig.json" }),
  ],
  external: [],
};
