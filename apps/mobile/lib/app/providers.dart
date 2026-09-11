import 'dart:ui' show PlatformDispatcher;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config/app_config.dart';
import '../core/l10n/strings.dart';
import '../core/network/api_client.dart';
import '../core/network/external_links.dart';
import '../core/sharing/shared_link_controller.dart';
import '../core/sharing/shared_text.dart';
import '../core/storage/token_store.dart';
import '../features/cargo/data/cargo_repository.dart';
import '../features/marketplace/data/marketplace_repository.dart';
import '../features/marketplace/domain/marketplace_models.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/auth/data/welcome_copy_repository.dart';
import '../features/auth/domain/welcome_copy.dart';
import '../features/auth/presentation/auth_controller.dart';
import '../features/auth/presentation/welcome_copy_controller.dart';
import '../features/gallery/data/gallery_repository.dart';
import '../features/gallery/domain/gallery_product.dart';
import '../features/gallery/presentation/gallery_controller.dart';
import '../features/home/data/home_repository.dart';
import '../features/home/domain/catalog_service.dart';
import '../features/orders/data/orders_repository.dart';
import '../features/orders/domain/order.dart';
import '../features/home/domain/promo.dart';
import '../features/profile/data/profile_repository.dart';
import '../features/profile/domain/legal_page.dart';
import '../features/profile/domain/profile_overview.dart';
import '../features/support/data/support_repository.dart';
import '../features/support/presentation/support_controller.dart';
import '../features/topup/data/topup_repository.dart';
import '../features/topup/domain/topup_options.dart';
import '../features/topup/presentation/topup_controller.dart';
import '../features/chat/data/chat_repository.dart';
import '../features/seller/data/seller_repository.dart';
import '../features/seller/domain/shop_profile.dart';
import '../features/chat/domain/chat_models.dart';
import '../features/social/data/social_feed_repository.dart';
import '../features/social/domain/social_post.dart';
import '../features/social/presentation/social_feed_controller.dart';

final appConfigProvider = Provider<AppConfig>(
  (_) => AppConfig.fromEnvironment(),
);

final tokenStoreProvider = Provider<TokenStore>((_) => SecureTokenStore());

/// Opens links that belong to someone else -- a social profile, an externally-linked promo.
final externalLinksProvider = Provider<ExternalLinks>(
  (_) => const ExternalLinks(),
);

/// The system share sheet, coming the other way: a product link sent into the app.
final sharedTextChannelProvider = Provider<SharedTextChannel>(
  (_) => const SharedTextChannel(),
);

final sharedLinkProvider = StateNotifierProvider<SharedLinkController, String?>(
  (ref) => SharedLinkController(ref.watch(sharedTextChannelProvider)),
);

/// The API client needs to tell the auth controller when a session dies, and the auth controller
/// needs the client to make requests. The cycle is broken by passing a callback that resolves the
/// controller lazily, at call time, rather than holding a reference to it.
///
/// The three providers below carry explicit variable types rather than relying on inference:
/// they reference each other, and Dart refuses to infer a top-level type through a cycle
/// (`top_level_cycle`) even when the cycle is only resolved at runtime.
final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient.create(
    config: ref.watch(appConfigProvider),
    store: ref.watch(tokenStoreProvider),
    onSessionExpired: () async =>
        ref.read(authControllerProvider.notifier).onSessionExpired(),
  );
});

final Provider<AuthRepository> authRepositoryProvider =
    Provider<AuthRepository>((ref) {
      return AuthRepository(
        api: ref.watch(apiClientProvider),
        store: ref.watch(tokenStoreProvider),
      );
    });

final StateNotifierProvider<AuthController, AuthState> authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
      return AuthController(ref.watch(authRepositoryProvider));
    });

/// The language the UI is drawn in.
///
/// The signed-in user's stored `locale` wins over the device's: someone who set the app to
/// Turkmen on their phone expects Turkmen on their tablet too. Before sign-in there is nothing
/// but the device to go on.
final stringsProvider = Provider<Strings>((ref) {
  final user = ref.watch(authControllerProvider.select((state) => state.user));
  if (user != null) return Strings.resolve(user.locale);
  return Strings.resolve(PlatformDispatcher.instance.locale.languageCode);
});

/// The welcome screen's copy, served from the CMS so the categories the app names can change
/// without a store release.
///
/// Keyed on the language, not on a user: this is the one screen shown to somebody who has no
/// account yet, so there is no session to hang it off.
final welcomeCopyRepositoryProvider = Provider<WelcomeCopyRepository>((ref) {
  return WelcomeCopyRepository(api: ref.watch(apiClientProvider));
});

final welcomeCopyProvider =
    StateNotifierProvider<WelcomeCopyController, WelcomeCopy?>((ref) {
      return WelcomeCopyController(
        ref.watch(welcomeCopyRepositoryProvider),
        ref.watch(stringsProvider).locale,
      );
    });

// ---------------------------------------------------------------------------
// Feature data
//
// Every provider below watches the signed-in user's id. That is not decoration: without it, a
// sign-out followed by a different sign-in on the same device would show the previous account's
// orders until something happened to invalidate the cache. Keying on the id makes the data
// belong to the session that fetched it.
// ---------------------------------------------------------------------------

String? _sessionKey(Ref ref) =>
    ref.watch(authControllerProvider.select((state) => state.user?.id));

final homeRepositoryProvider = Provider<HomeRepository>(
  (ref) => HomeRepository(ref.watch(apiClientProvider)),
);

final homeProvider = FutureProvider<HomeSnapshot>((ref) {
  _sessionKey(ref);
  return ref.watch(homeRepositoryProvider).load();
});

final ordersRepositoryProvider = Provider<OrdersRepository>(
  (ref) => OrdersRepository(ref.watch(apiClientProvider)),
);

final ordersProvider = FutureProvider<List<OrderSummary>>((ref) {
  _sessionKey(ref);
  return ref.watch(ordersRepositoryProvider).loadMine();
});

/// One order, for the detail screen.
///
/// Gift orders have no detail endpoint — their list row already carries everything the server
/// would return — so the list is the answer for those. Top-ups do have one, and it adds the
/// service relation the list omits, so it is fetched.
///
/// The list is **awaited**, not read as `valueOrNull`. Reading the cached value would race a
/// freshly created gift order: the list is invalidated and still refetching, the cache lookup
/// misses, and the fallback would call `GET /orders/:id` — the top-up endpoint — for a gallery
/// order id, which 404s.
///
/// A failing list must not block a top-up that could be fetched directly, so the await is
/// guarded.
final orderDetailProvider = FutureProvider.family<OrderSummary, String>((
  ref,
  id,
) async {
  var orders = const <OrderSummary>[];
  try {
    orders = await ref.watch(ordersProvider.future);
  } catch (_) {
    // Fall through to the direct fetch below.
  }

  final cached = orders.where((order) => order.id == id).firstOrNull;
  if (cached != null && cached.kind == OrderKind.gallery) return cached;
  return ref.watch(ordersRepositoryProvider).loadTopup(id);
});

final galleryRepositoryProvider = Provider<GalleryRepository>(
  (ref) => GalleryRepository(ref.watch(apiClientProvider)),
);

final galleryCategoriesProvider = FutureProvider<List<GalleryCategory>>(
  (ref) => ref.watch(galleryRepositoryProvider).loadCategories(),
);

/// Keyed by the filter, so category and search changes are separate cached requests and going
/// back to "all" is instant rather than a refetch.
final galleryProductsProvider =
    FutureProvider.family<List<GalleryProduct>, GalleryFilter>(
      (ref, filter) =>
          ref.watch(galleryRepositoryProvider).loadProducts(filter),
    );

/// One product, for a deep link or a cold start. Normally the catalogue already holds it — see
/// [GalleryRepository.loadProduct] for why this costs a full list fetch.
final galleryProductProvider = FutureProvider.family<GalleryProduct?, String>(
  (ref, id) => ref.watch(galleryRepositoryProvider).loadProduct(id),
);

final galleryOrderControllerProvider =
    StateNotifierProvider<GalleryOrderController, GalleryOrderState>((ref) {
      return GalleryOrderController(ref.watch(galleryRepositoryProvider));
    });

final socialFeedRepositoryProvider = Provider<SocialFeedRepository>(
  (ref) => SocialFeedRepository(ref.watch(apiClientProvider)),
);

/// Feed is session-bound: likes/saves and personal ranking must never outlive sign-out.
final sellerRepositoryProvider = Provider<SellerRepository>(
  (ref) => SellerRepository(ref.watch(apiClientProvider)),
);

/// One shop's public page, by handle.
final shopProvider = FutureProvider.family<ShopProfile, String>(
  (ref, handle) => ref.watch(sellerRepositoryProvider).loadShop(handle),
);

/// That shop's shelf. Separate from the profile so the header can render while it loads, and so a
/// failure to list products does not take the whole page down with it.
final shopProductsProvider = FutureProvider.family<List<GalleryProduct>, String>(
  (ref, sellerId) => ref
      .watch(galleryRepositoryProvider)
      .loadProducts(GalleryFilter(sellerId: sellerId)),
);

final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ChatRepository(ref.watch(apiClientProvider)),
);

final chatInboxProvider = FutureProvider<List<ChatConversation>>((ref) {
  _sessionKey(ref);
  return ref.watch(chatRepositoryProvider).inbox();
});

/// The badge on the navigation bar. Separate from the inbox so the number is current on every
/// screen, not only while the list is open.
final chatUnreadProvider = FutureProvider<int>((ref) {
  _sessionKey(ref);
  return ref.watch(chatRepositoryProvider).unreadTotal();
});

final chatChannelsProvider = FutureProvider<List<ChatChannel>>((ref) {
  _sessionKey(ref);
  return ref.watch(chatRepositoryProvider).channels();
});

/// A group's members and invite link. Keyed by the bare room id, not the `room:` conversation id,
/// because these endpoints address the group itself rather than the conversation in it.
final chatGroupInfoProvider = FutureProvider.family<ChatGroupInfo, String>((
  ref,
  groupId,
) {
  _sessionKey(ref);
  return ref.watch(chatRepositoryProvider).groupInfo(groupId);
});

final chatMessagesProvider = FutureProvider.family<ChatRoomView, String>((
  ref,
  conversationId,
) {
  _sessionKey(ref);
  return ref.watch(chatRepositoryProvider).messages(conversationId);
});

/// The signed-in author's own posts, every status. Session-bound like the feed itself.
final myPostsProvider = FutureProvider<List<SocialPost>>((ref) async {
  _sessionKey(ref);
  final page = await ref.watch(socialFeedRepositoryProvider).loadMine();
  return page.posts;
});

final socialFeedProvider =
    StateNotifierProvider<SocialFeedController, AsyncValue<SocialFeedState>>((
      ref,
    ) {
      _sessionKey(ref);
      return SocialFeedController(ref.watch(socialFeedRepositoryProvider));
    });

final topupRepositoryProvider = Provider<TopupRepository>(
  (ref) => TopupRepository(ref.watch(apiClientProvider)),
);

final catalogServicesProvider = FutureProvider<List<CatalogService>>(
  (ref) => ref.watch(topupRepositoryProvider).loadServices(),
);

/// Rates and payment methods for one service. Keyed by service id, so switching operator in the
/// form refetches rather than showing the previous operator's currencies.
final topupOptionsProvider = FutureProvider.family<TopupOptions, String>(
  (ref, serviceId) => ref.watch(topupRepositoryProvider).loadOptions(serviceId),
);

final cargoRepositoryProvider = Provider<CargoRepository>(
  (ref) => CargoRepository(ref.watch(apiClientProvider)),
);

final marketplaceRepositoryProvider = Provider<MarketplaceRepository>(
  (ref) => MarketplaceRepository(ref.watch(apiClientProvider)),
);

/// The last few links this customer resolved. Capped at five server-side, so this never grows
/// into a browsing record -- see MarketplaceSearchHistory's schema comment.
final marketplaceHistoryProvider = FutureProvider<List<MarketplaceSearchEntry>>(
  (ref) {
    return ref.watch(marketplaceRepositoryProvider).history();
  },
);

final marketplaceOrdersProvider = FutureProvider<List<MarketplaceOrder>>((ref) {
  _sessionKey(ref);
  return ref.watch(marketplaceRepositoryProvider).loadMine();
});

final marketplaceOrderProvider =
    FutureProvider.family<MarketplaceOrder, String>(
      (ref, id) => ref.watch(marketplaceRepositoryProvider).load(id),
    );

final topupControllerProvider =
    StateNotifierProvider<TopupController, TopupSubmitState>((ref) {
      return TopupController(ref.watch(topupRepositoryProvider));
    });

final supportRepositoryProvider = Provider<SupportRepository>(
  (ref) => SupportRepository(ref.watch(apiClientProvider)),
);

/// Not `autoDispose`: the screen stops its own polling in `dispose`, and keeping the loaded
/// conversation means coming back to support does not start from an empty screen.
final supportControllerProvider =
    StateNotifierProvider<SupportController, SupportState>((ref) {
      _sessionKey(ref);
      return SupportController(ref.watch(supportRepositoryProvider));
    });

final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => ProfileRepository(ref.watch(apiClientProvider)),
);

/// The shop's social accounts. Public data, so it is not keyed to the session.
final socialLinksProvider = FutureProvider<List<SocialLink>>(
  (ref) => ref.watch(profileRepositoryProvider).loadSocialLinks(),
);

/// One CMS page, resolved into the language the app is currently showing. Keyed by slug *and*
/// implicitly by locale through `stringsProvider`, so switching language refetches the right text
/// rather than leaving the previous language on screen.
final legalPageProvider = FutureProvider.family<LegalPage, String>((ref, slug) {
  final locale = ref.watch(stringsProvider).locale;
  return ref.watch(profileRepositoryProvider).loadLegalPage(slug, locale);
});

final profileOverviewProvider = FutureProvider<ProfileOverview>((ref) {
  _sessionKey(ref);
  return ref.watch(profileRepositoryProvider).load();
});
