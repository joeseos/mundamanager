import Image from 'next/image';

export default function BackgroundImage() {
  return (
    <div className="fixed inset-0 z-[-1] bg-gray-900 print:hidden">
      <Image
        src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/background_numv5r.avif"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
        quality={85}
      />
    </div>
  );
}
