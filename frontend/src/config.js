/**
 * Application configuration
 * Uses environment variables with fallbacks for development
 */

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
export const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000');

/**
 * Fetch wrapper with timeout and abort controller support
 */
export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || API_TIMEOUT);
  
  try {
    const finalUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
    const response = await fetch(finalUrl, {
      ...options,
      signal: controller.signal
    });
    
    if (!response.ok && response.status === 401) {
      // Handle unauthorized
      localStorage.removeItem('fastderash_token');
      localStorage.removeItem('fastderash_user');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout (${options.timeout || API_TIMEOUT}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
