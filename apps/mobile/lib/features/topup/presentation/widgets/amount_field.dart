import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/format/money.dart';
import '../../../../core/l10n/strings.dart';

/// The TMT amount: quick picks plus free entry.
///
/// The chips are the fast path — most top-ups are a round number — and the field is there for
/// everything else. Chips outside the service's own `minAmountTmt`/`maxAmountTmt` are not
/// rendered at all rather than shown and rejected on submit.
class AmountField extends StatelessWidget {
  const AmountField({
    super.key,
    required this.controller,
    required this.min,
    required this.max,
    required this.enabled,
    required this.onChanged,
  });

  final TextEditingController controller;
  final double min;
  final double max;
  final bool enabled;
  final ValueChanged<String> onChanged;

  static const _presets = [10.0, 20.0, 50.0, 100.0, 200.0];

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final presets = _presets.where((p) => p >= min && p <= max).toList();
    final current = parseAmount(controller.text);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          controller: controller,
          enabled: enabled,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          textInputAction: TextInputAction.done,
          // Digits and one separator. A numeric keyboard is a hint, not a guarantee — and this
          // field ends up in a money value, where a stray character is a failed order.
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
          ],
          onChanged: onChanged,
          decoration: InputDecoration(
            labelText: strings.get('topup.amount'),
            suffixText: 'TMT',
            helperText:
                '${strings.get('topup.amount.range')} '
                '${Money.amount(min, strings.locale)}–${Money.amount(max, strings.locale)} TMT',
            helperMaxLines: 2,
          ),
          validator: (value) {
            final amount = parseAmount(value);
            if (amount == null) return strings.get('topup.amount.invalid');
            // Mirrors the server's own bound check, which returns an English message.
            if (amount < min || amount > max) {
              return strings.get('topup.amount.invalid');
            }
            return null;
          },
        ),
        if (presets.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final preset in presets)
                ChoiceChip(
                  label: Text(Money.amount(preset, strings.locale)),
                  selected: current == preset,
                  onSelected: enabled
                      ? (_) {
                          final text = Money.amount(
                            preset,
                            'en',
                          ).replaceAll(',', '');
                          controller.text = text;
                          onChanged(text);
                        }
                      : null,
                  // 44dp minimum: a chip sized to its label alone is a 30dp target.
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  side: BorderSide(color: scheme.outlineVariant),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Accepts both decimal separators. People here type `25,5` as readily as `25.5`, and a form that
/// rejects the comma silently blames the user for a locale difference.
double? parseAmount(String? raw) {
  final text = (raw ?? '').trim().replaceAll(',', '.');
  if (text.isEmpty) return null;
  final value = double.tryParse(text);
  if (value == null || value <= 0) return null;
  return value;
}
