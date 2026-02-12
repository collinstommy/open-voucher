# Design Prototypes

Four design variations for the Open Vouchers web frontend. All designs are mobile-first and include:
- Landing page
- Login with Telegram widget
- Dashboard (upload, claim, balance)
- Voucher detail view
- Help/FAQ page

## v1-current-style.html

**Based on:** Current landing page aesthetic

**Visual Style:**
- Soft, friendly appearance with rounded corners (rounded-2xl, rounded-full)
- Blue-600 as primary accent color
- Light gray backgrounds (gray-50, gray-100)
- Subtle shadows and hover effects
- Gradient hero section (blue-600 to blue-700)
- Emoji icons for visual interest

**Key Features:**
- Soft cards with borders and shadow-sm
- Color-coded sections (blue for upload, yellow for coins, green for swap)
- FAQ accordion with rotate animation on expand
- Rounded buttons and inputs
- Friendly, approachable feel

**Best For:** 
- Community-focused apps
- Users who want a friendly, non-intimidating interface
- Maintaining brand consistency with existing landing page

## v2-ecommerce.html

**Based on:** Modern e-commerce patterns (Amazon, Shopify-style)

**Visual Style:**
- Clean, professional appearance
- Dark header (gray-900) with white content area
- Sharp corners (rounded-lg at most)
- Indigos and purples for accents
- Grid-based product displays
- Stock indicators ("In Stock", "Low Stock")

**Key Features:**
- Product card layout with image + details
- Shopping cart metaphor (coin balance as cart badge)
- Category browsing grid
- Order history section
- Trust badges (Verified, Secure, Community)
- Hero banner with gradient overlay
- Status labels and availability indicators

**Best For:**
- Users familiar with online shopping
- Emphasizing voucher "inventory"
- Professional/business presentation
- Making the app feel like a marketplace

## v3-minimal.html

**Based on:** Swiss design, brutalism, black-and-white minimalism

**Visual Style:**
- Strict black, white, and grays
- No rounded corners (sharp edges throughout)
- 2px thick borders
- No shadows
- Monospace elements where appropriate
- Only green (#16a34a) for success, red (#dc2626) for errors

**Key Features:**
- Numbered steps (01, 02, 03)
- Table-like layouts for data
- All caps typography for headers
- Minimal visual decoration
- Focus on information density
- Clear hierarchy through borders and spacing
- Direct, no-nonsense language

**Best For:**
- Users who prefer minimal interfaces
- Fast loading (no images, minimal CSS)
- Accessibility (high contrast)
- "Power users" who want efficiency
- Unique, memorable aesthetic

## v4-coop-exchange.html

**Based on:** 1970s Community Co-op / Member Exchange aesthetic

**Visual Style:**
- Warm cream paper texture with coffee stain overlays
- Burnt orange (#c45c26) and avocado green (#6b8e23) accents
- Rubber stamp effects, masking tape elements
- Ruled notebook lines (ledger aesthetic)
- Typewriter and handwritten fonts (DM Mono, Permanent Marker)
- Paper cards with subtle rotation (-1deg to 1deg)
- Receipt tear-off edges, punch card holes

**Key Features:**
- "Community Exchange" metaphor throughout
- Stamp animations for claimed vouchers
- Paper texture overlays with noise filters
- Punch card hole details on cards
- Ledger background lines
- Masking tape aesthetic for balance display
- Receipt-style transaction history
- Handwritten annotations and corrections
- Page turn transitions

**Typography:**
- **Display:** DM Serif Display — chunky, warm serif
- **Body:** DM Sans — clean, readable
- **Mono:** DM Mono — typewriter/ledger feel
- **Accent:** Permanent Marker — handwritten notes

**Best For:**
- Community-driven apps with trust/social focus
- Nostalgic, authentic feel (not corporate)
- Standing out from generic tech aesthetics
- Warm, welcoming personality
- Irish community context (strong co-op tradition)

## Comparison

| Aspect | v1 Current | v2 E-commerce | v3 Minimal | v4 Co-op Exchange |
|--------|-----------|---------------|------------|-------------------|
| **Corner radius** | High (rounded-2xl) | Medium (rounded-lg) | None (0) | Low (paper edges) |
| **Shadows** | Yes (shadow-sm/lg) | Minimal | None | Paper depth only |
| **Primary color** | Blue-600 | Gray-900 + Indigo | Black | Burnt orange |
| **Visual weight** | Light/friendly | Professional | Dense/clear | Warm/authentic |
| **Metaphor** | Community app | Online store | Information system | Member exchange |
| **Best feature** | Approachable | Familiar | Fast/scannable | Memorable/unique |

## Usage

Open any HTML file directly in a browser. Each file:
1. Loads Tailwind CSS from CDN
2. Includes Telegram Login Widget (will show placeholder if domain not registered)
3. Has working JavaScript navigation and interactions
4. Simulates upload/claim/report flows with toast notifications
5. Is fully responsive and mobile-optimized
6. **No auth required** - all pages accessible for UX testing

**Note:** Authentication checks have been removed from these prototypes so you can freely navigate between all pages and test the full user experience. The login page still exists but is not required to access the dashboard or other features.

## Recommendation

For the Open Vouchers app:

- **v1 Current Style** if you want to maintain consistency with the existing landing page and Telegram bot's friendly tone

- **v2 E-commerce** if you want to emphasize the "trading" aspect and make it feel like a marketplace

- **v3 Minimal** if you want something distinctive, fast, and no-nonsense that stands out from typical apps

- **v4 Co-op Exchange** if you want something truly memorable with authentic character — this design tells a story about community trust and member ownership

All four can be implemented with the same backend (convex/web.ts) — only the UI components change.
