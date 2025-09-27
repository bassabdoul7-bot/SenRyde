export const metadata = {
  title: "SenRyde Admin",
  description: "Ride-hailing admin dashboard",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{background:"#f6f7fb", color:"#111", fontFamily:"system-ui"}}>
        <header style={{borderBottom:"1px solid #e5e7eb", background:"#fff"}}>
          <nav style={{maxWidth:1000, margin:"0 auto", padding:"12px 16px", display:"flex", gap:16}}>
            <a href="/admin" style={{textDecoration:"underline"}}>Dashboard</a>
            <a href="/admin/trips" style={{textDecoration:"underline"}}>Trips</a>
          </nav>
        </header>
        <main style={{maxWidth:1000, margin:"16px auto", padding:"0 16px"}}>
          {children}
        </main>
      </body>
    </html>
  );
}
