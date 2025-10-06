# Enterprise Platform - Frontend Documentation

## Overview

The Enterprise Platform is a comprehensive multi-tenant SaaS application built with Next.js 15, React 19, and Tailwind CSS v4. This document provides technical guidance for the development team on working with the codebase, understanding the design system, and implementing new features consistently across the application.

## Technology Stack

The application is built on a modern technology foundation that prioritizes performance, maintainability, and developer experience. Next.js 15 with the App Router provides the framework for server-side rendering and routing. React 19 powers the component architecture with enhanced concurrent features. Tailwind CSS v4 handles styling through a CSS-first configuration approach, representing a significant paradigm shift from previous versions. TypeScript ensures type safety throughout the codebase, while Turbopack accelerates the development build process.

## Project Structure

The source code is organized within the `src` directory following Next.js App Router conventions. The `src/app` directory contains page routes and layouts, with each folder representing a route segment. Component files reside in `src/components`, separated into UI primitives within `src/components/ui` and feature-specific components at the root level. Utility functions and helper modules are located in `src/lib`, with the critical `cn` utility for class name management found in `src/lib/utils/cn.ts`. Global styles and the Tailwind CSS configuration are maintained in `src/styles/globals.css`.

## Design System

### Color Palette

The application implements a distinctive gold and black color scheme that reinforces the enterprise brand identity. The primary color is a vibrant gold (#ffc451) used for call-to-action elements, brand accents, and interactive components. The secondary color is pure black (#000000), providing strong contrast and professional gravitas. The accent color mirrors the primary gold, ensuring visual consistency across the interface.

Additional functional colors support user interface feedback patterns. Success states use emerald green (#22c55e), warnings display in amber (#f59e0b), errors appear in red (#ef4444), and informational elements use blue (#3b82f6). Each color includes shade variations from 50 to 950 for granular control over visual hierarchy.

### Dark Mode Implementation

The application supports class-based dark mode that users can toggle manually. The implementation relies on CSS custom properties that switch values when the `.dark` class is applied to the HTML element. The ThemeProvider from `next-themes` manages the theme state and persistence, while the ThemeToggle component provides the user interface for switching between light and dark modes.

In dark mode, the background shifts to a near-black shade (#0d0d0d), text becomes off-white for reduced eye strain, and the gold primary color maintains its vibrancy to preserve brand recognition. Border colors and muted elements adjust to lighter shades appropriate for dark backgrounds, ensuring adequate contrast ratios for accessibility compliance.

### Typography System

The typography scale is carefully calibrated for enterprise applications where information density and readability are paramount. Font sizes range from 2xs (0.625rem) through 9xl (8rem), with each size including predetermined line heights optimized for legibility. The base font size is intentionally compact at 0.8125rem to maximize screen real estate while remaining comfortably readable.

The default font family is Inter, selected for its excellent readability at small sizes and professional appearance. Monospace content uses Fira Code, which includes programming ligatures for improved code display. Both fonts are loaded through Next.js font optimization to minimize layout shift and improve performance.

## Working with Tailwind CSS v4

Tailwind CSS v4 represents a fundamental shift from JavaScript-based configuration to CSS-first design tokens. Understanding this change is essential for effective development within this codebase.

### Configuration Architecture

Custom design tokens must be defined in the `@theme` directive within `src/styles/globals.css` rather than exclusively in `tailwind.config.ts`. Color values are specified using the `--color-*` naming convention and accept hex, RGB, or HSL values. The JavaScript configuration file now serves primarily for content paths, plugin registration, and complex theme extensions that cannot be expressed in CSS.

When adding new colors to the design system, define them within the `@theme` block in your stylesheet. For example, if you need to introduce a tertiary color, add it to the theme directive and it will automatically generate utility classes throughout the application. This approach ensures that all custom tokens are available to the Tailwind engine during compilation.

### Using Color Classes

The utility class pattern follows standard Tailwind conventions with your custom colors available as modifiers. Apply background colors using `bg-primary`, `bg-secondary`, or any custom color defined in your theme. Text colors follow the same pattern with `text-primary`, `text-secondary`, and so forth. Border colors use `border-primary`, while ring colors for focus states use `ring-primary`.

Shade variations are accessed through numeric suffixes corresponding to the defined scales. For lighter tints, use classes like `bg-primary-100` or `text-primary-200`. For darker shades, employ `bg-primary-800` or `text-primary-900`. This systematic approach to color application maintains visual consistency across the interface.

### Dynamic Color Values

Components that require programmatic color manipulation continue to use CSS custom properties defined in the `:root` and `.dark` selectors. These properties use HSL color space for easier manipulation and interpolation. When referencing these variables in your styles, wrap them in the `hsl()` function, as in `hsl(var(--primary))`.

For components that need to adjust opacity dynamically, use the forward slash syntax within the HSL function. For example, `hsl(var(--primary) / 0.5)` produces the primary color at fifty percent opacity. This technique is particularly useful for hover states, overlays, and disabled elements.

## Component Development Guidelines

### Building New Components

When creating new components, establish a clear interface through TypeScript props that define the component's contract. Use the `cn` utility from `@/lib/utils/cn` to merge class names safely, allowing consumers to extend or override styles through the `className` prop. Export components as named exports rather than default exports to improve tree-shaking and refactoring capabilities.

Structure your component files with imports first, followed by the TypeScript interface definition, then the component implementation. Place any helper functions or constants at the bottom of the file. This consistent organization makes components easier to understand and maintain across the team.

### UI Component Library

The application includes a comprehensive UI component library in `src/components/ui`. These components are built on Radix UI primitives for accessibility and follow consistent styling patterns. The Button component provides multiple variants including default, destructive, outline, secondary, ghost, and link. The Card component offers a flexible container for grouping related content with optional header, content, and footer sections.

When building features, leverage these existing components rather than creating custom implementations. This approach ensures consistency, reduces bundle size, and takes advantage of thoroughly tested accessibility patterns. If you identify a gap in the component library, consider whether a new primitive would benefit the entire application before implementing feature-specific solutions.

### Responsive Design Patterns

The application defines custom breakpoint tokens that extend Tailwind's default responsive system. The extra-small breakpoint at 480px accommodates smaller mobile devices, while the 3xl breakpoint at 1920px supports ultra-wide displays. Apply responsive utilities using the standard Tailwind prefix syntax, such as `md:flex` or `lg:grid-cols-3`.

Design mobile-first by default, establishing base styles for the smallest viewport and progressively enhancing for larger screens. This approach ensures that the application remains functional even when responsive styles fail to load or when users employ unusual viewport configurations.

## Practical Examples

### Creating a Branded Button

To implement a button that uses the gold primary color with appropriate hover states and focus rings, combine Tailwind utilities with your custom color tokens. The button should use `bg-primary` for the background with `text-primary-foreground` ensuring proper contrast. Add `hover:bg-primary-600` to darken the background on interaction, and `focus-visible:ring-2 focus-visible:ring-ring` to provide clear focus indicators for keyboard navigation. The complete implementation would appear as:

```tsx
import { Button } from '@/components/ui/button'

export function BrandedCTAButton() {
  return (
    <Button 
      size="lg"
      className="bg-primary text-black hover:bg-primary-600 font-semibold"
    >
      Get Started
    </Button>
  )
}
```

### Building a Feature Card with Dark Mode Support

Feature cards require careful attention to dark mode styling to maintain readability and visual hierarchy. The Card component automatically inherits dark mode styles, but custom content within requires explicit dark mode variants. Text colors should transition from dark gray in light mode to light gray in dark mode, while borders should lighten appropriately. An implementation might look like:

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Shield } from 'lucide-react'

export function SecurityFeatureCard() {
  return (
    <Card className="hover:shadow-lg transition-shadow dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-base dark:text-white">
          Enterprise Security
        </CardTitle>
        <CardDescription className="text-xs dark:text-gray-400">
          Bank-level encryption, SSO, MFA, and comprehensive audit trails.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
```

### Implementing Custom Color Variations

When you need a color that does not exist in the current palette, add it to the theme directive in your globals.css file. For instance, if your design requires a purple accent for a specific feature set, define the complete color scale within the `@theme` block:

```css
@theme {
  --color-purple: #a855f7;
  --color-purple-50: #faf5ff;
  --color-purple-100: #f3e8ff;
  --color-purple-500: #a855f7;
  --color-purple-600: #9333ea;
  --color-purple-700: #7e22ce;
  --color-purple-900: #581c87;
}
```

After adding these definitions and restarting your development server, you can immediately use `bg-purple`, `text-purple-600`, `border-purple-500`, and other utility classes throughout your application.

### Creating Responsive Layouts

The application's custom breakpoint system enables precise control over layout behavior across devices. A typical responsive grid might start with a single column on mobile, expand to two columns on tablets, and reach three or four columns on desktop displays:

```tsx
export function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {features.map((feature) => (
        <FeatureCard key={feature.id} {...feature} />
      ))}
    </div>
  )
}
```

For more complex layouts that require different arrangements at various breakpoints, combine responsive utilities with flexbox or grid properties to achieve precise control over content positioning and spacing.

## Development Workflow

### Starting the Development Server

Initialize the development environment by running `npm run dev` from the project root. The application will start on port 3000 with Turbopack compilation, typically ready within one second after the initial build. The development server includes hot module replacement, allowing you to see changes immediately without full page reloads.

### Making Style Changes

When modifying colors or adding design tokens, edit `src/styles/globals.css` and add your changes within the appropriate section. Color definitions belong in the `@theme` directive, while dynamic values that respond to dark mode should be added to the `:root` and `.dark` selectors. After saving your changes, the development server will automatically recompile, though you may need to perform a hard refresh in your browser to clear cached styles.

If style changes do not appear immediately, stop the development server, delete the `.next` directory using `rm -rf .next`, and restart the server. This cache clearing resolves most styling inconsistencies during development.

### Building for Production

Generate an optimized production build by executing `npm run build`. Next.js will compile your application with full optimizations including code splitting, tree shaking, and asset optimization. The build process includes type checking, linting, and style compilation, failing if any errors are detected. After a successful build, test the production build locally using `npm run start` before deploying to your hosting environment.

## Common Patterns and Best Practices

### Class Name Composition

Always use the `cn` utility function when combining class names in components. This utility, which merges Tailwind classes using `tailwind-merge` and handles conditional classes through `clsx`, prevents class conflicts and ensures predictable styling outcomes. Import it from `@/lib/utils/cn` and use it to compose your className prop:

```tsx
import { cn } from '@/lib/utils/cn'

export function CustomComponent({ className, children }: Props) {
  return (
    <div className={cn('base-classes', 'more-classes', className)}>
      {children}
    </div>
  )
}
```

### Managing Hover and Focus States

Interactive elements require clear visual feedback through hover and focus states. Apply `hover:` variants for mouse interactions and `focus-visible:` variants for keyboard navigation. The focus-visible variant is preferable to basic focus because it only displays focus rings during keyboard navigation, avoiding unnecessary visual noise when users click with a mouse.

Ensure that focus indicators meet WCAG accessibility requirements with sufficient contrast and visibility. The ring utilities provide an excellent starting point, with `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` creating a prominent, accessible focus indicator.

### Handling Loading and Error States

Every component that fetches data or performs asynchronous operations should handle loading and error states explicitly. Use the Suspense component for server-side rendering scenarios and implement loading skeletons that match the expected content dimensions. Error boundaries should catch and display errors gracefully, providing users with actionable information rather than technical stack traces.

## Troubleshooting

### Styles Not Appearing

If utility classes are not applying correctly, verify that your content paths in `tailwind.config.ts` include all relevant file extensions and directories. Confirm that `src/styles/globals.css` is imported in your root layout file. Check the browser developer tools to see whether the CSS is loading and what computed styles are being applied to your elements.

### Dark Mode Not Working

Dark mode issues typically stem from missing or incorrect class application. Verify that the `suppressHydrationWarning` prop is set on your HTML element in the root layout. Ensure that the ThemeProvider wraps your application content and that dark mode variants are properly prefixed with `dark:` in your class names. Check that CSS custom properties have values defined in both the `:root` and `.dark` selectors.

### Build Failures

Build failures often indicate TypeScript errors, missing dependencies, or configuration issues. Review the error output carefully to identify the specific cause. Common culprits include unused imports, missing type definitions, and incorrect module resolution. Run `npm run lint` separately to isolate linting issues from compilation problems.

## Additional Resources

The Next.js documentation at nextjs.org provides comprehensive guidance on the App Router, server components, and routing patterns. Tailwind CSS documentation at tailwindcss.com covers utility classes and customization, though note that the v4 documentation specifically addresses the new CSS-first approach. The Radix UI documentation at radix-ui.com explains the primitives underlying the component library, useful for understanding accessibility patterns and customization options.

For team-specific questions or issues not covered in this documentation, consult with the technical lead or raise questions in the team's development channel. This living document will be updated as patterns evolve and new approaches are established.