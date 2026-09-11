/// Build-time switches for features whose presence changes what we may declare to a store.
///
/// These are `const`, so a disabled feature is constant-folded away: its screens and the calls
/// that feed them are not reachable in the shipped binary, and the declaration we sign is a
/// statement about the app as built, not a promise about how it behaves.
library;

/// Whether the customer-facing referral reward shows in this build.
///
/// Off for Android. The reward is a manat balance the customer accrues and spends at checkout,
/// and Google Play files that under the Financial features declaration ("rewards, points,
/// frequent flier miles and other loyalty programs"). A **personal** developer account may not
/// distribute an app that declares one — Play rejected `pro.gulyaly.app` on exactly that ground
/// on 2026-09-11 ("некоторые типы приложений могут распространяться только организациями").
///
/// The program itself is untouched: the backend, the storefront and the admin console keep it.
/// Only the Android build omits it, which is what lets the Play declaration truthfully say the
/// app has no financial features. Turning this back on means moving to an organization account
/// and re-answering that declaration first — flipping the flag alone would make the declaration
/// false, and an inaccurate declaration is an account-level enforcement risk, not an app-level one.
const bool kReferralRewardsEnabled = false;
