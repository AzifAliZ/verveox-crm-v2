export const META_MAX_ATTEMPTS = 5;
export function metaRetryDelay(attempt: number) {
  return Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1));
}
export function metaFailurePermanent(status: number, code?: number) {
  return [400, 403, 404].includes(status) && ![1, 2, 4, 17, 32, 613].includes(code ?? 0);
}
