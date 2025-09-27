import React from "react";

/** Small KPI card */
export function Kpi({
  label,
  value,
  sub,
}: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      padding:16,border:"1px solid #e5e7eb",borderRadius:12,background:"#fff",
      boxShadow:"0 1px 2px rgba(0,0,0,0.04)"
    }}>
      <div style={{fontSize:12,color:"#6b7280"}}>{label}</div>
      <div style={{fontSize:28,fontWeight:700,marginTop:4}}>{value}</div>
      {sub && <div style={{fontSize:12,color:"#6b7280",marginTop:6}}>{sub}</div>}
    </div>
  );
}

/** Mini line trend using inline SVG (no extra libs) */
export function LineTrend({ points }:{ points:number[] }) {
  if (!points?.length) return null;
  const w=180, h=48, pad=4;
  const max = Math.max(...points), min = Math.min(...points);
  const span = Math.max(1, max - min);
  const step = (w - pad*2) / (points.length - 1);
  const toY = (v:number) => h - pad - ((v - min) / span) * (h - pad*2);
  const d = points.map((v,i)=> `${i===0?'M':'L'} ${pad + i*step} ${toY(v)}`).join(" ");

  return (
    <svg width={w} height={h} style={{display:"block"}}>
      <polyline
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="1"
        points={`${pad},${h-pad} ${w-pad},${h-pad}`}
      />
      <path d={d} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
