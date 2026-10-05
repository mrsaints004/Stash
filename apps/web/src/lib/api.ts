import axios from "axios";

const TOKEN_KEY = "stash_token";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  headers: {
    "Content-Type": "application/json",
  },
});

// Clear stale token and redirect on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      localStorage.removeItem(TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);
