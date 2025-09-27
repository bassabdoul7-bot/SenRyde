"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = "http://localhost:4001";

export default function TripsPage() {
  const [trips, setTrips] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/trips`, { cache: "no-store" })
      .then(r => r.json())
      .then(data => setTrips(Array.isArray(data) ? data : (data?.trips ?? [])))
      .catch(console.error);
  }, []);
  return (
    <main>
      
      <h1>Trips</h1>
      <div style={{display:"grid",gap:8,marginTop:12}}>
        {trips.map((t:any) => (
          <Link key={t._id} href={`/admin/trips/${t._id}`} style={{border:"1px solid #eee",borderRadius:12,padding:12,display:"block"}}>
            <div>
              <strong>{t?.pickup?.address ?? "Pickup"}</strong> {'->'} {t?.dropoff?.address ?? "Dropoff"}
            </div>
            <div style={{fontSize:12,opacity:.7}}>
              id: {t._id} | status: {t.status ?? "(unknown)"} | price: {t.price ?? "-"}
            </div>
          </Link>
        ))}
        {!trips.length && <div>No trips found.</div>}
      </div>
    </main>
  );
}
