import { describe, expect, it } from 'vitest';
import { parseGreetings, pickableGreetings } from './greetings.js';

describe('greetings', () => {
  it('satırları ayrıştırır, yorum ve boşları atar', () => {
    expect(parseGreetings('selam\n# not\n\n  naber  ')).toEqual(['selam', 'naber']);
  });
  it('yakın zamanda gönderilenleri dışarıda bırakır, hepsi kullanıldıysa listeyi korur', () => {
    expect(pickableGreetings(['a', 'b'], ['a'])).toEqual(['b']);
    expect(pickableGreetings(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});
