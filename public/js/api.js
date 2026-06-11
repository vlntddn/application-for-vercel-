async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload;
}

export const api = {
  manifest: () => request('/api/manifest'),
  theory: () => request('/api/theory'),
  dictionary: () => request('/api/dictionary'),
  questions: (slug) => request(`/api/questions/${slug}`),
  progress: () => request('/api/progress'),
  updateProfile: (profile) =>
    request('/api/progress/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  recordAnswers: (answers) =>
    request('/api/progress/answers', { method: 'POST', body: JSON.stringify({ answers }) }),
  recordExam: (exam) =>
    request('/api/progress/exams', { method: 'POST', body: JSON.stringify(exam) }),
  markTheoryRead: (chapterId) =>
    request('/api/progress/theory', { method: 'POST', body: JSON.stringify({ chapterId }) }),
  resetProgress: () => request('/api/progress', { method: 'DELETE' }),
};
