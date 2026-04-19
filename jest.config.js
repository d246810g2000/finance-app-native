module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system.js',
  },
};
