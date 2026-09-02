const FANCY_TOP_BAR_STROKE_SRC =
  "https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/top-bar-stroke-v3_s97f2k.png";

export function FancyPrintTopBarArt() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={FANCY_TOP_BAR_STROKE_SRC}
      alt=""
      aria-hidden
      className="fancy-print-top-bar-art pointer-events-none absolute inset-0 size-full"
      style={{ objectFit: "fill" }}
    />
  );
}
