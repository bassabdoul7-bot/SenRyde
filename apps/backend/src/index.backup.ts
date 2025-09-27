import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, app: "SenRyde" }));

const PORT = Number(process.env.PORT || 4000);
const MONGO = process.env.MONGODB_URI || "mongodb://localhost:27017/senryde";

mongoose
  .connect(MONGO)
  .then(() => {
    app.listen(PORT, () => console.log("SenRyde API running on :" + PORT));
  })
  .catch((err) => {
    console.error("Mongo connect error:", err?.message || err);
    process.exit(1);
  });
function haversineKm(a:{lat:number,lng:number}, b:{lat:number,lng:number}) {
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
  const x=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}

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
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

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


