// One-method axios wrapper. Same signature as CRM's request.get so panels
// port over verbatim. baseURL '/api' → vite proxy → BE 8890.

import axios from 'axios';

axios.defaults.baseURL = '/api';

const request = {
  get: async ({ entity }) => {
    try {
      const response = await axios.get(entity);
      return response.data;
    } catch (error) {
      // Uniform shape — panels branch on success:false either way.
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
