"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker as LeafletCircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/searchable-select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MapPin, Plus, Loader2, Search, Building2, Hospital, Landmark, HeartHandshake,
  RefreshCw, Pencil, Trash2, Crosshair, LocationEdit, Ban, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { faNum } from "@/lib/jalali";
import {
  IR_PROVINCES, IR_PROVINCE_CAPITALS, IR_CITIES, normalizeFa, findCity,
  type IrCity,
} from "@/lib/ir-geo";

/**
 * اطلاعات پایهٔ مراکز و کلینیک‌ها — بندهای ۱ و ۵
 * ثبت و ویرایش مراکز/کلینیک‌ها، تعیین موقعیت روی نقشه (کلیک یا جستجو) و
 * همگام‌سازی از سامانهٔ حضور و غیاب (تکنورز).
 *
 * نقشه: چند سرویس تایل با تعویض خودکار — چون برخی سرویس‌ها از ایران در دسترس
 * نیستند، پیش‌فرض گوگل است و در صورت خطا خودکار به سرویس بعدی سوییچ می‌شود.
 * جستجوی نقشه: شهرهای ایران (آفلاین) + geocoding آنلاین؛ عبارت «کمیته امداد
 * امام خمینی» هم قابل جستجو است و نتیجه با پرش روی نقشه مشخص می‌شود.
 */

interface Center {
  id: string; code: string; name: string; type: string; region: string;
  province: string; city: string; address: string; phone: string;
  lat: number | null; lng: number | null; radiusM: number;
  isActive: boolean; source: string; managerId: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  CLINIC: "کلینیک", CENTER: "مرکز", HQ: "ستاد", EMDAD: "کمیته امداد",
};
const TYPE_COLORS: Record<string, string> = {
  CLINIC: "#c2185b", CENTER: "#0369a1", HQ: "#9c27b0", EMDAD: "#d97706",
};

// ---------- سرویس‌های تایل نقشه (به‌ترتیب تلاش) ----------
const TILE_PROVIDERS = [
  { key: "google", label: "گوگل", url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", subdomains: ["0", "1", "2", "3"], attribution: "© Google", maxZoom: 20 },
  { key: "osm", label: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap", maxZoom: 19 },
  { key: "esri", label: "Esri World", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attribution: "© Esri", maxZoom: 19 },
];

interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  source: "city" | "geo";
  zoom: number;
}

const emptyForm = {
  id: "", code: "", name: "", type: "CLINIC", region: "", province: "", city: "",
  address: "", phone: "", lat: "", lng: "", radiusM: "300", isActive: true,
};

// عبارت کمیته امداد — برای جستجوی دفاتر کمیته امداد امام خمینی (ره)
const EMDAD_PHRASE = "کمیته امداد";

export default function AdminCentersPage() {
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("all");
  const [fProvince, setFProvince] = useState("all");
  const [syncing, setSyncing] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [pickMode, setPickMode] = useState(false); // انتخاب مختصات روی نقشه

  const [deleteTarget, setDeleteTarget] = useState<Center | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  // جستجوی روی نقشه
  const [mapQuery, setMapQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [geoSearching, setGeoSearching] = useState(false);

  // سرویس تایل نقشه
  const [providerIdx, setProviderIdx] = useState(0);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<Map<string, LeafletCircleMarker>>(new Map());
  const pickModeRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef = useRef<any>(null);
  const tileErrorsRef = useRef(0);
  const providerIdxRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoMarkerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ centers: Center[] }>("/api/admin/centers");
      setCenters(data.centers);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---------- تعویض سرویس تایل ----------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyProvider = useCallback((idx: number) => {
    const map = mapRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = leafletRef.current as any;
    if (!map || !L) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const p = TILE_PROVIDERS[idx];
    tileLayerRef.current = L.tileLayer(p.url, {
      attribution: p.attribution,
      subdomains: p.subdomains || ["a", "b", "c"],
      maxZoom: p.maxZoom || 19,
    }).addTo(map);
    tileErrorsRef.current = 0;
    providerIdxRef.current = idx;
    setProviderIdx(idx);
  }, []);

  // ---------- نقشه (Leaflet — بدون وابستگی SSR) ----------
  // توجه: ساخت نقشه فقط بعد از پایان loading انجام می‌شود چون div نقشه
  // در حالت skeleton وجود ندارد؛ وگرنه effect یک‌بار با ref خالی اجرا
  // شده و نقشه هرگز ساخته نمی‌شود.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !mapDivRef.current || mapRef.current) return;
        leafletRef.current = L;
        const map = L.map(mapDivRef.current, {
          center: [35.6892, 51.389], zoom: 5, scrollWheelZoom: true,
        });
        mapRef.current = map;
        applyProvider(0);
        // خطای تایل → تعویض خودکار سرویس (بسیاری از سرویس‌ها از ایران فیلترند)
        map.on("tileerror", () => {
          tileErrorsRef.current += 1;
          if (tileErrorsRef.current >= 6) {
            const prev = providerIdxRef.current;
            const next = (prev + 1) % TILE_PROVIDERS.length;
            tileErrorsRef.current = 0;
            if (next !== prev) {
              applyProvider(next);
              toast.info(`تایل‌های «${TILE_PROVIDERS[prev].label}» بارگیری نشد — به «${TILE_PROVIDERS[next].label}» سوییچ شد`);
            }
          }
        });
        map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
          if (!pickModeRef.current) return;
          const lat = Number(e.latlng.lat.toFixed(6));
          const lng = Number(e.latlng.lng.toFixed(6));
          setForm((f) => ({ ...f, lat: String(lat), lng: String(lng) }));
          setPickMode(false);
          pickModeRef.current = false;
          setFormOpen(true); // بازگشت خودکار به فرم با مختصات ثبت‌شده
          toast.success(`مختصات ثبت شد: ${lat} ، ${lng}`);
        });
        setMapReady(true);
      } catch {
        toast.error("بارگذاری نقشه ممکن نشد — اتصال اینترنت سرور را بررسی کنید");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      markersRef.current.clear();
      setMapReady(false);
    };
  }, [loading, applyProvider]);

  // ---------- فیلتر ----------
  const filtered = useMemo(() => {
    const q = search.trim();
    return centers.filter(
      (c) =>
        (fType === "all" || c.type === fType) &&
        (fProvince === "all" || c.province === fProvince) &&
        (!q ||
          c.name.includes(q) || c.code.includes(q) || c.province.includes(q) || c.city.includes(q) ||
          normalizeFa(c.name).includes(normalizeFa(q)) ||
          normalizeFa(TYPE_LABELS[c.type] || "").includes(normalizeFa(q)))
    );
  }, [centers, search, fType, fProvince]);

  const provinces = useMemo(
    () => [...new Set(centers.map((c) => c.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fa")),
    [centers]
  );

  // ---------- پرش نقشه به شهر/استان ----------
  const flyToCity = useCallback((cityOrProvince: string, zoom = 12) => {
    const c = findCity(cityOrProvince);
    if (c && mapRef.current) {
      mapRef.current.flyTo([c.lat, c.lng], zoom, { duration: 0.8 });
    }
  }, []);

  // فیلتر استان → پرش مستقیم نقشه به مرکز همان استان
  function changeProvinceFilter(v: string) {
    setFProvince(v);
    if (v === "all") return;
    const cap = IR_PROVINCE_CAPITALS.find((c) => normalizeFa(c.province) === normalizeFa(v));
    if (cap) flyToCity(cap.province, 11);
  }

  // ---------- ترسیم نشانگرها ----------
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;
    for (const m of markersRef.current.values()) m.remove();
    markersRef.current.clear();
    const bounds: Array<[number, number]> = [];
    for (const c of centers) {
      if (c.lat === null || c.lng === null) continue;
      const color = c.isActive ? TYPE_COLORS[c.type] || "#64748b" : "#94a3b8";
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: 8, weight: 2, color: "#ffffff", fillColor: color, fillOpacity: 0.92,
      }).addTo(map);
      marker.bindPopup(
        `<div dir="rtl" style="font-family:Vazirmatn,Tahoma;text-align:right">
          <b>${c.name}</b><br/>
          <span style="font-size:11px;color:#475569">${TYPE_LABELS[c.type] || c.type} — ${c.province || "بدون استان"}</span><br/>
          <span style="font-size:11px;color:#64748b">${c.address || "بدون آدرس"}</span><br/>
          <span style="font-size:10px;color:#94a3b8" dir="ltr">${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}</span>
        </div>`
      );
      marker.on("click", () => {
        // در حالت انتخاب موقعیت، کلیک روی نشانگر مرکز هم مختصات ثبت می‌کند
        if (pickModeRef.current) {
          setForm((f) => ({ ...f, lat: String(c.lat), lng: String(c.lng) }));
          setPickMode(false);
          pickModeRef.current = false;
          setFormOpen(true);
          toast.success(`مختصات از نشانگر «${c.name}» ثبت شد`);
          return;
        }
        setFocusId(c.id);
      });
      markersRef.current.set(c.id, marker);
      bounds.push([c.lat, c.lng]);
    }
    if (bounds.length) {
      try { map.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 }); } catch { /* نقشه خالی */ }
    }
  }, [centers, mapReady]);

  // ---------- بزرگ‌نمایی روی مرکز انتخاب‌شده ----------
  useEffect(() => {
    if (!focusId) return;
    const c = centers.find((x) => x.id === focusId);
    const map = mapRef.current;
    if (c && c.lat !== null && c.lng !== null && map) {
      map.flyTo([c.lat, c.lng], 13, { duration: 0.8 });
    }
    setFocusId(null);
  }, [focusId, centers]);

  // ---------- جستجوی روی نقشه (شهرها آفلاین + geocoding آنلاین) ----------
  function localMatches(q: string): GeoResult[] {
    let text = normalizeFa(q);
    let isEmdad = false;
    if (text.includes(normalizeFa(EMDAD_PHRASE))) {
      isEmdad = true;
      text = text.replace(normalizeFa(EMDAD_PHRASE), "").trim();
    }
    if (!text) {
      // فقط «کمیته امداد» → پرش به شهر انتخاب‌شدهٔ فرم یا فیلتر استان
      const target = form.city || form.province || (fProvince !== "all" ? fProvince : "");
      const c = target ? findCity(target) : null;
      return c ? [{ label: `دفتر کمیته امداد امام خمینی — ${c.city}`, lat: c.lat, lng: c.lng, source: "city", zoom: 13 }] : [];
    }
    const hits = IR_CITIES.filter((c) => {
      const city = normalizeFa(c.city), prov = normalizeFa(c.province);
      return city.includes(text) || text.includes(city) || (text.length >= 3 && prov.includes(text));
    }).slice(0, 6);
    return hits.map((c) => ({
      label: isEmdad ? `دفتر کمیته امداد ${c.city} — استان ${c.province}` : `${c.city} — استان ${c.province}`,
      lat: c.lat, lng: c.lng, source: "city" as const, zoom: isEmdad ? 13 : 12,
    }));
  }

  // geocoding آنلاین — photon (سریع) و در صورت نرسیدن nominatim
  async function remoteGeocode(q: string, signal: AbortSignal): Promise<GeoResult[]> {
    const out: GeoResult[] = [];
    // Photon (komoot) — معمولاً از ایران در دسترس است
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lat=32.5&lon=52.5`,
        { signal }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          features?: Array<{ properties?: Record<string, string>; geometry?: { coordinates?: [number, number] } }>;
        };
        for (const f of data.features || []) {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates;
          if (!coords || coords.length < 2 || !p.name) continue;
          const label = [p.name, p.city || p.district || p.county, p.state].filter(Boolean).join(" — ");
          out.push({ label, lat: coords[1], lng: coords[0], source: "geo", zoom: 15 });
        }
      }
    } catch { /* photon در دسترس نیست — nominatim امتحان می‌شود */ }
    if (out.length === 0) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=fa&countrycodes=ir&q=${encodeURIComponent(q)}`,
          { signal }
        );
        if (res.ok) {
          const data = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
          for (const d of data) {
            if (!d.lat || !d.lon || !d.display_name) continue;
            const parts = d.display_name.split(",").map((s) => s.trim()).filter(Boolean);
            out.push({ label: parts.slice(0, 3).join(" — "), lat: Number(d.lat), lng: Number(d.lon), source: "geo", zoom: 15 });
          }
        }
      } catch { /* آفلاین — فقط نتایج محلی */ }
    }
    return out;
  }

  useEffect(() => {
    const q = mapQuery.trim();
    if (q.length < 2) {
      setGeoResults([]);
      setGeoSearching(false);
      return;
    }
    setGeoResults(localMatches(q));
    setGeoSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const remote = await remoteGeocode(q, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setGeoResults((prev) => {
          const seen = new Set(prev.map((p) => normalizeFa(p.label)));
          return [...prev, ...remote.filter((r) => !seen.has(normalizeFa(r.label)))].slice(0, 12);
        });
      } catch { /* لغو شد */ }
      finally {
        if (!ctrl.signal.aborted) setGeoSearching(false);
      }
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapQuery]);

  function goToGeoResult(r: GeoResult) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([r.lat, r.lng], r.zoom, { duration: 0.8 });
    // نشانگر نتیجهٔ جستجو
    const L = leafletRef.current;
    if (L) {
      if (geoMarkerRef.current) geoMarkerRef.current.remove();
      geoMarkerRef.current = L.circleMarker([r.lat, r.lng], {
        radius: 10, weight: 3, color: "#ffffff", fillColor: "#f59e0b", fillOpacity: 0.95, dashArray: "1",
        interactive: false, // کلیک از نشانگر عبور کند تا به نقشه برسد
      }).addTo(map);
      geoMarkerRef.current.bindPopup(
        `<div dir="rtl" style="font-family:Vazirmatn,Tahoma;text-align:right"><b>${r.label}</b><br/><span style="font-size:10px;color:#94a3b8">نتیجهٔ جستجو — برای ثبت در فرم، «انتخاب موقعیت روی نقشه» را بزنید</span></div>`
      ).openPopup();
    }
    setMapQuery("");
    setGeoResults([]);
    // اگر در حالت انتخاب موقعیت هستیم، همین نتیجه ثبت می‌شود
    if (pickModeRef.current) {
      setForm((f) => ({ ...f, lat: String(Number(r.lat.toFixed(6))), lng: String(Number(r.lng.toFixed(6))) }));
      setPickMode(false);
      pickModeRef.current = false;
      setFormOpen(true);
      toast.success(`مختصات از جستجو ثبت شد: ${r.label}`);
    }
  }

  // ---------- ذخیره ----------
  async function save() {
    if (!form.name.trim()) { toast.error("نام مرکز الزامی است"); return; }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        region: form.region.trim(),
        province: form.province.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        lat: form.lat === "" ? null : Number(form.lat),
        lng: form.lng === "" ? null : Number(form.lng),
        radiusM: Number(form.radiusM) || 300,
        isActive: form.isActive,
      };
      if (form.id) {
        await api(`/api/admin/centers/${form.id}`, { method: "PATCH", body: payload });
        toast.success("مرکز ویرایش شد");
      } else {
        await api("/api/admin/centers", { method: "POST", body: payload });
        toast.success("مرکز جدید ثبت شد");
      }
      setFormOpen(false);
      setPickMode(false);
      pickModeRef.current = false;
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(c: Center) {
    setForm({
      id: c.id, code: c.code, name: c.name, type: c.type, region: c.region,
      province: c.province, city: c.city, address: c.address, phone: c.phone,
      lat: c.lat === null ? "" : String(c.lat),
      lng: c.lng === null ? "" : String(c.lng),
      radiusM: String(c.radiusM), isActive: c.isActive,
    });
    setFormOpen(true);
    setPickMode(false);
    pickModeRef.current = false;
  }

  async function syncFromTechno() {
    setSyncing(true);
    try {
      const r = await api<{ total: number; created: number; updated: number }>(
        "/api/admin/centers/sync", { method: "POST", body: {} }
      );
      toast.success(`همگام‌سازی انجام شد: ${faNum(r.created)} ایجاد، ${faNum(r.updated)} بروزرسانی از ${faNum(r.total)} مرکز`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function toggleActive(c: Center) {
    try {
      await api(`/api/admin/centers/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } });
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/admin/centers/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`مرکز «${deleteTarget.name}» حذف شد`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
      setDeleteTarget(null);
    }
  }

  // گزینه‌های استان/شهر فرم — مقدار فعلی همیشه در فهرست است (حتی اگر خارج فهرست استاندارد باشد)
  // توجه: همهٔ هوک‌ها باید قبل از هر return شرطی بیایند
  const provinceOptions = useMemo(() => {
    const opts = IR_PROVINCES.map((p) => ({ value: p, label: p }));
    if (form.province && !IR_PROVINCES.some((p) => p === form.province)) {
      opts.unshift({ value: form.province, label: form.province });
    }
    return opts;
  }, [form.province]);

  const cityOptions = useMemo(() => {
    const pool = form.province
      ? IR_CITIES.filter((c) => normalizeFa(c.province) === normalizeFa(form.province))
      : IR_CITIES;
    const opts = pool.map((c) => ({ value: c.city, label: c.city, hint: form.province ? undefined : c.province }));
    if (form.city && !pool.some((c) => c.city === form.city)) {
      opts.unshift({ value: form.city, label: form.city });
    }
    return opts;
  }, [form.province, form.city]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-[520px] rounded-2xl" />
      </div>
    );
  }

  const withGeo = centers.filter((c) => c.lat !== null && c.lng !== null).length;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <MapPin className="size-6 text-primary" />
            مراکز و کلینیک‌ها (اطلاعات پایه)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ثبت مراکز و کلینیک‌ها با موقعیت روی نقشه — همگام‌سازی از سامانهٔ حضور و غیاب — استفاده در فرم کاربران و انتقال به سامانه‌ها
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={syncFromTechno} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            همگام‌سازی از حضور و غیاب
          </Button>
          <Button onClick={() => { setForm({ ...emptyForm }); setFormOpen(true); setPickMode(false); pickModeRef.current = false; }} className="gap-2">
            <Plus className="size-4" /> مرکز جدید
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="جستجوی نام، کد، استان، کمیته امداد…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 w-52" />
        </div>
        <Select dir="rtl" value={fType} onValueChange={setFType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همهٔ انواع</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchableSelect
          value={fProvince === "all" ? "all" : fProvince}
          onChange={(v) => changeProvinceFilter(v === "all" ? "all" : v)}
          options={provinces.map((p) => ({ value: p, label: p }))}
          noneLabel="همهٔ استان‌ها"
          placeholder="انتخاب استان"
          className="w-44"
        />
        <span className="text-xs text-muted-foreground ms-auto">
          {faNum(filtered.length)} رکورد از {faNum(centers.length)} — دارای مختصات نقشه: {faNum(withGeo)}
        </span>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* فهرست مراکز */}
        <Card className="lg:col-span-2">
          <CardContent className="p-2 max-h-[560px] overflow-y-auto space-y-1.5">
            {filtered.map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border p-2.5 hover:bg-muted/40 transition-colors cursor-pointer ${c.isActive ? "" : "opacity-60"}`}
                onClick={() => c.lat !== null && c.lng !== null && setFocusId(c.id)}
              >
                <div className="flex items-center gap-2">
                  {c.type === "HQ" ? (
                    <Landmark className="size-4 text-purple-700 shrink-0" />
                  ) : c.type === "CENTER" ? (
                    <Building2 className="size-4 text-sky-700 shrink-0" />
                  ) : c.type === "EMDAD" ? (
                    <HeartHandshake className="size-4 text-amber-600 shrink-0" />
                  ) : (
                    <Hospital className="size-4 text-primary shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.province || "بدون استان"} · کد {c.code} · شعاع {faNum(c.radiusM)} متر
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {c.lat !== null && (
                      <Button variant="ghost" size="icon" className="size-7" title="نمایش روی نقشه"
                        onClick={() => setFocusId(c.id)}>
                        <Crosshair className="size-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="size-7" title="ویرایش" onClick={() => openEdit(c)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" title={c.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
                      onClick={() => toggleActive(c)}>
                      <Ban className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive" title="حذف"
                      onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-10">
                مرکزی یافت نشد — با «همگام‌سازی از حضور و غیاب» یا «مرکز جدید» شروع کنید.
              </p>
            )}
          </CardContent>
        </Card>

        {/* نقشه */}
        <Card className="lg:col-span-3 overflow-hidden">
          <CardContent className="p-0 relative">
            <div ref={mapDivRef} className="h-[560px] w-full z-0" />

            {/* جستجوی نقشه — شهر، آدرس، کمیته امداد */}
            <div className="absolute top-3 right-3 z-[500] w-[calc(100%-1.5rem)] sm:w-80">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
                <Input
                  dir="rtl"
                  value={mapQuery}
                  onChange={(e) => setMapQuery(e.target.value)}
                  placeholder="جستجوی شهر، آدرس یا کمیته امداد…"
                  className="pr-9 pl-9 bg-card/95 shadow-md border"
                />
                {geoSearching && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />}
              </div>
              {geoResults.length > 0 && (
                <div className="mt-1 rounded-xl border bg-card shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                  {geoResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-right px-3 py-2 text-xs hover:bg-muted/60 flex items-center gap-2 border-b last:border-b-0"
                      onClick={() => goToGeoResult(r)}
                    >
                      <MapPin className="size-3.5 text-primary shrink-0" />
                      <span className="truncate">{r.label}</span>
                      <span className="ms-auto text-[10px] text-muted-foreground shrink-0">
                        {r.source === "city" ? "شهر" : "دقیق"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* سوییچ سرویس نقشه */}
            <Button
              size="sm" variant="outline"
              className="absolute top-3 left-3 z-[500] gap-1.5 h-9 bg-card/95 shadow-md"
              onClick={() => applyProvider((providerIdx + 1) % TILE_PROVIDERS.length)}
              title="تعویض سرویس نقشه (در صورت لود نشدن تایل‌ها)"
            >
              <Layers className="size-3.5" />
              {TILE_PROVIDERS[providerIdx]?.label}
            </Button>

            {pickMode && (
              <div className="absolute top-14 left-3 right-3 z-[500] rounded-xl bg-primary text-white text-xs font-semibold px-4 py-2.5 shadow-lg flex items-center gap-2">
                <LocationEdit className="size-4 shrink-0" />
                روی نقشه کلیک کنید یا از جستجوی بالا مقصد را انتخاب کنید — فرم بسته شده و بعد از ثبت مختصات برمی‌گردد
                <Button size="sm" variant="secondary" className="ms-auto h-7 text-xs shrink-0"
                  onClick={() => { setPickMode(false); pickModeRef.current = false; setFormOpen(true); }}>
                  بازگشت به فرم
                </Button>
              </div>
            )}
            <div className="absolute bottom-3 right-3 z-[500] bg-card/95 border rounded-xl px-3 py-2 shadow-md flex flex-col gap-1 text-[11px]">
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full inline-block" style={{ backgroundColor: TYPE_COLORS[k] }} />
                  {v}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* فرم مرکز */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) { setFormOpen(false); setPickMode(false); pickModeRef.current = false; } }}>
        <DialogContent className="sm:max-w-xl max-h-[88vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش مرکز" : "ثبت مرکز جدید"}</DialogTitle>
            <DialogDescription>
              مشخصات پایهٔ مرکز/کلینیک — مختصات نقشه در انتقال به سامانه‌ها و نمایش نقشهٔ مراکز استفاده می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>نام مرکز *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً کلینیک رز تهران" />
              </div>
              <div className="space-y-1.5">
                <Label>نوع</Label>
                <Select dir="rtl" value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>کد مرکز</Label>
                <Input dir="ltr" className="text-left" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="خالی = تولید خودکار" />
              </div>
              <div className="space-y-1.5">
                <Label>منطقه / حوزه</Label>
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>استان</Label>
                <SearchableSelect
                  value={form.province}
                  onChange={(v) => { setForm((f) => ({ ...f, province: v, city: "" })); if (v) flyToCity(v, 11); }}
                  options={provinceOptions}
                  noneLabel="— انتخاب نشده —"
                  placeholder="انتخاب استان"
                />
              </div>
              <div className="space-y-1.5">
                <Label>شهر</Label>
                <SearchableSelect
                  value={form.city}
                  onChange={(v) => { setForm((f) => ({ ...f, city: v })); if (v) flyToCity(v, 12); }}
                  options={cityOptions}
                  noneLabel="— انتخاب نشده —"
                  placeholder="انتخاب شهر — نقشه به آن شهر می‌رود"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>آدرس</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>تلفن</Label>
                <Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>شعاع مجاز تردد (متر)</Label>
                <Input dir="ltr" className="text-left" inputMode="numeric" value={form.radiusM}
                  onChange={(e) => setForm({ ...form, radiusM: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>عرض جغرافیایی (lat)</Label>
                <Input dir="ltr" className="text-left" inputMode="decimal" value={form.lat}
                  onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="35.6892" />
              </div>
              <div className="space-y-1.5">
                <Label>طول جغرافیایی (lng)</Label>
                <Input dir="ltr" className="text-left" inputMode="decimal" value={form.lng}
                  onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="51.3890" />
              </div>
            </div>
            <Button variant="outline" className="w-full gap-2"
              onClick={() => { setPickMode(true); pickModeRef.current = true; setFormOpen(false); }}>
              <Crosshair className="size-4" />
              انتخاب موقعیت روی نقشه (فرم بسته می‌شود — با کلیک روی نقشه مختصات ثبت و فرم برمی‌گردد)
            </Button>
            {form.lat !== "" && form.lng !== "" && (
              <p className="text-[11px] text-muted-foreground text-center" dir="ltr">
                {Number(form.lat).toFixed(5)} , {Number(form.lng).toFixed(5)}
              </p>
            )}
            <div className="flex items-center justify-between rounded-xl border px-3 py-2">
              <Label>مرکز فعال</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : form.id ? "ذخیرهٔ تغییرات" : "ثبت مرکز"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مرکز؟</AlertDialogTitle>
            <AlertDialogDescription>
              مرکز «{deleteTarget?.name}» حذف می‌شود. اگر کاربرانی به آن متصل باشند، حذف انجام نمی‌شود
              و باید ابتدا اتصال آن‌ها را تغییر دهید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doDelete(); }}
              className="bg-destructive text-white hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
