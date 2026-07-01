// Aggregator: every panel handler in one require.
const auth = require('./auth');
const persona = require('./persona');

module.exports = {
  getLlmUsage: require('./llmUsage'),
  getEmailToken: require('./emailToken'),
  getUserActivity: require('./userActivity'),
  getUserPanorama: require('./userPanorama'),
  getMcpHealth: require('./mcpHealth'),
  getLogs: require('./logs'),
  getDbSummary: require('./dbSummary'),
  getVersion: require('./version'),
  login: auth.login,
  logout: auth.logout,
  me: auth.me,
  getPersonaEnvs: persona.getPersonaEnvs,
  listPersonas: persona.listPersonas,
  getPersona: persona.getPersona,
  putPersona: persona.putPersona,
};
