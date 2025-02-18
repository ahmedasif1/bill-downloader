import js from "@eslint/js";
import globals from "globals";
export default [
    {
        files: ["app/*.js", "index.js"],
        rules: {
            ...js.configs.recommended.rules,
            "indent": [
                "error",
                2
            ],
            "linebreak-style": [
                "error",
                "unix"
            ],
            "quotes": [
                "error",
                "single"
            ],
            "semi": [
                "warning",
                "always"
            ]
        },
        languageOptions: {
            "ecmaVersion": "latest",
            "sourceType": "module",
            globals: {
                ...globals.browser,
                ...globals.es2021
            }
        }
    }
]