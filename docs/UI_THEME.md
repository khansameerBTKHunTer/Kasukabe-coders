# CIVISCOPE atlas colour theme

The palette was sampled from the supplied swatch. Existing components, typography, layout sizes and application behavior are retained. Shared Tailwind colours cover existing neutral/blue utilities; primary actions use chocolate. Error, priority and completion colours retain their status meanings.

| Colour | Value | Use |
| --- | --- | --- |
| Ivory | `#FFFCE9` | Light text and warm highlights |
| Mother of pearl | `#E7D6C2` | Borders and warm neutral surfaces |
| Muted slate blue | `#798DA6` | Accent colour and map device-location styling |
| Navy | `#142841` | Header and primary text |
| Chocolate | `#674635` | Primary buttons and focus accents |

The workspace uses a light pearl tint (`#F2E8D9`) with cream cards (`#FFF9ED`). Supporting text is darkened to maintain contrast. Source colours are defined in `tailwind.config.ts` and CSS variables in `src/app/globals.css`. The map, image uploader, AI assessment, response queues and authentication flows retain their existing components.

## Authentication artwork

Saved project asset: `public/images/civiscope-rescue-atlas.webp` (1672 × 941; approximately 326 KiB). Login, signup and the shared authentication pages use it through `.auth-screen`. The previous city background is retained as a separate asset.

Generation used the built-in **image_gen** tool, followed by WebP encoding with Sharp. The reference screenshots were used for visual direction; their pictured forms are not baked into the application background.

Final generation prompt:

> Use case: stylized-concept. Asset type: landscape background illustration for the existing CIVISCOPE disaster-reporting login and signup pages. Generate a wide 16:9 editorial illustration with subtle vintage atlas / topographic-map styling. Scene: a rescue worker in practical Indian disaster-response clothing with a search-and-rescue dog, seen from behind in the lower left, overlooking a flood-affected mountain valley town, damaged masonry at the left edge, distant mountain ridges and a small rescue helicopter. Hopeful warm late-afternoon atmosphere, no graphic injuries. Restrained palette matching cream ivory #FFFBEF, mother-of-pearl sand #E8D7C1, chocolate brown #694837, muted slate blue #7B91A8 and deep mystic navy #152B40. Fine contour lines, very subtle paper grain and understated cartographic grid blended into the landscape. Composition: detailed rescue scene concentrated on the left two thirds, quiet deep-navy/blue atmospheric scenery in the right third to sit behind an existing cream form. Upper left has light cream negative space suitable for separately rendered page copy. Preserve natural anatomy, realistic coherent rubble and rescue equipment. This is ONLY background artwork, not a website mockup: absolutely no text, no letters, no numbers, no logos, no watermarks, no form, no card, no buttons, no input fields, no border. Premium, calm, legible visual hierarchy; avoid heavy grunge, oversaturated orange, neon colors and exaggerated destruction.
