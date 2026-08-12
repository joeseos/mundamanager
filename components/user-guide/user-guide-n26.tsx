export function UserGuideN26() {
  return (
    <>
      <div className="mb-12">
        <h2 className="text-xl font-semibold text-foreground mb-2">Contents</h2>
        <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
          <li>
            <a href="#n26-coming-soon" className="underline hover:text-red-800">
              Coming Soon
            </a>
          </li>
        </ul>
      </div>

      <div className="space-y-6">
        <section id="n26-coming-soon" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold text-foreground mb-1">
            <a
              href="#n26-coming-soon"
              className="hover:text-red-800 transition-colors after:content-['#'] after:ml-2 after:text-sm after:text-muted-foreground after:opacity-0 hover:after:opacity-100 focus-visible:after:opacity-100 after:transition-opacity"
            >
              Coming Soon
            </a>
          </h2>
          <p className="text-muted-foreground mb-2">
            The N26 user guide is coming soon. Switch to N23 for the current guide, or check back later for edition-specific instructions.
          </p>
        </section>
      </div>
    </>
  );
}
