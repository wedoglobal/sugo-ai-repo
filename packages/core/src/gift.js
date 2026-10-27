/** Extension, sohbetteki hediye kartlarını bu önekle metin mesajı olarak iletir. */
export const GIFT_PREFIX = '[hediye]';

export const isGiftText = (t) => String(t).startsWith(GIFT_PREFIX);

/** Cevaplanacak mesajların hepsi hediye mi? */
export const onlyGifts = (texts) => Array.isArray(texts) && texts.length > 0 && texts.every(isGiftText);
