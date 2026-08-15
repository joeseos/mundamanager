export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4 md:p-4 space-y-4">
          <div className="h-7 w-64 rounded-md bg-muted animate-pulse" />
          <div className="h-5 w-full max-w-md rounded-md bg-muted animate-pulse" />
          <div className="h-8 w-full rounded-md bg-muted animate-pulse" />
          <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
        </div>
        <div className="bg-card shadow-md rounded-lg p-4 space-y-3">
          <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
          <div className="h-20 w-full rounded-md bg-muted animate-pulse" />
          <div className="h-20 w-full rounded-md bg-muted animate-pulse" />
        </div>
      </div>
    </main>
  );
}
