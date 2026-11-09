/** Sugo'nun otomatik takip metni; ek sohbet metni varsa bildirim sayılmaz. */
export function isFollowNotice(text) {
  const normalized = String(text).toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '');
  return ['senitakipettim', 'senitakipettimbirbirimizitakipettiktensonraarkadaşolabiliriz'].includes(normalized);
}

export const isIncomingPhoto = (text) => /^\[gelen fotoğraf:[a-f0-9]{8}\]$/u.test(String(text));
export const isIncomingVoice = (text) => /^\[gelen ses:[a-f0-9]{8}\]$/u.test(String(text));
