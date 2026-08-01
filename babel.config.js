module.exports = (api) => {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: [
      ["babel-plugin-react-compiler", { target: "19" }],
      ["inline-import", { extensions: [".sql"] }],
    ],
  };
};
