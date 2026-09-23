import 'package:flutter/material.dart';

import '../../../../core/widgets/brand_mark.dart';

/// The frame both auth screens sit in: brand mark, title, then the form.
///
/// Scrollable and bottom-inset aware, because on a short phone the on-screen keyboard covers the
/// password field otherwise — the single most common way a login screen breaks in the field.
class AuthFormLayout extends StatelessWidget {
  const AuthFormLayout({
    super.key,
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              24,
              32,
              24,
              32 + MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: ConstrainedBox(
              // Tablets and foldables: a form stretched to 900dp is unusable.
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: BrandMark(size: 72)),
                  const SizedBox(height: 24),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 28),
                  ...children,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
