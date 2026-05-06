# Design System Strategy: The Editorial Private Office

## 1. Overview & Creative North Star
The "Creative North Star" for this design system is **The Digital Concierge**. We are moving away from the cold, spreadsheet-heavy "industrial investment" look of the past and toward a bespoke, editorial experience that mirrors the exclusivity of high-end private wealth management.

To achieve this, the system breaks the "template" look through **Intentional Asymmetry** and **Tonal Depth**. We prioritize generous whitespace (breathing room) over information density. Instead of a rigid grid of boxes, we treat the screen as a series of curated layers. We use high-contrast typography scales—pairing large, authoritative serif headlines with utilitarian, modern sans-serif data—to create a sense of institutional trust and modern elegance.

---

## 2. Colors: Tonal Architecture
The palette is rooted in a warm, sophisticated foundation. We use a "No-Line" philosophy where boundaries are felt, not seen.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders for sectioning or containment. Boundaries must be defined solely through background color shifts or subtle tonal transitions. For example, a `surface-container-low` section should sit directly on a `surface` background to define its area.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine heavy-weight paper.
- **Base Layer:** `surface` (#faf9f8) provides the warm, cream-white canvas.
- **Nesting:** Use `surface-container-low` (#f4f3f2) for large secondary background areas and `surface-container-lowest` (#ffffff) for high-prominence cards to create a soft, natural lift.
- **The Glass & Gradient Rule:** For floating elements or top-level navigation, use Glassmorphism. Apply `surface` at 80% opacity with a `24px` backdrop-blur to allow underlying content to bleed through softly.

### Signature Textures
Main CTAs and hero backgrounds should utilize a subtle linear gradient (e.g., `primary` #a83900 to `primary-container` #ff6b2b at a 135-degree angle). This provides a "visual soul" and depth that a flat fill cannot achieve.

---

## 3. Typography: Editorial Authority
Our typography is the primary driver of the brand's voice. It balances the legacy of print journalism with the precision of modern finance.

* **Display & Headlines (Newsreader):** Used for storytelling and high-level section headers. The serif nature conveys "Institutional Trust."
* *Directives:* Increase line-height to 1.3 or 1.4 for display scales. Use optical sizing where available to maintain elegance at large sizes.
* **Body & Data (Inter):** Used for all functional UI, labels, and financial figures.
* *Directives:* For `body-md` and `body-sm`, increase letter-spacing by `0.02em`. For numerical data, ensure the use of tabular num features to maintain vertical alignment in tables.

---

## 4. Elevation & Depth: Tonal Layering
We reject the standard "drop shadow" in favor of environmental lighting.

* **The Layering Principle:** Depth is achieved by stacking surface tokens. A `surface-container-highest` element placed on a `surface-container` naturally feels "closer" to the user without a single pixel of shadow.
* **Ambient Shadows:** If a floating effect is required (e.g., a Modal or Menu), use an ultra-diffused shadow: `box-shadow: 0 12px 40px rgba(86, 67, 55, 0.08);`. The shadow color is a low-opacity version of `on-surface-variant`, not pure black.
* **The "Ghost Border" Fallback:** If a border is required for accessibility, use `outline-variant` (#dcc1b1) at **15% opacity**. Never use 100% opaque borders.

---

## 5. Components: Refined Primitives

### Cards & Containers
* **Radius:** Standardize on `md` (0.75rem / 12px) for cards. Large hero sections use `xl` (1.5rem / 24px).
* **Structure:** Forbid divider lines. Use vertical spacing (Scale `6` or `8`) or a subtle shift from `surface-container-low` to `surface-container-highest` to separate content blocks.

### Buttons & Inputs
* **Primary Button:** Uses the signature `primary` to `primary-container` gradient. High-contrast `on-primary` (#ffffff) text.
* **Text Inputs:** Use `surface-container-lowest` fill with a "Ghost Border" on hover. Labels use `label-md` in `on-surface-variant`.
* **Chips:** Use `secondary-container` with `on-secondary-container` text. Roundedness set to `full`.

### Wealth-Specific Components
* **The Data Ledger:** Replaces the "Data Table." Use `Inter` for all values. Header rows use `label-sm` in all-caps with `0.05em` letter-spacing. Alternate row backgrounds with `surface` and `surface-container-low` instead of borders.
* **Portfolio Summary Glass:** A floating summary card using the Glassmorphism rule to provide a persistent view of total assets over a scrolling editorial page.

---

## 6. Do's and Don'ts

### Do
* **Do** use asymmetrical layouts (e.g., a 60/40 split for hero sections) to break the "web template" feel.
* **Do** use the `16` (5.5rem) and `20` (7rem) spacing tokens for top-level section padding to emphasize exclusivity.
* **Do** treat financial figures as "Display" elements when highlighting performance—size them up.

### Don't
* **Don't** use pure black (#000000) for text. Use `on-surface` (#1a1c1c) to maintain the warmth of the cream background.
* **Don't** use standard `ROUND_FOUR` corners; they feel dated and "industrial." Stick to the `ROUND_EIGHT` (`DEFAULT` 0.5rem) minimum.
* **Don't** crowd the screen. If a page feels "efficient," it likely lacks the "premium" breathing room required by this system. Add whitespace.