import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/router.dart';
import 'package:gulyaly_mobile/features/auth/presentation/auth_controller.dart';
import 'package:gulyaly_mobile/features/auth/presentation/login_screen.dart';
import 'package:gulyaly_mobile/features/auth/presentation/register_screen.dart';
import 'package:gulyaly_mobile/features/auth/presentation/splash_screen.dart';
import 'package:gulyaly_mobile/features/auth/presentation/welcome_screen.dart';
import 'package:gulyaly_mobile/features/home/presentation/home_screen.dart';

void main() {
  group('guardRoute', () {
    test('while the session is unknown, everything waits on the splash', () {
      // The flash of a login screen in front of an already-signed-in user is exactly what this
      // branch prevents.
      expect(
        guardRoute(status: AuthStatus.unknown, location: SplashScreen.path),
        isNull,
      );
      expect(
        guardRoute(status: AuthStatus.unknown, location: HomeScreen.path),
        SplashScreen.path,
      );
      expect(
        guardRoute(status: AuthStatus.unknown, location: LoginScreen.path),
        SplashScreen.path,
      );
    });

    test('signed out reaches only the auth screens', () {
      expect(
        guardRoute(
          status: AuthStatus.unauthenticated,
          location: LoginScreen.path,
        ),
        isNull,
      );
      expect(
        guardRoute(
          status: AuthStatus.unauthenticated,
          location: RegisterScreen.path,
        ),
        isNull,
      );
      expect(
        guardRoute(
          status: AuthStatus.unauthenticated,
          location: HomeScreen.path,
        ),
        // Welcome, not the login form: somebody arriving for the first time has no password.
        WelcomeScreen.path,
      );
      expect(
        guardRoute(
          status: AuthStatus.unauthenticated,
          location: SplashScreen.path,
        ),
        WelcomeScreen.path,
      );
    });

    test('signed in never sits on the splash or an auth screen', () {
      expect(
        guardRoute(
          status: AuthStatus.authenticated,
          location: SplashScreen.path,
        ),
        HomeScreen.path,
      );
      expect(
        guardRoute(
          status: AuthStatus.authenticated,
          location: LoginScreen.path,
        ),
        HomeScreen.path,
      );
      expect(
        guardRoute(status: AuthStatus.authenticated, location: HomeScreen.path),
        isNull,
      );
    });

    test('an unknown location is treated as protected', () {
      expect(
        guardRoute(status: AuthStatus.unauthenticated, location: '/orders/42'),
        WelcomeScreen.path,
      );
      expect(
        guardRoute(status: AuthStatus.authenticated, location: '/orders/42'),
        isNull,
      );
    });

    // Same parking as `unknown`, and for the same reason: the session is unverified, not over.
    // The splash offers a retry -- the login form would throw away credentials that still work.
    test('unreachable parks on the splash rather than the login form', () {
      expect(
        guardRoute(status: AuthStatus.unreachable, location: HomeScreen.path),
        SplashScreen.path,
      );
      expect(
        guardRoute(status: AuthStatus.unreachable, location: LoginScreen.path),
        SplashScreen.path,
      );
      expect(
        guardRoute(status: AuthStatus.unreachable, location: SplashScreen.path),
        isNull,
      );
    });
  });
}
