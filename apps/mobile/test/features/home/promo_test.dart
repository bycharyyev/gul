import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/features/home/domain/catalog_service.dart';
import 'package:gulyaly_mobile/features/home/domain/promo.dart';

Map<String, dynamic> _promo(Map<String, dynamic> overrides) => {
  'id': 'p1',
  'title': 'Taze',
  'linkType': 'NONE',
  'sortOrder': 0,
  'isActive': true,
  ...overrides,
};

void main() {
  group('Promo scheduling', () {
    final now = DateTime(2026, 9, 1, 12);

    test('a campaign that has not started is not live', () {
      final promo = Promo.fromJson(
        _promo({'startsAt': '2026-09-02T00:00:00.000Z'}),
      );
      expect(promo.isLiveAt(now), isFalse);
    });

    test('an expired campaign is not live', () {
      final promo = Promo.fromJson(
        _promo({'endsAt': '2026-08-31T00:00:00.000Z'}),
      );
      expect(promo.isLiveAt(now), isFalse);
    });

    test('inactive beats an open window', () {
      final promo = Promo.fromJson(_promo({'isActive': false}));
      expect(promo.isLiveAt(now), isFalse);
    });

    test('no dates means always live', () {
      expect(Promo.fromJson(_promo({})).isLiveAt(now), isTrue);
    });

    test('a window that contains now is live', () {
      final promo = Promo.fromJson(
        _promo({
          'startsAt': '2026-08-01T00:00:00.000Z',
          'endsAt': '2026-12-01T00:00:00.000Z',
        }),
      );
      expect(promo.isLiveAt(now), isTrue);
    });
  });

  group('Promo link types', () {
    test('maps the values the backend sends', () {
      expect(
        Promo.fromJson(_promo({'linkType': 'NONE'})).linkType,
        PromoLinkType.none,
      );
      expect(
        Promo.fromJson(_promo({'linkType': 'INTERNAL_SERVICE'})).linkType,
        PromoLinkType.service,
      );
      expect(
        Promo.fromJson(
          _promo({'linkType': 'INTERNAL_GALLERY_PRODUCT'}),
        ).linkType,
        PromoLinkType.galleryProduct,
      );
      expect(
        Promo.fromJson(_promo({'linkType': 'EXTERNAL_URL'})).linkType,
        PromoLinkType.external,
      );
    });

    test('an unrecognised type degrades instead of throwing', () {
      // A new link type shipped server-side must not blank the home screen of an older build.
      expect(
        Promo.fromJson(_promo({'linkType': 'INTERNAL_SOMETHING_NEW'})).linkType,
        PromoLinkType.unknown,
      );
    });

    test('empty strings are treated as absent', () {
      // The admin console writes "" where it means unset — verified live on /stories.
      final promo = Promo.fromJson(
        _promo({
          'subtitle': '',
          'badgeLabel': '',
          'sponsorLabel': '',
          'externalUrl': '',
        }),
      );
      expect(promo.subtitle, isNull);
      expect(promo.badgeLabel, isNull);
      expect(promo.sponsorLabel, isNull);
      expect(promo.externalUrl, isNull);
    });
  });

  group('CatalogService', () {
    test('reads the string decimals the API sends', () {
      final service = CatalogService.fromJson(const {
        'id': 's1',
        'code': 'TMCELL',
        'name': 'TMCELL',
        'inputType': 'PHONE',
        'minAmountTmt': '5',
        'maxAmountTmt': '500',
        'sortOrder': 1,
      });

      expect(service.minAmountTmt, 5);
      expect(service.maxAmountTmt, 500);
    });

    test('an empty validationRegex is null, not a match-everything pattern', () {
      // Verified live: TTELECOM has "validationRegex":"". Compiling that gives a regex that
      // accepts any input, which would silently disable recipient validation in Phase 3.
      final service = CatalogService.fromJson(const {
        'id': 's2',
        'code': 'TTELECOM',
        'name': 'Turkmen Telecom',
        'inputType': 'PHONE',
        'minAmountTmt': '5',
        'maxAmountTmt': '500',
        'validationRegex': '',
        'description': '',
        'logoUrl': '',
      });

      expect(service.validationRegex, isNull);
      expect(service.description, isNull);
      expect(service.logoUrl, isNull);
    });
  });
}
