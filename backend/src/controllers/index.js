// Aggregator: every panel handler in one require.
module.exports = {
  getLlmUsage: require('./llmUsage'),
  getEmailToken: require('./emailToken'),
  getUserActivity: require('./userActivity'),
  getUserPanorama: require('./userPanorama'),
  getMcpHealth: require('./mcpHealth'),
  getLogs: require('./logs'),
  getDbSummary: require('./dbSummary'),
};
