import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/features/home/domain/promo.dart';
import 'package:gulyaly_mobile/features/profile/domain/legal_page.dart';

// The real shape, from GET /content-pages/privacy on production.
const _page = {
  'slug': 'privacy',
  'title': 'Политика конфиденциальности',
  'body': 'Мы собираем только необходимые данные.',
  'titleEn': 'Privacy policy',
  'bodyEn': 'We only collect what we need.',
  'titleTkm': 'Gizlinlik syýasaty',
  'bodyTkm': 'Diňe zerur maglumatlary ýygnaýarys.',
  'updatedAt': '2026-08-23T11:37:14.485Z',
};

void main() {
  group('LegalPage locale resolution', () {
    test('uses the requested language when it is translated', () {
      expect(LegalPage.fromJson(_page, 'en').title, 'Privacy policy');
      expect(
        LegalPage.fromJson(_page, 'tkm').body,
        'Diňe zerur maglumatlary ýygnaýarys.',
      );
      expect(
        LegalPage.fromJson(_page, 'ru').title,
        'Политика конфиденциальности',
      );
    });

    test('falls back to the base language when a translation is missing', () {
      // The backend's own convention: an empty override means "not translated yet". Showing a
      // customer a blank privacy policy would be worse than showing it in Russian.
      final partial = {..._page, 'bodyEn': '', 'titleEn': null};
      final page = LegalPage.fromJson(partial, 'en');

      expect(page.title, 'Политика конфиденциальности');
      expect(page.body, 'Мы собираем только необходимые данные.');
    });

    test('an unwritten page is empty rather than an error', () {
      final blank = {'slug': 'offer', 'title': 'Оферта', 'body': '   '};
      expect(LegalPage.fromJson(blank, 'ru').isEmpty, isTrue);
    });
  });

  group('SocialLink', () {
    test('accepts only real web links', () {
      // A CMS row with an empty or non-web URL is hidden rather than rendered as a button that
      // does nothing -- and the launcher refuses non-http schemes anyway.
      expect(
        const SocialLink(
          id: '1',
          platform: 'INSTAGRAM',
          url: 'https://instagram.com/x',
          sortOrder: 0,
        ).isUsable,
        isTrue,
      );
      expect(
        const SocialLink(
          id: '2',
          platform: 'TIKTOK',
          url: '',
          sortOrder: 1,
        ).isUsable,
        isFalse,
      );
      expect(
        const SocialLink(
          id: '3',
          platform: 'X',
          url: 'javascript:alert(1)',
          sortOrder: 2,
        ).isUsable,
        isFalse,
      );
    });

    test('reads the live shape', () {
      final link = SocialLink.fromJson(const {
        'id': 'cmt67ruzx0002qm01t2ajrqtf',
        'platform': 'INSTAGRAM',
        'url': 'https://instagram.com/gulyaly.pro',
        'label': '',
        'sortOrder': 0,
      });

      expect(link.platform, 'INSTAGRAM');
      // An empty label is absent, not an empty chip.
      expect(link.label, isNull);
      expect(link.isUsable, isTrue);
    });
  });
}
