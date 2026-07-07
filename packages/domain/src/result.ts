export type Result<T, E extends { _tag: string }> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E extends { _tag: string }>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
