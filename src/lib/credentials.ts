const FAL_KEY_STORAGE  = "ss_api_key";
const ELABS_KEY_STORAGE = "ss_elevenlabs_key";

// ─── fal.ai ───────────────────────────────────────────────────────────────────
export function getApiKey(): string | null {
  return localStorage.getItem(FAL_KEY_STORAGE);
}
export function setApiKey(key: string): void {
  localStorage.setItem(FAL_KEY_STORAGE, key.trim());
}
export function clearCredentials(): void {
  localStorage.removeItem(FAL_KEY_STORAGE);
  localStorage.removeItem(ELABS_KEY_STORAGE);
}
export function hasCredentials(): boolean {
  const key = getApiKey();
  return !!key && key.length > 8;
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────────
export function getElevenLabsKey(): string | null {
  return localStorage.getItem(ELABS_KEY_STORAGE);
}
export function setElevenLabsKey(key: string): void {
  localStorage.setItem(ELABS_KEY_STORAGE, key.trim());
}
export function hasElevenLabsKey(): boolean {
  const key = getElevenLabsKey();
  return !!key && key.length > 8;
}
