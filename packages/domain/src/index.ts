export type Result<T, E extends { _tag: string }> =
  | { ok: true; value: T }
  | { ok: false; error: E };
