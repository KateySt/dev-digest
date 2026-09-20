# `@devdigest/ui` — design system

The DevDigest web app's component library. One import surface, one stylesheet,
themed entirely through CSS variables.

## Usage

```tsx
// once, at the app root (e.g. app/layout.tsx):
import "@devdigest/ui/styles.css";

// anywhere:
import { Button, Card, SeverityBadge, LineChart } from "@devdigest/ui";
```

Everything is re-exported from the single barrel `index.ts` — **always import
from `@devdigest/ui`**, never reach into a layer file directly. The TS path
alias is configured in `tsconfig.json` (`@devdigest/ui` → `src/vendor/ui`).

## Layout

The library is organized into layers. Each layer is a folder with **one file
per component** plus a barrel `index.ts`; a few standalone, cross-feature
components live as flat files at the root.

| Layer | Folder | What's in it |
|-------|--------|--------------|
| **Tokens** | `primitives/tokens.ts` | `Severity`/`Category` unions, the `SEV` & `CAT` maps (color + icon + label), `ButtonProps` |
| **Primitives** | `primitives/` | `Button`, `IconBtn`, `Badge`/`SeverityBadge`/`CategoryTag`, `Chip`, `Avatar`, `ConfidenceNum`, `MonoLink`, `ProgressBar`/`PercentProgress`, `CircularScore`, `Toggle`, `Kbd`, `SectionLabel`, `Card`, `EmptyState`, `Skeleton`, `ErrorState`, `Markdown` |
| **Kit** | `kit/` | `Drawer`, `Modal`, `Tabs`, `Dropdown`, `FormField`, `TextInput`, `Select`, `SearchableSelect`, `Textarea`, `Checkbox` |
| **Charts** | `charts/` | `Sparkline`, `LineChart`, `Donut`, `BarRow`, `MetricCard` (Recharts + lightweight inline SVG) |
| **Shell** | `shell/` | `AppFrame`, `Sidebar`, `Topbar`, `NavItem`, `RepoSwitcher` — the app frame |
| **Command palette** | `command-palette/` | `CommandPalette` (Cmd+K), `ShortcutsHelp` (`?`) |
| **Icons** | `icons.tsx` | `Icon` registry + `IconName` type (single source; not split) |
| **Nav** | `nav.ts` | `NAV`, `SETTINGS_SECTIONS`, `SHORTCUTS`, `resolveHref()` — route/shortcut config |
| **Standalone** | `LiveLogStream.tsx`, `ExportWizardSteps.tsx`, `AutoTriggerStatus.tsx` | cross-feature components without a natural layer |

## Tokens & theming

Visual tokens are **CSS variables** defined in `styles.css` and switched by the
`data-theme` attribute (dark/light). Components never hard-code colors — they
reference vars like `var(--accent)`, `var(--text-muted)`, `var(--border)`.

Severity/category semantics are centralized in `primitives/tokens.ts`:

- `SEV[severity]` → `{ c, bg, icon, label }` for `CRITICAL | WARNING | SUGGESTION | INFO`
  (maps to `--crit`/`--crit-bg`, `--warn`/`--warn-bg`, `--sugg`/`--sugg-bg`, `--info`/`--info-bg`).
- `CAT[category]` → `{ icon, label }` for `bug | security | perf | style | test`.

Use `SeverityBadge` / `CategoryTag` rather than reading the maps directly when
you just need the rendered chip.

## Showcase

Every component is rendered (in both themes) by the **`/showcase`** route
(`src/components/showcase/Showcase.tsx`). The smoke test
(`src/test/smoke.test.tsx`) mounts that gallery, so a broken export or render
fails CI. When you add or change a component, add it to the showcase.

## Conventions

- **One component per file**, named in PascalCase; the layer's `index.ts` is the
  only re-export point.
- **Inline styles** keyed off CSS variables (no per-component stylesheet).
- Prop types are exported alongside the component when consumers need them
  (e.g. `ButtonProps`, `Command`, `ChartSeries`).
- **Compound slots over config props.** When a component has a section with
  its own chrome (e.g. `Modal`'s title row and action row), expose it as a
  static sub-component — `Modal.Header`, `Modal.Footer` — placed as a child,
  not as a `title`/`subtitle`/`footer`-style prop. `Modal` detects them via
  `child.type === Modal.Header` / `Modal.Footer` and renders them outside the
  scrollable body. `Modal`'s own `onClose` prop still drives the backdrop
  click; pass it again to `Modal.Header` to wire its close button. Follow this
  pattern for any new slot rather than adding another render-prop.
