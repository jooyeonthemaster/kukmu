"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl } from "react-leaflet";
import type { Map as LeafletMap, Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import type L from "leaflet";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { useElection } from "@/lib/election-context";
import { PROVINCE_CODE_MAP } from "@/lib/election-data";
import { PARTIES, type Province, type District } from "@/lib/election-types";

/** Map our DB province codes (e.g. "seoul") to GeoJSON numeric codes (e.g. "11") */
const DB_CODE_TO_GEO: Record<string, string> = {
  seoul: "11", busan: "21", daegu: "22", incheon: "23",
  gwangju: "24", daejeon: "25", ulsan: "26", sejong: "29",
  gyeonggi: "31", gangwon: "32", chungbuk: "33", chungnam: "34",
  jeonbuk: "35", jeonnam: "36", gyeongbuk: "37", gyeongnam: "38",
  jeju: "39",
};

const PROVINCE_GEOJSON_URLS = [
  "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-geo.json",
  "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/gadm/json/skorea-provinces-geo.json",
];
const MUNICIPALITY_TOPO_URL =
  "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json";

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';
const KOREA_CENTER: [number, number] = [36.0, 127.8];
const DEFAULT_ZOOM = 7;

interface Props {
  onProvinceSelect: (province: Province | null) => void;
  onDistrictSelect: (district: District | null) => void;
  selectedProvince: Province | null;
  selectedDistrict: District | null;
}

// Cache municipality GeoJSON globally so it's only fetched once
let municipalityCache: GeoJSON.FeatureCollection | null = null;

export default function KoreaMap({ onProvinceSelect, onDistrictSelect, selectedProvince, selectedDistrict }: Props) {
  const { provinces, getDistrictsByProvince } = useElection();

  const [provinceGeo, setProvinceGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [districtGeo, setDistrictGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const provinceGeoRef = useRef<L.GeoJSON | null>(null);
  const districtGeoRef = useRef<L.GeoJSON | null>(null);
  const selectedProvinceRef = useRef(selectedProvince);
  const selectedDistrictRef = useRef(selectedDistrict);
  const provincesRef = useRef(provinces);
  selectedProvinceRef.current = selectedProvince;
  selectedDistrictRef.current = selectedDistrict;
  provincesRef.current = provinces;

  // Helper: find Province from GeoJSON feature
  const getProvinceFromFeature = useCallback((feature: GeoJSON.Feature): Province | undefined => {
    const props = feature.properties || {};
    const name = props.name || props.NAME_1 || props.NL_NAME_1 || props.CTP_KOR_NM || "";
    const code = props.code || PROVINCE_CODE_MAP[name];
    if (code) {
      const found = provincesRef.current.find(p => p.code === String(code));
      if (found) return found;
    }
    return provincesRef.current.find(p => {
      const base = p.name.replace(/특별시|광역시|특별자치시|특별자치도|도/g, "");
      return name.includes(base) && base.length > 0;
    });
  }, []);

  // Load Leaflet CSS dynamically
  useEffect(() => {
    if (document.querySelector('link[data-leaflet-css]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.setAttribute("data-leaflet-css", "true");
    document.head.appendChild(link);
  }, []);

  // Load province GeoJSON
  useEffect(() => {
    async function load() {
      for (const url of PROVINCE_GEOJSON_URLS) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          setProvinceGeo(await res.json());
          setLoading(false);
          return;
        } catch { continue; }
      }
      setError("지도 데이터를 불러올 수 없습니다.");
      setLoading(false);
    }
    load();
  }, []);

  // Load municipality TopoJSON (once) and cache
  useEffect(() => {
    if (municipalityCache) return;
    fetch(MUNICIPALITY_TOPO_URL)
      .then(r => r.json())
      .then((topo: Topology) => {
        const objKey = Object.keys(topo.objects)[0];
        const geo = topojson.feature(topo, topo.objects[objKey] as GeometryCollection) as GeoJSON.FeatureCollection;
        municipalityCache = geo;
      })
      .catch(() => { /* municipality data not critical */ });
  }, []);

  // Auto-zoom when selectedProvince changes
  useEffect(() => {
    if (!mapRef.current || !provinceGeo) return;
    if (!selectedProvince) {
      mapRef.current.setView(KOREA_CENTER, DEFAULT_ZOOM, { animate: true });
      return;
    }
    const feature = provinceGeo.features.find(f => {
      const p = getProvinceFromFeature(f);
      return p?.code === selectedProvince.code;
    });
    if (feature) {
      const L = require("leaflet");
      const layer = L.geoJSON(feature);
      mapRef.current.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 11, animate: true });
    }
  }, [selectedProvince, provinceGeo, getProvinceFromFeature]);

  // When province selected, filter municipality features
  useEffect(() => {
    if (!selectedProvince) {
      setDistrictGeo(null);
      return;
    }
    if (!municipalityCache) {
      fetch(MUNICIPALITY_TOPO_URL)
        .then(r => r.json())
        .then((topo: Topology) => {
          const objKey = Object.keys(topo.objects)[0];
          municipalityCache = topojson.feature(topo, topo.objects[objKey] as GeometryCollection) as GeoJSON.FeatureCollection;
          filterDistricts(selectedProvince.code);
        })
        .catch(() => {});
      return;
    }
    filterDistricts(selectedProvince.code);
  }, [selectedProvince]);

  function filterDistricts(provinceCode: string) {
    if (!municipalityCache) return;
    // Convert DB code ("seoul") to GeoJSON numeric code ("11")
    const geoCode = DB_CODE_TO_GEO[provinceCode] || provinceCode;
    const filtered: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: municipalityCache.features.filter(f => {
        const code = f.properties?.code || "";
        return String(code).startsWith(geoCode);
      }),
    };
    setDistrictGeo(filtered);
  }

  // Province layer styling
  const styleProvince = useCallback((feature?: GeoJSON.Feature): PathOptions => {
    if (!feature) return {};
    const province = getProvinceFromFeature(feature);
    const isSelected = selectedProvinceRef.current && province?.code === selectedProvinceRef.current.code;
    const party = province ? PARTIES[province.leadingParty] : null;
    const inDrillDown = !!selectedProvinceRef.current;
    return {
      fillColor: party?.color || "#333",
      weight: isSelected ? 3 : 1.2,
      opacity: 1,
      color: isSelected ? "#00ffd0" : "rgba(200,220,255,0.25)",
      fillOpacity: inDrillDown ? (isSelected ? 0.08 : 0.05) : 0.22,
      dashArray: isSelected ? "" : "2 4",
    };
  }, [getProvinceFromFeature]);

  const onEachProvince = useCallback((feature: GeoJSON.Feature, layer: Layer) => {
    const province = getProvinceFromFeature(feature);
    if (!province) return;

    const shortName = province.name.replace(/광역시|특별자치시|특별자치도|도|특별시/g, '');
    const labelHtml = `<div style="font-size:11px;font-weight:800;text-shadow:1px 1px 3px #000, -1px -1px 3px #000, 0 0 5px rgba(0,0,0,0.8);color:rgba(255,255,255,0.95); pointer-events:none;">${shortName}</div>`;

    const latestPoll = province.polls[0];
    const sorted = latestPoll ? [...latestPoll.results].sort((a, b) => b.percentage - a.percentage) : [];
    const pollHtml = sorted.slice(0, 3).map(r =>
      `<div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;"><span style="color:${PARTIES[r.party].color}">${r.candidateName}(${PARTIES[r.party].name})</span><span>${r.percentage}%</span></div>`
    ).join("");
    const hoverHtml = `
      <div class="election-tooltip" style="min-width:180px; transform:translateY(-10px); pointer-events:none;">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px;">${province.name}</div>
        <div style="font-size:11px;color:${PARTIES[province.leadingParty].color};margin-bottom:6px;font-weight:600;">${PARTIES[province.leadingParty].name} 우세</div>
        ${pollHtml}
        ${latestPoll ? `<div style="font-size:10px;color:#888;margin-top:4px;">${latestPoll.source} ${latestPoll.date}</div>` : ""}
      </div>
    `;

    layer.bindTooltip(labelHtml, { permanent: true, direction: "center", className: "district-name-tooltip" });

    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        e.target.setStyle({ fillOpacity: 0.5, weight: 2.5, color: "rgba(200,220,255,0.5)" });
        e.target.bringToFront();
        if (window.innerWidth > 768) {
          e.target.setTooltipContent(hoverHtml);
          const el = e.target.getTooltip()?.getElement();
          if (el) el.style.zIndex = "1000";
        }
      },
      mouseout: (e: LeafletMouseEvent) => {
        if (provinceGeoRef.current) provinceGeoRef.current.resetStyle(e.target);
        if (window.innerWidth > 768 && !selectedProvinceRef.current) {
          e.target.setTooltipContent(labelHtml);
        }
      },
      click: (e: LeafletMouseEvent) => {
        onDistrictSelect(null);
        onProvinceSelect(province);
        e.target.setTooltipContent(labelHtml);
        if (mapRef.current && feature.geometry.type !== "Point") {
          const bounds = (layer as L.Polygon).getBounds();
          mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 });
        }
      },
    });
  }, [onProvinceSelect, onDistrictSelect, getProvinceFromFeature]);

  // Helper: match district by name (GeoJSON uses numeric codes, DB uses "seoul-gangnam")
  const findDistrictByFeature = useCallback((feature: GeoJSON.Feature) => {
    const provCode = selectedProvinceRef.current?.code || "";
    const districtList = getDistrictsByProvince(provCode);
    const featureName = feature.properties?.name || feature.properties?.NAME_2 || "";
    return districtList.find(d => featureName.includes(d.name.replace(/시$|구$|군$/, "")) || d.name.includes(featureName.replace(/시$|구$|군$/, "")));
  }, [getDistrictsByProvince]);

  // District layer styling
  const styleDistrict = useCallback((feature?: GeoJSON.Feature): PathOptions => {
    if (!feature) return {};
    const districtData = findDistrictByFeature(feature);
    const isSelected = districtData && selectedDistrictRef.current?.code === districtData.code;
    const party = districtData ? PARTIES[districtData.leadingParty] : null;
    return {
      fillColor: party?.color || "#555",
      weight: isSelected ? 3 : 1.5,
      opacity: 1,
      color: isSelected ? "#00ffd0" : "rgba(255,255,255,0.35)",
      fillOpacity: isSelected ? 0.6 : 0.35,
      dashArray: "",
    };
  }, [findDistrictByFeature]);

  const onEachDistrict = useCallback((feature: GeoJSON.Feature, layer: Layer) => {
    const name = feature.properties?.name || "";
    const districtData = findDistrictByFeature(feature);

    const shortName = name.replace(/시$|구$|군$/, '');
    const labelHtml = `<div style="font-size:10px;font-weight:700;text-shadow:1px 1px 2px #000, -1px -1px 2px #000, 0 0 4px rgba(0,0,0,0.9);color:rgba(255,255,255,0.9); pointer-events:none;">${shortName}</div>`;

    let hoverHtml = "";
    if (districtData && districtData.candidates.length >= 2) {
      const c1 = districtData.candidates[0];
      const c2 = districtData.candidates[1];
      hoverHtml = `
        <div class="election-tooltip" style="min-width:160px; transform:translateY(-10px); pointer-events:none;">
          <div style="font-size:13px;font-weight:700;margin-bottom:3px;">${name}</div>
          <div style="font-size:11px;color:${PARTIES[districtData.leadingParty].color};margin-bottom:5px;font-weight:600;">${PARTIES[districtData.leadingParty].name} 우세</div>
          <div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:${PARTIES[c1.party].color}">${c1.name}</span><span>${c1.percentage > 0 ? c1.percentage + "%" : PARTIES[c1.party].name}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:${PARTIES[c2.party].color}">${c2.name}</span><span>${c2.percentage > 0 ? c2.percentage + "%" : PARTIES[c2.party].name}</span></div>
          <div style="font-size:10px;color:#666;margin-top:4px;">인구 ${(districtData.population / 10000).toFixed(1)}만</div>
        </div>
      `;
    } else if (districtData && districtData.candidates.length === 1) {
      const c1 = districtData.candidates[0];
      hoverHtml = `
        <div class="election-tooltip" style="min-width:160px; transform:translateY(-10px); pointer-events:none;">
          <div style="font-size:13px;font-weight:700;margin-bottom:3px;">${name}</div>
          <div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:${PARTIES[c1.party].color}">${c1.name}</span><span>${PARTIES[c1.party].name}</span></div>
          <div style="font-size:10px;color:#666;margin-top:4px;">인구 ${(districtData.population / 10000).toFixed(1)}만</div>
        </div>
      `;
    } else {
      hoverHtml = `<div class="election-tooltip" style="transform:translateY(-10px); pointer-events:none;"><div style="font-size:13px;font-weight:700;">${name}</div><div style="font-size:10px;color:#888;">데이터 준비 중</div></div>`;
    }

    layer.bindTooltip(labelHtml, { permanent: true, direction: "center", className: "district-name-tooltip" });

    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        e.target.setStyle({ fillOpacity: 0.6, weight: 2.5, color: "rgba(255,255,255,0.6)" });
        e.target.bringToFront();
        if (window.innerWidth > 768) {
          e.target.setTooltipContent(hoverHtml);
          const el = e.target.getTooltip()?.getElement();
          if (el) el.style.zIndex = "1000";
        }
      },
      mouseout: (e: LeafletMouseEvent) => {
        if (districtGeoRef.current) districtGeoRef.current.resetStyle(e.target);
        if (window.innerWidth > 768) {
          e.target.setTooltipContent(labelHtml);
        }
      },
      click: (e: LeafletMouseEvent) => {
        if (districtData) {
          onDistrictSelect(districtData);
        }
        e.target.setTooltipContent(labelHtml);
        if (mapRef.current && feature.geometry.type !== "Point") {
          const bounds = (layer as L.Polygon).getBounds();
          mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
        }
      },
    });
  }, [onDistrictSelect, findDistrictByFeature]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0e1a]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
          <span className="text-sm text-cyan-400/60">지도 데이터 로딩 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0e1a]">
        <div className="text-center">
          <div className="text-sm text-red-400 mb-2">{error}</div>
          <button onClick={() => window.location.reload()} className="text-xs text-cyan-400 hover:text-cyan-300 underline">새로고침</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={KOREA_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        zoomControl={false}
        style={{ background: "#0a0e1a" }}
        ref={mapRef}
        minZoom={6}
        maxZoom={14}
        attributionControl={false}
      >
        <TileLayer url={DARK_TILES} attribution={TILE_ATTR} />
        <ZoomControl position="bottomleft" />

        {/* Province boundaries (always rendered) */}
        {provinceGeo && (
          <GeoJSON
            key={`prov-${selectedProvince?.code || "none"}-${provinces.length}`}
            data={provinceGeo}
            style={styleProvince}
            onEachFeature={onEachProvince}
            ref={(r) => { provinceGeoRef.current = r as unknown as L.GeoJSON; }}
          />
        )}

        {/* District boundaries (rendered when province selected) */}
        {districtGeo && selectedProvince && (
          <GeoJSON
            key={`dist-${selectedProvince.code}-${selectedDistrict?.code || "none"}-${getDistrictsByProvince(selectedProvince.code).length}`}
            data={districtGeo}
            style={styleDistrict}
            onEachFeature={onEachDistrict}
            ref={(r) => { districtGeoRef.current = r as unknown as L.GeoJSON; }}
          />
        )}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-[1000] rounded-lg bg-[#0d1220]/90 backdrop-blur border border-white/10 p-2 md:p-3 shadow-xl pointer-events-none">
        <div className="hidden md:block text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">정당별 우세 지역</div>
        <div className="flex flex-col gap-1 md:gap-1.5">
          {(["ppp", "dp", "rkp"] as const).map(id => (
            <div key={id} className="flex items-center gap-1 md:gap-2">
              <div className="h-2 w-2 md:h-3 md:w-3 rounded-sm shrink-0" style={{ background: PARTIES[id].color, opacity: 0.7 }} />
              <span className="text-[9px] md:text-[11px] text-white/70">{PARTIES[id].name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drill-down level indicator & back buttons */}
      {selectedProvince && (
        <div className="absolute top-10 md:top-4 left-2 md:left-4 z-[1000] flex flex-col md:flex-col gap-1.5 md:gap-2 shadow-lg">
          <button
            onClick={() => {
              onDistrictSelect(null);
              onProvinceSelect(null);
              mapRef.current?.setView(KOREA_CENTER, DEFAULT_ZOOM, { animate: true });
            }}
            className="flex items-center gap-1.5 rounded-md bg-[#0d1220]/90 backdrop-blur border border-white/10 px-2 py-1.5 md:px-3 md:py-1.5 text-[10px] md:text-xs text-cyan-400 hover:bg-[#151c30] transition"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="md:w-[14px] md:h-[14px]"><path d="M3 12h18M3 12l6-6M3 12l6 6" /></svg>
            <span className="hidden md:inline">전체 지도 보기</span>
            <span className="md:hidden">전체</span>
          </button>
          {selectedDistrict && (
            <button
              onClick={() => {
                onDistrictSelect(null);
                if (mapRef.current && provinceGeo) {
                  const provFeature = provinceGeo.features.find(f => {
                    const p = getProvinceFromFeature(f);
                    return p?.code === selectedProvince.code;
                  });
                  if (provFeature && provFeature.geometry.type !== "Point") {
                    const L = require("leaflet");
                    const layer = L.geoJSON(provFeature);
                    mapRef.current.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 11 });
                  }
                }
              }}
              className="flex items-center gap-1.5 rounded-md bg-[#0d1220]/90 backdrop-blur border border-cyan-500/20 px-2 py-1.5 md:px-3 md:py-1.5 text-[10px] md:text-xs text-cyan-300 hover:bg-[#151c30] transition"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="md:w-[14px] md:h-[14px]"><path d="M3 12h18M3 12l6-6M3 12l6 6" /></svg>
              {selectedProvince.name} 전체
            </button>
          )}
        </div>
      )}

      {/* Drill-down breadcrumb */}
      {selectedProvince && (
        <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 rounded-md bg-[#0d1220]/90 backdrop-blur border border-white/10 px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-[11px] shadow-lg">
          <span className="text-white/30 truncate max-w-[40px] md:max-w-none">전국</span>
          <span className="text-white/20">&rsaquo;</span>
          <span className={selectedDistrict ? "text-white/50 cursor-pointer hover:text-white/70 truncate max-w-[60px] md:max-w-none" : "text-cyan-400 font-medium truncate"}
            onClick={() => { if (selectedDistrict) onDistrictSelect(null); }}>
            {selectedProvince.name}
          </span>
          {selectedDistrict && (
            <>
              <span className="text-white/20">&rsaquo;</span>
              <span className="text-cyan-400 font-medium truncate max-w-[80px] md:max-w-none">{selectedDistrict.name}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
