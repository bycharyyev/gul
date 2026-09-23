import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/widgets/crystal.dart';

Widget _inCell({required Widget child, required Size cell}) => MaterialApp(
  home: Scaffold(
    body: Center(
      child: SizedBox.fromSize(size: cell, child: child),
    ),
  ),
);

void main() {
  group('CrystalSurface', () {
    // The defect this guards against shipped to a phone: a tappable surface wraps its content in
    // a Stack, and a Stack hands non-positioned children loose constraints. Inside a grid cell the
    // surface therefore shrank to the width of its own label and sat against the cell's left edge,
    // so three operator tiles came out three different widths.
    testWidgets('a tappable surface fills a tight parent, whatever its content', (
      t,
    ) async {
      const cell = Size(200, 120);

      await t.pumpWidget(
        _inCell(
          cell: cell,
          child: CrystalSurface(onTap: () {}, child: const Text('X')),
        ),
      );

      expect(t.getSize(find.byType(CrystalSurface)), cell);
      // The painted surface, not just the outer box: the Stack always filled the cell — it was
      // the decoration inside it that shrank.
      expect(t.getSize(find.byType(DecoratedBox).first), cell);
    });

    testWidgets('two tappable surfaces in one row come out identical', (
      t,
    ) async {
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Row(
              children: [
                Expanded(
                  child: CrystalSurface(
                    onTap: () {},
                    child: const Text('TMCELL'),
                  ),
                ),
                Expanded(
                  child: CrystalSurface(
                    onTap: () {},
                    child: const Text('Turkmen Telecom'),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      final sizes = t
          .widgetList<CrystalSurface>(find.byType(CrystalSurface))
          .map((w) => t.getSize(find.byWidget(w)));
      expect(sizes.first.width, sizes.last.width);
    });

    testWidgets(
      'without a tap target it still sizes to its content when free to',
      (t) async {
        await t.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Align(
                alignment: Alignment.topLeft,
                // border off: a 1px frame would pad the box by two in each axis and say nothing
                // about the sizing behaviour under test.
                child: CrystalSurface(
                  padding: EdgeInsets.zero,
                  border: false,
                  child: SizedBox(width: 40, height: 30),
                ),
              ),
            ),
          ),
        );

        expect(t.getSize(find.byType(CrystalSurface)), const Size(40, 30));
      },
    );
  });
}
