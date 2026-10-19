/**
 * Coalesce identical concurrent Remote calls into one shared promise, ported
 * from the Obsidian plugin's shared request map (0.27.2). Callers asking for
 * the same method with the same JSON parameters share a single in-flight
 * request; the shared promise is dropped once it settles, so a failed read
 * stays retryable and the next caller issues a fresh request.
 *
 * `cacheable` names the methods that may be coalesced (a Set of method names
 * or a predicate). Everything else —
 * synchronous accessors, subscription handles, mutating calls — passes
 * through untouched: wrapping a sync function would return a promise where
 * callers expect a value.
 */
export function shareRequests(api, cacheable = () => true) {
  const allows = typeof cacheable === 'function' ? cacheable : (name) => cacheable.has(name);
  const inflight = new Map();
  const wrapped = {};
  for (const [name, value] of Object.entries(api)) {
    if (typeof value !== 'function' || !allows(name)) {
      wrapped[name] = value;
      continue;
    }
    wrapped[name] = async (...args) => {
      const token = `${name}:${JSON.stringify(args)}`;
      const existing = inflight.get(token);
      if (existing) return existing;
      const pending = Promise.resolve()
        .then(() => value(...args))
        .finally(() => {
          if (inflight.get(token) === pending) inflight.delete(token);
        });
      inflight.set(token, pending);
      return pending;
    };
  }
  return wrapped;
}
