const API_KEY_STORAGE = "ss_api_key";
const SECRET_KEY_STORAGE = "ss_secret_key";

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}

export function getSecretKey(): string | null {
  return localStorage.getItem(SECRET_KEY_STORAGE);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
}

export function setSecretKey(key: string): void {
  localStorage.setItem(SECRET_KEY_STORAGE, key.trim());
}

export function clearCredentials(): void {
  localStorage.removeItem(API_KEY_STORAGE);
  localStorage.removeItem(SECRET_KEY_STORAGE);
}

export function hasCredentials(): boolean {
  const key = getApiKey();
  return !!key && key.length > 8;
}
