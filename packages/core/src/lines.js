/** Satır başına bir kayıt; `#` ile başlayan satırlar yorumdur. */
export function parseLines(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

export const formatLines = (list) => (Array.isArray(list) ? list : []).join('\n');
