"use client";
import { useEffect, useState } from "react";

const API_BASE = "http://localhost:4001";

type Stats = {
  ok: boolean;
  totals: { trips: number; riders: number; drivers: number };
  today: { created: number; revenue: number };
  byStatus: { pending:number; accepted:number; ongoing:number; completed:number; cancelled:number };
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const url = `${API_BASE}/admin/stats`;
    console.log("Admin stats URL:", url);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setStats)
      .catch((e) => {
        console.error("Admin stats fetch failed:", e);
        setErr(e.message);
      });
  }, []);

  if (err) return <main><h1>Dashboard</h1><p>Error: {err}</p></main>;
  if (!stats) return <main><h1>Dashboard</h1><p>Loading…</p></main>;

  const Card = ({ title, value, subtitle }: {title:string; value:string|number; subtitle?:string}) => (
    <div style={{border:"1px solid #eee", borderRadius:16, padding:16, background:"#fff"}}>
      <div style={{fontSize:12, color:"#6b7280"}}>{title}</div>
      <div style={{fontSize:28, fontWeight:700, marginTop:4}}>{value}</div>
      {subtitle && <div style={{fontSize:12, color:"#6b7280", marginTop:4}}>{subtitle}</div>}
    </div>
  );

  return (
    <main style={{maxWidth:1000, margin:"24px auto", padding:"0 16px"}}>
      <h1>Dashboard</h1>

      <section style={{display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:12, marginTop:16}}>
        <Card title="Trips (total)" value={stats.totals.trips} />
        <Card title="Riders (total)" value={stats.totals.riders} />
        <Card title="Drivers (total)" value={stats.totals.drivers} />
        <Card title="Revenue (today)" value={`$${(stats.today.revenue/100).toFixed(2)}`} subtitle={`${stats.today.created} trips today`} />
      </section>

      <section style={{marginTop:24}}>
        <h3>Status</h3>
        <div style={{display:"grid", gridTemplateColumns:"repeat(5, minmax(0,1fr))", gap:12}}>
          <Card title="Pending"   value={stats.byStatus.pending} />
          <Card title="Accepted"  value={stats.byStatus.accepted} />
          <Card title="Ongoing"   value={stats.byStatus.ongoing} />
          <Card title="Completed" value={stats.byStatus.completed} />
          <Card title="Cancelled" value={stats.byStatus.cancelled} />
        </div>
      </section>
    </main>
  );
}
