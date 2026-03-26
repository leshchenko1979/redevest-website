# High-End Investment Editorial: Design System Document

## 1. Overview & Creative North Star

This design system is engineered to elevate the digital presence of a real estate investment platform from a standard informational site to a high-end editorial experience. 

### The Creative North Star: "The Architectural Curator"
In the world of real estate and development, trust is built through precision, transparency, and a sense of permanence. This system rejects the "boxed-in" nature of traditional web templates. Instead, it adopts the layout principles of a prestige architectural magazine. We utilize **intentional asymmetry**, **over-scaled typography**, and **tonal depth** to guide the investor’s eye through complex data with the grace of a physical gallery.

By moving away from rigid grids and 1px borders, we create a fluid, premium environment that feels less like a software tool and more like a private wealth management concierge.

---

## 2. Colors

The color palette utilizes deep, authoritative navies paired with high-energy orange accents to punctuate key actions. However, the true sophistication lies in the neutral "Surface" tiers.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to define sections or containers. All spatial boundaries must be created through background color shifts.
*   *Implementation:* A card using `surface_container_lowest` (#ffffff) should sit atop a section using `surface_container_low` (#f0f3ff). The transition of color is the border.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the following tokens to create "stacked" importance:
*   **Surface:** The base canvas.
*   **Surface-Container-Low:** For large content blocks that need a subtle distinction from the background.
*   **Surface-Container-Highest:** For active elements or high-priority data points that must "rise" toward the user.

### The "Glass & Gradient" Rule
To add visual "soul," use Glassmorphism for floating navigation or sticky headers:
*   **Token:** `surface_container_low` at 80% opacity with a `20px` backdrop-blur.
*   **CTAs:** Main buttons should use a subtle vertical gradient transitioning from `primary` (#030813) to `primary_container` (#1a202c) to prevent a flat, "web 1.0" appearance.

---

## 3. Typography

The typographic system relies on the tension between the classic, authoritative **Newsreader** (Serif) and the hyper-functional **Inter** (Sans-Serif).

*   **Display & Headlines (Newsreader):** Used for large-scale emotional hooks and section titles. The serif typeface conveys legacy and intellectual depth.
*   **Titles & Body (Inter):** Used for data, labels, and instructional text. It provides the "modern" half of the brand, ensuring maximum legibility on mobile devices.
*   **The Hierarchy Strategy:** Use `display-lg` (3.5rem) for hero statements to create an immediate editorial impact. Ensure a wide vertical gap (using the `24` spacing token) between headlines and body text to allow the typography to "breathe."

---

## 4. Elevation & Depth

Standard drop shadows are too aggressive for a premium platform. We achieve hierarchy through **Tonal Layering**.

### The Layering Principle
Depth is achieved by "stacking" surface-container tiers. Placing a white card (`surface_container_lowest`) on a pale blue-grey background (`surface_container_low`) creates a natural, soft lift.

### Ambient Shadows
When a floating effect is required (e.g., a modal or a primary action button):
*   **Blur:** Minimum `32px`.
*   **Opacity:** `4% - 8%`.
*   **Color:** Use a tinted version of `on_surface` (#151c27) rather than pure black to keep the shadow feeling integrated with the environment.

### The "Ghost Border" Fallback
If a border is required for accessibility:
*   Use `outline_variant` at **20% opacity**. It should be barely visible—a "suggestion" of a boundary rather than a hard line.

---

## 5. Components

### Buttons
*   **Primary:** Dark Navy (`primary`) with a subtle gradient. `0.25rem` (sm) corner radius. High contrast text (`on_primary`).
*   **Secondary:** Ghost style. No background, no border. Use `label-md` uppercase with `secondary` (#9e4200) text and an icon for directionality.
*   **Tertiary/Glass:** Semi-transparent white with backdrop-blur for use over imagery.

### Cards & Lists
*   **Forbid dividers.** To separate real estate listings or investment stats, use the `8` (2rem) spacing scale.
*   **Grouping:** Use `surface_container_low` backgrounds for group containers to hold multiple related items without "boxing" them.

### Input Fields
*   **Style:** Minimalist. No bottom border. A slight `surface_container_high` background with a `0.25rem` radius. Label sits above the field in `label-sm` (Inter).

### Signature Component: The "Investment Progress Glass"
For development updates, use a glassmorphic container with a `secondary` (#9e4200) progress bar. The translucency allows the project imagery to remain visible underneath, maintaining the "Editorial" feel.

---

## 6. Do's and Don'ts

### Do
*   **Do use asymmetrical layouts:** Offset images from text blocks to create a custom, high-end magazine feel.
*   **Do prioritize white space:** If a layout feels "crowded," double the spacing token (e.g., move from `12` to `24`).
*   **Do use semi-transparent overlays:** When placing text over property photos, use a gradient overlay from `primary` at 60% to 0% to ensure readability.

### Don't
*   **Don't use 1px black/grey borders.** This is the fastest way to make the design look "cheap" and "templated."
*   **Don't use standard "Primary Blue."** Stick to the deep navy (`primary`) and use the orange (`secondary`) sparingly for high-intent actions only.
*   **Don't crowd the mobile view.** Stack elements vertically with generous padding (`8` or `10`) between unrelated content blocks.