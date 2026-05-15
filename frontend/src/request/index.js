// Axios wrapper. Same signature as CRM's request.get so panels port over
// verbatim; .post added for /auth/login (Ola/#225-C). baseURL '/api' →
// vite proxy → BE 8890. withCredentials so the session cookie flows.
// 401 on any non-/auth/login response dispatches a window event so App
// can flip back to LoginPage without prop drilling.

import axios from 'axios';

axios.defaults.baseURL = '/api';
axios.defaults.withCredentials = true;

function notifyUnauthenticated() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('devboard:unauthenticated'));
    } catch (_) {
      // CustomEvent unsupported in some jsdom configs — silent no-op.
    }
  }
}

function envelope(error) {
  const fallback = error?.response?.data;
  if (fallback && typeof fallback === 'object') return fallback;
  return {
    success: false,
    result: null,
    message: error?.message || 'Network error',
  };
}

const request = {
  get: async ({ entity }) => {
    try {
      const response = await axios.get(entity);
      return response.data;
    } catch (error) {
      if (error?.response?.status === 401) notifyUnauthenticated();
      return envelope(error);
    }
  },

  post: async ({ entity, body }) => {
    try {
      const response = await axios.post(entity, body);
      return response.data;
    } catch (error) {
      // /auth/login 401 = bad password (expected, surfaced as message);
      // any other 401 = real session loss, flip the app.
      if (error?.response?.status === 401 && entity !== '/auth/login') {
        notifyUnauthenticated();
      }
      return envelope(error);
    }
  },
};

export { request };
export default request;
