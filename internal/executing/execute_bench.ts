import { execute } from "./execute.ts";

const codesSimple = [
  "~10",
  "1~10",
  "d10 ~ 3d8+10",
];

for (const code of codesSimple) {
  Deno.bench(`simple: ${code}`, () => {
    execute(code);
  });
}
