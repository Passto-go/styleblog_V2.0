export function formatDate(iso, lang = 'zh') {
  const d = new Date(iso);
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

// 年-月 分组键，用于归档页
export function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(iso, lang = 'zh') {
  const d = new Date(iso);
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
}
