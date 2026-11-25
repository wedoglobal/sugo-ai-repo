/** Sugo'nun otomatik takip metni; ek sohbet metni varsa bildirim sayılmaz. */
export function isFollowNotice(text) {
  const normalized = String(text).toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '');
  return ['senitakipettim', 'senitakipettimbirbirimizitakipettiktensonraarkadaşolabiliriz'].includes(normalized);
}

export function isOnlineNotice(text) {
  const normalized = String(text).trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
  return /^(?:partner çevrim ?içi(?: oldu)?[.!]?|\[çevrim ?içi\])$/u.test(normalized);
}

export const isIncomingPhoto = (text) => /^\[gelen fotoğraf:[a-f0-9]{8}\]$/u.test(String(text));
export const isIncomingVoice = (text) => /^\[gelen ses:[a-f0-9]{8}\]$/u.test(String(text));
