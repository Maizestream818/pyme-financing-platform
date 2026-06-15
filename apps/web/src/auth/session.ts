'use client';

import { LoginResponse, User } from '../lib/types';

const TOKEN_KEY = 'pyme.accessToken';
const USER_KEY = 'pyme.user';

export type Session = {
  token: string;
  user: User;
};

export function getSession(): Session | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = window.localStorage.getItem(TOKEN_KEY);
  const userJson = window.localStorage.getItem(USER_KEY);

  if (!token || !userJson) {
    return null;
  }

  try {
    return {
      token,
      user: JSON.parse(userJson) as User,
    };
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(response: LoginResponse) {
  window.localStorage.setItem(TOKEN_KEY, response.accessToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(response.user));
}

export function clearSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function getAccessToken() {
  return getSession()?.token ?? null;
}
