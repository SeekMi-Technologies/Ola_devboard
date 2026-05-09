// Minimal axios wrapper for the devboard frontend.
//
// CRM's `request` module has 12 methods (create / read / update / delete /
// list / summary etc.) plus toast handlers. Devboard is read-only and the
// only HTTP verb it ever needs is GET, so this module is intentionally
// trimmed to one method with the same call signature as CRM
// (`request.get({ entity })`) — panels port over verbatim.
//
// baseURL = '/api' so an entity path like '/dashboard/llm-usage' resolves
// to '/api/dashboard/llm-usage'. The vite dev proxy rewrites '/api/*' to
// `127.0.0.1:8890/api/*` so the FE talks to the BE same-origin during dev.

import axios from 'axios';

axios.defaults.baseURL = '/api';

const request = {
  get: async ({ entity }) => {
    try {
      const response = await axios.get(entity);
      return response.data;
    } catch (error) {
      // Surface a uniform shape so panels can branch on `success === false`
      // the same way they would for a 4xx envelope from the BE.
      const fallback = error?.response?.data;
      if (fallback && typeof fallback === 'object') return fallback;
      return {
        success: false,
        result: null,
        message: error?.message || 'Network error',
      };
    }
  },
};

export { request };
export default request;
