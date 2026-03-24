export function AdminHome(props: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="max-w-2xl space-y-2">
        <h2 className="text-xl font-semibold text-text">{props.title}</h2>
        <p className="text-sm leading-6 text-muted">{props.description}</p>
      </div>
    </section>
  );
}
