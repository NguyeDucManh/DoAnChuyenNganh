(() => {
  // ===== Endpoints & flags =====
  const API_ORDERS = window.API_ORDERS || "/orders/api/orders/";
  const API_ATT    = window.API_ATT    || "/orders/api/attendance/";
  const IS_STAFF   = !!window.APP_IS_STAFF;

  // ===== Shortcuts =====
  const q = (s, r=document) => r.querySelector(s);
  const tbody   = q("#orderTable tbody");
  const attBody = q("#attTable tbody");
  const form      = q("#orderForm");
  const searchBox = q("#searchBox");
  const filterSel = q("#filterStatus");
  const submitBtn = q("#submitBtn");
  const resetBtn  = q("#resetBtn");
  const btnIn  = q("#checkInBtn");
  const btnOut = q("#checkOutBtn");

  // address fields
  const elPickupAddr  = q("#pickupAddress");
  const elPickupLat   = q("#pickupLat");
  const elPickupLng   = q("#pickupLng");
  const elDropAddr    = q("#dropAddress") || q("#address"); // fallback nếu HTML cũ
  const elDropLat     = q("#dropLat");
  const elDropLng     = q("#dropLng");
  // house-number inputs
  const elPickupHouse = q("#pickupHouse");
  const elDropHouse   = q("#dropHouse");

  // ===== Binh Thanh priority zone =====
  const BTH = {W:106.677, E:106.740, S:10.784, N:10.858};
  const inBinhThanh = (lat, lon) => lon>=BTH.W && lon<=BTH.E && lat>=BTH.S && lat<=BTH.N;

  // Snap về đường gần nhất với OSRM để distance/time chuẩn hơn
  async function osrmNearest(lat, lng){
    try{
      const u = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}`;
      const r = await fetch(u);
      if(!r.ok) return {lat, lng};
      const j = await r.json();
      const loc = j?.waypoints?.[0]?.location;
      return loc ? { lat: loc[1], lng: loc[0] } : { lat, lng };
    }catch{ return {lat, lng}; }
  }

  // ===== Utils =====
  const getCookie = n => {
    const m = document.cookie.match("(^|;)\\s*" + n + "\\s*=\\s*([^;]+)");
    return m ? decodeURIComponent(m.pop()) : "";
  };
  const CSRF = getCookie("csrftoken");

  const toast = (msg, type="success") => {
    const t = q("#toast");
    if (!t) return alert(msg);
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove("show"), 1800);
  };

  const esc = s => String(s||"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const js  = s => String(s||"").replaceAll("\\","\\\\").replaceAll("'","\\'");
  const fmtDT = v => v ? new Date(v).toLocaleString("vi-VN") : "";
  const fmtHours = h => (Math.round(Number(h||0)*100)/100).toFixed(2);

  const STATUS_LABEL = { new:"Mới tạo", shipping:"Đang giao", done:"Hoàn thành", cancel:"Đã hủy" };
  const badge = s => `<span class="badge ${
    s==="new"?"warning":s==="shipping"?"info":s==="done"?"success":"danger"
  }" style="min-width:96px;display:inline-flex;justify-content:center;">
    ${STATUS_LABEL[s]||s}
  </span>`;

  // join house + addr safely
  const joinHouseAddr = (house, addr) => {
    const h = String(house||"").trim();
    const a = String(addr||"").trim();
    if (!h) return a;
    return a.startsWith(h + " ") ? a : `${h} ${a}`.trim();
  };

  // ================= Orders =================
  let cache = [];

  async function loadOrders(){
    try{
      const res = await fetch(API_ORDERS, { credentials:"same-origin" });
      if(!res.ok) throw 0;
      cache = await res.json();
      renderOrders();
    }catch{
      tbody.innerHTML = `<tr><td colspan="${IS_STAFF?10:9}" style="color:#ef4444;text-align:center;">Lỗi tải dữ liệu</td></tr>`;
    }
  }

  function renderOrders(){
    const kw = (searchBox?.value||"").trim().toLowerCase();
    const st = filterSel?.value||"";
    const rows = cache.filter(o=>{
      const okSt = !st || o.status===st;
      const okKw = !kw ||
        (o.code||"").toLowerCase().includes(kw) ||
        (o.customer_name||"").toLowerCase().includes(kw);
      return okSt && okKw;
    }).map(o=>{
      const actions = IS_STAFF ? `
        <button class="icon-btn" onclick="editOrder(${o.id},'${js(o.code)}','${js(o.customer_name)}','${js(o.address||"")}','${js(o.phone||"")}','${js(o.status||"new")}',${Number(o.cod||0)})">✏️</button>
        <button class="icon-btn danger" onclick="delOrder(${o.id})">🗑️</button>
      ` : "";
      const addrShow = o.drop_address || o.address || "";
      return `
        <tr>
          <td style="text-align:center">${o.id}</td>
          <td>${esc(o.code)}</td>
          <td>${esc(o.customer_name)}</td>
          <td>${esc(addrShow)}</td>
          <td>${esc(o.phone||"")}</td>
          <td style="text-align:center">${Number(o.cod||0).toLocaleString("vi-VN")}</td>
          <td style="text-align:center">${badge(o.status)}</td>
          <td style="text-align:center">${esc(o.assigned_to_username||o.assigned_to||"")}</td>
          ${IS_STAFF?`<td style="text-align:center">${actions}</td>`:""}
        </tr>`;
    }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="${IS_STAFF?10:9}" style="text-align:center;opacity:.7">Không có dữ liệu</td></tr>`;
  }

  // CRUD
  if(form && IS_STAFF){
    form.addEventListener("submit", async e=>{
      e.preventDefault();
      const id = (q("#orderId")?.value||"").trim();

      // build payload sơ bộ
      const payload = {
        code: q("#trackingCode").value.trim(),
        customer_name: q("#customerName").value.trim(),
        address: (q("#address")?.value || "").trim(), // giữ để tương thích
        phone: q("#phone").value.trim(),
        status: q("#status").value,
        cod: Number(q("#cod").value||0),

        pickup_address: joinHouseAddr(elPickupHouse?.value, elPickupAddr?.value?.trim() || ""),
        drop_address:   joinHouseAddr(elDropHouse?.value,   elDropAddr?.value?.trim()   || (q("#address")?.value?.trim() || "")),
        pickup_lat: parseFloat(elPickupLat?.value || "NaN"),
        pickup_lng: parseFloat(elPickupLng?.value || "NaN"),
        drop_lat:   parseFloat(elDropLat?.value   || "NaN"),
        drop_lng:   parseFloat(elDropLng?.value   || "NaN"),
      };

      // Snap về đường nếu nằm trong Bình Thạnh
      if (!Number.isNaN(payload.pickup_lat) && !Number.isNaN(payload.pickup_lng) &&
          inBinhThanh(payload.pickup_lat, payload.pickup_lng)) {
        const p = await osrmNearest(payload.pickup_lat, payload.pickup_lng);
        payload.pickup_lat = p.lat; payload.pickup_lng = p.lng;
      }
      if (!Number.isNaN(payload.drop_lat) && !Number.isNaN(payload.drop_lng) &&
          inBinhThanh(payload.drop_lat, payload.drop_lng)) {
        const d = await osrmNearest(payload.drop_lat, payload.drop_lng);
        payload.drop_lat = d.lat; payload.drop_lng = d.lng;
      }

      // loại key NaN để không crash serializer
      ["pickup_lat","pickup_lng","drop_lat","drop_lng"].forEach(k=>{
        if (Number.isNaN(payload[k])) delete payload[k];
      });

      if(!payload.code || !payload.customer_name){
        toast("Thiếu mã đơn hoặc tên KH","error"); return;
      }

      const res = await fetch(id? `${API_ORDERS}${id}/` : API_ORDERS, {
        method: id? "PUT":"POST",
        credentials:"same-origin",
        headers:{ "Content-Type":"application/json", "X-CSRFToken": CSRF },
        body: JSON.stringify(payload)
      });
      if(!res.ok){ toast("Lỗi khi lưu đơn","error"); return; }

      toast(id? "Đã cập nhật đơn":"Đã tạo đơn");
      form.reset();
      if (elPickupLat) elPickupLat.value = "";
      if (elPickupLng) elPickupLng.value = "";
      if (elDropLat)   elDropLat.value   = "";
      if (elDropLng)   elDropLng.value   = "";
      q("#orderId").value="";
      submitBtn.textContent="Thêm đơn hàng";
      loadOrders();
    });

    resetBtn?.addEventListener("click", ()=>{
      form.reset();
      if (elPickupLat) elPickupLat.value = "";
      if (elPickupLng) elPickupLng.value = "";
      if (elDropLat)   elDropLat.value   = "";
      if (elDropLng)   elDropLng.value   = "";
      q("#orderId").value="";
      submitBtn.textContent="Thêm đơn hàng";
    });

    // edit
    window.editOrder = (id, code, name, addr, phone, status, cod)=>{
      q("#orderId").value = id;
      q("#trackingCode").value = code;
      q("#customerName").value = name;
      (q("#address")||{}).value = addr;
      q("#phone").value = phone;
      q("#status").value = status || "new";
      q("#cod").value = cod || 0;
      submitBtn.textContent = "Cập nhật đơn hàng";
      window.scrollTo({top:0,behavior:"smooth"});
    };

    window.delOrder = async id=>{
      if(!confirm("Xóa đơn hàng này?")) return;
      const res = await fetch(`${API_ORDERS}${id}/`, {
        method:"DELETE", credentials:"same-origin",
        headers:{ "X-CSRFToken": CSRF }
      });
      if(res.status===204){ toast("Đã xóa đơn"); loadOrders(); }
      else toast("Không thể xóa đơn","error");
    };
  }else{
    if(form) [...form.querySelectorAll("input,select,button")].forEach(el=>el.disabled=true);
    window.editOrder = window.delOrder = ()=>{};
  }

  // ================= Attendance =================
  function setAttButtons(hasOpen){
    if(!btnIn || !btnOut) return;
    btnIn.disabled  = !!hasOpen;
    btnOut.disabled = !hasOpen;
    btnIn.title  = hasOpen ? "Đang trong ca" : "";
    btnOut.title = hasOpen ? "" : "Chưa check-in";
  }

  async function loadAttendance(){
    try{
      const res = await fetch(API_ATT, { credentials:"same-origin" });
      if(!res.ok) throw 0;
      const data = await res.json();
      const hasOpen = data.some(r => !r.check_out);

      if(!data.length){
        attBody.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.6">Chưa có dữ liệu</td></tr>`;
        setAttButtons(false);
        return;
      }

      attBody.innerHTML = data.map((r,i)=>`
        <tr>
          <td style="text-align:center">${i+1}</td>
          <td style="text-align:center">${fmtDT(r.check_in)}</td>
          <td style="text-align:center">${fmtDT(r.check_out)}</td>
          <td style="text-align:center">${fmtHours(r.hours)}</td>
        </tr>`).join("");

      setAttButtons(hasOpen);
    }catch{
      attBody.innerHTML = `<tr><td colspan="4" style="color:#ef4444;text-align:center;">Lỗi tải dữ liệu</td></tr>`;
      setAttButtons(false);
    }
  }

  async function att(action){
    try{
      const res = await fetch(API_ATT, {
        method:"POST", credentials:"same-origin",
        headers:{ "Content-Type":"application/json", "X-CSRFToken": CSRF },
        body: JSON.stringify({ action })
      });
      const ok = res.ok;
      const data = await res.json().catch(()=>null);
      if(!ok){ toast(data?.detail || "Lỗi chấm công","error"); return; }

      toast(action==="in" ? "Đã check-in" : "Đã check-out");
      await loadAttendance();
    }catch{
      toast("Lỗi mạng","error");
    }
  }

  btnIn?.addEventListener("click", ()=>att("in"));
  btnOut?.addEventListener("click", ()=>att("out"));

  // ================= Filters =================
  searchBox?.addEventListener("input", renderOrders);
  filterSel?.addEventListener("change", renderOrders);

  // ================= Init =================
  loadOrders();
  loadAttendance();
  setInterval(loadAttendance, 60000);

  // ================= Performance =================
  const perfBody = document.querySelector("#perfTable tbody");
  const perfFrom = document.querySelector("#perfFrom");
  const perfTo   = document.querySelector("#perfTo");
  const perfReload = document.querySelector("#perfReload");

  const nowISO = new Date().toISOString().slice(0,16);
  const fromISO = new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,16);
  if (perfFrom) perfFrom.value = fromISO;
  if (perfTo)   perfTo.value   = nowISO;

  async function loadPerformance(){
    if (!perfBody) return;
    try{
      const params = new URLSearchParams();
      if (perfFrom?.value) params.set("from", new Date(perfFrom.value).toISOString());
      if (perfTo?.value)   params.set("to",   new Date(perfTo.value).toISOString());

      const res = await fetch(`${window.API_PERF}?${params.toString()}`, {credentials:"same-origin"});
      const j = await res.json();
      if (!res.ok || !j.ok) throw 0;

      const r = j.result;
      const selfRow = `
        <tr>
          <td>${r.user}</td>
          <td style="text-align:center">${r.orders.done}</td>
          <td style="text-align:center">${r.orders.total}</td>
          <td style="text-align:right">${Number(r.orders.cod_sum||0).toLocaleString("vi-VN")}</td>
          <td style="text-align:center">${(r.attendance.worked_hours||0).toFixed(2)}</td>
          <td style="text-align:center">${r.attendance.orders_per_hour ?? "-"}</td>
          <td style="text-align:center">${r.orders.avg_lead_hours ?? "-"}</td>
        </tr>`;

      perfBody.innerHTML = selfRow;
    }catch{
      perfBody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;text-align:center;">Lỗi tải KPI</td></tr>`;
    }
  }

  perfReload?.addEventListener("click", loadPerformance);
  loadPerformance();
  
})();
