const API_BASE = "http://127.0.0.1:3008";
export const API_URL = `${API_BASE}/api`;

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Core fetch wrapper with centralized error handling and timeout.
 */
export async function apiFetch(endpoint, options = {}) {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  // If the body is FormData, do not set Content-Type so the browser sets it automatically with the boundary
  const isFormData = fetchOptions.body instanceof FormData;
  
  const defaultHeaders = isFormData ? {} : { "Content-Type": "application/json" };
  const headers = { ...defaultHeaders, ...fetchOptions.headers };
  
  // If the user explicitly sets a header to undefined, remove it
  Object.keys(headers).forEach(key => {
      if (headers[key] === undefined || headers[key] === null) {
          delete headers[key];
      }
  });

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal || controller.signal,
    });

    clearTimeout(id);

    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { message: res.statusText };
      }
      throw new ApiError(errorData.message || errorData.error || res.statusText, res.status, errorData);
    }

    // Return the response directly if they want it (e.g. for blob/text)
    if (options.rawResponse) {
      return res;
    }

    // Prevent parsing 204 No Content
    if (res.status === 204) return null;

    return await res.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === "AbortError") {
      throw new Error("Request timed out");
    }
    // Network errors (TypeError: Failed to fetch)
    if (error instanceof TypeError) {
      console.error("Network Error:", error);
      throw new Error("Network connection failed. Server may be offline.");
    }
    throw error;
  }
}
