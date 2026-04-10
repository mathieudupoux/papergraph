## Workspace Cleanup Scan — 2026-04-10

The runtime cleanup pass is done: the unused list/review stack, LaTeX export stack, orphan UI modules, stale assets, and the old `projectReview` payload fields were removed. A fresh build now succeeds.

No additional high-confidence orphan runtime files showed up in the post-cleanup scan. What remains is a smaller set of obsolete references and product-copy follow-up.

### Remaining cleanup

- [ ] Remove or replace `assets/demo-switch-views.gif` after updating the landing-page feature block in `index.html` that still advertises `List View` and `PDF Export`, which are no longer part of the product.
- [ ] Rewrite the stale landing-page copy in `index.html` around lines 146-160 so it describes current capabilities instead of “Switch between views”.
- [ ] Update `README.md` to remove the `List View` section that is now obsolete.
- [ ] Update `README.md` roadmap items that still mention LaTeX note support and improved PDF export if those features are no longer planned.
- [ ] Remove the notifications schema/functions from `supabase_clean_setup.sql` if the frontend notifications feature is retired for good; the database setup still creates `public.notifications`, related policies, helper functions, and realtime publication entries.

### Verification notes

- [x] `npm run build` passes after the cleanup.
- [x] `projectReview`, `projectReviewMeta`, `renderListView`, and the removed list/LaTeX module paths no longer appear in active JS/CSS/HTML/runtime project data.
