-- Owner-selected Google Business Profile primary category.
--
-- The free-text `stores.category` (from Naver extraction) cannot drive a live
-- GBP locations.create — Google requires a `categories/gcid:*` resource name,
-- and its category search is unusable. So the owner picks a category from a
-- bundled KR snapshot during GBP setup and we persist the chosen gcid here.
--
-- Nullable: existing stores and stub-mode setups never set it, and the owner
-- only fills it in on the live GBP path.
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS gbp_primary_category_id text;
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS gbp_primary_category_display_name text;
