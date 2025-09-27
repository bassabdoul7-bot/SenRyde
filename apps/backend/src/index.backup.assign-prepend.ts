import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

function haversineKm(a:{lat:number,lng:number}, b:{lat:number,lng:number}) {
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
  const x=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("trip:join", (tripId) => {
    if (tripId) socket.join(`trip:${tripId}`);
  });
});
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, app: "SenRyde" }));

const PORT = Number(process.env.PORT || 4000);
const MONGO = process.env.MONGODB_URI || "mongodb://localhost:27017/senryde";

mongoose
  .connect(MONGO)
  .then(() => {
    httpServer.listen(PORT, () => console.log("SenRyde API running on :" + PORT));
  })
  .catch((err) => {
    console.error("Mongo connect error:", err?.message || err);
    process.exit(1);
  });
// add this AFTER the /health route
app.post("/fare/estimate", (req, res) => {
  const { pickup, dropoff } = req.body || {};
  if (!pickup?.lat || !pickup?.lng || !dropoff?.lat || !dropoff?.lng) {
    return res.status(400).json({ error: "pickup/dropoff lat/lng required" });
  }
  const km = haversineKm(pickup, dropoff);
  const minutes = (km / 28) * 60;                  // rough city speed km/h
  const total = Math.round(500 + km*250 + minutes*50); // base + per km + per min (CFA)
  res.json({ km:+km.toFixed(2), minutes:+minutes.toFixed(1), total });
});

// === Minimal User model (reuse if already exists) ===
const UserSchema = new mongoose.Schema({
  role: { type: String, enum: ["rider","driver","admin"], required: true, default: "rider" },
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  name: String
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);

// === Auth endpoints ===
app.post("/auth/signup", async (req, res) => {
  try {
    const { email, password, role="rider", name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email/password required" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, role, name });
    return res.json({ id: user.id, email: user.email, role: user.role });
  } catch (e:any) {
    if (e?.code === 11000) return res.status(409).json({ error: "email already exists" });
    return res.status(500).json({ error: e?.message || "signup failed" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email/password required" });
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "invalid credentials" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "change_me", { expiresIn: "7d" });
  return res.json({ token, role: user.role });
});


// ---------- simple auth middleware (optional token) ----------
function auth(req:any, _res:any, next:any){
  const authHeader = req.headers?.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || "change_me"); } catch {}
  }
  next();
}
app.use(auth);

// ---------- Trip model ----------
const TripSchema = new mongoose.Schema({
  rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  pickup: { lat: Number, lng: Number, address: String },
  dropoff: { lat: Number, lng: Number, address: String },
  price: Number,
  status: { type: String, enum: ["pending","accepted","ongoing","completed","canceled"], default: "pending" }
}, { timestamps: true });

const Trip = mongoose.models.Trip || mongoose.model("Trip", TripSchema);

// ---------- helper (reuse if you already have it) ----------
// ---------- rider creates a trip ----------
app.post("/trips/create", async (req, res) => {
  const { pickup, dropoff } = req.body || {};
  if (!pickup?.lat || !pickup?.lng || !dropoff?.lat || !dropoff?.lng) {
    return res.status(400).json({ error: "pickup/dropoff lat/lng required" });
  }
  const km = haversineKm(pickup, dropoff);
  const minutes = (km / 28) * 60;
  const price = Math.round(500 + km*250 + minutes*50); // CFA
  const riderId = (req as any).user?.id || null;

  const trip = await Trip.create({ rider: riderId, pickup, dropoff, price, status: "pending" });
  res.json({ trip });
});

// ---------- driver accepts a pending trip ----------
app.post("/driver/accept", async (req:any, res) => {
  const { tripId } = req.body || {};
  if (!tripId) return res.status(400).json({ error: "tripId required" });
  if (!req.user?.id || req.user?.role !== "driver") return res.status(401).json({ error: "driver auth required" });

  const trip = await Trip.findById(tripId);
  if (!trip) return res.status(404).json({ error: "trip not found" });
  if (trip.status !== "pending") return res.status(409).json({ error: "trip not pending" });

  trip.status = "accepted";
  (trip as any).driver = req.user.id;
  await trip.save();

  res.json({ ok: true, trip });
});

// ---------- driver updates status ----------
app.post("/driver/status", async (req:any, res) => {
  const { tripId, status } = req.body || {};
  const valid = ["accepted","ongoing","completed","canceled"];
  if (!tripId || !status || !valid.includes(status)) return res.status(400).json({ error: "tripId/status required" });
  if (!req.user?.id || req.user?.role !== "driver") return res.status(401).json({ error: "driver auth required" });

  const trip = await Trip.findById(tripId);
  if (!trip) return res.status(404).json({ error: "trip not found" });

  trip.status = status as any;
  await trip.save();

  res.json({ ok: true, trip });
});




app.get("/trips/:id", async (req, res) => {
  const trip = await Trip.findById(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  res.json({ trip });
});

app.get("/trips", async (_req, res) => {
  const trips = await Trip.find().sort({ createdAt: -1 }).limit(10);
  res.json({ trips });
});

app.post("/dev/emit-location", (req, res) => {
  const { tripId, lat, lng } = req.body || {};
  if (!tripId || typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "tripId, lat, lng required" });
  }
  const payload = { tripId, lat, lng, ts: Date.now() };
  io.to(`trip:${tripId}`).emit("driver:location", payload);
  res.json({ ok: true, sent: payload });
});


app.get("/dev/socket-demo", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html>
<head><meta charset="utf-8"/><title>Socket Demo</title></head>
<body style="font-family:system-ui">
  <h1>SenRyde Socket Demo</h1>
  <p>Trip ID: <input id="tid" style="width:260px" placeholder="paste trip id"/><button id="join">Join</button></p>
  <pre id="log" style="background:#111;color:#0f0;padding:12px;height:260px;overflow:auto"></pre>
  <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
  <script>
    const log = (m)=>{ const p=document.getElementById('log'); p.textContent += m + "\\n"; p.scrollTop = p.scrollHeight; };
    const socket = io("/", { transports:["websocket","polling"] });
    socket.on("connect", ()=> log("connected: "+socket.id));
    socket.on("driver:location", (data)=> log("driver:location " + JSON.stringify(data)));
    document.getElementById("join").onclick = ()=>{
      const tripId = document.getElementById("tid").value.trim();
      if (!tripId) return alert("enter trip id");
      socket.emit("trip:join", tripId);
      log("joined room trip:"+tripId);
    };
  </script>
</body>
</html>`);
});
app.get("/dev/socket-demo", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html>
<head><meta charset="utf-8"/><title>Socket Demo</title></head>
<body style="font-family:system-ui">
  <h1>SenRyde Socket Demo</h1>
  <p>Trip ID: <input id="tid" style="width:260px" placeholder="paste trip id"/><button id="join">Join</button></p>
  <pre id="log" style="background:#111;color:#0f0;padding:12px;height:260px;overflow:auto"></pre>
  <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
  <script>
    const log = (m)=>{ const p=document.getElementById('log'); p.textContent += m + "\\n"; p.scrollTop = p.scrollHeight; };
    const socket = io("/", { transports:["websocket","polling"] });
    socket.on("connect", ()=> log("connected: "+socket.id));
    socket.on("driver:location", (data)=> log("driver:location " + JSON.stringify(data)));
    document.getElementById("join").onclick = ()=>{
      const tripId = document.getElementById("tid").value.trim();
      if (!tripId) return alert("enter trip id");
      socket.emit("trip:join", tripId);
      log("joined room trip:"+tripId);
    };
  </script>
</body>
</html>`);
});
/** Driver sends current location (auth required) */
app.post("/driver/location", async (req: any, res) => {
  try {
    // must be an authenticated driver
    if (!req.user?.id || req.user?.role !== "driver") {
      return res.status(401).json({ error: "driver auth required" });
    }
    const { tripId, lat, lng } = req.body || {};
    if (!tripId || typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "tripId, lat, lng required" });
    }

    // Trip model reference
    const Trip = (mongoose.models as any).Trip;
    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: "trip not found" });
    if (String(trip.driver || "") !== String(req.user.id)) {
      return res.status(403).json({ error: "not driver of this trip" });
    }
    if (!["accepted", "ongoing"].includes(trip.status)) {
      return res.status(409).json({ error: "trip not active" });
    }

    const payload = { tripId, lat, lng, ts: Date.now() };

    // store last known location on trip (simple)
    (trip as any).driverLastLoc = { lat, lng, ts: payload.ts };
    await trip.save();

    // broadcast to riders joined to this trip
    io.to(`trip:${tripId}`).emit("driver:location", payload);

    return res.json({ ok: true, loc: payload });
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "location failed" });
  }
});
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html>
<head><meta charset="utf-8"/><title>SenRyde API</title></head>
<body style="font-family:system-ui;line-height:1.5;padding:24px">
  <h1>?? SenRyde API</h1>
  <ul>
    <li><a href="/health">/health</a></li>
    <li><a href="/dev/socket-demo">/dev/socket-demo</a> (live driver location test)</li>
  </ul>
  <p>POST endpoints:</p>
  <pre>
/auth/signup, /auth/login
/trips/create
/driver/accept, /driver/status
/dev/emit-location  (dev)
/driver/location    (if you added the auth one)
  </pre>
</body>
</html>`);
});
app.get("/trips", async (_req, res) => {
  // latest first
  const trips = await (mongoose.models as any).Trip.find().sort({ createdAt: -1 }).limit(20);
  res.json({ trips });
});

app.get("/trips/:id", async (req, res) => {
  const Trip = (mongoose.models as any).Trip;
  const trip = await Trip.findById(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  res.json({ trip });
});
/** Driver sends current location (auth required) */
app.post("/driver/location", async (req: any, res) => {
  try {
    if (!req.user?.id || req.user?.role !== "driver") {
      return res.status(401).json({ error: "driver auth required" });
    }
    const { tripId, lat, lng } = req.body || {};
    if (!tripId || typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "tripId, lat, lng required" });
    }

    const Trip = (mongoose.models as any).Trip;
    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: "trip not found" });

    // only the assigned driver can update this trip
    if (String(trip.driver || "") !== String(req.user.id)) {
      return res.status(403).json({ error: "not driver of this trip" });
    }
    // must be active
    if (!["accepted","ongoing"].includes(trip.status)) {
      return res.status(409).json({ error: "trip not active" });
    }

    const payload = { tripId, lat, lng, ts: Date.now() };
    (trip as any).driverLastLoc = { lat, lng, ts: payload.ts };
    await trip.save();

    io.to(`trip:${tripId}`).emit("driver:location", payload);
    return res.json({ ok: true, loc: payload });
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "location failed" });
  }
});
/** DEV: list all registered routes */
try {
  // @ts-ignore
  app.get("/api/_routes", (_req, res) => {
    const out: string[] = [];
    // @ts-ignore
    const stack = (app as any)?._router?.stack || [];
    const walk = (prefix: string, layer: any) => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods || {}).join(",").toUpperCase();
        out.push(`${methods.padEnd(8)} ${prefix}${layer.route.path}`);
      } else if (layer.name === "router" && layer.handle?.stack) {
        const raw = layer.regexp?.source ?? "";
        const path = raw.replace(/\\\//g,"/").replace(/\^|\$|\(\?:\(\[\^\\\/]\+\?\)\)|\(\?:\)*/g,"");
        layer.handle.stack.forEach((l: any) => walk(prefix + path, l));
      }
    };
    stack.forEach((l: any) => walk("", l));
    res.json({ count: out.length, routes: out.sort() });
  });
} catch {}
/** --- Admin Stats & Trip Ops --- */

// Quick helper for start-of-day (UTC-00 matches your seed well; switch to local TZ if you prefer)
function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

// GET /admin/stats
app.get("/admin/stats", async (req, res) => {
  try {
    const today = startOfToday();

    const [
      totalTrips,
      tripsToday,
      completedTodayAgg,
      pendingTrips,
      ongoingTrips,
      acceptedTrips,
      completedTrips,
      cancelledTrips,
      ridersCount,
      driversCount,
    ] = await Promise.all([
      Trip.countDocuments({}),
      Trip.countDocuments({ createdAt: { $gte: today } }),
      Trip.aggregate([
        { $match: { status: "completed", updatedAt: { $gte: today } } },
        { $group: { _id: null, revenue: { $sum: "$price" } } },
      ]),
      Trip.countDocuments({ status: "pending" }),
      Trip.countDocuments({ status: "ongoing" }),
      Trip.countDocuments({ status: "accepted" }),
      Trip.countDocuments({ status: "completed" }),
      Trip.countDocuments({ status: "cancelled" }),
      typeof User !== "undefined" ? User.countDocuments({ role: "rider" }) : Promise.resolve(0),
      typeof User !== "undefined" ? User.countDocuments({ role: "driver" }) : Promise.resolve(0),
    ]);

    const revenueToday = completedTodayAgg?.[0]?.revenue ?? 0;

    res.json({
      ok: true,
      totals: {
        trips: totalTrips,
        riders: ridersCount,
        drivers: driversCount,
      },
      today: {
        created: tripsToday,
        revenue: revenueToday,
        // optional: completedToday count (derived from revenue group)
      },
      byStatus: {
        pending: pendingTrips,
        accepted: acceptedTrips,
        ongoing: ongoingTrips,
        completed: completedTrips,
        cancelled: cancelledTrips,
      },
    });
  } catch (e) {
    console.error("admin/stats error", e);
    res.status(500).json({ ok: false, error: "stats_failed" });
  }
});

// PATCH /trips/:id/status { status }
app.patch("/trips/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const allowed = ["pending", "accepted", "ongoing", "completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ ok: false, error: "invalid_status", allowed });
    }
    const trip = await Trip.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    );
    if (!trip) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, trip });
  } catch (e) {
    console.error("patch trip status error", e);
    res.status(500).json({ ok: false, error: "update_failed" });
  }
});
// List users by role with simple search (?q=)
app.get("/admin/users", async (req, res) => {
  try {
    const { role, q } = req.query as any;
    const filter: any = {};
    if (role) filter.role = role;
    if (q) filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
    const users = await (mongoose.models.User || User).find(filter).limit(100).lean();
    res.json({ ok: true, users });
  } catch (e) {
    console.error("admin/users error", e);
    res.status(500).json({ ok: false, error: "user_list_failed" });
  }
});

// Assign driver to a trip
app.patch("/trips/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body || {};
    if (!driverId) return res.status(400).json({ ok:false, error:"missing_driverId" });

    // (Optional) validate driver exists
    const driver = await (mongoose.models.User || User).findById(driverId);
    if (!driver || driver.role !== "driver") {
      return res.status(400).json({ ok:false, error:"invalid_driver" });
    }

    const trip = await (mongoose.models.Trip || Trip).findByIdAndUpdate(
      id,
      { driverId, status: "accepted", updatedAt: new Date() },
      { new: true }
    );
    if (!trip) return res.status(404).json({ ok:false, error:"not_found" });
    res.json({ ok:true, trip });
  } catch (e) {
    console.error("assign driver error", e);
    res.status(500).json({ ok:false, error:"assign_failed" });
  }
});
app.patch("/trips/:id/status", async (req, res) => {
  try {
    const { id } = req.params as any;
    const { status } = req.body || {};
    const allowed = ["pending","accepted","ongoing","completed","cancelled"];
    if (!allowed.includes((status || "").toLowerCase())) {
      return res.status(400).json({ ok:false, error:"invalid_status" });
    }

    const update: any = { status: status.toLowerCase(), updatedAt: new Date() };
    if (update.status === "completed") update.completedAt = new Date();

    const TripModel = mongoose.models.Trip || Trip;
    const trip = await TripModel.findByIdAndUpdate(id, update, { new: true });
    if (!trip) return res.status(404).json({ ok:false, error:"not_found" });

    res.json({ ok:true, trip });
  } catch (e) {
    console.error("status update error", e);
    res.status(500).json({ ok:false, error:"status_update_failed" });
  }
});
app.patch("/trips/:id/status", async (req, res) => {
  try {
    const { id } = req.params as any;
    const { status } = req.body || {};
    const allowed = ["pending","accepted","ongoing","completed","cancelled"];
    if (!allowed.includes((status || "").toLowerCase())) {
      return res.status(400).json({ ok:false, error:"invalid_status" });
    }

    const update: any = { status: status.toLowerCase(), updatedAt: new Date() };
    if (update.status === "completed") update.completedAt = new Date();

    const TripModel = mongoose.models.Trip || Trip;
    const trip = await TripModel.findByIdAndUpdate(id, update, { new: true });
    if (!trip) return res.status(404).json({ ok:false, error:"not_found" });

    res.json({ ok:true, trip });
  } catch (e) {
    console.error("status update error", e);
    res.status(500).json({ ok:false, error:"status_update_failed" });
  }
});
/** Assign a driver and mark the trip accepted */
app.patch("/trips/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body || {};
    if (!driverId) return res.status(400).json({ ok:false, error:"missing_driverId" });

    // Ensure status becomes accepted when driver is assigned
    const trip = await (mongoose.models.Trip || Trip).findByIdAndUpdate(
      id,
      { driverId, status: "accepted", updatedAt: new Date() },
      { new: true }
    );
    if (!trip) return res.status(404).json({ ok:false, error:"not_found" });

    res.json({ ok:true, trip });
  } catch (e) {
    console.error("assign error", e);
    res.status(500).json({ ok:false, error:"assign_failed" });
  }
});
/** Assign a driver and mark the trip accepted */
app.patch("/trips/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body || {};
    if (!driverId) return res.status(400).json({ ok:false, error:"missing_driverId" });

    // Ensure status becomes accepted when driver is assigned
    const trip = await (mongoose.models.Trip || Trip).findByIdAndUpdate(
      id,
      { driverId, status: "accepted", updatedAt: new Date() },
      { new: true }
    );
    if (!trip) return res.status(404).json({ ok:false, error:"not_found" });

    res.json({ ok:true, trip });
  } catch (e) {
    console.error("assign error", e);
    res.status(500).json({ ok:false, error:"assign_failed" });
  }
});
/** === schema hotfix: ensure driver fields exist on Trip === */
try {
  // If TripSchema exists in this file, augment it. If not, this will no-op safely.
  if (typeof TripSchema !== "undefined") {
    TripSchema.add({
      driver:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      driverId: { type: String, default: null }
    });
  }
} catch (e) {
  console.error("TripSchema.add driver fields failed (ok to ignore if already present):", e?.message || e);
}


