import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // `.next/**` chỉ khớp bản build ở gốc repo. Các worktree agent dưới `.claude/` cũng có
    // `.next/` riêng; quét chúng làm ESLint ăn hết heap và chết trước khi báo được lỗi nào.
    ignores: [
      "**/.next/**",
      ".claude/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
