import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/sharing/shared_text.dart';

void main() {
  group('firstUrlIn', () {
    test('reads the link out of what Ozon actually shares', () {
      // The share button produces the product title, a newline, then the short link.
      const shared =
          'Магнитный аккумулятор на 5000 мАч с поддержкой MagSafe\n'
          'https://ozon.ru/t/1fJ1Bb2';

      expect(firstUrlIn(shared), 'https://ozon.ru/t/1fJ1Bb2');
    });

    test('reads a Yandex Market share', () {
      expect(
        firstUrlIn('Смотри что нашёл https://market.yandex.ru/cc/AzcSrs'),
        'https://market.yandex.ru/cc/AzcSrs',
      );
    });

    test('keeps a full product URL with its query intact', () {
      const url =
          'https://www.wildberries.ru/catalog/1232566244/detail.aspx?targetUrl=GP';

      expect(firstUrlIn(url), url);
    });

    test(
      'takes the first address when the share carries a promotional tail',
      () {
        expect(
          firstUrlIn(
            'https://ozon.ru/t/1fJ1Bb2 — скачай приложение https://ozon.ru/app',
          ),
          'https://ozon.ru/t/1fJ1Bb2',
        );
      },
    );

    test('drops sentence punctuation that is not part of the address', () {
      expect(
        firstUrlIn('Вот ссылка (https://ozon.ru/t/1fJ1Bb2).'),
        'https://ozon.ru/t/1fJ1Bb2',
      );
    });

    test('answers null for shared text with no address in it', () {
      // Somebody using the share sheet for something else entirely. Opening a buying form over
      // their copied paragraph would be worse than doing nothing.
      expect(firstUrlIn('позвони мне завтра в 10'), isNull);
      expect(firstUrlIn(''), isNull);
    });

    test('refuses a scheme we would not fetch anyway', () {
      expect(firstUrlIn('ftp://example.com/file'), isNull);
      expect(firstUrlIn('javascript:alert(1)'), isNull);
    });
  });

  group('groupInviteCodeIn', () {
    const site = 'https://gulyaly.pro';

    test('reads the code out of our own invite link', () {
      expect(
        groupInviteCodeIn('https://gulyaly.pro/i/ABCDEFGHJK', site),
        'ABCDEFGHJK',
      );
    });

    test('ignores a marketplace link, which means the opposite thing', () {
      // The two kinds of shared link lead to opposite places: this one opens a buying form.
      expect(groupInviteCodeIn('https://ozon.ru/t/1fJ1Bb2', site), isNull);
    });

    test('refuses the same path shape on another domain', () {
      // A page at /i/<code> on another host is another site's page, and following it here would
      // hand a stranger control of where a share lands.
      expect(
        groupInviteCodeIn(
          'https://gulyaly.pro.evil.example/i/ABCDEFGHJK',
          site,
        ),
        isNull,
      );
      expect(
        groupInviteCodeIn('https://evil.example/i/ABCDEFGHJK', site),
        isNull,
      );
    });

    test('refuses a path that is not exactly one code', () {
      expect(groupInviteCodeIn('https://gulyaly.pro/i', site), isNull);
      expect(
        groupInviteCodeIn('https://gulyaly.pro/i/ABC/extra', site),
        isNull,
      );
      expect(
        groupInviteCodeIn('https://gulyaly.pro/r/ABCDEFGHJK', site),
        isNull,
      );
    });

    test('does not care how the host was capitalised', () {
      expect(
        groupInviteCodeIn('https://Gulyaly.PRO/i/ABCDEFGHJK', site),
        'ABCDEFGHJK',
      );
    });
  });
}
