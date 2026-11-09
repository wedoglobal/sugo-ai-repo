import { describe, expect, it } from 'vitest';
import { removeRepeatedAddress, removeRepeatedEnding, removeRepeatedLaughter, removeFrequentWords, removeRepeatedWords, removeRepetition } from './repetition.js';

describe('removeRepeatedEnding', () => {
  it('önceki satırı bitiren süzü keser', () => {
    expect(removeRepeatedEnding('yok bir şey yapmıyorum ya', ['ne bileyim ya'])).toBe('yok bir şey yapmıyorum');
  });
  it('sıradan uzun sondaki sözcüğe dokunmaz', () => {
    expect(removeRepeatedEnding('bugün çok yorgunum gerçekten', ['yarın gerçekten'])).toBe('bugün çok yorgunum gerçekten');
  });
});

describe('removeRepeatedAddress', () => {
  it('yalnız seslenme konumundaki hitabı sayar, son cevapta kullanıldıysa kaldırır', () => {
    expect(removeRepeatedAddress('bak ben gelirim', 'bak, ya', ['bak ne diyeyim'])).toBe('ben gelirim');
    expect(removeRepeatedAddress('bak ben gelirim', 'bak, ya', ['tamam'])).toBe('bak ben gelirim');
    expect(removeRepeatedAddress('ya bak ya', 'ya', [])).toBe('ya bak');
  });
});

describe('removeRepeatedLaughter', () => {
  it('uzatılmış gülmeyi yakalar; cooldown ve 20 cevap sınırını uygular', () => {
    expect(removeRepeatedLaughter('olur hahahaha', ['hahaha'], ['süper hahaha'], { cooldown: 2 })).toBe('olur');
    expect(removeRepeatedLaughter('olur hahaha', ['hahaha'], ['süper hahaha', 'a', 'b', 'c'], { cooldown: 2 })).toBe('olur hahaha');
    expect(removeRepeatedLaughter('olur hahaha', ['hahaha'], ['x hahaha', 'a', 'b', 'c'], { cooldown: 2, maxIn20: 1 })).toBe('olur');
  });
});

describe('removeRepetition', () => {
  it('geçmişteki hostun satırlarına göre üçünü birden uygular', () => {
    const history = [{ direction: 'in', text: 'hahaha' }, { direction: 'out', text: 'tamam hahaha ya' }];
    expect(removeRepetition('olur tamam hahaha ya', { address: '', laughs: ['hahaha'], laughCooldown: 2, laughMax: 0 }, history)).toBe('olur tamam');
  });
});

describe('removeRepeatedWords', () => {
  const said = ['Yanalım da nerde yanıcaz, atölye malum', 'Sen gel, gerisi hallolur'];
  it('son cevaplarda geçen ayırt edici sözcüğü (ekli halleriyle) siler', () => {
    expect(removeRepeatedWords('Kadıköy tarafındayım, atölye burda', said)).toBe('Kadıköy tarafındayım, burda');
    expect(removeRepeatedWords('atölyede görüşürüz bence', said)).toBe('görüşürüz bence');
  });
  it('karşı tarafın kullandığı sözcüğe, yaygın sözcüğe ve eski cevaplara dokunmaz', () => {
    expect(removeRepeatedWords('atölye burda', said, ['atölye nerde'])).toBe('atölye burda');
    expect(removeRepeatedWords('şimdi geliyorum', ['şimdi buradayım'])).toBe('şimdi geliyorum');
    expect(removeRepeatedWords('atölye burda', ['atölye', 'a', 'b', 'c'])).toBe('atölye burda');
  });
  it('geriye iki sözcükten azı kalacaksa metni korur', () => {
    expect(removeRepeatedWords('atölye var', said)).toBe('atölye var');
  });
});

describe('removeFrequentWords', () => {
  const said = ['aşkım naber', 'ya aşkkkım tamam', 'aşkımmm bak', 'iyi', 'x', 'y'];
  it('3 kez kullanılan sözcük (uzatmalı yazım dahil) sonraki 6 cevapta silinir', () => {
    expect(removeFrequentWords('tamam askkkkm gel', said)).toBe('tamam gel');
    expect(removeFrequentWords('tamam aşkım gel', ['aşkım naber', 'aşkım tamam', 'aşkım bak', 'a', 'b', 'c', 'd', 'e', 'f'])).toBe('tamam aşkım gel');
  });
  it('2 kullanımda, karşı taraf kullandıysa ya da süre dolduysa dokunmaz', () => {
    expect(removeFrequentWords('tamam aşkım gel', ['aşkım naber', 'aşkım tamam', 'a'])).toBe('tamam aşkım gel');
    expect(removeFrequentWords('tamam aşkım gel', said, ['aşkım sen de'])).toBe('tamam aşkım gel');
  });
  it('3. kullanımdan sonra sayaç sıfırlanır', () => {
    const long = ['aşkım a', 'aşkım b', 'aşkım c', 'd', 'e', 'f', 'g', 'h', 'i', 'aşkım j'];
    expect(removeFrequentWords('tamam aşkım gel', long)).toBe('tamam aşkım gel');
  });
});
