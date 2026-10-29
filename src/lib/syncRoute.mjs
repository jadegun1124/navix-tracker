/** A 404 on a route the previous worker does not have. Place sync must stay up. */
export function optionalRouteMissing(path, status) {
  if (status !== 404) return false;
  return path.endsWith('/profile') || path.endsWith('/trail');
}
