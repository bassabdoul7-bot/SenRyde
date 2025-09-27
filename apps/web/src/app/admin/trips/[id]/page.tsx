"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = "http://localhost:4001";
const NEXTS = {
  pending:   ["accepted","cancelled"],
  accepted:  ["ongoing","cancelled"],
  ongoing:   ["completed","cancelled"],
  completed: [],
  cancelled: [],
} as const;

export default function TripDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id?.toString();

  const [trip, setTrip] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driverId, setDriverId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const [tripRes, drvRes] = await Promise.all([
      fetch(`${API_BASE}/trips/${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetch(`${API_BASE}/admin/users?role=driver`, { cache: "no-store" }),
    ]);
    if (!tripRes.ok) throw new Error("Trip fetch failed");
    const tripData = await tripRes.json();
    const drvData = await drvRes.json();
    setTrip(tripData.trip ?? tripData);
    setDrivers(drvData.users ?? []);
  }

  useEffect(() => { load().catch(e=>setError(e.message)); }, [id]);

  async function assign() {
    if (!id || !driverId) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API_BASE}/trips/${encodeURIComponent(id)}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setTrip(data.trip ?? data);
    } catch (e:any) { setError(e.message || "assign_failed"); }
    finally { setBusy(false); }
  }

  async function setStatus(s:string) {
    if (!id) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API_BASE}/trips/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type" : "application/json" },
        body: JSON.stringify({ status: s }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setTrip(data.trip ?? data);
    } catch (e:any) { setError(e.message || "update_failed"); }
    finally { setBusy(false); }
  }

  if (!id) return <main>Loading…</main>;
  if (error) return <main><p>Error: {error}</p></main>;
  if (!trip) return <main>Loading…</main>;

  const status = (trip.status || "").toLowerCase();
  const nexts = (NEXTS as any)[status] || [];

  return (
    <main style={{maxWidth:900, margin:"24px auto"}}>
      <h1>Trip Detail</h1>
      <p><strong>ID:</strong> {trip._id}</p>
      <p><strong>Pickup:</strong> {trip?.pickup?.address ?? `${trip?.pickup?.lat}, ${trip?.pickup?.lng}`}</p>
      <p><strong>Dropoff:</strong> {trip?.dropoff?.address ?? `${trip?.dropoff?.lat}, ${trip?.dropoff?.lng}`}</p>
      <p><strong>Status:</strong> {trip.status}</p>
      <p><strong>Price:</strong> {trip.price}</p>
      <p><strong>Rider ID:</strong> {trip.rider}</p>
      <p><strong>Driver:</strong> {trip?.driverId || "(unassigned)"}</p>

      <div style={{marginTop:16, display:"flex", gap:8, alignItems:"center"}}>
        <select value={driverId} onChange={(e)=>setDriverId(e.target.value)}
                style={{padding:"8px 10px", border:"1px solid #ddd", borderRadius:8}}>
          <option value="">Select driver…</option>
          {drivers.map((d:any)=>(
            <option key={d._id} value={d._id}>{d.name || d._id}</option>
          ))}
        </select>
        <button onClick={assign} disabled={!driverId || busy}
                style={{padding:"8px 12px", border:"1px solid #ddd", borderRadius:8, background:"#fff", cursor:"pointer"}}>
          Assign
        </button>
      </div>

      {nexts.length > 0 && (
        <div style={{marginTop:16, display:"flex", gap:8}}>
          {nexts.map((s:string)=>(
            <button key={s} disabled={busy}
              onClick={()=>setStatus(s)}
              style={{padding:"8px 12px", border:"1px solid #ddd", borderRadius:8, background:"#fff", cursor:"pointer"}}>
              Set {s}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
