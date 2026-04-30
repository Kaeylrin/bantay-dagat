import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  Wind,
  Droplets,
  Thermometer,
  CloudRain,
  RefreshCw,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Open-Meteo API — completely FREE, no API key required.
// Docs: https://open-meteo.com/en/docs
//
// We fetch current weather for Brgy. Labac, Naic, Cavite using its
// GPS coordinates.  Open-Meteo returns JSON with a `current` block
// containing the variables we asked for in the URL query string.
// ─────────────────────────────────────────────────────────────────────────────
const NAIC_LAT = 14.1291;
const NAIC_LON = 120.7611;

const API_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${