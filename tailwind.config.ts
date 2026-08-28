import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.25rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        // Only ever used on tier badges — the one place the product itself
        // names a metal. See globals.css for why they go no further.
        tier: {
          silver: "hsl(var(--tier-silver))",
          gold: "hsl(var(--tier-gold))",
          diamond: "hsl(var(--tier-diamond))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // On a dark surface a drop shadow is nearly invisible, so elevation is
        // carried by a hairline top highlight instead — the way light actually
        // catches a raised edge. The shadow underneath only adds depth.
        card: "inset 0 1px 0 0 hsl(0 0% 100% / 0.04), 0 1px 2px 0 rgb(0 0 0 / 0.4)",
        lift: "inset 0 1px 0 0 hsl(0 0% 100% / 0.06), 0 16px 40px -20px rgb(0 0 0 / 0.8)",
        glow: "0 0 0 1px hsl(var(--primary) / 0.35), 0 8px 30px -10px hsl(var(--primary) / 0.45)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // Headings only. Bricolage has enough character to carry a page and
        // enough restraint to sit above dense financial tables.
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        // Money, references and transaction hashes.
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
