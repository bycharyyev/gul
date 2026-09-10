import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/crystal.dart';
import '../../../core/widgets/status_chip.dart';
import '../domain/cargo_models.dart';

class TrackScreen extends ConsumerStatefulWidget {
  const TrackScreen({super.key});

  static const path = 'track';

  @override
  ConsumerState<TrackScreen> createState() => _TrackScreenState();
}

class _TrackScreenState extends ConsumerState<TrackScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;
  PublicTracking? _result;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final value = _controller.text.trim();
    if (value.isEmpty) return;
    final strings = Strings.of(context);
    setState(() {
      _loading = true;
      _error = null;
      _result = null;
    });
    try {
      final result = await ref.read(cargoRepositoryProvider).track(value);
      if (mounted) setState(() => _result = result);
    } on AppException {
      if (mounted) setState(() => _error = strings.get('cargo.trackNotFound'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('cargo.trackTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          16,
          16,
          16,
          AppShell.contentBottomInset,
        ),
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _search(),
                  decoration: InputDecoration(
                    labelText: strings.get('cargo.trackPlaceholder'),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton(
                onPressed: _loading ? null : _search,
                child: _loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(strings.get('cargo.trackSubmit')),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          if (_result != null) ...[
            const SizedBox(height: 22),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _result!.trackingNumber,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${_result!.originCity.name} → ${_result!.destinationCity.name}',
                      ),
                    ],
                  ),
                ),
                StatusChip(status: _result!.status),
              ],
            ),
            const SizedBox(height: 18),
            CrystalSurface(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final ev in _result!.events)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              margin: const EdgeInsets.only(top: 5),
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.primary,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                strings.get(
                                  'status.${ev.status.toLowerCase()}',
                                  fallback: ev.status,
                                ),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
