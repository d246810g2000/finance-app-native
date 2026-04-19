module.exports = {
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
  getInfoAsync: async () => ({ exists: false }),
  readAsStringAsync: async () => '',
  writeAsStringAsync: async () => {},
};
