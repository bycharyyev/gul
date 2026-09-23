-- The mobile welcome screen's copy, as an editable CMS page.
--
-- The app ships with this exact text and renders it on the first frame; this row only ever
-- replaces it. It exists as a migration rather than in seed.ts because seeding is a manual step
-- that production has never run -- and a page nobody can see in the admin console is a feature
-- nobody knows they have.
--
-- Field mapping, which the admin console also states on screen:
--   title  -> the first line of the headline
--   body   -> first line is the second half of the headline (the one with the gradient),
--             everything after it is the subtitle
--
-- ON CONFLICT: if staff have already created a page on this slug, theirs wins. A migration that
-- overwrote edited copy would be a data loss bug that only shows up on the next deploy.

INSERT INTO "ContentPage" (
  id, slug, title, body, "titleEn", "bodyEn", "titleTkm", "bodyTkm", "createdAt", "updatedAt"
) VALUES (
  'cms_welcome_screen',
  'welcome',
  'Дарите счастье',
  'в одно касание

Связь, цветы, подарки — и всё, что мы добавим дальше.',
  'Give happiness',
  'in one tap

Airtime, flowers, gifts — and whatever we add next.',
  'Bagt sowgat ediň',
  'bir degmede

Balans, gül, sowgat — we mundan soň goşuljaklar.',
  now(),
  now()
)
ON CONFLICT (slug) DO NOTHING;
