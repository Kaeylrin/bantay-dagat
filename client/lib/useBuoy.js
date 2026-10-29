import { useEffect, useState } from "react";
import { db, ref, onValue, DB_PATHS, mapArduinoReading } from "@/lib/firebase";
import { stationState } from "@/lib/stationState";

// Live link state for the monitoring station, shared by the sidebar, header pill and
// dashboard so they can never disagree.
//
// Staleness is re-evaluated on a timer: Firebase only fires onValue when data
// CHANGES, so if the station goes silent no event arrives — without the ticker the
// UI would stay "Live" forever.
//
// connection: "connecting" | "live" | "offline" | "empty" | "error"
export function useBuoy({ tickMs = 5000 } = {}) {
  const [reading, setReading] = useState(null);
  const [linkError, setLinkError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [databaseConnected, setDatabaseConnected] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const latestRef = ref(db, DB_PATHS.LATEST);
    const connectionUnsub = onValue(ref(db, ".info/connected"), (snap) => {
      setDatabaseConnected(snap.val() === true);
    });
    const unsub = onValue(
      latestRef,
      (snap) => {
        setReading(mapArduinoReading(snap.val()));
        setLinkError(null);
        setLoaded(true);
        setNow(Date.now());
      },
      (err) => {
        setLinkError(err?.message || "Database unavailable");
        setLoaded(true);
      },
    );
    return () => {
      unsub();
      connectionUnsub();
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return {
    reading,
    linkError,
    databaseConnected,
    ...stationState(reading, { now, loaded, linkError, databaseConnected }),
  };
}
