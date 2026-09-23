import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Reproduces the stacking of `_PostPage`. A childless DecoratedBox answers a hit test itself, so
/// the decorative gradient laid over the whole page was swallowing every tap meant for the video
/// beneath it -- the reason tap-to-pause did nothing. Each layer is stood in for by something with
/// the same hit-testing behaviour, so these hold without a platform view.
void main() {
  testWidgets('the gradient above the video must not block it', (t) async {
    var taps = 0;
    await t.pumpWidget(
      MaterialApp(
        home: Stack(
          fit: StackFit.expand,
          children: [
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => taps++,
              child: const Stack(
                fit: StackFit.expand,
                children: [SizedBox.expand()],
              ),
            ),
            const IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.center,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Color(0xCE000000)],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );

    await t.tapAt(const Offset(300, 300));
    await t.pump();

    expect(taps, 1);
  });

  testWidgets('the whole page arrangement still lets the video hear a tap', (
    t,
  ) async {
    var taps = 0;
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Stack(
            children: [
              PageView.builder(
                scrollDirection: Axis.vertical,
                itemCount: 2,
                itemBuilder: (_, __) => DecoratedBox(
                  decoration: const BoxDecoration(color: Colors.black),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => taps++,
                        child: const Stack(
                          fit: StackFit.expand,
                          children: [SizedBox.expand()],
                        ),
                      ),
                      const IgnorePointer(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.center,
                              end: Alignment.bottomCenter,
                              colors: [Colors.transparent, Color(0xCE000000)],
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        right: 14,
                        bottom: 200,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              onPressed: () {},
                              icon: const Icon(Icons.favorite),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 12, 12, 0),
                  child: Row(
                    children: [
                      const Text('Витрина'),
                      const Spacer(),
                      IconButton(onPressed: () {}, icon: const Icon(Icons.add)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    await t.tapAt(const Offset(300, 300));
    await t.pump();

    expect(taps, 1);
  });
}
