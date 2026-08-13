export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6" data-testid="privacy-page">
      <div className="space-y-2">
        <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
          Privacy
        </p>
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          Privacy Policy
        </h1>
        <p className="text-sm text-brand-text-soft">Last updated: February 2026</p>
      </div>

      <div className="space-y-4 text-brand-text leading-relaxed">
        <p>
          Manifeast is built on a simple principle: your data belongs to you. We do not
          have accounts, do not run advertising, and do not sell any information about you
          to third parties.
        </p>

        <h2 className="font-serif-display text-2xl font-medium pt-4">What stays on your device</h2>
        <p>
          Your meal log, favourite recipes, shopping list, weight entries and coach
          preferences are stored locally in your phone&rsquo;s browser storage. We never
          transmit or store these on our servers.
        </p>

        <h2 className="font-serif-display text-2xl font-medium pt-4">What we send to the AI</h2>
        <p>
          When you scan a fridge, analyse a plate or ask for recipes, the photo (if any)
          and any text you send are transmitted to our servers and forwarded to a
          third-party AI provider (Gemini / OpenAI) for processing. We keep an aggregate,
          anonymous record of the query text and result to improve the app. We do
          <em> not</em> keep your images after processing.
        </p>

        <h2 className="font-serif-display text-2xl font-medium pt-4">Camera &amp; photos</h2>
        <p>
          The app asks for camera and photo library access only when you tap Scan or
          Analyse. Photos you select are used to identify ingredients or meal contents and
          are not saved anywhere by Manifeast.
        </p>

        <h2 className="font-serif-display text-2xl font-medium pt-4">Analytics</h2>
        <p>
          We do not run third-party analytics or trackers in the app. Standard web server
          logs (IP address, user agent) are retained for up to 30 days for security and
          debugging.
        </p>

        <h2 className="font-serif-display text-2xl font-medium pt-4">Affiliate retailer links</h2>
        <p>
          When you tap through to a retailer to buy ingredients we may earn a small
          affiliate commission. The click leaves Manifeast for the retailer&rsquo;s own
          website, whose privacy policy then applies.
        </p>

        <h2 className="font-serif-display text-2xl font-medium pt-4">Children</h2>
        <p>
          Manifeast is not directed at children under 13. We do not knowingly collect
          personal information from anyone under 13.
        </p>

        <h2 className="font-serif-display text-2xl font-medium pt-4">Your rights</h2>
        <p>
          To delete every trace of your Manifeast data from your device, uninstall the
          app or clear the site data in your browser. Nothing is kept on our side that we
          could delete for you.
        </p>

        <h2 className="font-serif-display text-2xl font-medium pt-4">Contact</h2>
        <p>
          Questions or concerns? Reach us at{" "}
          <a
            href="mailto:hello@whatieat.emergent.host"
            className="text-brand-primary underline"
          >
            hello@whatieat.emergent.host
          </a>
          .
        </p>

        <p className="text-sm text-brand-text-soft italic pt-6">
          Manifeast is operated by Sean Reilly.
        </p>
      </div>
    </div>
  );
}
