import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../app/providers.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/l10n/strings.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/remote_image.dart';

/// The customer's photo, and the way they change it.
///
/// A person icon when there is no photo -- never an empty circle, which reads as a broken image
/// rather than as "you have not added one".
///
/// The picker downscales before upload: `POST /avatar` rejects anything over 5 MB, and a modern
/// phone camera produces a file several times that. Sending the original would mean a long upload
/// on a mobile connection ending in a rejection, which is the worst possible order of events.
class AvatarEditor extends ConsumerStatefulWidget {
  const AvatarEditor({super.key, required this.avatarUrl, this.size = 76});

  final String? avatarUrl;
  final double size;

  @override
  ConsumerState<AvatarEditor> createState() => _AvatarEditorState();
}

class _AvatarEditorState extends ConsumerState<AvatarEditor> {
  bool _busy = false;

  Future<void> _pick(ImageSource source) async {
    final strings = Strings.of(context);
    setState(() => _busy = true);

    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        // Comfortably above what a 76dp circle or a nav-bar thumbnail needs, and small enough
        // that the upload finishes on a slow connection.
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (picked == null) {
        if (mounted) setState(() => _busy = false);
        return;
      }

      final user = await ref
          .read(profileRepositoryProvider)
          .uploadAvatar(File(picked.path));
      // One source of truth: every screen reading `user.avatarUrl` -- the nav bar included --
      // updates from this.
      ref.read(authControllerProvider.notifier).applyUser(user);
      if (!mounted) return;
      setState(() => _busy = false);
      _toast(strings.get('profile.avatar.updated'));
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _toast(
        e is AppException
            ? strings.error(e)
            : strings.get('profile.avatar.failed'),
      );
    }
  }

  Future<void> _remove() async {
    final strings = Strings.of(context);
    setState(() => _busy = true);
    try {
      final user = await ref.read(profileRepositoryProvider).removeAvatar();
      ref.read(authControllerProvider.notifier).applyUser(user);
      if (!mounted) return;
      setState(() => _busy = false);
      _toast(strings.get('profile.avatar.removed'));
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _toast(
        e is AppException
            ? strings.error(e)
            : strings.get('profile.avatar.failed'),
      );
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _openSheet() async {
    final strings = Strings.of(context);
    final hasPhoto = widget.avatarUrl != null;

    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(strings.get('profile.avatar.gallery')),
              onTap: () => Navigator.of(context).pop('gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text(strings.get('profile.avatar.camera')),
              onTap: () => Navigator.of(context).pop('camera'),
            ),
            if (hasPhoto)
              ListTile(
                leading: Icon(
                  Icons.delete_outline_rounded,
                  color: Theme.of(context).colorScheme.error,
                ),
                title: Text(
                  strings.get('profile.avatar.remove'),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
                onTap: () => Navigator.of(context).pop('remove'),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (!mounted || action == null) return;
    switch (action) {
      case 'gallery':
        await _pick(ImageSource.gallery);
      case 'camera':
        await _pick(ImageSource.camera);
      case 'remove':
        await _remove();
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Semantics(
      button: true,
      label: strings.get('profile.avatar.change'),
      child: GestureDetector(
        onTap: _busy ? null : _openSheet,
        child: SizedBox(
          width: widget.size,
          height: widget.size,
          child: Stack(
            children: [
              Container(
                width: widget.size,
                height: widget.size,
                padding: const EdgeInsets.all(2.5),
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [AppTheme.brand, AppTheme.accent],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: RemoteImage(
                  url: widget.avatarUrl,
                  width: widget.size,
                  height: widget.size,
                  borderRadius: 999,
                  fallbackIcon: Icons.person_rounded,
                ),
              ),
              if (_busy)
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.black.withValues(alpha: 0.45),
                    ),
                    child: const Center(
                      child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                )
              else
                // The affordance. Without it, "tap your photo to change it" is a secret.
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: scheme.primary,
                      shape: BoxShape.circle,
                      border: Border.all(color: scheme.surface, width: 2),
                    ),
                    child: const Icon(
                      Icons.edit_rounded,
                      size: 12,
                      color: Colors.white,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
