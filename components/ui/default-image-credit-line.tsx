import { hasDefaultImageCredit, type DefaultImageCredit } from '@/types/gang';

export function DefaultImageCreditLine({
  credit,
}: {
  credit?: DefaultImageCredit | null;
}) {
  if (!hasDefaultImageCredit(credit)) {
    return <p className="text-xs mt-1">&nbsp;</p>;
  }

  const name = credit.name?.trim();
  const href = credit.url?.trim();
  const suffix = credit.suffix?.trim();
  const hasByline = Boolean(name || href);

  return (
    <p className="text-xs italic text-center text-muted-foreground mt-1">
      {hasByline && (
        <>
          Illustration by{' '}
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              {name || href}
            </a>
          ) : (
            name
          )}
        </>
      )}
      {suffix && `${hasByline ? ' ' : ''}${suffix}`}
    </p>
  );
}
