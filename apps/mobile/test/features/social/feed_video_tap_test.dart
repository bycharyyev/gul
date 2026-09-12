import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A video surface is a `Texture`, and a `Texture` takes no part in hit testing. A
/// [GestureDetector] left on its default `deferToChild` therefore hears nothing across the whole
/// area the video covers — which is the entire page — and tap-to-pause silently does nothing.
///
/// This reproduces that shape with a bare `SizedBox` standing in for the texture: it is equally
/// invisible to hit testing, so the assertion is about the behaviour flag rather than about
/// video_player's internals, and it holds without a platform view in the test.
void main() {
  Future<void> pumpTapTarget(
    WidgetTester tester, {
    required HitTestBehavior behavior,
    required VoidCallback onTap,
  }) => tester.pumpWidget(
    MaterialApp(
      home: GestureDetector(
        behavior: behavior,
        onTap: onTap,
        child: const Stack(fit: StackFit.expand, children: [SizedBox.expand()]),
      ),
    ),
  );

  testWidgets('deferToChild over a non-hit-testable child hears nothing', (
    t,
  ) async {
    var taps = 0;
    await pumpTapTarget(
      t,
      behavior: HitTestBehavior.deferToChild,
      onTap: () => taps++,
    );

    await t.tapAt(const Offset(200, 400));
    await t.pump();

    expect(taps, 0, reason: 'this is the bug the feed had');
  });

  testWidgets('opaque receives the tap', (t) async {
    var taps = 0;
    await pumpTapTarget(
      t,
      behavior: HitTestBehavior.opaque,
      onTap: () => taps++,
    );

    await t.tapAt(const Offset(200, 400));
    await t.pump();

    expect(taps, 1);
  });
}
