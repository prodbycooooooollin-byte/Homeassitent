export default function Loading() {
  return (
    <div className="container-page pt-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton mt-4 aspect-[4/3] w-full rounded-3xl sm:aspect-[21/9]" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="skeleton h-28 w-full rounded-2xl" />
          <div className="skeleton h-64 w-full rounded-2xl" />
        </div>
        <div className="skeleton h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}
