import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../domain/social_post.dart';
import 'social_feed_screen.dart';

class CreateSocialPostScreen extends ConsumerStatefulWidget {
  const CreateSocialPostScreen({super.key});
  static const path = 'create';
  @override
  ConsumerState<CreateSocialPostScreen> createState() =>
      _CreateSocialPostScreenState();
}

class _CreateSocialPostScreenState
    extends ConsumerState<CreateSocialPostScreen> {
  final _form = GlobalKey<FormState>();
  final _text = TextEditingController();
  final _media = TextEditingController();
  final _thumbnail = TextEditingController();
  final _product = TextEditingController();
  SocialPostKind _kind = SocialPostKind.video;
  bool _busy = false;
  bool _uploadingMedia = false;
  bool _uploadingThumbnail = false;
  // 0..1 while a file is going out, null otherwise. Null and 0 are different things here: null
  // means "not uploading", 0 means "uploading, nothing sent yet".
  double? _mediaProgress;
  double? _thumbnailProgress;
  @override
  void dispose() {
    _text.dispose();
    _media.dispose();
    _thumbnail.dispose();
    _product.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final s = Strings.of(context);
    if (_kind == SocialPostKind.text && _text.text.trim().isEmpty) {
      _toast(s.get('feed.captionRequired'));
      return;
    }
    if (_kind != SocialPostKind.text && _media.text.trim().isEmpty) {
      _toast(s.get('feed.mediaRequired'));
      return;
    }
    if (_kind == SocialPostKind.video && _thumbnail.text.trim().isEmpty) {
      _toast(s.get('feed.thumbnailRequired'));
      return;
    }
    setState(() => _busy = true);
    try {
      await ref
          .read(socialFeedRepositoryProvider)
          .create(
            kind: _kind,
            body: _text.text,
            mediaUrl: _media.text,
            thumbnailUrl: _thumbnail.text,
            productIds: _product.text
                .split(',')
                .map((id) => id.trim())
                .where((id) => id.isNotEmpty)
                .take(6)
                .toList(),
          );
      ref.invalidate(socialFeedProvider);
      if (!mounted) return;
      // A new post is created PENDING and the feed lists only PUBLISHED ones, so going straight
      // back to a feed that does not contain it is indistinguishable from the post never having
      // been created. Say where it went.
      _toast(s.get('feed.sentToModeration'));
      context.go(SocialFeedScreen.path);
    } catch (e) {
      // Previously there was no catch at all: a rejected post threw into nothing, the screen sat
      // there, and "publishing does not work" was the only conclusion available to the person
      // looking at it.
      if (mounted) {
        _toast(e is AppException ? s.error(e) : s.get('feed.publishFailed'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// What the server accepts, checked before the bytes go out.
  ///
  /// nginx and the API both cap an upload; without this the customer waits through a whole video
  /// upload on a mobile connection only to be told at the end that it was too big. The numbers
  /// mirror uploads.constants.ts -- if those change, these follow.
  static const _maxImageBytes = 8 * 1024 * 1024;
  static const _maxVideoBytes = 60 * 1024 * 1024;

  /// True when the file is small enough to send; toasts and returns false when it is not.
  Future<bool> _withinLimit(
    Strings s,
    File file, {
    required bool isVideo,
  }) async {
    final bytes = await file.length();
    final limit = isVideo ? _maxVideoBytes : _maxImageBytes;
    if (bytes <= limit) return true;
    final mb = (limit / (1024 * 1024)).round();
    _toast('${s.get('feed.fileTooLarge')} $mb МБ');
    return false;
  }

  /// The spinner while a file is going out, showing how far along it is.
  ///
  /// Determinate the moment the first bytes are acknowledged: an indeterminate ring says only
  /// "something is happening", which on a two-minute video upload is the same information as a
  /// frozen screen.
  Widget _uploadSpinner(double? progress) => SizedBox(
    width: 18,
    height: 18,
    child: CircularProgressIndicator(strokeWidth: 2, value: progress),
  );

  String _uploadLabel(Strings s, double? progress) => progress == null
      ? s.get('feed.uploading')
      : '${s.get('feed.uploading')} ${(progress * 100).round()}%';

  Future<void> _pickMedia() async {
    final s = Strings.of(context);
    setState(() {
      _uploadingMedia = true;
      _mediaProgress = null;
    });
    try {
      final picker = ImagePicker();
      final picked = _kind == SocialPostKind.video
          ? await picker.pickVideo(source: ImageSource.gallery)
          : await picker.pickImage(
              source: ImageSource.gallery,
              maxWidth: 1600,
              imageQuality: 88,
            );
      if (picked == null) return;
      final file = File(picked.path);
      if (!await _withinLimit(
        s,
        file,
        isVideo: _kind == SocialPostKind.video,
      )) {
        return;
      }
      final result = await ref
          .read(socialFeedRepositoryProvider)
          .uploadMedia(
            file,
            onProgress: (value) {
              if (mounted) setState(() => _mediaProgress = value);
            },
          );
      setState(() {
        _kind = result.kind;
        _media.text = result.url;
        if (result.kind == SocialPostKind.photo) _thumbnail.clear();
      });
    } catch (e) {
      _toast(e is AppException ? s.error(e) : s.get('feed.uploadFailed'));
    } finally {
      if (mounted) {
        setState(() {
          _uploadingMedia = false;
          _mediaProgress = null;
        });
      }
    }
  }

  Future<void> _pickThumbnail() async {
    final s = Strings.of(context);
    setState(() {
      _uploadingThumbnail = true;
      _thumbnailProgress = null;
    });
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1200,
        imageQuality: 82,
      );
      if (picked == null) return;
      final file = File(picked.path);
      if (!await _withinLimit(s, file, isVideo: false)) return;
      final result = await ref
          .read(socialFeedRepositoryProvider)
          .uploadMedia(
            file,
            onProgress: (value) {
              if (mounted) setState(() => _thumbnailProgress = value);
            },
          );
      if (result.kind != SocialPostKind.photo) {
        _toast(s.get('feed.thumbnailMustBeImage'));
        return;
      }
      setState(() => _thumbnail.text = result.url);
    } catch (e) {
      _toast(e is AppException ? s.error(e) : s.get('feed.uploadFailed'));
    } finally {
      if (mounted) {
        setState(() {
          _uploadingThumbnail = false;
          _thumbnailProgress = null;
        });
      }
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.get('feed.create'))),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              SegmentedButton<SocialPostKind>(
                segments: [
                  for (final kind in SocialPostKind.values)
                    ButtonSegment(
                      value: kind,
                      icon: Icon(_icon(kind)),
                      label: Text(s.get('feed.kind.${kind.name}')),
                    ),
                ],
                selected: {_kind},
                onSelectionChanged: (v) => setState(() => _kind = v.first),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _text,
                maxLines: 4,
                maxLength: 1200,
                decoration: InputDecoration(
                  labelText: s.get('feed.caption'),
                  hintText: s.get('feed.captionHint'),
                ),
              ),
              if (_kind != SocialPostKind.text) ...[
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: _uploadingMedia ? null : _pickMedia,
                  icon: _uploadingMedia
                      ? _uploadSpinner(_mediaProgress)
                      : Icon(_icon(_kind)),
                  label: Text(
                    _uploadingMedia
                        ? _uploadLabel(s, _mediaProgress)
                        : _media.text.isEmpty
                        ? s.get('feed.uploadMedia')
                        : s.get('feed.mediaSelected'),
                  ),
                ),
                if (_media.text.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      _media.text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
              if (_kind == SocialPostKind.video) ...[
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: _uploadingThumbnail ? null : _pickThumbnail,
                  icon: _uploadingThumbnail
                      ? _uploadSpinner(_thumbnailProgress)
                      : const Icon(Icons.image_outlined),
                  label: Text(
                    _uploadingThumbnail
                        ? _uploadLabel(s, _thumbnailProgress)
                        : _thumbnail.text.isEmpty
                        ? s.get('feed.uploadThumbnail')
                        : s.get('feed.thumbnailSelected'),
                  ),
                ),
                if (_thumbnail.text.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      _thumbnail.text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
              const SizedBox(height: 14),
              TextFormField(
                controller: _product,
                decoration: InputDecoration(
                  labelText: s.get('feed.productId'),
                  hintText: s.get('feed.productHint'),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                s.get('feed.productNote'),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _busy || _uploadingMedia || _uploadingThumbnail
                    ? null
                    : _submit,
                child: Text(
                  _uploadingMedia || _uploadingThumbnail
                      ? s.get('feed.uploading')
                      : s.get('feed.publish'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _icon(SocialPostKind kind) => switch (kind) {
    SocialPostKind.video => Icons.play_circle_outline_rounded,
    SocialPostKind.photo => Icons.image_outlined,
    SocialPostKind.text => Icons.text_fields_rounded,
  };
}
