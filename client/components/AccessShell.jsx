export default function AccessShell({ children, variant = "ranger" }) {
  return (
    <main className="access-shell" data-variant={variant}>
      <div className="access-panel">
        <div className="access-brand">
          <img src="/bantay-dagat.png" alt="" width="42" height="42" />
          <span>BantayDagat</span>
        </div>
        <div className="access-art" aria-hidden="true" />
        <section className="access-card">{children}</section>
      </div>
    </main>
  );
}
