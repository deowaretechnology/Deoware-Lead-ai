import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
});

// Attach the JWT to every request automatically
api.interceptors.request.use((config) => {
  const token = Cookies.get('crm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the token expires/invalid, bounce to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      Cookies.remove('crm_token');
      if (!window.location.pathname.startsWith('/login')) {
        // This runs outside React (an axios interceptor), so useRouter() isn't
        // available here - a hard redirect is the correct tool for this spot.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
