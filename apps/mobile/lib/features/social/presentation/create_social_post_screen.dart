import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/remote_image.dart';
import '../../gallery/data/gallery_repository.dart';
import '../../gallery/domain/gallery_product.dart';
import '../domain/social_post.dart';
import 'social_feed_screen.dart';

/// Writing a post.
///
/// Deliberately shaped like a post box and not like a form: a text field you can simply type in,
/// and two optional attachments under it. The kind of post is *derived* from what is attached —
/// nobody decides in advance that they are writing "a photo post" and then goes looking for a
/// photo. It used to open on a three-way Видео/Фото/Текст switch, ask for a caption, a media
/// file, a separate cover image for video, and a comma-separated list of product **ids** typed by
/// hand, which is not something a person can do.
class CreateSocialPostScreen extends ConsumerStatefulWidget {
  const CreateSocialPostScreen({super.key});
  static const path = 'create';
  @override
  ConsumerState<CreateSocialPostScreen> createState() =>
      _CreateSocialPostScreenState();
}

class _CreateSocialPostScreenState
    extends ConsumerState<CreateSocialPostScreen> {
  final _text = TextEditingController();

  /// The uploaded file's URL and what it turned out to be. Null until something is attached; the
  /// post is TEXT for exactly as long as this is null.
  String? _mediaUrl;
  SocialPostKind? _mediaKind;

  /// Local file shown while and after uploading, so the attachment is visible as a picture rather
  /// than as the URL string the old screen printed under the button.
  File? _preview;

  final List<GalleryProduct> _products = [];
  static const _maxProducts = 6;

  bool _busy = false;
  bool _uploading = false;
  double? _progress;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  bool get _canPost =>
      !_busy &&
      !_uploading &&
      (_text.text.trim().isNotEmpty || _mediaUrl != null);

  Future<void> _submit() async {
    final s = Strings.of(context);
    if (!_canPost) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(socialFeedRepositoryProvider)
          .create(
            kind: _mediaKind ?? SocialPostKind.text,
            body: _text.text,
            mediaUrl: _mediaUrl,
            productIds: _products.map((p) => p.id).toList(),
          );
      ref.invalidate(socialFeedProvider);
      ref.invalidate(myPostsProvider);
      if (!mounted) return;
      // A new post is created PENDING and the feed lists only PUBLISHED ones, so going straight
      // back to a feed that does not contain it is indistinguishable from the post never having
      // been created. Say where it went.
      _toast(s.get('feed.sentToModeration'));
      context.go(SocialFeedScreen.path);
    } catch (e) {
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
  /// mirror uploads.constants.ts — if those change, these follow.
  static const _maxImageBytes = 8 * 1024 * 1024;
  static const _maxVideoBytes = 60 * 1024 * 1024;

  /// One attachment button for both, because the phone's gallery holds both and the distinction
  /// only matters afterwards. What came back decides whether this is a photo post or a video one.
  Future<void> _attach({required bool video}) async {
    final s = Strings.of(context);
    final picker = ImagePicker();
    final picked = video
        ? await picker.pickVideo(source: ImageSource.gallery)
        : await picker.pickImage(source: ImageSource.gallery);
    if (picked == null || !mounted) return;
    final file = File(picked.path);
    final limit = video ? _maxVideoBytes : _maxImageBytes;
    if (await file.length() > limit) {
      _toast(
        '${s.get('feed.fileTooLarge')} ${(limit / (1024 * 1024)).round()} МБ',
      );
      return;
    }
    setState(() {
      _uploading = true;
      _progress = 0;
      _preview = file;
    });
    try {
      final result = await ref
          .read(socialFeedRepositoryProvider)
          .uploadMedia(
            file,
            onProgress: (value) {
              if (mounted) setState(() => _progress = value);
            },
          );
      if (!mounted) return;
      setState(() {
        _mediaUrl = result.url;
        _mediaKind = result.kind;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _preview = null);
        _toast(e is AppException ? s.error(e) : s.get('feed.uploadFailed'));
      }
    } finally {
      if (mounted) {
        setState(() {
          _uploading = false;
          _progress = null;
        });
      }
    }
  }

  void _detach() => setState(() {
    _mediaUrl = null;
    _mediaKind = null;
    _preview = null;
  });

  Future<void> _addProduct() async {
    final chosen = await showModalBottomSheet<GalleryProduct>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _ProductPicker(),
    );
    if (chosen == null || !mounted) return;
    if (_products.any((p) => p.id == chosen.id)) return;
    setState(() => _products.add(chosen));
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(s.get('feed.create')),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton(
              // The app's FilledButton theme asks for `Size.fromHeight(54)` — that is
              // `Size(infinity, 54)`, meant for the full-width primary button at the bottom of a
              // page. In an AppBar's actions row that demand takes the whole toolbar: the button
              // is laid out wider than the bar and draws nothing, and the title is squeezed to
              // zero. Both simply vanished. A toolbar button has to state its own size.
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 40),
                padding: const EdgeInsets.symmetric(horizontal: 18),
                textStyle: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              onPressed: _canPost ? _submit : null,
              child: Text(
                _uploading ? s.get('feed.uploading') : s.get('feed.publish'),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            TextField(
              controller: _text,
              autofocus: true,
              maxLines: null,
              minLines: 4,
              maxLength: 1200,
              textCapitalization: TextCapitalization.sentences,
              keyboardType: TextInputType.multiline,
              // No label and no border: the page is the post. A label above an empty box is the
              // thing that makes a composer feel like paperwork.
              decoration: InputDecoration(
                hintText: s.get('feed.composer.hint'),
                border: InputBorder.none,
                counterText: '',
              ),
              style: theme.textTheme.titleMedium,
              onChanged: (_) => setState(() {}),
            ),
            if (_preview != null) ...[
              const SizedBox(height: 8),
              _Attachment(
                file: _preview!,
                isVideo: _mediaKind == SocialPostKind.video,
                uploading: _uploading,
                progress: _progress,
                onRemove: _uploading ? null : _detach,
              ),
            ],
            if (_products.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final product in _products)
                    InputChip(
                      avatar: const Icon(Icons.shopping_bag_outlined, size: 18),
                      label: Text(product.name),
                      onDeleted: () =>
                          setState(() => _products.remove(product)),
                    ),
                ],
              ),
            ],
            const Divider(height: 32),
            Row(
              children: [
                IconButton(
                  tooltip: s.get('feed.composer.addPhoto'),
                  onPressed: _uploading ? null : () => _attach(video: false),
                  icon: const Icon(Icons.image_outlined),
                ),
                IconButton(
                  tooltip: s.get('feed.composer.addVideo'),
                  onPressed: _uploading ? null : () => _attach(video: true),
                  icon: const Icon(Icons.videocam_outlined),
                ),
                IconButton(
                  tooltip: s.get('feed.composer.addProduct'),
                  onPressed: _products.length >= _maxProducts
                      ? null
                      : _addProduct,
                  icon: const Icon(Icons.sell_outlined),
                ),
                const Spacer(),
                Text(
                  '${_text.text.characters.length}/1200',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.outline,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              s.get('feed.productNote'),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The attached file, shown as itself.
class _Attachment extends StatelessWidget {
  const _Attachment({
    required this.file,
    required this.isVideo,
    required this.uploading,
    required this.progress,
    required this.onRemove,
  });

  final File file;
  final bool isVideo;
  final bool uploading;
  final double? progress;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Stack(
        children: [
          // A video file cannot be drawn by Image.file, so it gets a plain plate with a film icon
          // rather than a broken-image box.
          if (isVideo)
            Container(
              height: 200,
              width: double.infinity,
              color: theme.colorScheme.surfaceContainerHighest,
              child: Icon(
                Icons.movie_outlined,
                size: 48,
                color: theme.colorScheme.outline,
              ),
            )
          else
            Image.file(
              file,
              height: 200,
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                height: 200,
                color: theme.colorScheme.surfaceContainerHighest,
              ),
            ),
          if (uploading)
            Positioned.fill(
              child: ColoredBox(
                color: const Color(0x66000000),
                child: Center(
                  // Determinate as soon as the first bytes are acknowledged: an indeterminate
                  // ring on a two-minute video upload says the same thing as a frozen screen.
                  child: CircularProgressIndicator(
                    value: progress,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          if (onRemove != null)
            Positioned(
              top: 8,
              right: 8,
              child: IconButton.filled(
                onPressed: onRemove,
                iconSize: 18,
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0xAA000000),
                ),
                icon: const Icon(Icons.close_rounded, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}

/// Choosing a product to tag, by looking at it.
///
/// What this replaces: a text field into which the author was expected to type product ids,
/// comma-separated. Nobody knows a cuid, so in practice no post ever carried a product.
class _ProductPicker extends ConsumerStatefulWidget {
  const _ProductPicker();
  @override
  ConsumerState<_ProductPicker> createState() => _ProductPickerState();
}

class _ProductPickerState extends ConsumerState<_ProductPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    // Searched on the server, like the catalogue: filtering a downloaded page works at five
    // products and stops working the moment the catalogue is real.
    final products = ref.watch(
      galleryProductsProvider(GalleryFilter(search: _query)),
    );
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.7,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                autofocus: true,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: s.get('feed.composer.searchProduct'),
                ),
                onChanged: (value) => setState(() => _query = value.trim()),
              ),
            ),
            Expanded(
              child: products.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => Center(child: Text(s.get('err.unknown'))),
                data: (list) => list.isEmpty
                    ? Center(child: Text(s.get('feed.composer.noProducts')))
                    : ListView.builder(
                        itemCount: list.length,
                        itemBuilder: (_, i) => ListTile(
                          leading: RemoteImage(
                            url: list[i].imageUrl,
                            width: 48,
                            height: 48,
                            fallbackIcon: Icons.shopping_bag_outlined,
                          ),
                          title: Text(list[i].name),
                          subtitle: Text(Money.tmt(list[i].priceTmt, s.locale)),
                          onTap: () => Navigator.of(context).pop(list[i]),
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
