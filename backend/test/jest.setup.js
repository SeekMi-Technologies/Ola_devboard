// Tests run with a synthetic env so they never depend on a real Atlas
// connection or a real CRM checkout. Individual tests override these as
// needed.
process.env.NODE_ENV = 'test';
process.env.BACKEND_PORT = process.env.BACKEND_PORT || '0'; // 0 = ephemeral
