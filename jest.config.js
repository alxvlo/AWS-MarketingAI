/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  modulePathIgnorePatterns: ["<rootDir>/.claude/worktrees/"],
  testPathIgnorePatterns: [
    "<rootDir>/.claude/worktrees/",
    "<rootDir>/cdk.out/",
    "<rootDir>/frontend/.next/",
    "<rootDir>/frontend/out/",
  ],
};
