export default function AccessShell({ children }) {
  return (
    <main className="access-shell">
      <div className="mb-6 flex items-center gap-3">
        <img
          src="/bantay-dagat.png"
          alt=""
          className="h-11 w-11 object-contain"
        />
        <span className="text-2xl font-bold tracking-tight">BantayDagat</span>
      </div>
      <section className="access-card">{children}</section>
    </main>
  );
}
