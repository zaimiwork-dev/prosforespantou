export function getSessionId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem('sid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('sid', id);
  }
  return id;
}
