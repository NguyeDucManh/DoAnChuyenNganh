// helpers
const $ = (s, r=document) => r.querySelector(s);
function toast(msg){ const t=$("#toast"); if(!t) return; t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1400); }

// header scroll
(function(){ const h=$('.site-header'); const onScroll=()=>{ if(window.scrollY>8) h.classList.add('scrolled'); else h.classList.remove('scrolled'); }; onScroll(); window.addEventListener('scroll',onScroll,{passive:true}); })();

// theme toggle
(function(){ const btn=$("#themeToggle"), root=document.documentElement, saved=localStorage.getItem("theme"); if(saved) root.setAttribute("data-theme",saved);
  btn?.addEventListener("click",()=>{ const next=root.getAttribute("data-theme")==="dark"?"light":"dark"; root.setAttribute("data-theme",next); localStorage.setItem("theme",next); btn.setAttribute("aria-pressed",String(next==="dark")); toast(next==="dark"?"Đã bật Dark Mode":"Đã tắt Dark Mode"); });
})();

// hamburger
(function(){ const ham=$("#hamburger"), nav=$("#mainNav"); ham?.addEventListener("click",()=>{ const open=!ham.classList.contains("active"); ham.classList.toggle("active",open); nav?.classList.toggle("open",open); ham.setAttribute("aria-expanded",String(open)); }); })();

// user dropdown
(function(){ const menu=$("#userMenu"), chip=$("#userChip"); chip?.addEventListener("click",()=>{ const open=!menu.classList.contains("open"); menu.classList.toggle("open",open); chip.setAttribute("aria-expanded",String(open)); }); document.addEventListener("click",(e)=>{ if(menu && !menu.contains(e.target)){ menu.classList.remove("open"); chip?.setAttribute("aria-expanded","false"); } }); })();

// tracking demo
(function(){ const form=$("#trackForm"), input=$("#trackInput"), box=$("#trackResult");
  function render(code,status){ const badge = status==='moving' ? '<span class="badge success"><i class="fa-solid fa-truck"></i> Đang vận chuyển</span>' :
                               status==='pending'? '<span class="badge warning"><i class="fa-regular fa-clock"></i> Chờ lấy hàng</span>' :
                                                   '<span class="badge"><i class="fa-regular fa-circle-question"></i> Không xác định</span>';
    box.innerHTML = `<div class="result-box">
      <div class="result-head"><strong>Mã vận đơn: ${code}</strong>${badge}</div>
      <div class="timeline">
        <div class="step"><div class="dot"></div><div><b>Đã tiếp nhận</b><br><small>Kho Quận 1 – 09:20</small></div></div>
        <div class="line"></div>
        <div class="step"><div class="dot"></div><div><b>Đang trung chuyển</b><br><small>Hub HCM – 14:10</small></div></div>
        <div class="line"></div>
        <div class="step"><div class="dot ${status==='moving'?'active':''}"></div><div><b>Dự kiến giao</b><br><small>Hôm nay 16:30–19:00</small></div></div>
      </div></div>`; }
  form?.addEventListener("submit",(e)=>{ e.preventDefault(); const code=(input?.value||"").trim().toUpperCase(); if(!code||code.length<5){ box.innerHTML='<p class="error">Vui lòng nhập mã vận đơn hợp lệ.</p>'; return; }
    box.innerHTML='<p class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Đang tra cứu...</p>';
    setTimeout(()=>{ if(code.startsWith("GH")) render(code,"moving"); else if(code.startsWith("TEST")) render(code,"pending"); else render(code,"other"); },800);
  });
})();

// reveal on scroll
(function(){ const els=document.querySelectorAll(".reveal"); const io=new IntersectionObserver((xs)=>{ xs.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add("show"); io.unobserve(en.target);} }); },{threshold:0.12}); els.forEach(el=>io.observe(el)); })();
