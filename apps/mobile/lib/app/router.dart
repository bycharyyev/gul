import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/auth_controller.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/register_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/auth/presentation/welcome_screen.dart';
import '../features/cargo/presentation/cargo_home_screen.dart';
import '../features/cargo/presentation/create_shipment_screen.dart';
import '../features/cargo/presentation/shipment_detail_screen.dart';
import '../features/cargo/presentation/track_screen.dart';
import '../features/gallery/presentation/gallery_checkout_screen.dart';
import '../features/gallery/presentation/gallery_screen.dart';
import '../features/gallery/presentation/product_screen.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/marketplace/presentation/create_marketplace_order_screen.dart';
import '../features/marketplace/presentation/marketplace_home_screen.dart';
import '../features/marketplace/presentation/marketplace_order_detail_screen.dart';
import '../features/chat/presentation/channels_screen.dart';
import '../features/chat/presentation/group_info_screen.dart';
import '../features/chat/presentation/join_group_screen.dart';
import '../features/chat/presentation/new_group_screen.dart';
import '../features/chat/presentation/chat_inbox_screen.dart';
import '../features/chat/presentation/chat_room_screen.dart';
import '../features/orders/presentation/order_detail_screen.dart';
import '../features/orders/presentation/orders_screen.dart';
import '../features/profile/presentation/change_password_screen.dart';
import '../features/profile/presentation/edit_profile_screen.dart';
import '../features/profile/presentation/email_verification_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/profile/presentation/legal_page_screen.dart';
import '../features/profile/presentation/referral_screen.dart';
import '../features/support/presentation/support_screen.dart';
import '../features/topup/presentation/topup_screen.dart';
import '../features/social/presentation/create_social_post_screen.dart';
import '../features/social/presentation/social_feed_screen.dart';
import 'providers.dart';
import 'shell.dart';

/// Routes that a signed-out user is allowed to reach.
const _publicRoutes = {
  WelcomeScreen.path,
  LoginScreen.path,
  RegisterScreen.path,
};

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefreshNotifier(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: SplashScreen.path,
    refreshListenable: refresh,
    routes: [
      GoRoute(
        path: SplashScreen.path,
        builder: (_, __) => const SplashScreen(),
      ),
      GoRoute(
        path: WelcomeScreen.path,
        builder: (_, __) => const WelcomeScreen(),
      ),
      GoRoute(path: LoginScreen.path, builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: RegisterScreen.path,
        builder: (_, __) => const RegisterScreen(),
      ),

      // A stateful shell, so each tab keeps its own navigation stack and scroll position.
      // Switching to Profile and back must not reset a scrolled order list — losing your place
      // is the classic bottom-nav regression.
      StatefulShellRoute.indexedStack(
        builder: (_, __, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: HomeScreen.path,
                builder: (_, __) => const HomeScreen(),
                routes: [
                  // Cargo is a full flow of its own, nested under Home rather than a sixth bottom
                  // tab (Material's own cap is five) -- reachable from a card on Home, per the
                  // design review done for this vertical.
                  // Orders live here since the fifth bottom tab went to conversations. Nested, so
                  // opening one keeps the bottom bar where it was.
                  GoRoute(
                    path: OrdersScreen.pathSegment,
                    builder: (_, __) => const OrdersScreen(),
                    routes: [
                      GoRoute(
                        path: '${OrderDetailScreen.pathSegment}/:id',
                        builder: (_, state) => OrderDetailScreen(
                          orderId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: CargoHomeScreen.path,
                    builder: (_, __) => const CargoHomeScreen(),
                    routes: [
                      GoRoute(
                        path: CreateShipmentScreen.path,
                        builder: (_, __) => const CreateShipmentScreen(),
                      ),
                      GoRoute(
                        path: '${ShipmentDetailScreen.pathSegment}/:id',
                        builder: (_, state) => ShipmentDetailScreen(
                          shipmentId: state.pathParameters['id']!,
                        ),
                      ),
                      GoRoute(
                        path: TrackScreen.path,
                        builder: (_, __) => const TrackScreen(),
                      ),
                      // Buying on the customer's behalf is a Cargo service, not a separate
                      // product: the parcel it produces travels the same route, to the same
                      // address, and shows up in the same list. Nesting the route says so, and
                      // the back button then lands on Cargo rather than the app home.
                      GoRoute(
                        path: MarketplaceHomeScreen.path,
                        builder: (_, __) => const MarketplaceHomeScreen(),
                        routes: [
                          GoRoute(
                            path: CreateMarketplaceOrderScreen.path,
                            builder: (_, __) =>
                                const CreateMarketplaceOrderScreen(),
                          ),
                          GoRoute(
                            path:
                                '${MarketplaceOrderDetailScreen.pathSegment}/:id',
                            builder: (_, state) => MarketplaceOrderDetailScreen(
                              orderId: state.pathParameters['id']!,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: SocialFeedScreen.path,
                builder: (_, __) => const SocialFeedScreen(),
                routes: [
                  GoRoute(
                    path: CreateSocialPostScreen.path,
                    builder: (_, __) => const CreateSocialPostScreen(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: GalleryScreen.path,
                builder: (_, __) => const GalleryScreen(),
                routes: [
                  GoRoute(
                    path: 'product/:id',
                    builder: (_, state) =>
                        ProductScreen(productId: state.pathParameters['id']!),
                  ),
                  GoRoute(
                    path: 'checkout/:id',
                    builder: (_, state) => GalleryCheckoutScreen(
                      productId: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: ChatInboxScreen.path,
                builder: (_, __) => const ChatInboxScreen(),
                routes: [
                  // Nested, so a conversation opens inside the Chats tab and the bottom bar stays
                  // put — the tab is still where you are.
                  GoRoute(
                    path: ChannelsScreen.pathSegment,
                    builder: (_, __) => const ChannelsScreen(),
                  ),
                  GoRoute(
                    path: NewGroupScreen.pathSegment,
                    builder: (_, __) => const NewGroupScreen(),
                  ),
                  GoRoute(
                    path: '${GroupInfoScreen.pathSegment}/:id',
                    builder: (_, state) =>
                        GroupInfoScreen(groupId: state.pathParameters['id']!),
                  ),
                  // Two routes rather than one optional parameter: arriving from a link carries
                  // the code, arriving from the inbox has nothing to carry yet.
                  GoRoute(
                    path: JoinGroupScreen.pathSegment,
                    builder: (_, __) => const JoinGroupScreen(),
                  ),
                  GoRoute(
                    path: '${JoinGroupScreen.pathSegment}/:code',
                    builder: (_, state) =>
                        JoinGroupScreen(code: state.pathParameters['code']),
                  ),
                  GoRoute(
                    path: '${ChatRoomScreen.pathSegment}/:id',
                    builder: (_, state) => ChatRoomScreen(
                      conversationId: Uri.decodeComponent(
                        state.pathParameters['id']!,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: ProfileScreen.path,
                builder: (_, __) => const ProfileScreen(),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (_, __) => const EditProfileScreen(),
                  ),
                  GoRoute(
                    path: 'password',
                    builder: (_, __) => const ChangePasswordScreen(),
                  ),
                  GoRoute(
                    path: 'email',
                    builder: (_, __) => const EmailVerificationScreen(),
                  ),
                  GoRoute(
                    path: 'referral',
                    builder: (_, __) => const ReferralScreen(),
                  ),
                  GoRoute(
                    path: 'support',
                    builder: (_, __) => const SupportScreen(),
                  ),
                  GoRoute(
                    path: 'page/:slug',
                    builder: (_, state) =>
                        LegalPageScreen(slug: state.pathParameters['slug']!),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      // Top up remains a guarded route; the social feed simply owns the scarce bottom-bar slot.
      GoRoute(
        path: TopupScreen.path,
        builder: (_, state) => TopupScreen(
          initialServiceId: state.uri.queryParameters['serviceId'],
        ),
      ),
    ],
    redirect: (context, state) => guardRoute(
      status: ref.read(authControllerProvider).status,
      location: state.matchedLocation,
    ),
  );
});

/// The whole auth guard, as a pure function so it can be tested without pumping a widget tree.
///
/// The `unknown` case is the one that matters: while the stored session is being validated the
/// app parks on the splash instead of guessing, which is what stops the login screen from
/// flashing for a fraction of a second in front of an already-signed-in user.
String? guardRoute({required AuthStatus status, required String location}) {
  final onSplash = location == SplashScreen.path;
  final onPublic = _publicRoutes.contains(location);

  switch (status) {
    case AuthStatus.unknown:
    // Nothing answered, so the session is unverified rather than over. Parking on the splash --
    // which offers a retry -- keeps the credentials in play; sending someone to the login form
    // would throw away a session that is very probably still valid.
    case AuthStatus.unreachable:
      return onSplash ? null : SplashScreen.path;
    case AuthStatus.unauthenticated:
      // Welcome, not the login form: a form asks for a password before saying what it is for,
      // and somebody arriving for the first time has no password to give. Login is one tap away
      // from there for people who already have an account.
      return onPublic ? null : WelcomeScreen.path;
    case AuthStatus.authenticated:
      return (onSplash || onPublic) ? HomeScreen.path : null;
  }
}

/// Bridges Riverpod's auth state to go_router, which wants a [Listenable].
///
/// Watches only `status`: re-running every redirect on each keystroke-driven `busy` change would
/// be pure waste, and go_router does not debounce.
class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    _subscription = ref.listen<AuthStatus>(
      authControllerProvider.select((state) => state.status),
      (_, __) => notifyListeners(),
    );
  }

  late final ProviderSubscription<AuthStatus> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}
