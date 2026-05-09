// Side-effect module: requiring it registers every devboard model with
// the global mongoose instance. Both `server.js` and the jest test files
// require this before instantiating any controller, so
// `mongoose.model('Admin')` / `mongoose.model('LlmUsage')` resolve.

require('./Admin');
require('./LlmUsage');

module.exports = {};
