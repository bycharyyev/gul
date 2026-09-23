import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import 'product_screen.dart';

/// Points the camera at a barcode and opens whatever product it names.
///
/// Reads either code this app hands out: the one a product's own page prints (its id) and the
/// one a seller types in when they list something (its SKU) -- see
/// `GalleryRepository.findByScannedCode`. Somebody standing next to a shelf, or next to a friend
/// holding up their phone, gets to the same product a search would have found, without typing
/// anything.
class BarcodeScanScreen extends ConsumerStatefulWidget {
  const BarcodeScanScreen({super.key});

  @override
  ConsumerState<BarcodeScanScreen> createState() => _BarcodeScanScreenState();
}

class _BarcodeScanScreenState extends ConsumerState<BarcodeScanScreen> {
  final _controller = MobileScannerController();

  /// Guards against the same frame's detection firing the lookup twice, and against a second
  /// barcode being read while the first is still being looked up.
  bool _busy = false;
  bool _torchOn = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_busy) return;
    final code = capture.barcodes
        .map((b) => b.rawValue?.trim())
        .firstWhere((v) => v != null && v.isNotEmpty, orElse: () => null);
    if (code == null) return;

    setState(() => _busy = true);
    final product = await ref
        .read(galleryRepositoryProvider)
        .findByScannedCode(code);
    if (!mounted) return;

    if (product == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(Strings.of(context).get('scan.notFound'))),
      );
      setState(() => _busy = false);
      return;
    }

    Navigator.of(context).pop();
    unawaited(context.push('${ProductScreen.path}/${product.id}'));
  }

  Future<void> _toggleTorch() async {
    await _controller.toggleTorch();
    if (mounted) setState(() => _torchOn = !_torchOn);
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(strings.get('scan.title')),
        actions: [
          IconButton(
            onPressed: _toggleTorch,
            icon: Icon(
              _torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
            ),
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) => _ScanError(error: error),
          ),
          if (_busy)
            const ColoredBox(
              color: Color(0x66000000),
              child: Center(child: CircularProgressIndicator()),
            ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 32,
            child: Text(
              strings.get('scan.hint'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScanError extends StatelessWidget {
  const _ScanError({required this.error});
  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final message = switch (error.errorCode) {
      MobileScannerErrorCode.permissionDenied => strings.get(
        'scan.permissionDenied',
      ),
      MobileScannerErrorCode.unsupported => strings.get('scan.unsupported'),
      _ => strings.get('err.unknown'),
    };
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, height: 1.4),
          ),
        ),
      ),
    );
  }
}
