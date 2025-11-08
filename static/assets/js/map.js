// static/assets/js/map.js
document.addEventListener("DOMContentLoaded", () => {
  // ===== Map base =====
  const map = L.map("map").setView([21.0285, 105.8542], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
  }).addTo(map);

  // ===== UI refs =====
  const wpListEl  = document.getElementById("wpList");
  const statsEl   = document.getElementById("stats");
  const btnSearch = document.getElementById("searchBtn");
  const btnOpt    = document.getElementById("optBtn");
  const btnUndo   = document.getElementById("undoBtn");
  const btnClear  = document.getElementById("clearBtn");
  const addrIn    = document.getElementById("addressInput");

  // ===== State =====
  const LS_KEY = "route_waypoints_v1";
  let WAYPOINTS = [];                 // [{lat,lng,label}]
  let ROUTE_LAYER = null;             // L.Polyline
  let WP_MARKERS_LAYER = L.layerGroup().addTo(map);
  let RUN_ID = 0;                     // debounce id
  let LAST_ROUTE_RUN = 0;             // run id của layer đang hiển thị

  // ===== Utils =====
  const fmtKm  = m => (m/1000).toFixed(1);
  const fmtMin = s => Math.round(s/60);
  const persist = () => localStorage.setItem(LS_KEY, JSON.stringify(WAYPOINTS));

  function renderWpList(){
    wpListEl.innerHTML =
      WAYPOINTS.map(p=>`<li>${p.label || (p.lat.toFixed(5)+", "+p.lng.toFixed(5))}</li>`).join("")
      || "<i>Chưa có điểm</i>";
  }

  function encodeHash(){
    const s = WAYPOINTS.map(p=>`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|");
    location.hash = s ? `#${s}` : "";
  }

  function addWaypoint(lat, lng, label){
    WAYPOINTS.push({lat, lng, label});
    const idx = WAYPOINTS.length;
    L.marker([lat, lng], { title: label || `WP ${idx}` }).addTo(WP_MARKERS_LAYER);
    const tt = L.tooltip({ permanent:true, direction:"center", className:"badge" })
      .setContent(String(idx)).setLatLng([lat,lng]).addTo(WP_MARKERS_LAYER);

    // Alt+click vào badge để xóa điểm đó
    tt.getElement().addEventListener("click", e => {
      if(!e.altKey) return;
      const i = WAYPOINTS.findIndex(p=>p.lat===lat && p.lng===lng);
      if(i>=0){
        WAYPOINTS.splice(i,1);
        redrawWpMarkers();
        renderWpList();
        persist();
        encodeHash();
      }
    });

    renderWpList();
    persist();
    encodeHash();
  }

  function redrawWpMarkers(){
    WP_MARKERS_LAYER.clearLayers();
    WAYPOINTS.forEach((p,i)=>{
      L.marker([p.lat,p.lng]).addTo(WP_MARKERS_LAYER);
      L.tooltip({ permanent:true, direction:"center", className:"badge" })
        .setContent(String(i+1)).setLatLng([p.lat,p.lng]).addTo(WP_MARKERS_LAYER);
    });
  }

  function clearRoute(){
    if (ROUTE_LAYER) { map.removeLayer(ROUTE_LAYER); ROUTE_LAYER = null; }
    WP_MARKERS_LAYER.clearLayers();
    WAYPOINTS = [];
    renderWpList();
    statsEl.textContent = "";
    persist();
    encodeHash();
  }

  function undoWaypoint(){
    if (!WAYPOINTS.length) return;
    WAYPOINTS.pop();
    redrawWpMarkers();
    renderWpList();
    persist();
    encodeHash();
  }

  // ===== Markers từ đơn hàng (click -> thêm waypoint) =====
  fetch("/orders/api/orders/?format=json", { credentials: "same-origin" })
    .then(r => r.json())
    .then(data => {
      const bounds = L.latLngBounds();
      data.forEach(o => {
        const lat = o.lat || o.latitude;
        const lng = o.lng || o.longitude;
        if (!lat || !lng) return;
        const m = L.marker([lat,lng]).addTo(map)
          .bindPopup(
            `<div class="popup-title">${o.customer_name||""}</div>
             <div><b>Mã:</b> ${o.code||""}</div>
             <div><b>Trạng thái:</b> ${o.status||""}</div>
             <div><b>COD:</b> ${Number(o.cod||0).toLocaleString("vi-VN")} ₫</div>
             <hr style="margin:6px 0"/>
             <button id="add-${o.id}" style="padding:6px 10px;border:0;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer">Thêm làm điểm dừng</button>`
          );
        m.on("popupopen", () => {
          const btn = document.getElementById(`add-${o.id}`);
          if (btn) btn.onclick = () => {
            addWaypoint(lat, lng, `${o.customer_name||""} (${o.code||""})`);
            map.closePopup();
          };
        });
        bounds.extend([lat,lng]);
      });
      if (bounds.isValid()) map.fitBounds(bounds, { padding:[40,40] });
    })
    .catch(()=>{});

  // ===== Search địa chỉ (Nominatim) =====
  btnSearch?.addEventListener("click", () => {
    const q = (addrIn?.value || "").trim();
    if (!q) return alert("Nhập địa chỉ trước");
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(res => {
        if (!res.length) return alert("Không tìm thấy địa chỉ");
        const { lat, lon, display_name } = res[0];
        addWaypoint(parseFloat(lat), parseFloat(lon), display_name);
        map.setView([lat,lon], 15);
      })
      .catch(()=>alert("Lỗi tìm địa chỉ"));
  });
  addrIn?.addEventListener("keydown", e=>{
    if(e.key==="Enter"){ e.preventDefault(); btnSearch.click(); }
  });

  // ===== Ctrl+click thêm điểm tự do =====
  map.on("click", e => {
    if (!e.originalEvent.ctrlKey) return;
    addWaypoint(e.latlng.lat, e.latlng.lng, `WP`);
  });

  // ===== Nút vị trí hiện tại =====
  const locBtn = L.control({position:"topleft"});
  locBtn.onAdd = () => {
    const b = L.DomUtil.create("button","leaflet-bar");
    b.title="Vị trí của tôi"; b.style.padding="6px 10px"; b.textContent="📍";
    b.onclick = () => {
      if(!navigator.geolocation) return alert("Trình duyệt không hỗ trợ GPS");
      navigator.geolocation.getCurrentPosition(pos=>{
        const {latitude,longitude} = pos.coords;
        addWaypoint(latitude, longitude, "Vị trí của tôi");
        map.setView([latitude,longitude], 15);
      },()=>alert("Không lấy được vị trí"));
    };
    return b;
  };
  locBtn.addTo(map);

  // ===== Undo / Clear =====
  btnUndo?.addEventListener("click", undoWaypoint);
  btnClear?.addEventListener("click", clearRoute);

  // ===== Khôi phục từ localStorage =====
  (function restoreLS(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return;
      const arr = JSON.parse(raw);
      arr.forEach(p=>addWaypoint(p.lat,p.lng,p.label));
      if(arr.length) map.fitBounds(arr.map(p=>[p.lat,p.lng]),{padding:[40,40]});
    }catch{}
  })();

  // ===== Khôi phục từ URL hash =====
  function restoreFromHash(){
    const h = (location.hash||"").replace(/^#/, "");
    if(!h) return;
    clearRoute();
    h.split("|").forEach(pair=>{
      const [la,lo]=pair.split(",").map(Number);
      if(Number.isFinite(la)&&Number.isFinite(lo)) addWaypoint(la,lo,"WP");
    });
    if(WAYPOINTS.length) map.fitBounds(WAYPOINTS.map(p=>[p.lat,p.lng]),{padding:[40,40]});
  }
  window.addEventListener("hashchange", restoreFromHash);
  restoreFromHash();

  // ===== OSRM helpers (fallback) =====
  const OSRM_HOSTS = [
    "https://router.project-osrm.org",
    "https://routing.openstreetmap.de",
    "https://osrm.kk.my.id"
  ];

  async function fetchJson(url, {timeout=8000, retries=2} = {}){
    for(let i=0;i<=retries;i++){
      const c = new AbortController();
      const t = setTimeout(()=>c.abort(), timeout);
      try{
        const r = await fetch(url, {signal:c.signal});
        clearTimeout(t);
        if(r.ok) return await r.json();
      }catch{}
    }
    throw new Error("fetch-fail");
  }

  function greedyOrder(points){
    const n = points.length;
    const remain = [...Array(n).keys()];
    const order = [0];
    remain.splice(0,1);
    function d(i,j){
      const [la1,lo1] = [points[i].lat, points[i].lng];
      const [la2,lo2] = [points[j].lat, points[j].lng];
      const R=6371e3, toRad=x=>x*Math.PI/180;
      const dphi=toRad(la2-la1), dl=toRad(lo2-lo1);
      const a=Math.sin(dphi/2)**2 + Math.cos(toRad(la1))*Math.cos(toRad(la2))*Math.sin(dl/2)**2;
      return 2*R*Math.asin(Math.sqrt(a));
    }
    let cur = 0;
    while(remain.length){
      let bestIdx = remain[0], bestD = d(cur, bestIdx), bestPos = 0;
      for(let k=1;k<remain.length;k++){
        const id = remain[k];
        const dist = d(cur,id);
        if(dist < bestD){ bestPos=k; bestIdx=id; bestD=dist; }
      }
      order.push(bestIdx);
      cur = bestIdx;
      remain.splice(bestPos,1);
    }
    return order;
  }

  async function routeChain(host, seq){
    let totalDist=0, totalDur=0, allCoords=[];
    for(let i=0;i<seq.length-1;i++){
      const a = seq[i], b = seq[i+1];
      const url = `${host}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
      const j = await fetchJson(url);
      if(j.code!=="Ok" || !j.routes?.length) throw new Error("route-fail");
      const r = j.routes[0];
      totalDist += r.distance; totalDur += r.duration;
      const coords = r.geometry.coordinates.map(([x,y])=>[y,x]);
      if(i>0) coords.shift();
      allCoords.push(...coords);
    }
    return {coords: allCoords.map(([la,lo])=>L.latLng(la,lo)), distance: totalDist, duration: totalDur};
  }

  // ===== Optimize & draw route (no false alert) =====
  btnOpt?.addEventListener("click", async () => {
    if (WAYPOINTS.length < 2) return alert("Cần ít nhất 2 điểm.");
    if (WAYPOINTS.length > 12) return alert("Giới hạn demo 12 điểm.");

    const myRun = ++RUN_ID;
    btnOpt.disabled = true;
    const oldLabel = btnOpt.textContent;
    btnOpt.textContent = "Đang tối ưu...";

    let drew = false;

    try{
      // 1) /trip trên nhiều host
      let tripOK = null;
      for(const host of OSRM_HOSTS){
        const coords = WAYPOINTS.map(p=>`${p.lng},${p.lat}`).join(";");
        const url = `${host}/trip/v1/driving/${coords}?source=first&destination=last&roundtrip=false&overview=full&geometries=geojson`;
        try{
          const j = await fetchJson(url);
          if (myRun !== RUN_ID) return;
          if(j.code==="Ok" && j.trips?.length){ tripOK = j; break; }
        }catch{}
      }

      let polyCoords=null, dist=0, dur=0, order=null;

      if(tripOK){
        const trip = tripOK.trips[0];
        polyCoords = L.geoJSON(trip.geometry).getLayers()[0].getLatLngs();
        order = trip.waypoint_order;
        dist = trip.distance; dur = trip.duration;
      }else{
        // 2) tham lam + /route chuỗi
        const ord = greedyOrder(WAYPOINTS);
        let chainOK=null;
        for(const host of OSRM_HOSTS){
          try{
            chainOK = await routeChain(host, ord.map(i=>WAYPOINTS[i]));
            break;
          }catch{}
        }
        if(!chainOK) throw new Error("osrm-down");
        polyCoords = chainOK.coords;
        order = ord;
        dist = chainOK.distance; dur = chainOK.duration;
      }

      if (myRun !== RUN_ID) return;

      if (ROUTE_LAYER) map.removeLayer(ROUTE_LAYER);
      ROUTE_LAYER = L.polyline(polyCoords, {weight:6, opacity:.9, color:"#2563eb", lineJoin:"round"}).addTo(map);
      ROUTE_LAYER._runId = myRun;
      LAST_ROUTE_RUN = myRun;
      drew = true;

      map.fitBounds(ROUTE_LAYER.getBounds(), {padding:[40,40]});
      WP_MARKERS_LAYER.clearLayers();
      order.forEach((pos, i) => {
        const p = WAYPOINTS[pos];
        L.marker([p.lat,p.lng])
          .bindTooltip(String(i+1), {permanent:true, direction:"center", className:"badge"})
          .addTo(WP_MARKERS_LAYER);
      });

      statsEl.textContent = `Tổng quãng đường ~ ${fmtKm(dist)} km • Thời gian ~ ${fmtMin(dur)} phút`;

      const seqForHash = order.map(i=>WAYPOINTS[i]);
      location.hash = "#" + seqForHash.map(p=>`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|");
    }catch{
      const sameRunLayer = ROUTE_LAYER && ROUTE_LAYER._runId === myRun;
      if (myRun === RUN_ID && !drew && !sameRunLayer) {
        alert("OSRM quá tải và fallback cũng fail. Thử lại sau.");
      }
    }finally{
      if (myRun === RUN_ID){
        btnOpt.disabled = false;
        btnOpt.textContent = oldLabel;
      }
    }
  });
});
