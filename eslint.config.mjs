import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";

export default [
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  pluginReactConfig,
  {
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "no-empty": "off"
    }
  }
];
