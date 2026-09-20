/// Countries a person can say they are in. The server fills this in from the phone number at
/// registration; the profile lets them correct it, and it decides which country-targeted
/// notifications they receive. Keep in step with `apps/api/src/common/phone-country.ts`.
class CountryOption {
  const CountryOption(this.code, this.ru, this.en, this.tkm);

  final String code;
  final String ru;
  final String en;
  final String tkm;

  String name(String locale) => switch (locale) {
    'en' => en,
    'tkm' => tkm,
    _ => ru,
  };
}

const countryOptions = <CountryOption>[
  CountryOption('TM', 'Туркменистан', 'Turkmenistan', 'Türkmenistan'),
  CountryOption('RU', 'Россия', 'Russia', 'Russiýa'),
  CountryOption('KZ', 'Казахстан', 'Kazakhstan', 'Gazagystan'),
  CountryOption('CN', 'Китай', 'China', 'Hytaý'),
  CountryOption('TR', 'Турция', 'Türkiye', 'Türkiýe'),
  CountryOption('UZ', 'Узбекистан', 'Uzbekistan', 'Özbegistan'),
  CountryOption('KG', 'Кыргызстан', 'Kyrgyzstan', 'Gyrgyzystan'),
  CountryOption('TJ', 'Таджикистан', 'Tajikistan', 'Täjigistan'),
  CountryOption('AZ', 'Азербайджан', 'Azerbaijan', 'Azerbaýjan'),
  CountryOption('GE', 'Грузия', 'Georgia', 'Gruziýa'),
  CountryOption('AM', 'Армения', 'Armenia', 'Ermenistan'),
  CountryOption('BY', 'Беларусь', 'Belarus', 'Belarus'),
  CountryOption('UA', 'Украина', 'Ukraine', 'Ukraina'),
  CountryOption(
    'AE',
    'ОАЭ',
    'United Arab Emirates',
    'Birleşen Arap Emirlikleri',
  ),
  CountryOption('IR', 'Иран', 'Iran', 'Eýran'),
  CountryOption('DE', 'Германия', 'Germany', 'Germaniýa'),
  CountryOption('GB', 'Великобритания', 'United Kingdom', 'Beýik Britaniýa'),
  CountryOption('US', 'США', 'United States', 'ABŞ'),
];
