import 'package:flutter/material.dart';

import '../../../core/l10n/strings.dart';
import '../domain/chat_models.dart';

class OfficialChatLabel extends StatelessWidget {
  const OfficialChatLabel({super.key, required this.category});

  final ChatOfficialCategory category;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.verified_rounded,
          size: 14,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            '${strings.get('chat.official')} · ${strings.get('chat.${category.name}')}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}
