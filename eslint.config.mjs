import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: fileURLToPath(new URL(".", import.meta.url)) });

const config = [
  { ignores: ["node_modules/**", "deps/**", ".next/**", "next-env.d.ts", ".workstation-deploy/**", ".planning/**", ".playwright-cli/**", ".ci-home/**", "output/**", "dist/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
export default config;
