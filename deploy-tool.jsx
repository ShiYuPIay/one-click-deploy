/**
 * deploy-tool.jsx — One-Click Deploy Platform
 * ─────────────────────────────────────────────
 * React control panel for the Cloudflare Worker backend.
 * All API calls target relative paths (/api/*) on the same origin.
 *
 * Usage: bundle with Vite/CRA/Next, then serve from worker.js or a
 * Cloudflare Pages project that proxies /api/* to the Worker.
 *
 * Changes from the original:
 *  - ConfigPage.handleTest   → calls real POST /api/test-connection
 *  - TemplatePage            → fetches GET /api/templates (falls back
 *                              to the built-in TEMPLATES constant)
 *  - DeployPage              → calls POST /api/deploy and polls
 *                              GET /api/deploy/:id for live progress
 *  - CompletePage            → one-time-display: password shown once,
 *                              cleared from React state after acknowledgment
 *  - All English strings     → corrected to standard American English
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════

const DEPLOY_STEPS = ["解析源码", "云端构建", "创建仓库", "上传部署", "绑定节点", "完成"];

/** Built-in template list — used as a fallback if /api/templates is unavailable. */
const TEMPLATES = [
  { id:1,  name:"Astro 极速博客",  framework:"Astro",     stars:45200, icon:"🚀", color:"#FF5D01", compatible:true,  buildCmd:"npm run build",                          outputDir:"dist",           desc:"内容驱动 · 零 JS 运行时 · 首屏极速",     previewUrl:"https://astro.build" },
  { id:2,  name:"React 作品集",    framework:"React",     stars:23800, icon:"⚛️", color:"#0ea5e9", compatible:true,  buildCmd:"npm run build",                          outputDir:"build",          desc:"响应式个人主页 · 内置暗色模式与动画",   previewUrl:"https://react.dev" },
  { id:3,  name:"Vue 企业官网",    framework:"Vue 3",     stars:18600, icon:"🌿", color:"#42B883", compatible:true,  buildCmd:"npm run build",                          outputDir:"dist",           desc:"商务展示站点 · 多语言国际化支持",       previewUrl:"https://vuejs.org" },
  { id:4,  name:"Next.js 电商",    framework:"Next.js",   stars:98000, icon:"▲",  color:"#333",    compatible:false, buildCmd:"next build",                             outputDir:".next",          desc:"React 全栈电商，含购物车与动态路由",    previewUrl:"https://nextjs.org",
    incompatibleReason:"Next.js SSR requires a persistent Node.js runtime.\nFree edge nodes enforce a strict 10ms CPU limit which is incompatible with SSR middleware.\n\nRecommended options:\n① Upgrade to a paid high-performance node, or\n② Set output: \"export\" in next.config.js to use static-export mode." },
  { id:5,  name:"SvelteKit 应用",  framework:"SvelteKit", stars:16400, icon:"🔥", color:"#FF3E00", compatible:true,  buildCmd:"npm run build",                          outputDir:"build",          desc:"编译时优化 · 极致运行性能 · 产物极小", previewUrl:"https://svelte.dev" },
  { id:6,  name:"Nuxt 3 门户",     framework:"Nuxt 3",    stars:52000, icon:"💫", color:"#00DC82", compatible:false, buildCmd:"nuxt generate",                          outputDir:".output/public", desc:"Vue 全栈框架 · 自动路由与内置 SEO 优化", previewUrl:"https://nuxt.com",
    incompatibleReason:"Nuxt 3 SSR mode requires a persistent Node.js process.\nThe stateless single-invocation edge function model is incompatible.\n\nRecommended options:\n① Set ssr: false in nuxt.config.ts to switch to SPA mode, or\n② Use nuxt generate to pre-render a fully static site (SSG mode)." },
  { id:7,  name:"Vite 落地页",     framework:"Vite",      stars:67000, icon:"⚡", color:"#646CFF", compatible:true,  buildCmd:"npm run build",                          outputDir:"dist",           desc:"超快构建 · 极简落地页 · 首屏 < 200ms", previewUrl:"https://vitejs.dev" },
  { id:8,  name:"Hugo 技术博客",   framework:"Hugo",      stars:73000, icon:"📝", color:"#FF4088", compatible:true,  buildCmd:"hugo --minify",                          outputDir:"public",         desc:"世界最快静态生成器 · 毫秒级构建万篇文章", previewUrl:"https://gohugo.io" },
  { id:9,  name:"Gatsby 营销站",   framework:"Gatsby",    stars:55000, icon:"🟣", color:"#663399", compatible:true,  buildCmd:"gatsby build",                           outputDir:"public",         desc:"React 静态站点生成器 · GraphQL 数据层", previewUrl:"https://www.gatsbyjs.com" },
  { id:10, name:"Angular 管理台",  framework:"Angular",   stars:95000, icon:"🅰️", color:"#DD0031", compatible:true,  buildCmd:"ng build --configuration production",    outputDir:"dist",           desc:"企业级 TypeScript 框架 · 完整 MVC 生态", previewUrl:"https://angular.io" },
];

// ═══════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════

const T = {
  pink:      "#e5345a",
  primary:   "#1ab394",
  primaryDk: "#12826b",
  primaryBg: "#e6f7f3",
  success:   "#52c41a",
  successBg: "#f6ffed",
  warn:      "#d97706",
  warnBg:    "#fffbe6",
  danger:    "#ef4444",
  dangerBg:  "#fef2f2",
  bg:        "#f0f2f5",
  card:      "#fff",
  border:    "#e4e9f0",
  text:      "#1a2234",
  muted:     "#7b8599",
  term:      "#0d1117",
};

// ═══════════════════════════════════════════════════════════
// GLOBAL STYLES
// ═══════════════════════════════════════════════════════════

const GS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:${T.bg};color:${T.text};font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif}
  input:focus{outline:none;border-color:${T.primary}!important;box-shadow:0 0 0 2.5px ${T.primary}28!important}
  button{font-family:inherit}
  a{text-decoration:none;color:inherit}
  ::placeholder{color:#b0b8c8}
  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-thumb{background:#c8d0da;border-radius:3px}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
  @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  .rise{animation:rise .3s ease}
  .card{background:${T.card};border:1px solid ${T.border};border-radius:10px;box-shadow:0 1px 5px rgba(0,0,0,.04)}
  .tcard{transition:transform .18s ease,box-shadow .18s ease}
  .tcard:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.1)!important}
`;

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════

const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
/** Terminal log color by type */
const lc   = t => ({ success:"#4ade80", error:"#f87171", warn:"#fbbf24", info:"#60a5fa" })[t] || "#94a3b8";

// ═══════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════

export default function App() {
  const [page,   setPage]   = useState("config");
  const [config, setConfig] = useState(null);
  const [tpl,    setTpl]    = useState(null);
  const [result, setResult] = useState(null);

  return (
    <>
      <style>{GS}</style>
      <div style={{ minHeight:"100vh", background:T.bg }}>
        <TopBar page={page} />
        {page === "config" && (
          <ConfigPage
            key="cfg"
            onNext={c => { setConfig(c); setPage("templates"); }}
          />
        )}
        {page === "templates" && (
          <TemplatePage
            key="tpl"
            onSelect={t => { setTpl(t); setPage("deploying"); }}
            onBack={() => setPage("config")}
          />
        )}
        {page === "deploying" && config && tpl && (
          <DeployPage
            key={`d${tpl.id}`}
            config={config}
            tpl={tpl}
            onComplete={r => { setResult(r); setPage("complete"); }}
            onChangeTemplate={() => setPage("templates")}
            onChangeConfig={()   => setPage("config")}
          />
        )}
        {page === "complete" && result && (
          <CompletePage key="done" result={result} tpl={tpl} />
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════

function TopBar({ page }) {
  const nav    = ["config", "templates", "deploying", "complete"];
  const labels = ["填写授权", "选择模板", "部署中", "完成"];
  const idx    = nav.indexOf(page);
  return (
    <div style={{ height:50, background:T.card, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px", position:"sticky", top:0, zIndex:999, boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:20 }}>🚀</span>
        <span style={{ fontWeight:800, fontSize:16, color:T.primary, letterSpacing:"-.3px" }}>一键建站平台</span>
        <span style={{ fontSize:11, background:T.primaryBg, color:T.primary, padding:"1px 9px", borderRadius:20, fontWeight:700 }}>免费版</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:3, fontSize:12 }}>
        {labels.map((l, i) => (
          <React.Fragment key={i}>
            <span style={{ color:i <= idx ? T.primary : T.muted, fontWeight:i === idx ? 700 : 400 }}>
              {i < idx ? "✓ " : ""}{l}
            </span>
            {i < labels.length - 1 && (
              <span style={{ color:"#d4d8e0", margin:"0 5px" }}>›</span>
            )}
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize:12, color:T.muted }}>🌍 全球 310+ 边缘节点</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAGE: CONFIG
// ═══════════════════════════════════════════════════════════

function ConfigPage({ onNext }) {
  const [form,    setForm]    = useState({ cfToken:"", cfId:"", ghToken:"", ghUser:"" });
  const [testing, setTesting] = useState(false);
  const [testSt,  setTestSt]  = useState(null); // null | "ok" | "fail" | "empty" | "error"
  const [testMsg, setTestMsg] = useState("");

  const set = k => v => {
    setForm(f => ({ ...f, [k]:v }));
    setTestSt(null);
    setTestMsg("");
  };

  /** Call the real /api/test-connection endpoint. */
  const handleTest = async () => {
    if (!form.cfToken || !form.cfId) { setTestSt("empty"); return; }
    setTesting(true); setTestSt(null); setTestMsg("");
    try {
      const res  = await fetch("/api/test-connection", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cfToken:form.cfToken, cfAccountId:form.cfId }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestSt("ok");
        setTestMsg(data.accountName ? `— ${data.accountName}` : "");
      } else {
        setTestSt("fail");
        setTestMsg(data.error || "Token validation failed. Please check the token and account ID.");
      }
    } catch (e) {
      setTestSt("error");
      setTestMsg(`Network error: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleNext = () => {
    const miss = [
      !form.cfToken  && "Platform API Token",
      !form.cfId     && "Account ID",
      !form.ghToken  && "Code Repository Token",
      !form.ghUser   && "Code Repository Username",
    ].filter(Boolean);
    if (miss.length) {
      alert(`Please fill in the following required fields: ${miss.join(", ")}`);
      return;
    }
    onNext(form);
  };

  return (
    <div className="rise" style={{ maxWidth:700, margin:"0 auto", padding:"40px 24px" }}>
      {/* Hero */}
      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontSize:52, marginBottom:14, lineHeight:1 }}>⚡</div>
        <h1 style={{ fontSize:26, fontWeight:800, margin:"0 0 10px", letterSpacing:"-.5px" }}>
          零代码建站，一键全球部署
        </h1>
        <p style={{ fontSize:14, color:T.muted, margin:0 }}>
          填写两项授权 · 选择模板 · 30 秒内完成 · 全程免费
        </p>
      </div>

      {/* Cloud platform auth */}
      <div className="card" style={{ padding:24, marginBottom:16 }}>
        <SectionHead icon="☁️" title="云托管平台授权" />
        <div style={{ fontSize:13, color:"#0d6f5e", background:T.primaryBg, borderRadius:8, padding:"10px 14px", marginBottom:18, lineHeight:1.7 }}>
          💡 本工具已全权接管云端仓库创建与部署，只需填写下方两项授权即可。部署完成后建议立即撤销令牌，保障账户安全。
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field id="cfToken" label="API 令牌 *"  type="password" placeholder="eyJhbGci..."  value={form.cfToken} onChange={set("cfToken")} />
          <Field id="cfId"    label="账户 ID *"   type="text"     placeholder="a1b2c3d4..."   value={form.cfId}    onChange={set("cfId")} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <Btn onClick={handleTest} disabled={testing} variant="outline">
            <span style={{ display:"inline-block", animation:testing?"spin .7s linear infinite":"none", marginRight:5 }}>
              {testing ? "↻" : "🔌"}
            </span>
            {testing ? "Testing connection..." : "Test Connection"}
          </Btn>
          {testSt === "ok"    && <span style={{ fontSize:13, color:T.success }}>✅ Connected successfully {testMsg}</span>}
          {testSt === "fail"  && <span style={{ fontSize:13, color:T.danger  }}>❌ {testMsg || "Invalid token — please check the format."}</span>}
          {testSt === "error" && <span style={{ fontSize:13, color:T.danger  }}>❌ {testMsg}</span>}
          {testSt === "empty" && <span style={{ fontSize:13, color:T.warn    }}>⚠️ Please enter a token and account ID first.</span>}
        </div>
      </div>

      {/* Code repository auth */}
      <div className="card" style={{ padding:24, marginBottom:16 }}>
        <SectionHead icon="📦" title="代码托管平台授权" />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field id="ghToken" label="访问令牌 *" type="password" placeholder="ghp_xxxxxxxxxxxx"  value={form.ghToken} onChange={set("ghToken")} />
          <Field id="ghUser"  label="用户名 *"   type="text"     placeholder="your_username"      value={form.ghUser}  onChange={set("ghUser")} />
        </div>
      </div>

      {/* Environment selector */}
      <div className="card" style={{ padding:20, marginBottom:28, background:T.primaryBg, border:`1px solid ${T.primary}33` }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🖥️ 部署环境</div>
        <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginBottom:10 }}>
          <input type="radio" checked readOnly style={{ accentColor:T.primary, width:15, height:15 }} />
          <span style={{ fontSize:14 }}>
            <strong style={{ color:T.primary }}>✅ 免费边缘节点</strong>
            <span style={{ color:T.muted, fontSize:12, marginLeft:8 }}>全球 310+ 节点 · 静态网站首选 · 无限流量</span>
          </span>
        </label>
        <label style={{ display:"flex", alignItems:"center", gap:10, opacity:.38, cursor:"not-allowed" }}>
          <input type="radio" disabled />
          <span style={{ fontSize:14 }}>
            付费高性能节点 <span style={{ fontSize:12, color:T.muted }}>（支持服务端渲染 · 暂未开放）</span>
          </span>
        </label>
      </div>

      <button
        onClick={handleNext}
        style={{ width:"100%", padding:"13px", fontSize:16, fontWeight:800, background:`linear-gradient(135deg,${T.primary},${T.primaryDk})`, color:"#fff", border:"none", borderRadius:10, cursor:"pointer", letterSpacing:"-.2px" }}
      >
        下一步：选择网站模板 →
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAGE: TEMPLATES
// ═══════════════════════════════════════════════════════════

function TemplatePage({ onSelect, onBack }) {
  const [sel,       setSel]       = useState(null);
  const [templates, setTemplates] = useState(TEMPLATES);
  const [loading,   setLoading]   = useState(true);
  const [loadErr,   setLoadErr]   = useState(null);

  /** Fetch live templates from the API; fall back to the built-in list on error. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.templates && d.templates.length > 0) setTemplates(d.templates);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setLoadErr(`Could not load live templates (${e.message}). Using built-in list.`);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="rise" style={{ maxWidth:1020, margin:"0 auto", padding:"36px 24px" }}>
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:28 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <h2 style={{ fontSize:22, fontWeight:800, margin:0 }}>🔥 本月趋势模板库</h2>
            <span style={{ fontSize:11, background:"#fff7e6", color:T.warn, padding:"2px 10px", borderRadius:20, border:`1px solid ${T.warn}44`, fontWeight:700 }}>每月自动更新</span>
          </div>
          <p style={{ margin:0, fontSize:13, color:T.muted }}>精选 GitHub 万星开源项目 · 预置构建配置 · 点击卡片选择，即刻部署</p>
        </div>
        <Btn onClick={onBack} variant="ghost">← 返回</Btn>
      </div>

      {loadErr && (
        <div style={{ background:T.warnBg, border:`1px solid #ffe58f`, borderRadius:8, padding:"10px 14px", fontSize:12, color:"#7c4a00", marginBottom:16 }}>
          ⚠️ {loadErr}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:"center", padding:"100px 0" }}>
          <div style={{ fontSize:40, display:"inline-block", animation:"spin 1.5s linear infinite", marginBottom:18 }}>⏳</div>
          <p style={{ color:T.muted, fontSize:15 }}>正在从云端拉取本月热门项目...</p>
        </div>
      ) : (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:16, marginBottom:28 }}>
            {templates.map(t => (
              <TplCard
                key={t.id}
                tpl={t}
                selected={sel?.id === t.id}
                onClick={() => setSel(s => s?.id === t.id ? null : t)}
              />
            ))}
            {/* Custom upload slot */}
            <div style={{ background:T.card, border:`2px dashed ${T.border}`, borderRadius:12, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, padding:24, cursor:"pointer", color:T.muted, minHeight:230 }}>
              <div style={{ fontSize:34 }}>📁</div>
              <div style={{ fontSize:13, fontWeight:700 }}>自定义上传</div>
              <div style={{ fontSize:11, textAlign:"center", lineHeight:1.6 }}>拖拽 ZIP 压缩包<br/>（适用于特殊需求）</div>
            </div>
          </div>
          <div style={{ textAlign:"center" }}>
            <button
              disabled={!sel}
              onClick={() => sel && onSelect(sel)}
              style={{ padding:"13px 48px", fontSize:16, fontWeight:800, borderRadius:10, border:"none", background:sel ? `linear-gradient(135deg,${T.primary},${T.primaryDk})` : "#c8d4e0", color:"#fff", cursor:sel ? "pointer" : "not-allowed", minWidth:280, transition:"all .2s", letterSpacing:"-.2px" }}
            >
              {sel ? `🚀 立即部署「${sel.name}」` : "请先点击选择一个模板"}
            </button>
            {sel && !sel.compatible && (
              <p style={{ marginTop:10, fontSize:13, color:T.warn }}>⚠️ 该模板有兼容性限制，部署时会显示详细原因</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TplCard({ tpl:t, selected, onClick }) {
  const [imgErr, setImgErr] = useState(false);
  const ssUrl = `https://api.microlink.io/?url=${encodeURIComponent(t.previewUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
  return (
    <div className="tcard" onClick={onClick} style={{ background:T.card, border:`2px solid ${selected ? T.primary : T.border}`, borderRadius:12, overflow:"hidden", cursor:"pointer", boxShadow:selected ? `0 0 0 4px ${T.primary}22,0 4px 14px rgba(0,0,0,.08)` : "0 1px 4px rgba(0,0,0,.05)", transition:"border .18s,box-shadow .18s", position:"relative" }}>
      <div style={{ height:132, position:"relative", overflow:"hidden", background:`linear-gradient(135deg,${t.color}18,${t.color}36)` }}>
        {!imgErr
          ? <img src={ssUrl} alt="" onError={() => setImgErr(true)} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:54 }}>{t.icon}</div>
        }
        {selected    && <div style={{ position:"absolute", top:8, left:8,  background:T.primary,        color:"#fff", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20 }}>✓ 已选择</div>}
        {!t.compatible && <div style={{ position:"absolute", top:8, right:8, background:"#d97706cc",   color:"#fff", fontSize:10, fontWeight:700, padding:"2px  9px", borderRadius:20 }}>⚠ 有限制</div>}
      </div>
      <div style={{ padding:"12px 14px" }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:5 }}>{t.name}</div>
        <div style={{ fontSize:12, color:T.muted, lineHeight:1.5, minHeight:36, marginBottom:10 }}>{t.desc}</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:11, fontWeight:700, background:t.color+"18", color:t.color, padding:"2px 9px", borderRadius:20, border:`1px solid ${t.color}33` }}>{t.framework}</span>
          <span style={{ fontSize:12, color:"#d97706" }}>⭐ {fmtK(t.stars)}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAGE: DEPLOY
// Real API integration — calls POST /api/deploy, then polls
// GET /api/deploy/:id every 700ms for live progress.
// ═══════════════════════════════════════════════════════════

function DeployPage({ config, tpl, onComplete, onChangeTemplate, onChangeConfig }) {
  const [step,    setStep]    = useState(0);
  const [logs,    setLogs]    = useState([]);
  const [failed,  setFailed]  = useState(false);
  const [failMsg, setFailMsg] = useState("");
  const logEl   = useRef(null);
  const aborted = useRef(false);
  const pollRef = useRef(null);

  const scrollLog = useCallback(() => {
    setTimeout(() => { if (logEl.current) logEl.current.scrollTop = 99999; }, 25);
  }, []);

  useEffect(() => {
    aborted.current = false;

    const startDeploy = async () => {
      try {
        // POST /api/deploy to start the pipeline
        const res  = await fetch("/api/deploy", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            cfToken:     config.cfToken,
            cfAccountId: config.cfId,
            ghToken:     config.ghToken,
            ghUsername:  config.ghUser,
            template:    tpl,
          }),
        });
        const data = await res.json();

        if (!data.deployId) {
          setFailed(true);
          setFailMsg(data.error || "Failed to start the deploy job. Please try again.");
          setLogs(p => [...p, { id:0, ts:ts(), text:`[Error] ${data.error || "Deploy failed to start."}`, type:"error" }]);
          return;
        }

        const deployId = data.deployId;

        // Poll GET /api/deploy/:id every 700ms
        pollRef.current = setInterval(async () => {
          if (aborted.current) { clearInterval(pollRef.current); return; }
          try {
            const sr    = await fetch(`/api/deploy/${deployId}`);
            const state = await sr.json();

            if (state.step !== undefined) setStep(state.step);
            if (state.logs) {
              setLogs(state.logs.map((l, i) => ({ ...l, id:i })));
              scrollLog();
            }

            if (state.status === "failed") {
              clearInterval(pollRef.current); pollRef.current = null;
              setFailed(true);
              setFailMsg(state.failReason || "Deploy failed.");
            } else if (state.status === "complete") {
              clearInterval(pollRef.current); pollRef.current = null;
              setStep(5);
              scrollLog();
              // Brief pause before navigating to the complete page
              setTimeout(() => {
                if (!aborted.current) onComplete(state.result);
              }, 1200);
            }
          } catch (_) {
            // Ignore transient network errors during polling
          }
        }, 700);

      } catch (e) {
        setFailed(true);
        setFailMsg(`Network error: ${e.message}`);
        setLogs(p => [...p, { id:0, ts:ts(), text:`[Network Error] ${e.message}`, type:"error" }]);
      }
    };

    startDeploy();
    return () => {
      aborted.current = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rise" style={{ maxWidth:900, margin:"0 auto", padding:"36px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>部署进度</h2>
        <p style={{ fontSize:13, color:T.muted }}>
          {failed ? "⚠️ 部署遇到限制，请查看下方错误详情"
            : step >= 5 ? "🎉 部署完成，正在跳转..."
            : "⏳ 预计 1-3 分钟，请勿关闭页面"}
        </p>
      </div>

      {/* Step progress bar */}
      <div className="card" style={{ padding:"24px 28px", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          {DEPLOY_STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <StepDot i={i} label={label} cur={step} failed={failed} />
              {i < DEPLOY_STEPS.length - 1 && (
                <div style={{ flex:1, height:3, margin:"0 3px", marginTop:-18, background:i < step ? (failed && i === step - 1 ? T.danger : T.primary) : T.border, transition:"background .5s" }} />
              )}
            </React.Fragment>
          ))}
        </div>
        {!failed && step < 5 && (
          <div style={{ textAlign:"center", marginTop:20, padding:"10px 16px", background:T.primaryBg, borderRadius:8, fontSize:13, color:T.primary, fontWeight:700 }}>
            正在进行：{DEPLOY_STEPS[step]}
          </div>
        )}
      </div>

      {/* Compatibility error box */}
      {failed && (
        <div style={{ background:T.dangerBg, border:`2px solid ${T.danger}`, borderRadius:12, padding:22, marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:800, color:T.danger, marginBottom:12 }}>
            ⛔ 部署受限 — 当前免费边缘节点无法运行此模板
          </div>
          <div style={{ fontSize:14, color:"#b91c1c", lineHeight:1.8, marginBottom:14 }}>
            当前模板需要复杂后端运行时或资源超出免费托管环境限制，<strong>将导致网站无法正常访问或功能严重缺失</strong>。请查看下方完整错误日志了解具体原因。
          </div>
          {failMsg && (
            <div style={{ background:"rgba(239,68,68,.07)", border:"1px dashed #fca5a5", borderRadius:8, padding:"12px 16px", fontSize:13, color:"#991b1b", fontFamily:"monospace", lineHeight:1.8, marginBottom:18, whiteSpace:"pre-wrap" }}>
              {failMsg}
            </div>
          )}
          <div style={{ display:"flex", gap:12 }}>
            <button onClick={onChangeConfig}   style={{ padding:"9px 20px", background:T.primary, color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer" }}>🔑 更换令牌 / 升级套餐</button>
            <button onClick={onChangeTemplate} style={{ padding:"9px 20px", background:"transparent", color:T.text, border:`1px solid ${T.border}`, borderRadius:8, fontWeight:600, fontSize:13, cursor:"pointer" }}>↩ 更换兼容模板</button>
          </div>
        </div>
      )}

      {/* Terminal log */}
      <div className="card" style={{ padding:0, overflow:"hidden" }}>
        <div style={{ background:"#1a1f2e", padding:"10px 18px", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ display:"flex", gap:6 }}>
            {["#ff5f57","#ffbd2e","#28c840"].map(c => <div key={c} style={{ width:12, height:12, borderRadius:"50%", background:c }} />)}
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:failed ? "#f87171" : "#4ade80", marginLeft:6 }}>
            实时日志
            {!failed && step < 5 && <span style={{ animation:"pulse 1s infinite", display:"inline-block", marginLeft:6 }}>●</span>}
          </span>
        </div>
        <div ref={logEl} style={{ background:T.term, padding:"14px 20px", height:340, overflowY:"auto", fontFamily:'"SF Mono","Fira Code",Consolas,monospace', fontSize:12, lineHeight:1.65 }}>
          {logs.map(l => l.text === "" ? (
            <div key={l.id} style={{ height:8 }} />
          ) : (
            <div key={l.id} style={{ display:"flex", gap:12, marginBottom:2 }}>
              <span style={{ color:"#3a4455", flexShrink:0, userSelect:"none" }}>{l.ts}</span>
              <span style={{ color:lc(l.type) }}>{l.text}</span>
            </div>
          ))}
          {!failed && step < 5 && (
            <span style={{ color:T.primary, animation:"blink 1s step-end infinite" }}>█</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAGE: COMPLETE — One-Time Secret Display
//
// The password returned by the backend is shown exactly once.
// After the user clicks the acknowledgment button:
//   1. The password and username are wiped from React state.
//   2. The clipboard is cleared as a precaution.
//   3. localStorage and sessionStorage are cleared of any
//      credential keys that may have been written elsewhere.
//   4. Subsequent renders show a "cleared" placeholder instead
//      of the original value, preventing accidental disclosure.
// ═══════════════════════════════════════════════════════════

function CompletePage({ result:initialResult, tpl }) {
  /** displayResult holds the mutable copy — sensitive fields are
   *  nulled out after acknowledgment. */
  const [displayResult, setDisplayResult] = useState(initialResult);
  const [acknowledged,  setAcknowledged]  = useState(false);
  const [copied,        setCopied]        = useState("");

  const cp = (value, key) => {
    if (acknowledged && (key === "pwd" || key === "usr")) return; // cleared fields cannot be copied
    try { navigator.clipboard.writeText(value); } catch (_) {}
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  };

  /** Wipe sensitive credentials from all client-side storage and React state. */
  const handleAcknowledge = () => {
    // 1. Wipe from React state
    setDisplayResult(prev => ({
      ...prev,
      password: null,
      username: null,
    }));

    // 2. Clear any clipboard content for safety
    try { navigator.clipboard.writeText(""); } catch (_) {}

    // 3. Remove any credential keys from browser storage
    //    (defensive — the panel does not intentionally write to storage)
    const credsKeys = ["deploy_result", "deploy_password", "deploy_username", "credentials"];
    credsKeys.forEach(k => {
      try { localStorage.removeItem(k);   } catch (_) {}
      try { sessionStorage.removeItem(k); } catch (_) {}
    });

    setAcknowledged(true);
  };

  const r = displayResult;

  const clearedLabel = (
    <span style={{ color:T.muted, fontStyle:"italic", fontSize:13 }}>
      已从内存清除 — 请查阅您的保存记录
    </span>
  );

  return (
    <div className="rise" style={{ maxWidth:660, margin:"0 auto", padding:"40px 24px" }}>
      <div style={{ borderRadius:14, overflow:"hidden", boxShadow:"0 10px 36px rgba(0,0,0,.12)" }}>

        {/* Success header */}
        <div style={{ background:"linear-gradient(135deg,#2d7d5a,#38a169)", padding:"30px 28px", textAlign:"center" }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#fff", letterSpacing:"-.3px", marginBottom:8 }}>
            您的网站已一键部署成功！
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.75)", display:"flex", alignItems:"center", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
            <span>任务 ID：</span>
            <code style={{ background:"rgba(0,0,0,.22)", padding:"1px 10px", borderRadius:4 }}>{r.repoName}</code>
            <button onClick={() => cp(r.repoName, "rid")} style={{ fontSize:11, color:copied==="rid"?"#86efac":"rgba(255,255,255,.7)", background:"none", border:"none", cursor:"pointer" }}>
              {copied === "rid" ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div style={{ background:T.card, padding:28 }}>

          {/* ── One-time warning banner (hidden after acknowledgment) ── */}
          {!acknowledged && (
            <div style={{ background:"#fff1f2", border:"2px solid #ef4444", borderRadius:10, padding:"16px 20px", marginBottom:20 }}>
              <div style={{ fontWeight:800, fontSize:14, color:"#dc2626", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
                🔴 One-Time Display — Save These Credentials Now
              </div>
              <p style={{ fontSize:13, color:"#7f1d1d", lineHeight:1.75, margin:0 }}>
                These credentials are displayed <strong>exactly once</strong>. They have already been removed from the server.
                Once you click the button below, they <strong>cannot be recovered</strong> under any circumstances.
                Save them to a password manager or a secure location before continuing.
              </p>
            </div>
          )}

          {/* ── Acknowledgment success banner ── */}
          {acknowledged && (
            <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:9, padding:"14px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#15803d" }}>
              <span style={{ fontSize:18 }}>✅</span>
              Credentials cleared from browser memory. Keep your saved copy safe.
            </div>
          )}

          <div style={{ textAlign:"center", color:T.muted, fontSize:12, marginBottom:16 }}>
            请妥善记录以下全部信息，建议复制保存或截图留存。
          </div>

          {/* Website info table */}
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${T.border}` }}>🌐 网站信息</div>
          <div style={{ border:`1px solid ${T.border}`, borderRadius:8, overflow:"hidden", marginBottom:20 }}>
            <InfoRow label="网站地址" index={0}>
              <a href={r.frontendUrl} target="_blank" rel="noreferrer" style={{ color:T.primary, wordBreak:"break-all" }}>{r.frontendUrl}</a>
              <CopyBtn onClick={() => cp(r.frontendUrl, "url")} copied={copied === "url"} />
            </InfoRow>
            <InfoRow label="网站名称" index={1}>
              <span style={{ fontSize:13 }}>{tpl?.name}</span>
            </InfoRow>
            <InfoRow label="访问域名" index={2}>
              <span style={{ fontSize:13, fontFamily:"monospace" }}>{r.domain}</span>
              <CopyBtn onClick={() => cp(r.domain, "dom")} copied={copied === "dom"} />
            </InfoRow>
          </div>

          {/* Credentials table */}
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${T.border}` }}>🔐 管理员凭证</div>
          <div style={{ border:`1px solid ${T.border}`, borderRadius:8, overflow:"hidden", marginBottom:20 }}>
            <InfoRow label="登录账号" index={0}>
              {acknowledged ? clearedLabel : (
                <>
                  <span style={{ fontSize:13, fontFamily:"monospace" }}>{r.username}</span>
                  <CopyBtn onClick={() => cp(r.username || "", "usr")} copied={copied === "usr"} />
                </>
              )}
            </InfoRow>
            <InfoRow label="登录密码" index={1} highlight={!acknowledged}>
              {acknowledged ? clearedLabel : (
                <>
                  <span style={{ fontSize:13, fontFamily:"monospace", letterSpacing:".5px" }}>{r.password}</span>
                  <CopyBtn onClick={() => cp(r.password || "", "pwd")} copied={copied === "pwd"} />
                </>
              )}
            </InfoRow>
          </div>

          {/* Acknowledgment button */}
          {!acknowledged && (
            <button
              onClick={handleAcknowledge}
              style={{ width:"100%", padding:"14px", fontSize:14, fontWeight:800, background:"#ef4444", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", marginBottom:20, letterSpacing:"-.2px" }}
            >
              🔐 I Have Saved All Credentials — Clear from Memory
            </button>
          )}

          {/* Security note */}
          <div style={{ background:T.successBg, border:"1px solid #b7eb8f", borderRadius:9, padding:"12px 16px", fontSize:13, color:"#2d6a4f", lineHeight:1.7, marginBottom:24 }}>
            🔒 安全建议：请立即前往云平台控制台撤销用于部署的 API 令牌，并登录网站后台修改默认密码。
          </div>

          {/* Action buttons */}
          <div style={{ display:"flex", gap:12 }}>
            <a href={r.frontendUrl} target="_blank" rel="noreferrer" style={{ flex:1 }}>
              <button style={{ width:"100%", padding:"13px", fontSize:15, fontWeight:700, background:T.primary, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>
                🌐 立即访问网站
              </button>
            </a>
            <button
              onClick={() => {
                if (!acknowledged) {
                  const ok = window.confirm("Have you saved all credentials? They cannot be retrieved again once you leave this page.");
                  if (!ok) return;
                  handleAcknowledge();
                }
                window.close();
              }}
              style={{ flex:1, padding:"13px", fontSize:15, fontWeight:700, background:"#52c41a", color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}
            >
              ✅ 已保存，关闭页面
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════

function SectionHead({ icon, title }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:16, paddingBottom:11, borderBottom:`2px solid ${T.pink}22` }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <span style={{ fontWeight:800, fontSize:15, color:T.pink }}>{title}</span>
    </div>
  );
}

function Field({ id, label, type, placeholder, value, onChange }) {
  return (
    <div>
      <label htmlFor={id} style={{ fontSize:12, color:T.muted, display:"block", marginBottom:5, fontWeight:500 }}>{label}</label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width:"100%", padding:"9px 12px", border:`1px solid ${T.border}`, borderRadius:7, fontSize:13, color:T.text, background:"#f8fafc", transition:"all .18s" }}
      />
    </div>
  );
}

function Btn({ children, onClick, disabled, variant }) {
  const base = { padding:"8px 18px", fontSize:13, fontWeight:600, borderRadius:7, border:"none", cursor:disabled ? "not-allowed" : "pointer", display:"inline-flex", alignItems:"center", opacity:disabled ? .5 : 1, transition:"all .18s", fontFamily:"inherit" };
  if (variant === "outline") return <button onClick={!disabled ? onClick : undefined} style={{ ...base, background:"transparent", border:`1px solid ${T.border}`, color:T.text }}>{children}</button>;
  if (variant === "ghost")   return <button onClick={onClick}                         style={{ ...base, background:"transparent", border:`1px solid ${T.border}`, color:T.muted }}>{children}</button>;
  return <button onClick={!disabled ? onClick : undefined} style={{ ...base, background:T.primary, color:"#fff" }}>{children}</button>;
}

function StepDot({ i, label, cur, failed }) {
  const done   = i < cur;
  const active = i === cur;
  const fail   = failed && active;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
      <div style={{ width:40, height:40, borderRadius:"50%", flexShrink:0, background:fail ? T.danger : done ? T.primary : active ? "#fff" : "#edf1f7", border:`2.5px solid ${fail ? T.danger : done || active ? T.primary : T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:fail ? "#fff" : done ? "#fff" : active ? T.primary : T.muted, boxShadow:active && !fail ? `0 0 0 5px ${T.primary}22` : "none", transition:"all .35s ease" }}>
        {fail ? "✗" : done ? "✓" : i + 1}
      </div>
      <span style={{ fontSize:11, fontWeight:active ? 700 : 400, color:active ? T.primary : done ? T.text : T.muted, whiteSpace:"nowrap" }}>{label}</span>
    </div>
  );
}

function InfoRow({ label, children, index, highlight }) {
  return (
    <div style={{ display:"flex", alignItems:"center", padding:"10px 16px", background:highlight ? "#fff9f9" : index % 2 === 0 ? "#fff" : "#f8fafc", borderBottom:`1px solid ${T.border}` }}>
      <span style={{ width:90, fontSize:13, color:T.muted, flexShrink:0 }}>{label}</span>
      <span style={{ flex:1, display:"flex", alignItems:"center", gap:8, wordBreak:"break-all" }}>
        {children}
      </span>
    </div>
  );
}

function CopyBtn({ onClick, copied }) {
  return (
    <button
      onClick={onClick}
      style={{ fontSize:12, color:copied ? T.success : T.primary, background:"none", border:"none", cursor:"pointer", padding:"2px 10px", flexShrink:0, fontFamily:"inherit", whiteSpace:"nowrap" }}
    >
      {copied ? "✓ Copied" : "复制"}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/** Return the current HH:MM:SS timestamp string. */
function ts() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, "0")).join(":");
}
