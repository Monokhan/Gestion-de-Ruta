(()=>{'use strict';
/* ===================== CONFIG ===================== */
const CFG={kmMin:0,kmMax:219.5,zMin:1,zMax:10,textMin:.7,textMax:2.2,tourZoom:2.6};
const COLORS={'Troncal':'#0084ff','Enlace':'#17c964','Pasarela':'#94a3b8','PMV':'#f5a524','Peaje lateral':'#06b6d4','Noche':'#7c3aed','Día':'#f31260'};
const INFRA=['Troncal','Enlace','Pasarela','PMV','Peaje lateral'],WORKS=[{name:'Noche',emoji:'🌙'},{name:'Día',emoji:'☀️'}],ALL=[...INFRA,...WORKS.map(w=>w.name)];
const data=Object.fromEntries(ALL.map(k=>[k,[]])),visible=Object.fromEntries(ALL.map(k=>[k,true]));

/* ===================== STATE ===================== */
const S={markScale:1};
let pinned=null, activeTooltipWork=null, tourAnim=null, tourOn=false, tourStarted=false, tourKm=null, lastLogHour=null, hintTimer=null, flowClickAt=0;
const $=id=>document.getElementById(id);
const tooltip=$('tooltip');
let map=null; const LAYERS={};

/* ===================== UTIL ===================== */
function txt(v){return String(v??'').trim()}
function normWord(v){return txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()}
function norm(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase()}
function clean(v){return String(v??'').replace(/_x000D_/g,'').trim()}
function clamp(v,a,b){return Math.min(b,Math.max(a,v))}
function esc(v){return String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function fmtKm(k){return Number(k).toLocaleString('es-CL',{maximumFractionDigits:3})}
function num(v){if(typeof v==='number')return Number.isFinite(v)?v:NaN;let s=String(v??'').trim().toUpperCase().replace(/KM/g,'').replace(/\s/g,'');let m=s.match(/(-?\d+(?:[\.,]\d+)?)\+(\d{1,3})/);if(m)return parseFloat(m[1].replace(',','.'))+parseFloat(m[2].padEnd(3,'0'))/1000;s=s.replace(',','.').replace(/[^0-9.\-]/g,'');let p=s.split('.');if(p.length>2)s=p[0]+'.'+p.slice(1).join('');let n=parseFloat(s);return Number.isFinite(n)?n:NaN}
function validKm(k){return Number.isFinite(k)&&k>=CFG.kmMin&&k<=CFG.kmMax}
function routeOf(v){let s=norm(v);if(s.includes('ASS')||s.includes('ACCESO SUR')||s.includes('TUNEL'))return'ASS';return'R5'}
function pad(n){return String(n).padStart(2,'0')}
function fmtHora(v){if(v==null||v==='')return'';if(v instanceof Date&&!isNaN(v))return pad(v.getHours())+':'+pad(v.getMinutes());if(typeof v==='number'&&Number.isFinite(v))return serialHora(v);let s=String(v).trim(),m=s.match(/(?:\d{1,2}\/\d{1,2}\/\d{2,4}\s+)?(\d{1,2}):(\d{2})(?::\d{2})?/);if(m)return pad(m[1])+':'+m[2];let n=Number(s.replace(',','.'));return Number.isFinite(n)?serialHora(n):s}
function serialHora(n){let f=((n%1)+1)%1,tm=Math.round(f*24*60),h=Math.floor(tm/60)%24,m=tm%60;return pad(h)+':'+pad(m)}
function dateVal(v){if(v instanceof Date&&!isNaN(v))return v.getTime();if(typeof v==='number'&&Number.isFinite(v))return (v-25569)*86400000;let s=clean(v);if(!s)return NaN;let m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);if(m){let d=+m[1],mo=+m[2]-1,y=+m[3];if(y<100)y+=2000;return new Date(y,mo,d).getTime()}let t=Date.parse(s);return Number.isFinite(t)?t:NaN}
function fmtFecha(t){if(!Number.isFinite(t))return'';let d=new Date(t);return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`}
function formatDateTimeNow(d=new Date()){return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`}
function kmBounds(a,b){let k1=num(a),k2=num(b);if(!Number.isFinite(k1)&&!Number.isFinite(k2))return{ini:NaN,fin:NaN,min:NaN,max:NaN};if(!Number.isFinite(k1))k1=k2;if(!Number.isFinite(k2))k2=k1;return{ini:k1,fin:k2,min:Math.min(k1,k2),max:Math.max(k1,k2)}}

/* ===================== DOMINIO: curvas, clima, esquemas ===================== */
const EVAL_STATE={OK:'Aprobado',CHECK:'Confirmar con Centro de Control',NO:'Rechazado'};
const CURVES={R5:[{ini:45.2,fin:45.48},{ini:48.35,fin:48.8},{ini:49,fin:49.4},{ini:52.9,fin:53.8},{ini:54.8,fin:56.05},{ini:63.4,fin:64.05},{ini:68.6,fin:69.72},{ini:73.5,fin:74.3},{ini:77.6,fin:78.15},{ini:94.55,fin:95.15},{ini:100.3,fin:100.8},{ini:116.18,fin:116.54},{ini:123.2,fin:123.5},{ini:123.85,fin:124.1},{ini:130.1,fin:130.3},{ini:133,fin:133.2},{ini:135.05,fin:135.4},{ini:136.7,fin:137.15},{ini:140,fin:140.65},{ini:145.85,fin:146.25},{ini:155.75,fin:156.05},{ini:163,fin:163.3},{ini:165.7,fin:166},{ini:167.7,fin:168},{ini:176.6,fin:176.9},{ini:179.6,fin:179.9},{ini:186.65,fin:186.95},{ini:190.6,fin:190.85},{ini:192.9,fin:193.3},{ini:194.3,fin:194.6},{ini:196.1,fin:196.35},{ini:199,fin:199.3},{ini:209.15,fin:209.5},{ini:214.45,fin:214.65},{ini:215.75,fin:216.3},{ini:217.45,fin:217.9}],ASS:[{ini:9.65,fin:10.8},{ini:15.4,fin:16.6},{ini:17.7,fin:18.6},{ini:44.9,fin:45.3}]};
const REGION_POINTS=[{name:'Acceso Sur',lat:-33.58,lon:-70.69},{name:'Paine',lat:-33.81,lon:-70.74},{name:'Buin',lat:-33.73,lon:-70.74},{name:'Angostura',lat:-34.07,lon:-70.72},{name:'Mostazal',lat:-33.98,lon:-70.72},{name:'Bypass Rancagua (km 85)',lat:-34.17,lon:-70.76},{name:'Requínoa',lat:-34.28,lon:-70.81},{name:'Pelequén',lat:-34.49,lon:-71.11},{name:'San Fernando',lat:-34.58,lon:-70.99},{name:'Tinguiririca',lat:-34.71,lon:-71.02},{name:'Chimbarongo',lat:-34.72,lon:-71.04},{name:'Quinta',lat:-34.86,lon:-71.11},{name:'Teno',lat:-34.87,lon:-71.17},{name:'Romeral',lat:-34.98,lon:-71.13},{name:'Curicó',lat:-34.98,lon:-71.24},{name:'Lontué',lat:-35.08,lon:-71.29},{name:'Molina',lat:-35.12,lon:-71.28},{name:'Itahue',lat:-35.22,lon:-71.32},{name:'Rio claro',lat:-35.27,lon:-71.32}];
const ROUTE_ANCHORS_GEO={R5:[{km:29,lat:-33.612,lon:-70.742},{km:43.5,lat:-33.533,lon:-70.690},{km:60,lat:-33.720,lon:-70.733},{km:80,lat:-33.912,lon:-70.713},{km:100,lat:-34.098,lon:-70.742},{km:120,lat:-34.274,lon:-70.832},{km:140,lat:-34.430,lon:-70.900},{km:160,lat:-34.610,lon:-71.010},{km:180,lat:-34.845,lon:-71.160},{km:200,lat:-35.122,lon:-71.345},{km:219,lat:-35.430,lon:-71.665}],ASS:[{km:0,lat:-33.617,lon:-70.705},{km:5,lat:-33.605,lon:-70.700},{km:10,lat:-33.592,lon:-70.698},{km:15,lat:-33.575,lon:-70.696},{km:20,lat:-33.562,lon:-70.695},{km:25,lat:-33.552,lon:-70.694},{km:30,lat:-33.545,lon:-70.692},{km:35,lat:-33.539,lon:-70.691},{km:40,lat:-33.535,lon:-70.690},{km:43.5,lat:-33.533,lon:-70.690}]};
const WEATHER_TEXT={0:'Despejado',1:'Mayormente despejado',2:'Parcialmente nublado',3:'Nublado',45:'Neblina',48:'Neblina con escarcha',51:'Llovizna ligera',53:'Llovizna',55:'Llovizna intensa',56:'Llovizna helada ligera',57:'Llovizna helada',61:'Lluvia ligera',63:'Lluvia',65:'Lluvia intensa',66:'Lluvia helada ligera',67:'Lluvia helada',71:'Nieve ligera',73:'Nieve',75:'Nieve intensa',77:'Granizo de nieve',80:'Chubascos ligeros',81:'Chubascos',82:'Chubascos intensos',85:'Chubascos de nieve ligeros',86:'Chubascos de nieve intensos',95:'Tormenta',96:'Tormenta con granizo leve',99:'Tormenta con granizo'};
const WEATHER={stepKm:5,ttlMs:10*60*1000,cache:new Map(),pending:new Map(),tipSeq:0};
function weatherBin(km){return Math.round(Number(km)/WEATHER.stepKm)*WEATHER.stepKm}
function interpolateGeo(points,km){if(!points?.length)return{lat:-33.45,lon:-70.66};if(km<=points[0].km)return{lat:points[0].lat,lon:points[0].lon};for(let i=1;i<points.length;i++){let a=points[i-1],b=points[i];if(km<=b.km){let t=(km-a.km)/Math.max(.0001,b.km-a.km);return{lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t}}}let last=points[points.length-1];return{lat:last.lat,lon:last.lon}}
function approxCoordsForKm(route,km){return geoAt(route,weatherBin(km))}
function weatherLabel(code,isDay){return WEATHER_TEXT[code]||(isDay?'Condiciones variables':'Condiciones nocturnas')}
async function fetchWeather(route,km){const lw=nearestLiveWeather(route,km);if(lw&&LIVE.weather.at&&Date.now()-LIVE.weather.at<2*WEATHER.ttlMs)return `${weatherLabel(lw.cur.weather_code,lw.cur.is_day===1)} · ${Math.round(lw.cur.temperature_2m)}°C · viento ${Math.round(lw.cur.wind_speed_10m)} km/h`;let {lat,lon}=approxCoordsForKm(route,km);return fetchWeatherAt(lat,lon,`${route}|${weatherBin(km)}`)}
function fetchWeatherAt(lat,lon,key){let now=Date.now(),cached=WEATHER.cache.get(key);if(cached&&now-cached.ts<WEATHER.ttlMs)return Promise.resolve(cached.value);if(WEATHER.pending.has(key))return WEATHER.pending.get(key);let url1=`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,wind_speed_10m,weather_code,is_day&timezone=auto&forecast_days=1`;let url2=`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current_weather=true&timezone=auto`;let parse=(j)=>{let c=j?.current;if(c&&Number.isFinite(Number(c.temperature_2m)))return `${weatherLabel(c.weather_code,c.is_day===1)} · ${Math.round(Number(c.temperature_2m))}°C · viento ${Math.round(Number(c.wind_speed_10m))} km/h`;let cw=j?.current_weather;if(cw&&Number.isFinite(Number(cw.temperature)))return `${weatherLabel(cw.weathercode,true)} · ${Math.round(Number(cw.temperature))}°C · viento ${Math.round(Number(cw.windspeed))} km/h`;throw new Error('weather')};let p=fetch(url1).then(r=>{if(!r.ok)throw new Error('weather');return r.json()}).then(parse).catch(()=>fetch(url2).then(r=>{if(!r.ok)throw new Error('weather');return r.json()}).then(parse)).then(t=>{WEATHER.cache.set(key,{ts:Date.now(),value:t});return t}).catch(()=>{let t='Clima no disponible';WEATHER.cache.set(key,{ts:Date.now(),value:t});return t}).finally(()=>WEATHER.pending.delete(key));WEATHER.pending.set(key,p);return p}
function renderRegionWeather(){let wrap=$('weatherList');if(!wrap)return;const pts=(window.LIVE&&LIVE.weather.pts)||[];if(!pts.length){wrap.innerHTML='<div class="small">Cargando clima por sector…</div>';if(window.refreshWeatherLayer)refreshWeatherLayer();return}wrap.innerHTML=pts.map(p=>`<div class="weatherItem" data-route="${p.route}" data-km="${p.km}" style="cursor:pointer"><div><div class="weatherName">${esc(p.name)}</div><div class="small">${p.route} km ${fmtKm(p.km)}</div></div><div class="weatherVal">${p.eval.icon} ${Math.round(p.cur.temperature_2m)}°C<div class="small">${esc(p.eval.state)}</div></div></div>`).join('');wrap.querySelectorAll('.weatherItem').forEach(el=>el.onclick=()=>focusKm(el.dataset.route,+el.dataset.km))}
function classifyWeather(text){let s=normWord(text);if(!s)return{state:EVAL_STATE.CHECK,weatherIcon:'⛅️',label:'Clima no disponible'};if(/NIEVE|GRANIZO/.test(s))return{state:EVAL_STATE.NO,weatherIcon:'🌨️',label:txt(text)};if(/LLUVIA|CHUBASCOS|LLOVIZNA|TORMENTA/.test(s))return{state:EVAL_STATE.NO,weatherIcon:'🌧️',label:txt(text)};if(/NEBLINA/.test(s))return{state:EVAL_STATE.CHECK,weatherIcon:'🌫️',label:txt(text)};if(/PARCIALMENTE NUBLADO|MAYORMENTE DESPEJADO/.test(s))return{state:EVAL_STATE.OK,weatherIcon:'⛅️',label:txt(text)};if(/NUBLADO/.test(s))return{state:EVAL_STATE.OK,weatherIcon:'☁️',label:txt(text)};if(/DESPEJADO/.test(s))return{state:EVAL_STATE.OK,weatherIcon:'☀️',label:txt(text)};return{state:EVAL_STATE.CHECK,weatherIcon:'⛅️',label:txt(text)}}
function parseTrackInfo(raw){let s=normWord(raw).replace(/\s+/g,' '),lanes=[...new Set((s.match(/PISTA\s*[1-6]|(?<!\d)[1-6](?!\d)/g)||[]).map(x=>Number(String(x).replace(/\D/g,''))).filter(Boolean))];let flags={berma:/\bBERMA\b/.test(s),mediana:/\bMEDIANA\b/.test(s),cs:/\bC\.?S\b|CALLE DE SERVICIO/.test(s),faja:/\bFAJA\b/.test(s),enlace:/\bENLACE\b/.test(s),peaje:/\bPEAJE/.test(s),incorporacion:/INCORPORACION/.test(s),descanso:/AREA DE DESCANSO/.test(s)};let recognized=lanes.length+Object.values(flags).filter(Boolean).length;return{raw:txt(raw),lanes,flags,recognized,hasMultipleLanes:lanes.length>1,unknown:!txt(raw)||recognized===0}}
function inferScheme(trackInfo,route,kmMin,kmMax){if(trackInfo.flags.berma)return'Esquema trabajos en berma 8.4.1';if(trackInfo.flags.mediana)return'Trabajos en mediana 8.5.2';if(trackInfo.flags.cs)return'Esquema de angostamiento de pistas bidireccional 8.4.10 Calle de Servicio';if(trackInfo.flags.faja)return'Esquema de señalización 8.4.12';if(trackInfo.flags.enlace||trackInfo.flags.peaje||trackInfo.flags.incorporacion||trackInfo.flags.descanso)return'Confirmar esquema específico';if(trackInfo.lanes.length===1){let lane=trackInfo.lanes[0],special=normWord(route)==='R5'&&kmMax>=45&&kmMin<=70&&(lane===3||lane===4);return special?'Esquema de angostamiento de dos pistas 8.4.4':'Esquema de angostamiento de pistas 8.4.6'}if(trackInfo.lanes.length>1)return'Confirmar con Centro de Control';return'Revisar esquema'}
function stateIcon(state){return state===EVAL_STATE.OK?'✅':state===EVAL_STATE.NO?'⛔️':'⚠️'}
function evaluateWorkLogicalMatrix(work,ctx={}){let t=parseTrackInfo(work.pistas||work.pista),k=kmBounds(work.kmInicial,work.kmFinal),weather=classifyWeather(ctx.weather||'');let estado=weather.state,obs=[];if(t.hasMultipleLanes)obs.push('Más de una pista informada');if(t.unknown)obs.push('Pista o zona no identificada');if(ctx.curva?.inside)obs.push('Trabajo dentro de curva');if(obs.length&&estado!==EVAL_STATE.NO)estado=EVAL_STATE.CHECK;return{estado,esquemaSugerido:inferScheme(t,work.route||work.ruta,k.min,k.max),weather,observaciones:obs}}
window.LOGIC_MATRIX={CURVES,REGION_POINTS}; window.evaluateWorkLogicalMatrix=evaluateWorkLogicalMatrix;

/* ===================== LOG / ESTADOS ===================== */
const LOG_STORE={entries:[],changes:[]};
function getWorkKey(w){return `${w.route||w.ruta}|${w.trabajo||w.nombre}|${w.kmInicial}|${w.kmFinal}`}
function getCurrentTrackedWorks(){let map=new Map();[...data['Noche'],...data['Día']].forEach(w=>{if(w.estadoManual==='En ejecución'||w.estadoManual==='Terminado')map.set(getWorkKey(w),w)});return [...map.values()]}
function findWorkCollection(work){if(!work)return null;let cls=work.tipo||work.cls||'';if(cls&&data[cls])return data[cls];return work.horario==='Noche'?data['Noche']:data['Día']}
function deleteWork(work){let arr=findWorkCollection(work);if(!arr)return false;let idx=arr.indexOf(work);if(idx<0)return false;arr.splice(idx,1);if(activeTooltipWork===work)activeTooltipWork=null;if(pinned&&pinned.data===work)pinned=null;tooltip.style.display='none';renderLog();renderMarkers();return true}
function normalizeStateClass(state){return String(state||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-')}
function cycleWorkStatus(current){return current==='Programado'?'En ejecución':current==='En ejecución'?'Terminado':'Programado'}
function registerStateChange(work,prev,next){let now=formatDateTimeNow();LOG_STORE.changes.push({ruta:work.route||work.ruta,trabajo:work.trabajo||work.nombre,kmIni:work.kmInicial,kmFin:work.kmFinal,pista:work.pistas,sector:work.sector,inicioReal:work.horaInicioReal||'',terminoReal:work.horaTerminoReal||'',estado:next,momento:now});}
function toggleWorkState(work){if(!work)return '';let prev=work.estadoManual||'Programado';let next=cycleWorkStatus(prev);work.estadoManual=next;if(next==='En ejecución'&&!work.horaInicioReal)work.horaInicioReal=formatDateTimeNow();if(prev==='En ejecución'&&next!=='En ejecución')work.horaTerminoReal=formatDateTimeNow();registerStateChange(work,prev,next);persistWorkState(work);renderLog();renderMarkers();return next}
function snapshotLog(reason='auto'){let hourKey=new Date().getFullYear()+'-'+(new Date().getMonth()+1)+'-'+new Date().getDate()+' '+new Date().getHours();if(reason==='auto'&&lastLogHour===hourKey)return;lastLogHour=hourKey;[...data['Noche'],...data['Día']].forEach(w=>LOG_STORE.entries.push({ruta:w.route||w.ruta,trabajo:w.trabajo||w.nombre,kmIni:w.kmInicial,kmFin:w.kmFinal,pista:w.pistas,sector:w.sector,inicioReal:w.horaInicioReal||'',terminoReal:w.horaTerminoReal||'',estado:w.estadoManual||'Programado',logHora:formatDateTimeNow()}));renderLog()}
function renderLog(){let body=document.querySelector('#logTable tbody');if(!body)return;let rows=getCurrentTrackedWorks();body.innerHTML=rows.map(r=>`<tr><td>${esc(r.route||r.ruta)}</td><td>${esc(r.trabajo||r.nombre)}</td><td>${esc(r.kmInicial)}</td><td>${esc(r.kmFinal)}</td><td>${esc(r.pistas)}</td><td>${esc(r.sector)}</td><td>${esc(r.horaInicioReal||'')}</td><td>${esc(r.estadoManual==='Terminado'?(r.horaTerminoReal||''):'')}</td><td>${esc(r.estadoManual)}</td></tr>`).join('');let meta=$('logMeta');if(meta)meta.textContent=`${rows.length} registros`;}

/* ===================== CARGA XLSX (lógica original intacta) ===================== */
async function wbFromFile(f){let buf=await f.arrayBuffer();return XLSX.read(buf,{type:'array',cellDates:true})}
function rowsOf(wb,sh){return XLSX.utils.sheet_to_json(wb.Sheets[sh],{header:1,defval:'',blankrows:false})}
async function loadClasses(f){try{let wb=await wbFromFile(f),total=0;INFRA.forEach(c=>data[c]=[]);wb.SheetNames.forEach(sh=>{let cls=INFRA.find(c=>norm(c)==norm(sh));if(!cls)return;rowsOf(wb,sh).slice(1).forEach(r=>{let nombre=clean(r[0]),km=num(r[1]),ruta=clean(r[2]),route=routeOf(ruta);if(nombre&&validKm(km)){data[cls].push({nombre,km,ruta,route});total++}})});fileState('btnClasses',total);renderMarkers();if(!total)alert('No se cargaron clases: revisa hojas, nombre y km.')}catch(e){alert('Error CLASES: '+e.message)}}
async function loadWorks(f){try{let wb=await wbFromFile(f),map={};wb.SheetNames.forEach(s=>map[norm(s)]=s);data.Noche=[];data['Día']=[];let diag=[],n=map.NOCHE?loadNight(rowsOf(wb,map.NOCHE),diag):0,d=map.DIA?loadDay(rowsOf(wb,map.DIA),diag):0;if(!map.NOCHE)diag.push('No se encontró hoja NOCHE.');if(!map.DIA)diag.push('No se encontró hoja DÍA/DIA.');calcularFechaPromedio();let total=n+d;fileState('btnWorks',total);SERVER.mode='manual';WF.date='';WF.touched=true;buildWorkDates();$('worksSrc').innerHTML='Carga manual: '+esc(f.name)+' (solo en este navegador)';$('histBannerTxt').textContent='Mostrando carga manual: '+f.name;$('histBanner').classList.add('on');renderMarkers();if(total)scheduleWeatherWarmup();if(!total)alert('No se cargaron trabajos.\n\n'+diag.join('\n'));else if(!d)alert('Se cargó NOCHE pero DÍA quedó en 0.\n\n'+diag.join('\n'))}catch(e){alert('Error TRABAJOS: '+e.message)}}
function calcularFechaPromedio(){let vals=[...data.Noche,...data['Día']].map(x=>dateVal(x.fecha)).filter(Number.isFinite);window.fechaPromedio=vals.length?fmtFecha(vals.reduce((a,b)=>a+b,0)/vals.length):'';let hint=$('topHint');if(hint)hint.textContent=window.fechaPromedio?`rueda = zoom · arrastrar = desplazar · fecha promedio: ${window.fechaPromedio}`:'rueda = zoom · arrastrar = desplazar · clic en un punto = detalle'}
function loadNight(rs,diag){let hdr=findHeader(rs,['TIPO DE TRABAJOS','CONTRATISTA','KM INICIAL','HORA INICIO','RESPONSABLE']);let cols=hdr?mapHeaders(rs[hdr.row]):{ruta:1,responsable:3,trabajo:4,contratista:5,kmInicial:6,kmFinal:7,longitud:8,pistas:9,calzada:10,sector:11,horario:12,horaInicio:13,horaFinal:14,fecha:15,observacion:16};let c=0,badKm=0,badName=0;rs.slice((hdr?.row??3)+1).forEach(r=>{let trabajo=clean(r[cols.trabajo]),k1=num(r[cols.kmInicial]),k2=num(r[cols.kmFinal]),km=(k1+k2)/2;if(!trabajo){badName++;return}if(!validKm(km)){badKm++;return}data.Noche.push(workObj('Noche',r,cols,trabajo,k1,k2,km));c++});diag.push(`Noche: ${c} cargados, ${badKm} con km inválido, ${badName} sin trabajo.`);return c}
function loadDay(rs,diag){let hdr=findHeader(rs,['TIPO DE TRABAJOS','CONTRATISTA','KM INICIAL','HORA INICIO','RESPONSABLE']);let cols,start;if(hdr){let panel=mapHeaders(rs[hdr.row],0),det=mapHeaders(rs[hdr.row],11);cols={...det,rutaPanel:panel.ruta,fechaPanel:panel.fecha};start=hdr.row+1}else{cols={rutaPanel:1,fechaPanel:2,ruta:1,fecha:2,trabajo:4,kmInicial:5,kmFinal:6,pistas:7,calzada:8,sector:9};start=4}let c=0,badKm=0,badName=0;rs.slice(start).forEach(r=>{let trabajo=clean(r[cols.trabajo]),k1=num(r[cols.kmInicial]),k2=num(r[cols.kmFinal]),km=(k1+k2)/2;if(!trabajo){badName++;return}if(!validKm(km)){badKm++;return}data['Día'].push(workObj('Día',r,cols,trabajo,k1,k2,km));c++});diag.push(`Día: ${c} cargados, ${badKm} con km inválido, ${badName} sin trabajo.`);return c}
function findHeader(rs,need){for(let i=0;i<Math.min(rs.length,12);i++){let line=rs[i].map(norm).join('|');if(need.every(n=>line.includes(n)))return{row:i}}return null}
function mapHeaders(row,preferFrom=0){let cols={};row.forEach((v,i)=>{let h=norm(v);if(!h||i<preferFrom)return;if(h.includes('RUTA'))cols.ruta??=i;else if(h.includes('FECHA'))cols.fecha??=i;else if(h.includes('RESPONSABLE'))cols.responsable=i;else if(h.includes('TIPO DE TRABAJOS')||h==='ACTIVIDAD')cols.trabajo??=i;else if(h.includes('CONTRATISTA'))cols.contratista=i;else if(h.includes('KM INICIAL'))cols.kmInicial??=i;else if(h.includes('KM FINAL'))cols.kmFinal??=i;else if(h.includes('LONGITUD'))cols.longitud=i;else if(h.includes('PISTA'))cols.pistas??=i;else if(h.includes('CALZADA'))cols.calzada=i;else if(h.includes('SECTOR'))cols.sector=i;else if(h.includes('HORARIO'))cols.horario=i;else if(h.includes('HORA INICIO'))cols.horaInicio=i;else if(h.includes('HORA FINAL'))cols.horaFinal=i;else if(h.includes('OBSERVACION'))cols.observacion=i});return cols}
function val(r,i){return i==null?'':clean(r[i])}
function hora(r,i){return i==null?'':fmtHora(r[i])}
function workObj(tipo,r,c,trabajo,k1,k2,km){let ruta=tipo==='Día'?(val(r,c.rutaPanel)||val(r,c.ruta)||val(r,1)):val(r,c.ruta);let route=routeOf(ruta);return{tipo,nombre:trabajo,trabajo,km,ruta,route,fecha:val(r,c.fecha)||val(r,c.fechaPanel),responsable:val(r,c.responsable),contratista:val(r,c.contratista),kmInicial:k1,kmFinal:k2,longitud:val(r,c.longitud),pistas:val(r,c.pistas),calzada:val(r,c.calzada),sector:val(r,c.sector),horario:val(r,c.horario),horaInicio:hora(r,c.horaInicio),horaFinal:hora(r,c.horaFinal),observacion:val(r,c.observacion),enEjecucion:false,estadoManual:'Programado',horaInicioReal:'',horaTerminoReal:''}}
function fileState(id,total){let el=$(id),b=el.querySelector('.badge'),ok=total>0;el.classList.toggle('ok',ok);b.classList.toggle('ok',ok);b.textContent=ok?`✅ ${total}`:'0'}

/* ===================== UBICACIÓN POR KM ===================== */
/* La troncal R5 de la concesión comienza en el PK 29,475 (hoja Sectores): PK "R5" menores corresponden al Acceso Sur. */
function placeKm(route,km){if(route==='R5'&&km<29.4)return{route:'ASS',km};return{route,km}}
function llAt(route,km){const p=placeKm(route,km);const g=geoAt(p.route,p.km);return[g.lat,g.lon]}
function routeLine(route,k0,k1){const g=route==='ASS'?GEO.ass:GEO.r5;const kmax=g.k0+g.step*(g.pts.length-1);const a=clamp(Math.min(k0,k1),g.k0,kmax),b=clamp(Math.max(k0,k1),g.k0,kmax);const out=[];const p0=geoAt(route,a);out.push([p0.lat,p0.lon]);for(let k=Math.ceil((a-g.k0)/g.step+1e-9)*g.step+g.k0;k<b-1e-9;k+=g.step){const p=geoAt(route,k);out.push([p.lat,p.lon])}const p1=geoAt(route,b);out.push([p1.lat,p1.lon]);return out}
function nearestRouteKm(lat,lon){let best={d:1e9};const kx=Math.cos(lat*Math.PI/180);[['R5',GEO.r5],['ASS',GEO.ass]].forEach(([r,g])=>g.pts.forEach((p,i)=>{const d=(p[0]-lat)**2+((p[1]-lon)*kx)**2;if(d<best.d)best={d,route:r,km:g.k0+i*g.step}}));best.distKm=Math.sqrt(best.d)*111.2;return best}

/* ===================== MARCADORES ===================== */
function getWorkVisualState(p){if(p.estadoManual==='En ejecución')return'en-ejecucion';if(p.estadoManual==='Terminado')return'terminado';return'programado'}
function mkIcon(html,cls=''){return L.divIcon({className:'lf-icon',html:`<div class="mk ${cls}">${html}</div>`,iconSize:[0,0],iconAnchor:[0,0]})}
function bindTip(m,getHit){m.on('mouseover',e=>{if(!pinned)showTipAt(e.originalEvent,getHit())});m.on('mousemove',e=>{if(!pinned)positionTooltip(e.originalEvent)});m.on('mouseout',()=>{if(!pinned)tooltip.style.display='none'});m.on('click',e=>{L.DomEvent.stopPropagation(e);const hit=getHit();pinned=hit;showTipAt(e.originalEvent,hit)})}
function renderMarkers(){
  if(!map)return;
  LAYERS.markers.clearLayers(); LAYERS.extents.clearLayers();
  ALL.forEach(cls=>{
    if(!visible[cls]) return;
    const isWork = cls==='Noche'||cls==='Día';
    (data[cls]||[]).forEach(item=>{
      if(isWork&&WF.date&&item.fechaISO&&item.fechaISO!==WF.date) return;
      if(isWork){ /* tramo intervenido (km inicial → km final) dibujado sobre la ruta */
        const kb=kmBounds(item.kmInicial,item.kmFinal);
        if(Number.isFinite(kb.min)&&kb.max-kb.min>=0.05){const a=placeKm(item.route,kb.min),b=placeKm(item.route,kb.max);
          if(a.route===b.route)L.polyline(routeLine(a.route,a.km,b.km),{pane:'worksPane',color:COLORS[cls],weight:20,opacity:item.estadoManual==='Terminado'?.15:.32,lineCap:'butt',interactive:false}).addTo(LAYERS.extents)}
      }
      const html=`<div class="dot" style="background:${COLORS[cls]}">${isWork?(item.tipo==='Noche'?'🌙':'☀️'):''}</div>`;
      const m=L.marker(llAt(item.route,item.km),{icon:mkIcon(html,isWork?'work state-'+normalizeStateClass(item.estadoManual):''),riseOnHover:true,keyboard:false,zIndexOffset:isWork?500:0});
      bindTip(m,()=>({type:isWork?'work':'infra',cls,data:item}));
      m.addTo(LAYERS.markers);
    });
  });
  updateCounts(); renderLegend();
}
function setMarkScale(v){S.markScale=clamp(v,CFG.textMin,CFG.textMax);$('map').style.setProperty('--ms',S.markScale)}
function updateCounts(){ ALL.forEach(cls=>{ const el=$('cnt_'+cls); if(el){ const n=(data[cls]||[]).length; el.textContent=n; el.classList.toggle('on',n>0); } }); }
function renderLegend(){
  const lg=$('legend'); if(!lg)return;
  lg.innerHTML = ALL.map(cls=>{
    const n=(data[cls]||[]).length;
    return `<span class="lg ${visible[cls]?'on':''}" data-cls="${cls}" style="cursor:pointer"><span class="dotSwatch" style="background:${COLORS[cls]}"></span>${cls}<b>${n}</b></span>`;
  }).join('') + `<span class="lg-sep"></span>` + [['incidents','🚨','Incidentes'],['traffic','🚗','Tráfico'],['weather','⛅','Clima'],['rivers','💧','Ríos']].map(([k,ic,n])=>`<span class="lg live ${LIVE.show[k]?'on':''}" data-live="${k}" style="cursor:pointer">${ic} ${n}</span>`).join('') + `<span class="lg-sep"></span><span id="kmReadout">km --</span>`;
  lg.querySelectorAll('.lg[data-cls]').forEach(el=>el.addEventListener('click',()=>{ const c=el.dataset.cls; visible[c]=!visible[c]; syncLayerRows(); renderMarkers(); }));
  lg.querySelectorAll('.lg[data-live]').forEach(el=>el.addEventListener('click',()=>setLiveShow(el.dataset.live,!LIVE.show[el.dataset.live])));
  updateKmReadout();
}
function syncLayerRows(){ document.querySelectorAll('.layer').forEach(el=>{ const c=el.dataset.cls; if(c) el.classList.toggle('active',visible[c]); }); }
function updateKmReadout(){ const el=$('kmReadout'); if(!el||!map) return; const c=map.getCenter(); const n=nearestRouteKm(c.lat,c.lng); el.textContent=n.distKm<4?`${n.route} km ${fmtKm(Math.round(n.km*2)/2)}`:'Vista general'; }

/* ===================== TOOLTIP ===================== */
function positionTooltip(e){ let m=14,w=tooltip.offsetWidth,hh=tooltip.offsetHeight,x=e.clientX+16,y=e.clientY+16; if(x+w+m>innerWidth)x=e.clientX-w-16; if(y+hh+m>innerHeight)y=e.clientY-hh-16; tooltip.style.left=Math.max(m,x)+'px'; tooltip.style.top=Math.max(m,y)+'px'; }
function tipInfra(h){let p=h.data;return`<div class="tt" style="color:${COLORS[h.cls]}">${h.cls} · ${p.route}</div><div class="grid"><div class="k">Nombre</div><div class="v"><b>${esc(p.nombre)}</b></div><div class="k">Km</div><div class="v">${fmtKm(p.km)}</div><div class="k">Clima</div><div class="v weatherValue">cargando…</div></div>`}
function tipWork(h){let p=h.data,items=[['Eje',p.route],['Responsable',p.responsable],['Pistas',p.pistas],['Trabajo',p.trabajo],['Contratista',p.contratista],['Km Inicial',fmtKm(p.kmInicial)],['Km Final',fmtKm(p.kmFinal)],['Longitud Segregación',p.longitud],['Calzada',p.calzada],['Sector',p.sector],['Hora Inicio',p.horaInicio],['Hora Final',p.horaFinal],['Observación',p.observacion],...liveWorkRows(p),['Estado',`<span class="stateText">calculando…</span>`],['Esquema sugerido',`<span class="schemeText">calculando…</span>`]];let stateCls=normalizeStateClass(p.estadoManual||'Programado');return`<div class="ttHead"><span class="ttIcon weatherTopEmoji">⛅️</span><span class="weatherText"></span><span class="ttIcon stateTopEmoji">⚠️</span><span class="stateLabel"></span><div class="ttTitle" style="color:${COLORS[h.cls]}">${h.cls} · ${p.route}</div></div><div class="execRow"><button type="button" class="execToggle state-${stateCls}" data-action="toggle-run">${p.estadoManual||'Programado'}</button><button type="button" class="execToggle" data-action="delete-work" style="background:rgba(220,38,38,.24);border-color:rgba(248,113,113,.7)">Eliminar</button></div><div class="grid">${items.map(([k,v])=>`<div class="k">${k}</div><div class="v">${String(v).includes('<span')?v:esc(v||'-')}</div>`).join('')}<div class="k">Clima</div><div class="v weatherValue">cargando…</div></div>`}
function showTipAt(e,h){ if(h?.type==='work') activeTooltipWork=h.data; tooltip.innerHTML=h.type==='work'?tipWork(h):tipInfra(h); tooltip.style.display='block'; positionTooltip(e); queueTooltipWeather(h); if(h.type==='work') applyTooltipEvaluation(h,''); }
function queueTooltipWeather(hit){let box=tooltip.querySelector('.weatherValue');if(!box||!hit?.data)return;let token=String(++WEATHER.tipSeq);box.dataset.token=token;let key=`${hit.data.route}|${weatherBin(hit.data.km)}`,cached=WEATHER.cache.get(key);let preload=cached?.value&&cached.value!=='Clima no disponible'?cached.value:'cargando…';box.textContent=preload;applyTooltipEvaluation(hit,preload==='cargando…'?'':preload);fetchWeather(hit.data.route,hit.data.km).then(t=>{let el=tooltip.querySelector('.weatherValue');if(el&&el.dataset.token===token)el.textContent=t;applyTooltipEvaluation(hit,t)})}
function applyTooltipEvaluation(hit,weatherText){if(!hit||hit.type!=='work')return;let insideCurve=(CURVES[hit.data.route]||[]).some(c=>Math.min(c.ini,c.fin)<=hit.data.km&&hit.data.km<=Math.max(c.ini,c.fin));let r=evaluateWorkLogicalMatrix(hit.data,{weather:weatherText,curva:{inside:insideCurve}});const lw=nearestLiveWeather(hit.data.route,hit.data.km);if(lw){if(lw.eval.state===EVAL_STATE.NO)r.estado=EVAL_STATE.NO;else if(lw.eval.state===EVAL_STATE.CHECK&&r.estado===EVAL_STATE.OK)r.estado=EVAL_STATE.CHECK}const nr=nearbyRivers(hit.data.route,hit.data.km).find(x=>x.level==='high'||x.level==='elev');if(nr&&r.estado===EVAL_STATE.OK)r.estado=EVAL_STATE.CHECK;{const pl=placeKm(hit.data.route,hit.data.km);if(r.estado===EVAL_STATE.OK&&INC.list.some(i=>i.route===pl.route&&i.relation==='ruta'&&SEVN[i.severity]>=2&&Math.abs(i.km-pl.km)<=2))r.estado=EVAL_STATE.CHECK}let wx=tooltip.querySelector('.weatherTopEmoji'),sx=tooltip.querySelector('.stateTopEmoji'),st=tooltip.querySelector('.stateText'),sc=tooltip.querySelector('.schemeText');if(wx)wx.textContent=r.weather.weatherIcon;let wt=tooltip.querySelector('.weatherText');if(wt)wt.textContent=' '+(r.weather.label||'');if(sx)sx.textContent=stateIcon(r.estado);if(st)st.textContent=r.estado;let sl=tooltip.querySelector('.stateLabel');if(sl)sl.textContent=' '+r.estado;if(sc)sc.textContent=r.esquemaSugerido||'-'}
function scheduleWeatherWarmup(){let seen=new Set(),jobs=[];['Noche','Día'].forEach(cls=>data[cls].forEach(p=>{let key=`${p.route}|${weatherBin(p.km)}`;if(!seen.has(key)){seen.add(key);jobs.push([p.route,p.km])}}));let i=0;function pump(deadline){let n=0;while(i<jobs.length&&n<3&&(!deadline||deadline.timeRemaining()>6)){let [route,km]=jobs[i++];fetchWeather(route,km);n++}if(i<jobs.length){if('requestIdleCallback' in window)requestIdleCallback(pump,{timeout:1200});else setTimeout(()=>pump(),120)}}if('requestIdleCallback' in window)requestIdleCallback(pump,{timeout:800});else setTimeout(()=>pump(),180)}

tooltip.addEventListener('pointerdown',e=>{let runBtn=e.target.closest('[data-action="toggle-run"]');let delBtn=e.target.closest('[data-action="delete-work"]');if(runBtn&&activeTooltipWork){e.preventDefault();e.stopPropagation();let next=toggleWorkState(activeTooltipWork);runBtn.className='execToggle state-'+normalizeStateClass(next);runBtn.textContent=next;return;}if(delBtn&&activeTooltipWork){e.preventDefault();e.stopPropagation();if(confirm('¿Eliminar este trabajo? Esta acción no se puede deshacer.')){deleteWork(activeTooltipWork);}return;}});
document.addEventListener('click',e=>{ if(Date.now()-flowClickAt<400) return; if(!tooltip.contains(e.target) && !e.target.closest('.mk')){ pinned=null; activeTooltipWork=null; tooltip.style.display='none'; } });

/* ===================== MAPA SATELITAL (Leaflet) ===================== */
const BASES={
  esri:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',opt:{maxNativeZoom:19,maxZoom:20,attribution:'Imágenes © Esri, Maxar, Earthstar Geographics y GIS User Community'}},
  ttsat:{key:true,url:'https://api.tomtom.com/map/1/tile/sat/main/{z}/{x}/{y}.jpg?key={k}',opt:{maxNativeZoom:19,maxZoom:20,attribution:'Imágenes © TomTom'}},
  ttmap:{key:true,url:'https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key={k}',opt:{maxNativeZoom:20,maxZoom:20,attribution:'Mapa © TomTom'}},
  ttnight:{key:true,url:'https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key={k}',opt:{maxNativeZoom:20,maxZoom:20,attribution:'Mapa © TomTom'}}
};
const LABELS_URL='https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
let baseLayer=null,labelsLayer=null,netLayer=null,routeBounds=null;
function ttTileKey(){const d=new Date();return 'tt_tiles_'+d.getFullYear()+'-'+pad(d.getMonth()+1)}
function ttTileCount(){LS.set(ttTileKey(),LS.get(ttTileKey(),0)+1)}
function setBase(id){
  if(!BASES[id]||(BASES[id].key&&!TT.key))id='esri';
  const B=BASES[id];if(baseLayer)map.removeLayer(baseLayer);
  baseLayer=L.tileLayer(B.url.replace('{k}',encodeURIComponent(TT.key)),B.opt);if(B.key)baseLayer.on('tileload',ttTileCount);baseLayer.addTo(map);LS.set('base',id);
  document.querySelectorAll('#baseSeg button').forEach(x=>{const need=!!BASES[x.dataset.base].key&&!TT.key;x.classList.toggle('on',x.dataset.base===id);x.disabled=need;x.title=need?'Requiere API key de TomTom (Tiempo real → Configuración)':''});
}
function setLabels(on){if(labelsLayer){map.removeLayer(labelsLayer);labelsLayer=null}if(on)labelsLayer=L.tileLayer(LABELS_URL,{pane:'labelsPane',maxNativeZoom:19,maxZoom:20}).addTo(map);LS.set('labels',!!on);$('chkLabels').checked=!!on}
function setNetFlow(on){
  if(netLayer){map.removeLayer(netLayer);netLayer=null}
  if(on&&TT.key){netLayer=L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(TT.key)}`,{pane:'netPane',maxZoom:20,maxNativeZoom:20,opacity:.9,attribution:'Tráfico © TomTom'});netLayer.on('tileload',ttTileCount);netLayer.addTo(map)}
  LS.set('netflow',!!on);$('chkNet').checked=!!(on&&TT.key);$('chkNet').disabled=!TT.key;$('chkNetWrap').classList.toggle('dis',!TT.key);$('chkNetWrap').title=TT.key?'Capa de flujo de TomTom para todas las vías (cuenta como consultas de mosaicos)':'Requiere API key de TomTom';
}
function initMap(){
  map=L.map('map',{zoomControl:false,attributionControl:true,minZoom:7,maxZoom:20,zoomSnap:0.25,zoomDelta:0.5,wheelPxPerZoomLevel:90});
  map.attributionControl.setPrefix(false);
  [['labelsPane',380],['netPane',390],['worksPane',400],['routePane',410],['flowPane',450],['incPane',455]].forEach(([n,z])=>{const p=map.createPane(n);p.style.zIndex=z;p.style.pointerEvents='none'});
  ['route','extents','markers','live','km','inc','incHist'].forEach(k=>LAYERS[k]=L.layerGroup().addTo(map));
  const r5=GEO.r5.pts,as=GEO.ass.pts;
  [as,r5].forEach(line=>{
    L.polyline(line,{pane:'routePane',color:'#04123a',weight:12,opacity:.55,interactive:false}).addTo(LAYERS.route);
    L.polyline(line,{pane:'routePane',color:'#f4791f',weight:4,opacity:.95,interactive:false,className:'routeCore'}).addTo(LAYERS.route);
  });
  routeBounds=L.latLngBounds([...r5,...as]);
  setBase(LS.get('base','esri'));setLabels(LS.get('labels',true));setNetFlow(LS.get('netflow',false));
  fitRoute(false);
  FLOW.init();
  const zoomCls=()=>{const z=map.getZoom();$('viewer').classList.toggle('zoomed',z>=12);$('viewer').classList.toggle('far',z<10.5)};zoomCls();buildKmLabels();
  map.on('zoomend',()=>{zoomCls();buildKmLabels()});
  map.on('move',updateKmReadout);
  map.on('mousedown touchstart',()=>{if(tourOn)stopTour()});
  map.on('zoomstart',fadeHint);
  map.on('mousemove',e=>FLOW.hover(e));
  map.on('click',e=>FLOW.click(e));
  document.querySelectorAll('#baseSeg button').forEach(b=>b.onclick=()=>setBase(b.dataset.base));
  $('chkLabels').onchange=e=>setLabels(e.target.checked);
  $('chkNet').onchange=e=>setNetFlow(e.target.checked);
}
function fitRoute(anim=true){const sm=innerWidth<700;map.fitBounds(routeBounds,{paddingTopLeft:sm?[70,20]:[200,30],paddingBottomRight:sm?[16,50]:[240,70],animate:anim})}
function buildKmLabels(){
  LAYERS.km.clearLayers();const z=map.getZoom();const step=z>=12.5?5:z>=10.5?10:50;
  const add=(route,km,major)=>L.marker(llAt(route,km),{icon:L.divIcon({className:'lf-icon',html:`<div class="kmlbl ${major?'major':''}">${route==='ASS'?'ASS ':''}km ${fmtKm(km)}</div>`,iconSize:[0,0]}),interactive:false,keyboard:false,zIndexOffset:-1000}).addTo(LAYERS.km);
  for(let k=Math.ceil(30/step)*step;k<=215;k+=step)add('R5',k,k%50===0);add('R5',219.5,true);
  if(z>=10.5)for(let k=step;k<=45;k+=step)add('ASS',k,false);
}
function focusKm(route,km){if(tourOn)stopTour();map.flyTo(llAt(route,km),Math.max(map.getZoom(),14.5),{duration:.9})}
function fadeHint(){ clearTimeout(hintTimer); const h=$('topHint'); h.classList.remove('faded'); hintTimer=setTimeout(()=>h.classList.add('faded'),4000); }

/* --- Recorrido virtual por la troncal (R5 km 29,5 → 219,5) --- */
function stopTour(){ tourOn=false; if(tourAnim)cancelAnimationFrame(tourAnim); tourAnim=null; $('tour').textContent = tourStarted?'Reanudar':'Reproducir'; }
function startTour(){
  tourOn=true; tourStarted=true; $('tour').textContent='Pausar';
  if(tourKm==null||tourKm>=219.4)tourKm=29.5;
  map.setView(llAt('R5',tourKm),Math.max(map.getZoom(),14),{animate:false});
  let last=performance.now();
  const step=t=>{ if(!tourOn)return; const dt=Math.min(100,t-last)/1000; last=t;
    const sp=$('speed').value, kps=sp==='fast'?1.4:sp==='medium'?0.7:0.3;
    tourKm+=kps*dt;
    if(tourKm>=219.5){ tourKm=219.5; stopTour(); tourStarted=false; $('tour').textContent='Reproducir'; return; }
    map.panTo(llAt('R5',tourKm),{animate:false}); tourAnim=requestAnimationFrame(step); };
  tourAnim=requestAnimationFrame(step);
}
function toggleTour(){ tourOn?stopTour():startTour(); }

/* ===================== PANELES / CAPAS ===================== */
function buildLayers(){
  $('layers').innerHTML = INFRA.map(cls=>`<div class="layer active" data-cls="${cls}"><span class="left"><span class="dotSwatch" style="background:${COLORS[cls]}"></span>${cls}</span><span class="badge" id="cnt_${cls}">0</span></div>`).join('');
  $('worksLayers').innerHTML = WORKS.map(w=>`<div class="layer active" data-cls="${w.name}"><span class="left">${w.emoji} ${w.name}</span><span class="badge" id="cnt_${w.name}">0</span></div>`).join('');
  document.querySelectorAll('.layer').forEach(el=>{
    el.addEventListener('click',()=>{ const cls=el.dataset.cls; visible[cls]=!visible[cls]; el.classList.toggle('active',visible[cls]); renderMarkers(); });
  });
}
function closeAllPanels(exceptId=''){
  [['alertsToggle','alertsPanel'],['histToggle','histPanel'],['filesToggle','dataPanel'],['infraToggle','side'],['worksToggle','worksPanel'],['liveToggle','livePanel'],['logToggle','logPanel'],['controlsToggle','controlsPanel'],['weatherToggle','weatherPanel']].forEach(([bid,pid])=>{
    const p=$(pid); if(p && pid!==exceptId) p.classList.remove('open');
    const b=$(bid); if(b) b.classList.toggle('active', p && p.classList.contains('open'));
  });
}
function togglePanel(buttonId,panelId,cb){ const p=$(panelId); const willOpen=!p.classList.contains('open'); closeAllPanels(willOpen?panelId:''); p.classList.toggle('open',willOpen); $(buttonId).classList.toggle('active',willOpen); if(willOpen&&cb)cb(); }

/* ===================== RELOJ ===================== */
function tickClock(){ const t=$('liveTitle'); if(t)t.textContent=formatDateTimeNow(); }
function startClock(){ tickClock(); setInterval(tickClock,1000); setInterval(()=>{ const now=new Date(); if(now.getMinutes()===0&&now.getSeconds()<2)snapshotLog('auto'); },1000); setInterval(renderRegionWeather,10*60*1000); }

/* ===================== EVENTOS ===================== */
function events(){
  $('filesToggle').onclick=()=>togglePanel('filesToggle','dataPanel');
  $('infraToggle').onclick=()=>togglePanel('infraToggle','side');
  $('worksToggle').onclick=()=>togglePanel('worksToggle','worksPanel');
  $('logToggle').onclick=()=>togglePanel('logToggle','logPanel',renderLog);
  $('liveToggle').onclick=()=>togglePanel('liveToggle','livePanel',renderLivePanel);
  $('controlsToggle').onclick=()=>togglePanel('controlsToggle','controlsPanel');
  $('weatherToggle').onclick=()=>togglePanel('weatherToggle','weatherPanel',renderRegionWeather);
  $('logClose').onclick=()=>{ $('logPanel').classList.remove('open'); $('logToggle').classList.remove('active'); };
  $('zIn').onclick=$('zInFab').onclick=()=>map.zoomIn(1);
  $('zOut').onclick=$('zOutFab').onclick=()=>map.zoomOut(1);
  $('fit').onclick=$('fitFab').onclick=$('resetView').onclick=()=>{ if(tourOn)stopTour(); tourKm=null; tourStarted=false; $('tour').textContent='Reproducir'; fitRoute(); };
  $('tIn').onclick=()=>setMarkScale(S.markScale+0.15);
  $('tOut').onclick=()=>setMarkScale(S.markScale-0.15);
  $('tFit').onclick=()=>setMarkScale(1);
  $('tour').onclick=toggleTour;
  $('full').onclick=()=>{ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); };
  $('classesFile').onchange=e=>e.target.files[0]&&loadClasses(e.target.files[0]);
  $('worksFile').onchange=e=>e.target.files[0]&&loadWorks(e.target.files[0]);
}

/* =====================================================================
   CAPAS EN TIEMPO REAL · Tráfico (TomTom) · Clima (Open-Meteo) · Caudales (GloFAS)
   ===================================================================== */
/* Trazado real (OpenStreetMap vía OSRM) calibrado con PK oficiales:
   R5: Puente Maipo = km 29,1 · Peaje Angostura = km 54,0   |   ASS: empalme con R5 = km 46,59
   r5/ass: eje sentido Sur cada 0,5 km · n5/nass: calzada sentido Norte cada 2,5 km */
let GEO=null, RIVERS=[], SECTORS={};  /* se cargan en boot() desde data/static/ */
/* Criterios iniciales (ajustables por el área): */
const LIVE_CFG={
  weatherEveryMin:15, riversEveryMin:180,
  wx:{gustCheck:50,gustNo:70,visCheck:1000,visNo:200,probCheck:60},
  river:{elev:1.0,high:1.5},               // pico pronosticado 7 días / percentil 90 de los últimos 92 días
  traffic:{zoom:12,concurrency:4},
  speed:[[.85,'#16a34a','Fluido'],[.65,'#eab308','Moderado'],[.45,'#f97316','Lento'],[0,'#dc2626','Congestión']]
};
const LS={get(k,d){try{const v=localStorage.getItem('rdm_'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem('rdm_'+k,JSON.stringify(v))}catch(e){}}};
const LIVE={show:{traffic:LS.get('show_traffic',true),weather:LS.get('show_weather',true),rivers:LS.get('show_rivers',true)},weather:{pts:[],at:null,err:null,loading:false},rivers:{list:[],at:null,err:null,loading:false},traffic:{segs:[],at:null,err:null,loading:false,progress:''},timer:null};
const TT={key:LS.get('tt_key',''),dir:LS.get('tt_dir','both'),spacing:LS.get('tt_spacing',10),every:LS.get('tt_every',0),limit:LS.get('tt_limit',20000)};
window.LIVE=LIVE;

/* ---------- geo helpers ---------- */
function geoAt(route,km){const g=route==='ASS'?GEO.ass:GEO.r5;const n=g.pts.length;const f=clamp((km-g.k0)/g.step,0,n-1);const a=Math.floor(f),b=Math.min(n-1,a+1),t=f-a;const p=g.pts[a],q=g.pts[b];return{lat:p[0]+(q[0]-p[0])*t,lon:p[1]+(q[1]-p[1])*t}}
function geoNorth(route,km){const arr=route==='ASS'?GEO.nass:GEO.n5;let best=null,bd=1e9;for(const p of arr){const d=Math.abs(p[0]-km);if(d<bd){bd=d;best=p}}return bd<=1.3?{lat:best[1],lon:best[2]}:null}
function sectorName(route,km){const s=(SECTORS[route]||[]).find(([a,b])=>km>=a&&km<b+1e-9);return s?s[2]:`km ${fmtKm(km)}`}
function hav(a,b){const t=Math.PI/180,dla=(b.lat-a.lat)*t,dlo=(b.lon-a.lon)*t;const h=Math.sin(dla/2)**2+Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin(dlo/2)**2;return 2*6371.0088*Math.asin(Math.sqrt(h))}
function bearing(a,b){const t=Math.PI/180;const y=Math.sin((b.lon-a.lon)*t)*Math.cos(b.lat*t);const x=Math.cos(a.lat*t)*Math.sin(b.lat*t)-Math.sin(a.lat*t)*Math.cos(b.lat*t)*Math.cos((b.lon-a.lon)*t);return(Math.atan2(y,x)/t+360)%360}
function angDiff(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d}
function median(a){const s=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!s.length)return NaN;const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
function localISO(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function hhmm(d){return d?`${pad(d.getHours())}:${pad(d.getMinutes())}`:'--:--'}
function fmtNum(v,dec=1){return Number.isFinite(v)?Number(v).toLocaleString('es-CL',{maximumFractionDigits:dec,minimumFractionDigits:0}):'–'}
/* ---------- marker factory for live layers ---------- */
function liveMarker(cls,route,km,html,tipFn,ll){const m=L.marker(ll||llAt(route,km),{icon:mkIcon(html,cls),riseOnHover:true,keyboard:false,zIndexOffset:800});
  m.on('mouseover',e=>{if(!pinned)showLiveTip(e.originalEvent,tipFn())});m.on('mousemove',e=>{if(!pinned)positionTooltip(e.originalEvent)});m.on('mouseout',()=>{if(!pinned)tooltip.style.display='none'});
  m.on('click',e=>{L.DomEvent.stopPropagation(e);pinned={type:'live'};activeTooltipWork=null;showLiveTip(e.originalEvent,tipFn())});return m}
function showLiveTip(e,html){tooltip.innerHTML=html;tooltip.style.display='block';positionTooltip(e)}

/* =================== CLIMA =================== */
function weatherSamplePoints(){const pts=[];[5,15,25,35].forEach(k=>pts.push({route:'ASS',km:k}));for(let k=30;k<=210;k+=10)pts.push({route:'R5',km:k});pts.push({route:'R5',km:219});return pts.map(p=>({...p,...geoAt(p.route,p.km),name:sectorName(p.route,p.km)}))}
function evalWeatherPoint(c,prob){const label=weatherLabel(c.weather_code,c.is_day===1);const base=classifyWeather(label);let state=base.state;const why=[];const W=LIVE_CFG.wx;
  if(base.state===EVAL_STATE.NO)why.push(label);
  if(c.precipitation>0){state=EVAL_STATE.NO;why.push(`precipitación ${fmtNum(c.precipitation)} mm`)}
  if(c.wind_gusts_10m>=W.gustNo){state=EVAL_STATE.NO;why.push(`ráfagas ${Math.round(c.wind_gusts_10m)} km/h`)}else if(c.wind_gusts_10m>=W.gustCheck){if(state===EVAL_STATE.OK)state=EVAL_STATE.CHECK;why.push(`ráfagas ${Math.round(c.wind_gusts_10m)} km/h`)}
  if(Number.isFinite(c.visibility)){if(c.visibility<W.visNo){state=EVAL_STATE.NO;why.push(`visibilidad ${Math.round(c.visibility)} m`)}else if(c.visibility<W.visCheck){if(state===EVAL_STATE.OK)state=EVAL_STATE.CHECK;why.push(`visibilidad ${Math.round(c.visibility)} m`)}}
  if(prob>=W.probCheck){if(state===EVAL_STATE.OK)state=EVAL_STATE.CHECK;why.push(`prob. lluvia próx. 12 h ${prob}%`)}
  let icon=base.weatherIcon;if(c.is_day===0&&c.weather_code<=1)icon='🌙';
  return{state,icon,label,why}}
async function refreshWeatherLayer(){const L=LIVE.weather;if(L.loading)return;L.loading=true;renderLiveStatus();
  const pts=weatherSamplePoints();
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p=>p.lat.toFixed(4)).join(',')}&longitude=${pts.map(p=>p.lon.toFixed(4)).join(',')}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility,is_day&hourly=precipitation_probability&forecast_hours=12&timezone=America%2FSantiago`;
  try{const r=await fetch(url);if(!r.ok)throw new Error('HTTP '+r.status);let j=await r.json();if(!Array.isArray(j))j=[j];
    L.pts=pts.map((p,i)=>{const c=j[i]?.current||{};const pr=(j[i]?.hourly?.precipitation_probability||[]).filter(Number.isFinite);const prob=pr.length?Math.max(...pr):0;return{...p,cur:c,prob,eval:evalWeatherPoint(c,prob)}});
    L.pts.forEach(p=>{const t=`${weatherLabel(p.cur.weather_code,p.cur.is_day===1)} · ${Math.round(p.cur.temperature_2m)}°C · viento ${Math.round(p.cur.wind_speed_10m)} km/h`;WEATHER.cache.set(`${p.route}|${weatherBin(p.km)}`,{ts:Date.now(),value:t})});
    L.err=null}catch(e){L.err='No se pudo consultar Open‑Meteo ('+(e.message||'red')+')'}
  L.at=new Date();L.loading=false;renderLiveAll();if($('weatherPanel').classList.contains('open'))renderRegionWeather()}
window.refreshWeatherLayer=refreshWeatherLayer;
function nearestLiveWeather(route,km){let best=null,bd=1e9;LIVE.weather.pts.forEach(p=>{const d=p.route===route?Math.abs(p.km-km):1e9;if(d<bd){bd=d;best=p}});return bd<=6?best:null}
function tipWeather(p){const c=p.cur,st=p.eval.state,cls=st===EVAL_STATE.OK?'ok':st===EVAL_STATE.NO?'bad':'warn';
  return `<div class="ttHead"><span class="ttIcon">${p.eval.icon}</span><div><div class="ttTitle" style="margin-left:0">${esc(p.name)}</div><div class="small">${p.route} · km ${fmtKm(p.km)}</div></div></div>
  <div class="grid"><div class="k">Condición</div><div class="v">${esc(p.eval.label)}</div><div class="k">Temperatura</div><div class="v">${fmtNum(c.temperature_2m)} °C</div><div class="k">Precipitación</div><div class="v">${fmtNum(c.precipitation)} mm</div><div class="k">Viento / ráfagas</div><div class="v">${Math.round(c.wind_speed_10m)} / ${Math.round(c.wind_gusts_10m)} km/h</div><div class="k">Visibilidad</div><div class="v">${Number.isFinite(c.visibility)?fmtNum(c.visibility/1000)+' km':'–'}</div><div class="k">Prob. lluvia 12 h</div><div class="v">${p.prob}%</div></div>
  <div class="ttRow"><span class="tag ${cls}">${stateIcon(st)} ${esc(st)}</span>${p.eval.why.map(w=>`<span class="tag">${esc(w)}</span>`).join('')}</div><div class="note" style="margin-top:8px">Open‑Meteo · ${hhmm(LIVE.weather.at)}</div>`}

/* =================== CAUDALES =================== */
async function refreshRiversLayer(){const L=LIVE.rivers;if(L.loading)return;L.loading=true;renderLiveStatus();
  const url=`https://flood-api.open-meteo.com/v1/flood?latitude=${RIVERS.map(r=>r.cell[0]).join(',')}&longitude=${RIVERS.map(r=>r.cell[1]).join(',')}&daily=river_discharge,river_discharge_max&past_days=92&forecast_days=7`;
  try{const r=await fetch(url);if(!r.ok)throw new Error('HTTP '+r.status);let j=await r.json();if(!Array.isArray(j))j=[j];const today=localISO();
    L.list=RIVERS.map((rv,i)=>{const d=j[i]?.daily||{};const t=d.time||[],q=d.river_discharge||[],qx=d.river_discharge_max||[];const ti=Math.max(0,t.length-7);/* forecast_days=7 → primer día de pronóstico = hoy */
      const hist=q.slice(0,ti).filter(Number.isFinite);const base=median(hist);const hs=[...hist].sort((a,b)=>a-b);const p90=hs.length?hs[Math.min(hs.length-1,Math.floor(hs.length*0.9))]:NaN;const now=q[ti];
      let peak=NaN,peakDate='',ens=NaN;for(let k=ti;k<t.length;k++){if(Number.isFinite(q[k])&&!(q[k]<=peak)){peak=q[k];peakDate=t[k]}if(Number.isFinite(qx[k])&&!(qx[k]<=ens))ens=qx[k]}
      const ratio=p90>0?peak/p90:NaN;const level=!Number.isFinite(ratio)?'na':ratio>=LIVE_CFG.river.high?'high':ratio>=LIVE_CFG.river.elev?'elev':'normal';
      const s0=Math.max(0,ti-30);return{...rv,now,base,p90,peak,peakDate,ens,ratio,level,ser:{t:t.slice(s0,ti+7),q:q.slice(s0,ti+7),qx:qx.slice(s0,ti+7),ti:ti-s0}}});
    L.err=null}catch(e){L.err='No se pudo consultar GloFAS ('+(e.message||'red')+')'}
  L.at=new Date();L.loading=false;renderLiveAll()}
const LEVEL_TXT={normal:['Normal','ok'],elev:['Elevado','warn'],high:['Muy elevado','bad'],na:['Sin dato','']};
function nearbyRivers(route,km,dist=3){return LIVE.rivers.list.filter(r=>r.route===route&&Math.abs(r.km-km)<=dist)}
function sparkline(ser){const W=260,H=58,P=4;const vals=[...ser.q,...ser.qx].filter(Number.isFinite);if(!vals.length)return'';const mx=Math.max(...vals)*1.08||1;const n=ser.t.length;const x=i=>P+i*(W-2*P)/Math.max(1,n-1),y=v=>H-P-(v/mx)*(H-2*P);
  const line=(arr,from,to)=>{let d='';for(let i=from;i<=to&&i<n;i++){if(!Number.isFinite(arr[i]))continue;d+=(d?'L':'M')+x(i).toFixed(1)+','+y(arr[i]).toFixed(1)}return d};
  let band='';{const up=[],dn=[];for(let i=ser.ti;i<n;i++){const hi=Number.isFinite(ser.qx[i])?ser.qx[i]:ser.q[i];if(Number.isFinite(hi)&&Number.isFinite(ser.q[i])){up.push([x(i),y(hi)]);dn.push([x(i),y(ser.q[i])])}}if(up.length>1)band='M'+up.map(p=>p.map(v=>v.toFixed(1)).join(',')).join('L')+'L'+dn.reverse().map(p=>p.map(v=>v.toFixed(1)).join(',')).join('L')+'Z'}
  const tx=x(ser.ti);
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect x="${tx}" y="0" width="${W-tx}" height="${H}" fill="rgba(244,121,31,.08)"/>${band?`<path d="${band}" fill="rgba(244,121,31,.25)"/>`:''}<path d="${line(ser.q,0,ser.ti)}" fill="none" stroke="#7dd3fc" stroke-width="2"/><path d="${line(ser.q,ser.ti,n-1)}" fill="none" stroke="#f4791f" stroke-width="2" stroke-dasharray="4 3"/><line x1="${tx}" x2="${tx}" y1="0" y2="${H}" stroke="rgba(255,255,255,.5)" stroke-dasharray="2 2"/><text x="${tx+3}" y="10" fill="rgba(255,255,255,.7)" font-size="9" font-family="Inter">hoy</text></svg><div class="small" style="display:flex;justify-content:space-between"><span>últimos 30 días</span><span style="color:#f4791f">pronóstico 7 días (banda = máx. ensamble)</span></div>`}
function tipRiver(r){const [lt,lc]=LEVEL_TXT[r.level]||LEVEL_TXT.na;const rel={alta:'Alta',media:'Media',baja:'Baja (cauce menor para la grilla de 5 km)'}[r.rel]||r.rel;
  return `<div class="ttHead"><span class="ttIcon">💧</span><div><div class="ttTitle" style="margin-left:0">${esc(r.name)}</div><div class="small">${esc(r.sub)} · ${r.route} km ${fmtKm(r.km)}</div></div></div>
  <div class="grid"><div class="k">Caudal hoy</div><div class="v"><b>${fmtNum(r.now)} m³/s</b></div><div class="k">Pico pronosticado 7 d</div><div class="v">${fmtNum(r.peak)} m³/s ${r.peakDate?`(${r.peakDate.slice(8,10)}-${r.peakDate.slice(5,7)})`:''}</div><div class="k">Escenario alto (ensamble)</div><div class="v">${fmtNum(r.ens)} m³/s</div><div class="k">Mediana / P90 · 92 d</div><div class="v">${fmtNum(r.base)} / ${fmtNum(r.p90)} m³/s</div><div class="k">Pico vs P90</div><div class="v">${fmtNum(r.ratio,2)}×</div><div class="k">Confiabilidad</div><div class="v">${esc(rel)}</div></div>
  ${r.ser?sparkline(r.ser):''}<div class="ttRow"><span class="tag ${lc}">${lt}</span></div><div class="note" style="margin-top:8px">Modelo GloFAS v4 (Copernicus) vía Open‑Meteo · valores diarios simulados. Usar como alerta temprana; confirmar con DGA.</div>`}

/* =================== TRÁFICO =================== */
function ttMonthKey(){const d=new Date();return 'tt_count_'+d.getFullYear()+'-'+pad(d.getMonth()+1)}
function ttUsed(){return LS.get(ttMonthKey(),0)}
function ttCount(n){LS.set(ttMonthKey(),ttUsed()+n)}
function trafficSamplePoints(){const sp=Number(TT.spacing)||10,out=[];const add=(route,km)=>{if(TT.dir!=='N'){const g=geoAt(route,km);out.push({route,km,dir:'S',...g})}if(TT.dir!=='S'){const g=geoNorth(route,km);if(g)out.push({route,km,dir:'N',...g})}};
  for(let k=2.5;k<=45;k+=sp)add('ASS',k);for(let k=30;k<=217.5;k+=sp)add('R5',k);return out}
function speedClass(ratio){for(const [th,col,txt] of LIVE_CFG.speed)if(ratio>=th)return{col,txt};return{col:'#dc2626',txt:'Congestión'}}
async function ttFetch(p){const url=`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/${LIVE_CFG.traffic.zoom}/json?key=${encodeURIComponent(TT.key)}&point=${p.lat.toFixed(5)},${p.lon.toFixed(5)}&unit=KMPH`;
  ttCount(1);const r=await fetch(url);if(!r.ok){const e=new Error(r.status===403?'API key inválida o sin acceso a Traffic API (403)':r.status===429?'Límite de consultas TomTom alcanzado (429)':r.status===400?'Solicitud rechazada (400)':'HTTP '+r.status);e.status=r.status;throw e}
  return (await r.json()).flowSegmentData}
async function refreshTrafficLayer(manual){const L=LIVE.traffic;if(L.loading)return;
  if(!TT.key){L.err='Ingresa tu API key de TomTom en Tiempo real → Configuración.';L.at=new Date();renderLiveAll();return}
  const pts=trafficSamplePoints();const used=ttUsed();
  if(used+pts.length>Number(TT.limit)){L.err=`Se omitió la consulta: superaría el límite mensual configurado (${fmtNum(used,0)} + ${pts.length} > ${fmtNum(+TT.limit,0)}).`;L.at=new Date();renderLiveAll();return}
  L.loading=true;L.err=null;L.progress=`0/${pts.length}`;renderLiveStatus();
  const res=[];let i=0,fatal=null,done=0;
  async function worker(){while(i<pts.length&&!fatal){const p=pts[i++];try{const f=await ttFetch(p);const coords=(f.coordinates?.coordinate||[]).map(c=>({lat:c.latitude,lon:c.longitude}));
        let dist=NaN;coords.forEach(c=>{const d=hav(p,c);if(!(d>=dist))dist=d});
        let dir=p.dir;if(coords.length>1){const exp=bearing(geoAt(p.route,p.km-0.3),geoAt(p.route,p.km+0.3));const got=bearing(coords[0],coords[coords.length-1]);const df=angDiff(exp,got);if(df<70)dir='S';else if(df>110)dir='N'}
        const flags=[];if(!/^FRC[0-2]$/.test(f.frc||''))flags.push('vía secundaria ('+(f.frc||'?')+')');if(dist>0.3)flags.push('tramo a '+fmtNum(dist*1000,0)+' m');if(dir!==p.dir)flags.push('sentido corregido');
        res.push({route:p.route,km:p.km,dir,reqDir:p.dir,cur:f.currentSpeed,free:f.freeFlowSpeed,ratio:f.freeFlowSpeed>0?f.currentSpeed/f.freeFlowSpeed:NaN,tt:f.currentTravelTime,ttf:f.freeFlowTravelTime,conf:f.confidence,closed:!!f.roadClosure,frc:f.frc,dist,flags})}
      catch(e){if(e.status===403||e.status===429)fatal=e;else res.push({route:p.route,km:p.km,dir:p.dir,err:e.message})}
      done++;L.progress=`${done}/${pts.length}`;if(done%6===0)renderLiveStatus()}}
  await Promise.all(Array.from({length:LIVE_CFG.traffic.concurrency},worker));
  const map=new Map();res.filter(s=>!s.err).forEach(s=>{const k=`${s.route}|${s.km}|${s.dir}`;const o=map.get(k);if(!o||(s.dir===s.reqDir&&o.dir!==o.reqDir)||s.dist<o.dist)map.set(k,s)});
  if(fatal){L.err=fatal.message}else if(!map.size){L.err='TomTom no devolvió datos de tramos.'}else{L.segs=[...map.values()];L.err=null;L.src='navegador'}
  L.at=new Date();L.loading=false;L.progress='';renderLiveAll()}
/* =================== FLUJO DE TRÁFICO ANIMADO (canvas sobre el mapa satelital) =================== */
/* Cada tramo medido se dibuja sobre su calzada (tránsito por la derecha) con el color de la relación velocidad actual / flujo libre.
   Las partículas blancas avanzan en el sentido de circulación a una velocidad proporcional a la velocidad medida. */
function segDist(p,a,b){const dx=b.x-a.x,dy=b.y-a.y;const L2=dx*dx+dy*dy||1;let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/L2;t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy))}
const FLOW={canvas:null,ctx:null,segs:[],paths:[],phase:0,last:0,hoverSeg:null,dpr:1,
  init(){const c=L.DomUtil.create('canvas','leaflet-zoom-hide',map.getPane('flowPane'));c.id='flowCanvas';this.canvas=c;this.ctx=c.getContext('2d');
    map.on('resize',()=>this.resize());this.resize();
    const loop=t=>{try{this.draw(t)}catch(e){}requestAnimationFrame(loop)};requestAnimationFrame(loop)},
  resize(){const s=map.getSize(),d=window.devicePixelRatio||1;this.dpr=d;this.canvas.width=Math.round(s.x*d);this.canvas.height=Math.round(s.y*d);this.canvas.style.width=s.x+'px';this.canvas.style.height=s.y+'px'},
  build(){const sp=Number(TT.spacing)||10;
    this.segs=LIVE.traffic.segs.map(s=>{const lim=s.route==='ASS'?[1,46.5]:[29.5,219.5];const hs=(s.span||sp)/2;const lo=Math.max(lim[0],s.km-hs),hi=Math.min(lim[1],s.km+hs);if(hi<=lo)return null;let ll=routeLine(s.route,lo,hi);if(s.dir==='N')ll=ll.slice().reverse();return{s,lo,hi,ll}}).filter(Boolean)},
  draw(t){const c=this.canvas;if(!c||!map)return;const ctx=this.ctx,d=this.dpr;const dt=this.last?Math.min(80,t-this.last)/1000:0;this.last=t;this.phase+=dt;
    L.DomUtil.setPosition(c,map.containerPointToLayerPoint([0,0]));
    ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,c.width/d,c.height/d);this.paths=[];
    if(!LIVE.show.traffic||!this.segs.length)return;
    const z=map.getZoom(),sz=map.getSize();const off=z>=14?8:z>=12?6:z>=10?4.5:3;const w=z>=14?7:z>=12?5.5:z>=10?4.5:3.5;
    ctx.lineJoin='round';ctx.lineCap='round';
    for(const g of this.segs){const s=g.s;const P=g.ll.map(p=>map.latLngToContainerPoint(p));
      let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;P.forEach(p=>{if(p.x<minx)minx=p.x;if(p.x>maxx)maxx=p.x;if(p.y<miny)miny=p.y;if(p.y>maxy)maxy=p.y});
      if(maxx<-20||maxy<-20||minx>sz.x+20||miny>sz.y+20)continue;
      const Q=P.map((p,i)=>{const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)];let dx=b.x-a.x,dy=b.y-a.y;const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;return{x:p.x-dy*off,y:p.y+dx*off}});
      const path=new Path2D();Q.forEach((q,i)=>i?path.lineTo(q.x,q.y):path.moveTo(q.x,q.y));
      const sc=s.closed?{col:'#111827'}:speedClass(s.ratio);
      ctx.setLineDash([]);ctx.globalAlpha=1;ctx.strokeStyle='rgba(2,8,30,.6)';ctx.lineWidth=w+3.5;ctx.stroke(path);
      ctx.globalAlpha=s.conf<0.5?.6:1;ctx.strokeStyle=sc.col;ctx.lineWidth=w;ctx.stroke(path);ctx.globalAlpha=1;
      if(s.closed){ctx.setLineDash([6,6]);ctx.strokeStyle='#ef4444';ctx.lineWidth=2;ctx.stroke(path)}
      else{const v=Math.max(3,s.cur||0);const gap=w*3+12;ctx.setLineDash([2.5,gap]);ctx.lineDashOffset=-((this.phase*v*0.9)%(gap+2.5));ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=Math.max(2,w-2);ctx.stroke(path)}
      ctx.setLineDash([]);this.paths.push({g,Q});
    }},
  hit(pt){let best=null,bd=9;for(const p of this.paths){const Q=p.Q;for(let i=1;i<Q.length;i++){const dd=segDist(pt,Q[i-1],Q[i]);if(dd<bd){bd=dd;best=p}}}return best},
  hover(e){if(pinned)return;const h=this.hit(e.containerPoint);const el=map.getContainer();
    if(h){el.style.cursor='pointer';showLiveTip(e.originalEvent,tipTraffic(h.g.s,h.g.lo,h.g.hi));this.hoverSeg=h}
    else if(this.hoverSeg){el.style.cursor='';this.hoverSeg=null;tooltip.style.display='none'}},
  click(e){const h=this.hit(e.containerPoint);if(h){flowClickAt=Date.now();pinned={type:'live'};activeTooltipWork=null;showLiveTip(e.originalEvent,tipTraffic(h.g.s,h.g.lo,h.g.hi))}}
};
function renderTraffic(){if(FLOW.canvas)FLOW.build()}
function tipTraffic(s,lo,hi){const sc=s.closed?{col:'#111827',txt:'Cerrado'}:speedClass(s.ratio);const delay=Number.isFinite(s.tt-s.ttf)?Math.max(0,s.tt-s.ttf):NaN;
  return `<div class="ttHead"><span class="ttIcon">🚗</span><div><div class="ttTitle" style="margin-left:0;color:${sc.col==='#111827'?'#fff':sc.col}">${sc.txt} · sentido ${s.dir==='S'?'Sur':'Norte'}</div><div class="small">${s.route} km ${fmtKm(lo)} – ${fmtKm(hi)} · ${esc(sectorName(s.route,s.km))}</div></div></div>
  <div class="grid"><div class="k">Velocidad actual</div><div class="v"><b>${fmtNum(s.cur,0)} km/h</b></div><div class="k">Flujo libre</div><div class="v">${fmtNum(s.free,0)} km/h</div><div class="k">Relación</div><div class="v">${fmtNum(s.ratio*100,0)} %</div><div class="k">Demora del tramo</div><div class="v">${Number.isFinite(delay)?fmtNum(delay,0)+' s':'–'}</div><div class="k">Confianza</div><div class="v">${fmtNum((s.conf||0)*100,0)} %</div><div class="k">Clase de vía</div><div class="v">${esc(s.frc||'–')}</div></div>
  ${s.flags.length?`<div class="ttRow">${s.flags.map(f=>`<span class="tag warn">${esc(f)}</span>`).join('')}</div>`:''}<div class="note" style="margin-top:8px">TomTom Traffic Flow · ${hhmm(LIVE.traffic.at)}</div>`}
function trafficAt(route,km){const sp=Number(TT.spacing)||10;return LIVE.traffic.segs.filter(s=>s.route===route&&Math.abs(s.km-km)<=(s.span||sp)/2+1e-6)}

/* =================== RENDER LIVE =================== */
function renderLiveMarkers(){if(!map)return;LAYERS.live.clearLayers();
  if(LIVE.show.weather)LIVE.weather.pts.forEach(p=>{const st=p.eval.state===EVAL_STATE.OK?'ok':p.eval.state===EVAL_STATE.NO?'no':'check';liveMarker('wx st-'+st,p.route,p.km,`<div class="wxchip"><span class="ic">${p.eval.icon}</span><span class="t">${Math.round(p.cur.temperature_2m)}°</span></div><div class="lbl">${esc(p.name)}</div>`,()=>tipWeather(p)).addTo(LAYERS.live)});
  if(LIVE.show.rivers)(LIVE.rivers.list.length?LIVE.rivers.list:RIVERS.map(r=>({...r,level:'na'}))).forEach(r=>{liveMarker('riv lv-'+r.level,r.route,r.km,`<div class="rivdot">💧</div><div class="lbl">${esc(r.name)}${Number.isFinite(r.now)?' · '+fmtNum(r.now)+' m³/s':''}</div>`,()=>r.ser?tipRiver(r):`<div class="tt">💧 ${esc(r.name)}</div><div class="small">${esc(r.sub)} · km ${fmtKm(r.km)}</div><div class="small" style="margin-top:6px">${LIVE.rivers.err?esc(LIVE.rivers.err):'Cargando caudal…'}</div>`,[r.lat,r.lon]).addTo(LAYERS.live)})}
function liveAlerts(){const A=[];
  LIVE.traffic.segs.forEach(s=>{if(s.closed)A.push({sev:3,cls:'bad',route:s.route,km:s.km,html:`🚧 <b>Tramo cerrado</b> · ${s.route} km ${fmtKm(s.km)} sentido ${s.dir==='S'?'Sur':'Norte'}`});else if(s.ratio<0.65)A.push({sev:s.ratio<0.45?3:2,cls:s.ratio<0.45?'bad':'warn',route:s.route,km:s.km,html:`🚗 <b>${speedClass(s.ratio).txt}</b> · ${esc(sectorName(s.route,s.km))} (${s.route} km ${fmtKm(s.km)}, ${s.dir==='S'?'Sur':'Norte'}) · ${fmtNum(s.cur,0)}/${fmtNum(s.free,0)} km/h`})});
  LIVE.weather.pts.forEach(p=>{if(p.eval.state!==EVAL_STATE.OK)A.push({sev:p.eval.state===EVAL_STATE.NO?3:1,cls:p.eval.state===EVAL_STATE.NO?'bad':'warn',route:p.route,km:p.km,html:`${p.eval.icon} <b>${esc(p.name)}</b> · ${esc(p.eval.why.join(', ')||p.eval.label)}`})});
  LIVE.rivers.list.forEach(r=>{if(r.level==='elev'||r.level==='high')A.push({sev:r.level==='high'?3:2,cls:r.level==='high'?'bad':'warn',route:r.route,km:r.km,html:`💧 <b>${esc(r.name)}</b> · ${LEVEL_TXT[r.level][0]} (pico ${fmtNum(r.peak)} m³/s, ${fmtNum(r.ratio,2)}× el P90 de 92 días)`})});
  return A.sort((a,b)=>b.sev-a.sev)}
function renderLivePills(){const box=$('livePills');if(!box)return;const T=LIVE.traffic,W=LIVE.weather,R=LIVE.rivers;const pills=[];
  {const ir=INC.list.filter(i=>i.relation==='ruta');const hi=ir.filter(i=>i.severity==='alta').length,me=ir.filter(i=>i.severity==='media').length;pills.push(!SERVER.incidents?['muted','🚨','Incidentes: sin datos']:[hi?'bad':me?'warn':'ok','🚨',hi?`${hi} incidente(s) grave(s)`:me?`${me} incidente(s) en ruta`:'Sin incidentes en ruta'])}

  if(!TT.key&&!T.segs.length)pills.push(['muted','🚗','Tráfico: sin datos']);else if(T.err&&!T.segs.length)pills.push(['muted','🚗','Tráfico: sin datos']);else if(T.segs.length){const cl=T.segs.filter(s=>s.closed).length,slow=T.segs.filter(s=>!s.closed&&s.ratio<0.65).length,bad=T.segs.filter(s=>!s.closed&&s.ratio<0.45).length;pills.push([cl||bad?'bad':slow?'warn':'ok','🚗',cl?`${cl} tramo(s) cerrado(s)`:slow?`${slow} tramo(s) lento(s)`:'Tráfico fluido'])}else pills.push(['muted','🚗',T.loading?'Tráfico…':'Tráfico']);
  if(W.pts.length){const no=W.pts.filter(p=>p.eval.state===EVAL_STATE.NO).length,ck=W.pts.filter(p=>p.eval.state===EVAL_STATE.CHECK).length;pills.push([no?'bad':ck?'warn':'ok','⛅',no?`${no} sector(es) clima adverso`:ck?`${ck} sector(es) a confirmar`:'Clima apto'])}else pills.push(['muted','⛅',W.err?'Clima: sin datos':'Clima…']);
  if(R.list.length){const hi=R.list.filter(r=>r.level==='high').length,el=R.list.filter(r=>r.level==='elev').length;pills.push([hi?'bad':el?'warn':'ok','💧',hi?`${hi} río(s) muy elevado(s)`:el?`${el} río(s) elevado(s)`:'Ríos normales'])}else pills.push(['muted','💧',R.err?'Ríos: sin datos':'Ríos…']);
  box.innerHTML=pills.map(([c,ic,t])=>`<div class="pill ${c}" title="${esc(t)}"><span class="led"></span>${ic}<span class="txt">${esc(t)}</span></div>`).join('');
  box.querySelectorAll('.pill').forEach((p,k)=>p.onclick=()=>{if(k===0){if(!$('alertsPanel').classList.contains('open'))togglePanel('alertsToggle','alertsPanel',renderAlertsPanel)}else if(!$('livePanel').classList.contains('open'))togglePanel('liveToggle','livePanel',renderLivePanel)})}
function renderLiveStatus(){const T=LIVE.traffic,W=LIVE.weather,R=LIVE.rivers;
  const st=(L,okTxt)=>L.loading?'Actualizando…':L.err?L.err:L.at?okTxt+' · '+hhmm(L.at):'—';
  if($('stTraffic'))$('stTraffic').textContent=T.loading?`Consultando TomTom… ${T.progress}`:(T.src==='servidor'&&!T.loading)?`Publicado por el pipeline · ${T.segs.length} tramos · ${ago(SERVER.traffic&&SERVER.traffic.generated_at)}`:!TT.key?'Sin datos del pipeline · opcional: tu API key abajo':st(T,`${T.segs.length} tramos`);
  if($('stWeather'))$('stWeather').textContent=st(W,`${W.pts.length} sectores`);
  if($('stRivers'))$('stRivers').textContent=st(R,`${R.list.length} cruces de ríos`);
  const used=ttUsed(),lim=Number(TT.limit)||1;const per=trafficSamplePoints().length;
  if($('ttUsage'))$('ttUsage').innerHTML=`Este navegador: <b>${fmtNum(used,0)}</b> consultas este mes · ${per} por actualización${Number(TT.every)>0?` · ≈${fmtNum(per*60/Number(TT.every),0)}/hora abierta (≈${fmtNum(per*60/Number(TT.every)*24*30,0)}/mes si queda abierta 24/7)`:''}. El contador es por navegador: si varias personas usan la misma key, el consumo se suma.<br>Mosaicos TomTom (satélite / red) este mes: <b>${fmtNum(LS.get(ttTileKey(),0),0)}</b> de 200.000 gratuitos.`;
  if($('ttMeter'))$('ttMeter').style.width=Math.min(100,used/lim*100)+'%'}
function renderLivePanel(){['traffic','weather','rivers'].forEach(k=>{const el=$('sw'+k[0].toUpperCase()+k.slice(1));if(el)el.checked=!!LIVE.show[k]});
  $('ttKey').value=TT.key;$('ttDir').value=TT.dir;$('ttSpacing').value=String(TT.spacing);$('ttEvery').value=String(TT.every);$('ttLimit').value=TT.limit;
  const A=liveAlerts();$('liveAlerts').innerHTML=A.length?A.slice(0,12).map((a,i)=>`<div class="alertItem ${a.cls}" data-i="${i}">${a.html}</div>`).join(''):`<div class="alertItem ok">✅ Sin alertas con los datos disponibles.</div>`;
  $('liveAlerts').querySelectorAll('.alertItem[data-i]').forEach(el=>el.onclick=()=>{const a=A[+el.dataset.i];focusKm(a.route,a.km)});renderLiveStatus()}
function renderLiveAll(){renderTraffic();renderIncidents();updateAlertBadge();renderLiveMarkers();renderLivePills();renderLiveStatus();renderLegend();if($('livePanel').classList.contains('open'))renderLivePanel()}
function setLiveShow(k,v){LIVE.show[k]=v;LS.set('show_'+k,v);renderLiveAll();if(v){if(k==='weather'&&!LIVE.weather.pts.length)refreshWeatherLayer();if(k==='rivers'&&!LIVE.rivers.list.length)refreshRiversLayer();if(k==='traffic'&&!LIVE.traffic.segs.length&&TT.key)refreshTrafficLayer(true)}}
function liveWorkRows(p){const rows=[];if(p.fechaISO)rows.push(['Fecha',(p.dia?p.dia+' ':'')+p.fecha]);{const pl=placeKm(p.route,p.km);const ni=INC.list.filter(i=>i.route===pl.route&&i.km_to>=Math.min(p.kmInicial,p.kmFinal)-1&&i.km_from<=Math.max(p.kmInicial,p.kmFinal)+1);if(ni.length)rows.push(['Incidentes ≤ 1 km',ni.map(i=>`${i.icon} ${i.category_name} (${i.severity})`).join(' · ')])}const rv=nearbyRivers(p.route,p.km);if(rv.length)rows.push(['Ríos ≤ 3 km',rv.map(r=>`${r.name} (${LEVEL_TXT[r.level][0]}${Number.isFinite(r.now)?', '+fmtNum(r.now)+' m³/s':''})`).join(' · ')]);
  const tr=trafficAt(p.route,p.km);if(tr.length)rows.push(['Tráfico ahora',tr.map(s=>`${s.dir==='S'?'Sur':'Norte'} ${fmtNum(s.cur,0)} km/h (${s.closed?'cerrado':speedClass(s.ratio).txt.toLowerCase()})`).join(' · ')]);return rows}

/* =================== FUENTE SHAREPOINT =================== */
/* Columnas sugeridas de la lista (nombre interno): Title (trabajo), Turno (Día/Noche), Ruta (R5/ASS), FechaIntervencion,
   Contratista, Responsable, KmInicial, KmFinal, LongitudSegregacion, Pistas, Calzada, Sector, HoraInicio, HoraFinal, Observacion */
const SP_FIELDS={turno:'Turno',ruta:'Ruta',fecha:'FechaIntervencion',trabajo:'Title',contratista:'Contratista',responsable:'Responsable',kmInicial:'KmInicial',kmFinal:'KmFinal',longitud:'LongitudSegregacion',pistas:'Pistas',calzada:'Calzada',sector:'Sector',horaInicio:'HoraInicio',horaFinal:'HoraFinal',observacion:'Observacion'};
async function loadWorksFromSharePoint(){const msg=$('spMsg');const site=$('spSite').value.trim().replace(/\/+$/,''),list=$('spList').value.trim();
  if(!/^https:\/\//i.test(site)||!list){msg.className='msg err';msg.textContent='Indica la URL del sitio (https://…) y el nombre de la lista.';return}
  LS.set('sp_site',site);LS.set('sp_list',list);msg.className='msg';msg.textContent='Consultando lista…';
  try{let url=`${site}/_api/web/lists/getbytitle('${encodeURIComponent(list.replace(/'/g,"''"))}')/items?$top=5000`;const items=[];
    while(url){const r=await fetch(url,{headers:{Accept:'application/json;odata=nometadata'},credentials:'include'});if(!r.ok)throw new Error(r.status===401||r.status===403?'sin permiso o el visor no está dentro de SharePoint ('+r.status+')':r.status===404?'lista no encontrada (404)':'HTTP '+r.status);const j=await r.json();items.push(...(j.value||[]));url=j['odata.nextLink']||null}
    data.Noche=[];data['Día']=[];let c=0,bad=0;const f=(it,k)=>it[SP_FIELDS[k]];
    items.forEach(it=>{const trabajo=clean(f(it,'trabajo'));const k1=num(f(it,'kmInicial')),k2=num(f(it,'kmFinal'));const kb=kmBounds(k1,k2);const km=(kb.ini+kb.fin)/2;if(!trabajo||!validKm(km)){bad++;return}
      const tipo=/NOCH|NOCT/i.test(String(f(it,'turno')||''))?'Noche':'Día';const ruta=clean(f(it,'ruta'));const fv=f(it,'fecha');
      data[tipo].push({tipo,nombre:trabajo,trabajo,km,ruta,route:routeOf(ruta),fecha:fv?fmtFecha(Date.parse(fv)):'',responsable:clean(f(it,'responsable')),contratista:clean(f(it,'contratista')),kmInicial:kb.ini,kmFinal:kb.fin,longitud:clean(f(it,'longitud')),pistas:clean(f(it,'pistas')),calzada:clean(f(it,'calzada')),sector:clean(f(it,'sector')),horario:tipo==='Noche'?'Nocturno':'Diurno',horaInicio:fmtHora(f(it,'horaInicio')),horaFinal:fmtHora(f(it,'horaFinal')),observacion:clean(f(it,'observacion')),enEjecucion:false,estadoManual:'Programado',horaInicioReal:'',horaTerminoReal:''});c++});
    calcularFechaPromedio();fileState('btnWorks',c);SERVER.mode='manual';WF.date='';WF.touched=true;buildWorkDates();$('worksSrc').innerHTML='Lista SharePoint (solo en este navegador)';$('histBannerTxt').textContent='Mostrando lista SharePoint';$('histBanner').classList.add('on');renderMarkers();if(c)scheduleWeatherWarmup();msg.className='msg '+(c?'okc':'err');msg.textContent=`${c} trabajos cargados desde SharePoint${bad?` · ${bad} omitidos (sin trabajo o km inválido)`:''}.`}
  catch(e){msg.className='msg err';msg.textContent='No se pudo leer la lista: '+e.message}}

/* =================== INIT LIVE =================== */
function initLive(){
  [['swTraffic','traffic'],['swWeather','weather'],['swRivers','rivers']].forEach(([id,k])=>$(id).onchange=e=>setLiveShow(k,e.target.checked));
  $('ttSave').onclick=()=>{TT.key=$('ttKey').value.trim();TT.dir=$('ttDir').value;TT.spacing=+$('ttSpacing').value;TT.every=+$('ttEvery').value;TT.limit=Math.max(100,+$('ttLimit').value||20000);['key','dir','spacing','every','limit'].forEach(k=>LS.set('tt_'+k,TT[k]));LIVE.traffic.segs=[];const m=$('ttMsg');m.className='msg okc';m.textContent='Configuración guardada en este navegador.';renderLiveAll();setBase(LS.get('base','esri'));setNetFlow(LS.get('netflow',false));if(TT.key&&LIVE.show.traffic)refreshTrafficLayer(true)};
  $('ttNow').onclick=()=>{if(!TT.key){const m=$('ttMsg');m.className='msg err';m.textContent='Primero guarda una API key.';return}refreshTrafficLayer(true)};
  ['ttDir','ttSpacing','ttEvery'].forEach(id=>$(id).onchange=()=>{const m=$('ttMsg');m.className='msg';m.textContent='Cambios sin guardar.'});
  $('liveRefreshAll').onclick=()=>{refreshWeatherLayer();refreshRiversLayer();if(TT.key&&LIVE.show.traffic)refreshTrafficLayer(true)};
  $('spSite').value=LS.get('sp_site','');$('spList').value=LS.get('sp_list','');$('spLoad').onclick=loadWorksFromSharePoint;
  renderLiveAll();
  if(LIVE.show.weather)refreshWeatherLayer();
  if(LIVE.show.rivers)refreshRiversLayer();
  if(LIVE.show.traffic&&TT.key&&Number(TT.every)>0)refreshTrafficLayer(false);
  LIVE.timer=setInterval(()=>{if(document.hidden)return;const now=Date.now();
    if(LIVE.show.weather&&(!LIVE.weather.at||now-LIVE.weather.at>LIVE_CFG.weatherEveryMin*60000))refreshWeatherLayer();
    if(LIVE.show.rivers&&(!LIVE.rivers.at||now-LIVE.rivers.at>LIVE_CFG.riversEveryMin*60000))refreshRiversLayer();
    if(LIVE.show.traffic&&TT.key&&Number(TT.every)>0&&(!LIVE.traffic.at||now-LIVE.traffic.at>TT.every*60000))refreshTrafficLayer(false)},30000);
}

/* =====================================================================
   v5 · DATOS DEL PIPELINE · INCIDENTES · CENTRO DE ALERTAS · HISTÓRICO · BÚSQUEDA
   ===================================================================== */
const RC=Object.assign({dataBase:'data/',staticBase:'data/static/',refreshMinutes:5,repoUrl:''},window.RDM_CONFIG||{});
const SERVER={manifest:null,works:null,worksGen:null,incidents:null,traffic:null,mode:'vigente',histDate:null};
const INC={list:[],seen:new Set(LS.get('inc_seen',[])),filter:LS.get('inc_filter','ruta')};
const OPT={toast:LS.get('opt_toast',true),sound:LS.get('opt_sound',false),notif:LS.get('opt_notif',false)};
const SEVN={alta:3,media:2,baja:1};
const WF={date:'',touched:false};
const WSTATE=new Map(Object.entries(LS.get('work_state',{})));
LIVE.show.incidents=LS.get('show_incidents',true);

async function getJSON(path,bust=true){const r=await fetch(RC.dataBase+path+(bust?(path.includes('?')?'&':'?')+'t='+Date.now():''),{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} · ${path}`);return r.json()}
async function getText(path){const r=await fetch(RC.dataBase+path+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} · ${path}`);return r.text()}
function ago(iso){if(!iso)return '—';const t=Date.parse(iso);if(!Number.isFinite(t))return '—';const m=Math.round((Date.now()-t)/60000);if(m<1)return 'recién';if(m<60)return `hace ${m} min`;const h=Math.round(m/60);if(h<48)return `hace ${h} h`;return `hace ${Math.round(h/24)} días`}
function fmtDateISO(d){return d&&/^\d{4}-\d{2}-\d{2}/.test(d)?`${d.slice(8,10)}-${d.slice(5,7)}-${d.slice(0,4)}`:(d||'')}
function fmtDT(iso){if(!iso)return '';const d=new Date(iso);return isNaN(d)?'':`${pad(d.getDate())}-${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function addDays(d,n){const t=new Date(d+'T12:00:00');t.setDate(t.getDate()+n);return localISO(t)}
function persistWorkState(w){if(!w||!w.id)return;if(w.estadoManual==='Programado')WSTATE.delete(w.id);else WSTATE.set(w.id,w.estadoManual);LS.set('work_state',Object.fromEntries([...WSTATE].slice(-500)))}

/* ---------- trabajos publicados por el pipeline ---------- */
function toAppWork(w){return {...w,nombre:w.trabajo,fechaISO:w.fecha,fecha:fmtDateISO(w.fecha),enEjecucion:false,estadoManual:WSTATE.get(w.id)||'Programado',horaInicioReal:'',horaTerminoReal:''}}
function applyWorks(list,label){
  data.Noche=[];data['Día']=[];
  (list||[]).forEach(w=>{const a=toAppWork(w);(a.tipo==='Noche'?data.Noche:data['Día']).push(a)});
  calcularFechaPromedio();fileState('btnWorks',data.Noche.length+data['Día'].length);buildWorkDates();renderMarkers();
  if(list&&list.length)scheduleWeatherWarmup();
  $('worksSrc').innerHTML=label||'';
}
function buildWorkDates(){
  const sel=$('workDate');const all=[...data.Noche,...data['Día']];
  const ds=[...new Set(all.map(w=>w.fechaISO).filter(Boolean))].sort();
  if(WF.date&&!ds.includes(WF.date))WF.date='';
  if(!WF.date&&!WF.touched&&ds.includes(localISO()))WF.date=localISO();
  sel.innerHTML=`<option value="">Todas las fechas (${all.length})</option>`+ds.map(d=>`<option value="${d}">${fmtDateISO(d)} · ${all.filter(w=>w.fechaISO===d).length} trabajos</option>`).join('');
  sel.value=WF.date;
}
async function loadServerWorks(){
  try{
    const cur=await getJSON('works/current.json');SERVER.works=cur;
    if(SERVER.mode!=='vigente'||cur.generated_at===SERVER.worksGen)return;
    SERVER.worksGen=cur.generated_at;
    const last=Object.values(cur.sources||{}).map(s=>s.received).filter(Boolean).sort().pop();
    applyWorks(cur.works,`Fuente: correo${last?' recibido '+fmtDT(last):''}${cur.mode==='ultimo_archivo'?'<br><b>Sin fechas vigentes: se muestra el último programa recibido.</b>':''}`);
  }catch(e){SERVER.works=null}
}

/* ---------- incidentes ---------- */
function incVisible(i){return INC.filter==='all'||i.relation==='ruta'}
function sevColor(s){return s==='alta'?'#dc2626':s==='media'?'#f59e0b':'#94a3b8'}
async function loadServerIncidents(){
  try{const d=await getJSON('incidents/live.json');SERVER.incidents=d;INC.list=d.incidents||[]}catch(e){SERVER.incidents=null;INC.list=[]}
  renderIncidents();notifyNewIncidents();renderAlertsPanel();renderLivePills();
}
function tipIncident(i){
  const works=i.related_works||[];
  return `<div class="ttHead"><span class="ttIcon">${i.icon}</span><div><div class="ttTitle" style="margin-left:0">${esc(i.category_name)}${i.description&&i.description!==i.category_name?' · '+esc(i.description):''}</div><div class="small">${i.route} km ${fmtKm(i.km_from)}${i.km_to-i.km_from>0.1?' – '+fmtKm(i.km_to):''} · ${esc(i.sector)}</div></div></div>
  <div class="grid"><div class="k">Severidad</div><div class="v"><span class="sevTag ${i.severity}">${i.severity}</span> ${i.relation==='ruta'?'en la ruta':'entorno inmediato ('+i.dist_m+' m)'}</div>
  <div class="k">Tramo</div><div class="v">${esc(i.from||'–')} → ${esc(i.to||'–')}</div>
  <div class="k">Demora</div><div class="v">${i.delay_s?Math.round(i.delay_s/60)+' min':'–'}${i.magnitude_name?' · magnitud '+esc(i.magnitude_name):''}</div>
  <div class="k">Largo</div><div class="v">${i.length_m?fmtNum(i.length_m/1000,2)+' km':'–'}</div>
  <div class="k">Inicio</div><div class="v">${fmtDT(i.start)||'–'}${i.first_seen?' · detectado '+fmtDT(i.first_seen):''}${i.cleared_at?' · despejado '+fmtDT(i.cleared_at):''}</div>
  ${works.length?`<div class="k">Trabajos en el tramo</div><div class="v">${works.map(w=>esc(w.trabajo)+(w.contratista?' ('+esc(w.contratista)+')':'')).join('<br>')}</div>`:''}</div>
  <div class="note" style="margin-top:8px">TomTom Traffic Incidents · ${ago(SERVER.incidents&&SERVER.incidents.generated_at)}</div>`;
}
function renderIncidents(){
  if(!map||!LAYERS.inc)return;LAYERS.inc.clearLayers();if(!LIVE.show.incidents)return;
  INC.list.forEach(i=>{
    if(!incVisible(i))return;
    if(i.geometry&&i.geometry.length>1){
      L.polyline(i.geometry,{pane:'incPane',color:'#000',weight:10,opacity:.35,interactive:false}).addTo(LAYERS.inc);
      L.polyline(i.geometry,{pane:'incPane',color:sevColor(i.severity),weight:5,opacity:.95,dashArray:(i.category===7||i.category===8)?'6 6':null,interactive:false}).addTo(LAYERS.inc);
    }
    const m=liveMarker(`inc sev-${i.severity} ${i.relation}`,i.route,i.km,`<div class="incdot">${i.icon}</div><div class="lbl">${esc(i.category_name)} · ${i.route} km ${fmtKm(i.km)}</div>`,()=>tipIncident(i),[i.lat,i.lon]);
    m.setZIndexOffset(1200+SEVN[i.severity]*100);m.addTo(LAYERS.inc);
  });
}
function notifyNewIncidents(){
  const fresh=INC.list.filter(i=>!INC.seen.has(i.id));
  const important=fresh.filter(i=>i.relation==='ruta'&&SEVN[i.severity]>=2).sort((a,b)=>SEVN[b.severity]-SEVN[a.severity]);
  fresh.forEach(i=>INC.seen.add(i.id));LS.set('inc_seen',[...INC.seen].slice(-400));
  if(OPT.toast){important.slice(0,3).forEach(i=>toast(i));if(important.length>3)toast(null,`+${important.length-3} incidentes nuevos más en el Centro de alertas`)}
  if(OPT.sound&&important.some(i=>i.severity==='alta'))beep();
  if(OPT.notif&&'Notification' in window&&Notification.permission==='granted')important.slice(0,3).forEach(i=>{try{new Notification(`${i.icon} ${i.category_name} · ${i.route} km ${fmtKm(i.km)}`,{body:`${i.sector} · ${i.description||''}`,tag:i.id})}catch(e){}});
}
function toast(i,text){
  const el=document.createElement('div');el.className='toast '+(i?i.severity:'info');
  el.innerHTML=i?`<span class="x" title="Cerrar">✕</span><b>${i.icon} ${esc(i.category_name)} · ${i.route} km ${fmtKm(i.km)}</b><div>${esc(i.sector)}${i.description?' · '+esc(i.description):''}</div><div class="small">${i.relation==='ruta'?'En la ruta':'Entorno'}${i.start?' · desde '+fmtDT(i.start):''} · clic para ver</div>`:`<span class="x">✕</span>${esc(text)}`;
  el.onclick=e=>{if(!e.target.classList.contains('x')){if(i)focusIncident(i);else if(!$('alertsPanel').classList.contains('open'))togglePanel('alertsToggle','alertsPanel',renderAlertsPanel)}el.remove()};
  $('toasts').appendChild(el);setTimeout(()=>el.remove(),i&&i.severity==='alta'?30000:15000);
}
function beep(){try{const a=new (window.AudioContext||window.webkitAudioContext)();const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=880;g.gain.setValueAtTime(.0001,a.currentTime);g.gain.exponentialRampToValueAtTime(.25,a.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.6);o.connect(g).connect(a.destination);o.start();o.stop(a.currentTime+.65)}catch(e){}}
function showTipAtLatLng(ll,html,hit){const p=map.latLngToContainerPoint(ll);const r=map.getContainer().getBoundingClientRect();const ev={clientX:r.left+p.x,clientY:r.top+p.y};if(hit){pinned=hit;showTipAt(ev,hit)}else{pinned={type:'live'};activeTooltipWork=null;showLiveTip(ev,html)}}
function focusIncident(i){if(tourOn)stopTour();const ll=[i.lat,i.lon];map.flyTo(ll,Math.max(map.getZoom(),15),{duration:.9});map.once('moveend',()=>setTimeout(()=>showTipAtLatLng(ll,tipIncident(i)),60))}
function focusWork(w){
  if(tourOn)stopTour();
  if(WF.date&&w.fechaISO&&w.fechaISO!==WF.date){WF.date='';WF.touched=true;$('workDate').value='';renderMarkers()}
  const ll=llAt(w.route,w.km);map.flyTo(ll,Math.max(map.getZoom(),15),{duration:.9});
  map.once('moveend',()=>setTimeout(()=>showTipAtLatLng(ll,'',{type:'work',cls:w.tipo==='Noche'?'Noche':'Día',data:w}),60));
}
function renderAlertsPanel(){
  const box=$('alertList');if(!box)return;
  const list=INC.list.filter(incVisible);const gen=SERVER.incidents&&SERVER.incidents.generated_at;
  $('alertsAge').textContent=gen?'TomTom '+ago(gen):'';
  document.querySelectorAll('#alertFilter button').forEach(b=>b.classList.toggle('on',b.dataset.f===INC.filter));
  const other=liveAlerts();let html='';
  if(!SERVER.incidents)html+=`<div class="empty">Aún no hay incidentes publicados por el pipeline.<br><span class="small">Se generan con la API de TomTom en GitHub Actions.</span></div>`;
  else if(!list.length)html+=`<div class="alertCard ok"><div class="h"><span class="ic">✅</span>Sin incidentes ${INC.filter==='ruta'?'en la ruta':'en la ruta ni en su entorno'}</div><div class="m">Último reporte ${ago(gen)} · ${SERVER.incidents.corridor_total||0} incidentes en el corredor regional, ninguno asociado a la concesión.</div></div>`;
  else ['alta','media','baja'].forEach(sev=>{const g=list.filter(i=>i.severity===sev);if(!g.length)return;
    html+=`<div class="groupTitle">Severidad ${sev} · ${g.length}</div>`+g.map(i=>`<div class="alertCard ${sev}" data-inc="${esc(i.id)}"><div class="h"><span class="ic">${i.icon}</span>${esc(i.category_name)} · ${i.route} km ${fmtKm(i.km)}<span class="when">${fmtDT(i.start)}</span></div><div class="m">${esc(i.sector)}${i.description?' · '+esc(i.description):''}${i.delay_s?' · demora '+Math.round(i.delay_s/60)+' min':''}</div><div class="tags">${i.relation!=='ruta'?'<span class="sevTag">entorno</span>':''}${(i.related_works||[]).length?`<span class="sevTag media">🚧 ${i.related_works.length} trabajo(s) programado(s) en el tramo</span>`:''}</div></div>`).join('')});
  if(other.length)html+=`<div class="groupTitle">Clima, ríos y tráfico</div>`+other.slice(0,10).map((a,k)=>`<div class="alertCard ${a.cls==='bad'?'alta':'media'}" data-oth="${k}"><div class="m" style="margin:0">${a.html}</div></div>`).join('');
  box.innerHTML=html;
  box.querySelectorAll('[data-inc]').forEach(el=>el.onclick=()=>{const i=INC.list.find(x=>x.id===el.dataset.inc);if(i)focusIncident(i)});
  box.querySelectorAll('[data-oth]').forEach(el=>el.onclick=()=>{const a=other[+el.dataset.oth];focusKm(a.route,a.km)});
  updateAlertBadge();
}
function updateAlertBadge(){const b=$('alertBadge');if(!b)return;const r=INC.list.filter(i=>i.relation==='ruta'&&SEVN[i.severity]>=2);b.textContent=r.length;b.classList.toggle('on',r.length>0);b.classList.toggle('warn',r.length>0&&!r.some(i=>i.severity==='alta'))}
function handleHash(){
  const m=location.hash.match(/^#inc=(.+)$/);if(!m)return;const id=decodeURIComponent(m[1]);
  const i=INC.list.find(x=>x.id===id);if(i){focusIncident(i);return}
  getJSON('incidents/history/index.json').then(async idx=>{for(const mo of Object.keys(idx.months||{}).sort().reverse()){const doc=await getJSON(idx.months[mo].file);const h=doc.incidents&&doc.incidents[id];if(h){focusIncident(h);return}}}).catch(()=>{});
}

/* ---------- tráfico publicado por el pipeline ---------- */
async function loadServerTraffic(){
  try{
    const d=await getJSON('traffic/live.json');SERVER.traffic=d;const T=LIVE.traffic;
    if(T.loading)return;
    if(T.src==='navegador'&&T.at&&T.at>=new Date(d.generated_at))return;
    T.segs=(d.segments||[]).map(s=>({...s,span:d.spacing_km,flags:s.flags||[]}));T.at=new Date(d.generated_at);T.src='servidor';T.err=null;
    renderLiveAll();
  }catch(e){SERVER.traffic=null}
}

/* ---------- estado de las fuentes ---------- */
async function loadManifest(){try{SERVER.manifest=await getJSON('manifest.json')}catch(e){SERVER.manifest=null}renderSrcStatus()}
function renderSrcStatus(){
  const el=$('srcStatus');if(!el)return;const m=SERVER.manifest;
  if(!m){el.innerHTML='No se encontraron datos publicados (data/manifest.json). La app funciona con carga manual y con las capas en vivo de clima y caudales.';return}
  const L=m.last||{};const u=(m.usage||{})[localISO().slice(0,7)]||{};
  el.innerHTML=(m.demo?'<div class="msg err" style="margin-bottom:6px"><b>DATOS DE DEMOSTRACIÓN</b> · trabajos, incidentes históricos y tráfico son sintéticos.</div>':'')+`<div class="fresh"><span class="k">Correo revisado</span><span>${ago(L.mail)}</span><span class="k">Incidentes</span><span>${ago(L.incidents)}</span><span class="k">Tráfico</span><span>${ago(L.traffic)}</span><span class="k">Sitio publicado</span><span>${ago(m.built_at)}</span><span class="k">TomTom este mes</span><span>${fmtNum(u.flow||0,0)} flujo · ${fmtNum(u.incidents||0,0)} incidentes</span></div>${(m.errors||[]).length?`<div class="msg err" style="margin-top:6px">Último aviso: ${esc(m.errors[m.errors.length-1].msg)}</div>`:''}${RC.repoUrl?`<div style="margin-top:6px"><a href="${esc(RC.repoUrl)}" target="_blank" rel="noopener" style="color:#ffb27a">Ver repositorio</a></div>`:''}`;
}

/* ---------- histórico ---------- */
const HIST={tab:'works',worksIdx:null,incIdx:null,incMonth:null,incDoc:null,trIdx:null,trMonth:null,trRows:null,trRowsMonth:null,range:30,showIncOnMap:false};
async function renderHist(){
  const body=$('histBody');document.querySelectorAll('#histTabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===HIST.tab));
  try{if(HIST.tab==='works')await histWorks(body);else if(HIST.tab==='inc')await histInc(body);else await histTraffic(body)}
  catch(e){body.innerHTML=`<div class="empty">Todavía no hay histórico publicado para esta sección.<br><span class="small">${esc(e.message)}</span></div>`}
}
function niceMax(v){const p=Math.pow(10,Math.floor(Math.log10(Math.max(1,v))));const m=v/p;return (m<=1?1:m<=2?2:m<=5?5:10)*p}
function roundTop(x,y,w,h,r){return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`}
function barSVG(items,{h=120,sel=null}={}){
  const W=540,P={l:30,r:6,t:10,b:20};const n=items.length;if(!n)return '<div class="small">Sin datos</div>';
  const nice=niceMax(Math.max(1,...items.map(i=>i.v)));const bw=(W-P.l-P.r)/n;const barW=Math.min(24,Math.max(2,bw-2));let g='';
  [0,.5,1].forEach(f=>{const y=P.t+(h-P.t-P.b)*(1-f);g+=`<line class="grid" x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}"/><text x="${P.l-5}" y="${y+3}" text-anchor="end">${fmtNum(nice*f,0)}</text>`});
  items.forEach((it,i)=>{const x=P.l+i*bw+(bw-barW)/2;const bh=(h-P.t-P.b)*it.v/nice;const y=h-P.b-bh;const r=Math.min(4,barW/2,bh);
    if(bh>0)g+=`<path class="bar${it.k===sel?' sel':''}" d="${roundTop(x,y,barW,bh,r)}"/>`;
    g+=`<rect class="hit" data-k="${esc(it.k)}" data-tip="${esc(it.tip)}" x="${P.l+i*bw}" y="${P.t}" width="${bw}" height="${h-P.t-P.b}"/>`;
    if(it.label)g+=`<text x="${x+barW/2}" y="${h-6}" text-anchor="middle">${esc(it.label)}</text>`});
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">${g}</svg>`;
}
function lineSVG(hours){
  const W=540,H=120,P={l:30,r:8,t:10,b:20};const pts=hours.filter(x=>x.v!=null);if(!pts.length)return '<div class="small">Sin datos</div>';
  const x=hh=>P.l+hh*(W-P.l-P.r)/23,y=v=>P.t+(H-P.t-P.b)*(1-Math.min(1.1,v)/1.1);let g='';
  [0,.5,1].forEach(f=>{g+=`<line class="grid" x1="${P.l}" x2="${W-P.r}" y1="${y(f)}" y2="${y(f)}"/><text x="${P.l-5}" y="${y(f)+3}" text-anchor="end">${f*100}</text>`});
  const d=pts.map((p,i)=>(i?'L':'M')+x(p.h).toFixed(1)+','+y(p.v).toFixed(1)).join('');
  g+=`<path class="area" d="${d}L${x(pts[pts.length-1].h)},${y(0)}L${x(pts[0].h)},${y(0)}Z"/><path class="line" d="${d}"/>`;
  pts.forEach(p=>{g+=`<circle class="dotm" cx="${x(p.h)}" cy="${y(p.v)}" r="4"/><rect class="hit" data-k="${p.h}" data-tip="${pad(p.h)}:00 · ${fmtNum(p.v*100,0)}% de la velocidad libre (${p.n} mediciones)" x="${x(p.h)-10}" y="${P.t}" width="20" height="${H-P.t-P.b}"/>`});
  [0,6,12,18,23].forEach(hh=>g+=`<text x="${x(hh)}" y="${H-6}" text-anchor="middle">${pad(hh)}h</text>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
function hbars(obj,max=8){const e=Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,max);const mx=Math.max(1,...e.map(x=>x[1]));return e.length?e.map(([k,v])=>`<div class="hbar"><span class="t" title="${esc(k)}">${esc(k)}</span><span class="track"><i style="width:${(v/mx*100).toFixed(1)}%"></i></span><span class="n">${fmtNum(v,0)}</span></div>`).join(''):'<div class="small">Sin datos</div>'}
function bindChartTips(root,onClick){root.querySelectorAll('svg.chart .hit').forEach(el=>{el.addEventListener('mouseenter',e=>{if(!pinned)showLiveTip(e,`<div class="small" style="font-size:12px">${esc(el.dataset.tip)}</div>`)});el.addEventListener('mousemove',e=>{if(!pinned)positionTooltip(e)});el.addEventListener('mouseleave',()=>{if(!pinned)tooltip.style.display='none'});if(onClick)el.addEventListener('click',()=>{tooltip.style.display='none';onClick(el.dataset.k)})})}
function parseCSV(t){const L=t.trim().split(/\r?\n/);const h=L.shift().split(',');return L.map(l=>{const c=l.split(',');const o={};h.forEach((k,i)=>o[k]=c[i]);return o})}

async function histWorks(body){
  if(!HIST.worksIdx)HIST.worksIdx=await getJSON('works/index.json');
  const D=HIST.worksIdx.dates||{};const all=Object.keys(D).filter(d=>/^\d{4}-/.test(d)).sort();
  if(!all.length){body.innerHTML='<div class="empty">Aún no hay programas de trabajo registrados.</div>';return}
  const last=all[all.length-1];const from=HIST.range?addDays(last,-HIST.range+1):all[0];const ds=all.filter(d=>d>=from);
  const tot=ds.reduce((a,d)=>a+D[d].n,0),no=ds.reduce((a,d)=>a+D[d].noche,0),kmS=ds.reduce((a,d)=>a+(D[d].km_segregados||0),0);
  const ctr={};ds.forEach(d=>Object.entries(D[d].contratistas||{}).forEach(([k,v])=>ctr[k]=(ctr[k]||0)+v));
  const days=[];for(let d=from;d<=last;d=addDays(d,1))days.push(d);
  const every=Math.ceil(days.length/12);
  body.innerHTML=`<div class="hrow"><div class="small">${all.length} fechas registradas · desde ${fmtDateISO(all[0])}</div><select class="select" id="hRange"><option value="14">Últimos 14 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="0">Todo</option></select></div>
  <div class="kpis"><div class="kpi"><b>${fmtNum(tot,0)}</b><span>Trabajos</span></div><div class="kpi"><b>${fmtNum(no,0)}</b><span>Nocturnos</span></div><div class="kpi"><b>${fmtNum(tot-no,0)}</b><span>Diurnos</span></div><div class="kpi"><b>${fmtNum(kmS,1)}</b><span>km programados</span></div></div>
  <div class="chartBox"><div class="ct">Trabajos por día · clic en una barra para verlos en el mapa</div>${barSVG(days.map((d,i)=>({k:d,v:D[d]?D[d].n:0,label:i%every===0?d.slice(8,10)+'/'+d.slice(5,7):'',tip:`${fmtDateISO(d)} · ${D[d]?D[d].n:0} trabajos${D[d]?` (${D[d].noche} noche · ${D[d].dia} día)`:''}`})),{sel:SERVER.histDate})}</div>
  <div class="chartBox"><div class="ct">Trabajos por contratista</div>${hbars(ctr)}</div>
  <table class="tbl"><tr><th>Fecha</th><th>Trabajos</th><th>Noche / Día</th><th>Fuente</th></tr>${ds.slice().reverse().slice(0,45).map(d=>`<tr data-go="${d}"><td>${fmtDateISO(d)}</td><td>${D[d].n}</td><td>${D[d].noche} / ${D[d].dia}</td><td class="small">${esc((D[d].source&&D[d].source.filename)||'')}${D[d].revisions?` · ${D[d].revisions+1} versiones`:''}</td></tr>`).join('')}</table>`;
  $('hRange').value=String(HIST.range);$('hRange').onchange=e=>{HIST.range=+e.target.value;renderHist()};
  bindChartTips(body,d=>{if(D[d])showHistDay(d)});body.querySelectorAll('tr[data-go]').forEach(tr=>tr.onclick=()=>showHistDay(tr.dataset.go));
}
async function showHistDay(d){
  const meta=HIST.worksIdx.dates[d];const day=await getJSON(meta.file,false);
  SERVER.mode='historico';SERVER.histDate=d;WF.date='';WF.touched=true;
  applyWorks(day.works,`Histórico ${fmtDateISO(d)} · ${esc((day.source&&day.source.filename)||'')}`);
  $('histBannerTxt').textContent=`Mostrando trabajos del ${fmtDateISO(d)} (histórico)`;$('histBanner').classList.add('on');renderHist();
}
function backToCurrent(){SERVER.mode='vigente';SERVER.histDate=null;SERVER.worksGen=null;WF.touched=false;$('histBanner').classList.remove('on');loadServerWorks();if($('histPanel').classList.contains('open'))renderHist()}

async function histInc(body){
  if(!HIST.incIdx)HIST.incIdx=await getJSON('incidents/history/index.json');
  const months=Object.keys(HIST.incIdx.months||{}).sort();
  if(!months.length){body.innerHTML='<div class="empty">Aún no hay incidentes registrados.</div>';return}
  if(!HIST.incMonth||!months.includes(HIST.incMonth))HIST.incMonth=months[months.length-1];
  if(!HIST.incDoc||HIST.incDoc.month!==HIST.incMonth)HIST.incDoc=await getJSON(HIST.incIdx.months[HIST.incMonth].file);
  const list=Object.values(HIST.incDoc.incidents||{}).filter(incVisible).sort((a,b)=>(b.first_seen||'').localeCompare(a.first_seen||''));
  const byCat={};list.forEach(i=>byCat[i.category_name]=(byCat[i.category_name]||0)+1);
  const bins=[{k:'ASS',label:'ASS',v:list.filter(i=>i.route==='ASS').length}];
  for(let k=30;k<220;k+=10)bins.push({k:'R5-'+k,label:k%50===0?String(k):'',v:list.filter(i=>i.route==='R5'&&i.km>=k&&i.km<k+10).length});
  bins.forEach(b=>b.tip=b.k==='ASS'?`Acceso Sur · ${b.v} incidentes`:`R5 km ${b.k.slice(3)}–${+b.k.slice(3)+10} · ${b.v} incidentes`);
  const dur=list.filter(i=>i.cleared_at&&i.first_seen).map(i=>(Date.parse(i.cleared_at)-Date.parse(i.first_seen))/60000);
  body.innerHTML=`<div class="hrow"><select class="select" id="hMonth">${months.map(m=>`<option value="${m}">${m.slice(5)}-${m.slice(0,4)}</option>`).join('')}</select><div class="segs" style="margin:0;min-width:210px" id="hIncF"><button type="button" data-f="ruta">En la ruta</button><button type="button" data-f="all">Con entorno</button></div><label class="chk2" style="margin:0"><input type="checkbox" id="hIncMap"> Ver en mapa</label></div>
  <div class="kpis"><div class="kpi"><b>${list.length}</b><span>Incidentes</span></div><div class="kpi"><b>${list.filter(i=>i.category===1).length}</b><span>Accidentes</span></div><div class="kpi"><b>${list.filter(i=>i.severity==='alta').length}</b><span>Severidad alta</span></div><div class="kpi"><b>${dur.length?fmtNum(median(dur),0)+' min':'–'}</b><span>Duración mediana</span></div></div>
  <div class="chartBox"><div class="ct">Incidentes por tramo (R5 cada 10 km) · clic para ir</div>${barSVG(bins,{h:110})}</div>
  <div class="chartBox"><div class="ct">Por tipo</div>${hbars(byCat)}</div>
  <table class="tbl"><tr><th>Detectado</th><th>Tipo</th><th>Ubicación</th><th>Duración</th></tr>${list.slice(0,60).map(i=>`<tr data-go="${esc(i.id)}"><td>${fmtDT(i.first_seen)}</td><td>${i.icon} ${esc(i.category_name)} <span class="sevTag ${i.severity}">${i.severity}</span></td><td>${i.route} km ${fmtKm(i.km)}<div class="small">${esc(i.sector)}</div></td><td>${i.cleared_at?fmtNum((Date.parse(i.cleared_at)-Date.parse(i.first_seen))/60000,0)+' min':'activo'}</td></tr>`).join('')}</table>`;
  $('hMonth').value=HIST.incMonth;$('hMonth').onchange=e=>{HIST.incMonth=e.target.value;renderHist()};
  body.querySelectorAll('#hIncF button').forEach(b=>{b.classList.toggle('on',b.dataset.f===INC.filter);b.onclick=()=>{INC.filter=b.dataset.f;LS.set('inc_filter',INC.filter);renderIncidents();renderAlertsPanel();renderHist()}});
  $('hIncMap').checked=HIST.showIncOnMap;$('hIncMap').onchange=e=>{HIST.showIncOnMap=e.target.checked;renderIncHistLayer(list)};renderIncHistLayer(list);
  bindChartTips(body,k=>{if(tourOn)stopTour();if(k==='ASS')map.flyToBounds(L.latLngBounds(routeLine('ASS',1,46)),{padding:[60,60]});else{const a=+k.slice(3);map.flyToBounds(L.latLngBounds(routeLine('R5',a,a+10)),{padding:[60,60]})}});
  body.querySelectorAll('tr[data-go]').forEach(tr=>tr.onclick=()=>{const i=list.find(x=>x.id===tr.dataset.go);if(i)focusIncident(i)});
}
function renderIncHistLayer(list){if(!LAYERS.incHist)return;LAYERS.incHist.clearLayers();if(!HIST.showIncOnMap)return;list.forEach(i=>liveMarker('inchist',i.route,i.km,`<div class="dot" style="background:${sevColor(i.severity)}"></div>`,()=>tipIncident(i),[i.lat,i.lon]).addTo(LAYERS.incHist))}

async function histTraffic(body){
  if(!HIST.trIdx)HIST.trIdx=await getJSON('traffic/history/index.json');
  const months=Object.keys(HIST.trIdx.months||{}).sort();
  if(!months.length){body.innerHTML='<div class="empty">Aún no hay mediciones de tráfico registradas.</div>';return}
  if(!HIST.trMonth||!months.includes(HIST.trMonth))HIST.trMonth=months[months.length-1];
  if(HIST.trRowsMonth!==HIST.trMonth){HIST.trRows=parseCSV(await getText(HIST.trIdx.months[HIST.trMonth].file));HIST.trRowsMonth=HIST.trMonth}
  const rows=HIST.trRows.filter(r=>r.ratio!==''&&r.ratio!=null&&r.ratio!=='None').map(r=>({...r,km:+r.km,ratio:+r.ratio}));
  const seg={};rows.forEach(r=>{const k=r.route+'|'+r.km+'|'+r.dir;(seg[k]=seg[k]||{route:r.route,km:r.km,dir:r.dir,v:[]}).v.push(r.ratio)});
  const segs=Object.values(seg).map(s=>({...s,avg:s.v.reduce((a,b)=>a+b,0)/s.v.length,low:s.v.filter(x=>x<0.65).length/s.v.length})).sort((a,b)=>a.avg-b.avg);
  const hours=Array.from({length:24},(_,hh)=>{const v=rows.filter(r=>new Date(r.timestamp).getHours()===hh).map(r=>r.ratio);return{h:hh,v:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,n:v.length}});
  const snaps=new Set(rows.map(r=>r.timestamp)).size;const n=Math.max(1,rows.length);
  body.innerHTML=`<div class="hrow"><select class="select" id="hTrM">${months.map(m=>`<option value="${m}">${m.slice(5)}-${m.slice(0,4)}</option>`).join('')}</select><div class="small">${snaps} mediciones · ${segs.length} tramos por sentido</div></div>
  <div class="kpis"><div class="kpi"><b>${fmtNum(rows.reduce((a,r)=>a+r.ratio,0)/n*100,0)}%</b><span>Velocidad vs libre</span></div><div class="kpi"><b>${fmtNum(rows.filter(r=>r.ratio<0.65).length/n*100,1)}%</b><span>Mediciones lentas</span></div><div class="kpi"><b>${rows.filter(r=>r.closed==='1').length}</b><span>Cierres medidos</span></div><div class="kpi"><b>${snaps}</b><span>Mediciones</span></div></div>
  <div class="chartBox"><div class="ct">Velocidad media relativa por hora del día (% de la velocidad libre)</div>${lineSVG(hours)}</div>
  <div class="chartBox"><div class="ct">Tramos con menor velocidad relativa · clic para ir</div><table class="tbl"><tr><th>Tramo</th><th>Sentido</th><th>Media</th><th>% lento</th></tr>${segs.slice(0,10).map(s=>`<tr data-go="${s.route}|${s.km}"><td>${s.route} km ${fmtKm(s.km)} · ${esc(sectorName(s.route,s.km))}</td><td>${s.dir==='S'?'Sur':'Norte'}</td><td>${fmtNum(s.avg*100,0)}%</td><td>${fmtNum(s.low*100,0)}%</td></tr>`).join('')}</table></div>`;
  $('hTrM').value=HIST.trMonth;$('hTrM').onchange=e=>{HIST.trMonth=e.target.value;renderHist()};
  bindChartTips(body);body.querySelectorAll('tr[data-go]').forEach(tr=>tr.onclick=()=>{const [r,k]=tr.dataset.go.split('|');focusKm(r,+k)});
}

/* ---------- búsqueda ---------- */
const SEARCH={items:[],sel:0};
function searchIndex(q){
  q=q.trim();const out=[];if(!q)return out;
  const f=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();const Q=f(q);
  const m=Q.match(/^(r5|ass|ruta 5|acceso sur)?\s*(km)?\s*(\d{1,3}(?:[.,]\d+)?)$/);
  if(m){const k=parseFloat(m[3].replace(',','.'));const r=m[1]?(m[1][0]==='a'?'ASS':'R5'):null;
    if((!r||r==='R5')&&k>=29.5&&k<=219.5)out.push({k:'km',t:`Ruta 5 Sur · km ${fmtKm(k)}`,s:sectorName('R5',k),go:()=>focusKm('R5',k)});
    if((!r||r==='ASS')&&k>=1&&k<=46.5)out.push({k:'km',t:`Acceso Sur · km ${fmtKm(k)}`,s:sectorName('ASS',k),go:()=>focusKm('ASS',k)})}
  if(Q.length<2)return out;
  Object.entries(SECTORS).forEach(([r,arr])=>arr.forEach(([a,b,n])=>{if(f(n).includes(Q))out.push({k:'sector',t:n,s:`${r} km ${fmtKm(a)} – ${fmtKm(b)}`,go:()=>{if(tourOn)stopTour();map.flyToBounds(L.latLngBounds(routeLine(r,Math.max(a,r==='ASS'?1:29.5),Math.min(b,r==='ASS'?46.5:219.5))),{padding:[70,70],duration:.9})}})}));
  RIVERS.forEach(rv=>{if(f(rv.name+' '+rv.sub).includes(Q))out.push({k:'río',t:rv.name,s:`${rv.sub} · ${rv.route} km ${fmtKm(rv.km)}`,go:()=>{if(tourOn)stopTour();map.flyTo([rv.lat,rv.lon],15)}})});
  INC.list.forEach(i=>{if(f([i.category_name,i.description,i.sector,i.from,i.to].join(' ')).includes(Q))out.push({k:'incidente',t:`${i.icon} ${i.category_name} · ${i.route} km ${fmtKm(i.km)}`,s:i.sector,go:()=>focusIncident(i)})});
  [...data.Noche,...data['Día']].forEach(w=>{if(f([w.trabajo,w.contratista,w.sector,w.responsable,w.observacion,w.pistas].join(' ')).includes(Q))out.push({k:w.tipo==='Noche'?'trabajo 🌙':'trabajo ☀️',t:w.trabajo,s:`${w.route} km ${fmtKm(w.kmInicial)}–${fmtKm(w.kmFinal)} · ${w.contratista||''} · ${w.fecha||''}`,go:()=>focusWork(w)})});
  return out.slice(0,14);
}
function initSearch(){
  const q=$('q'),res=$('qres');
  const pick=i=>{const x=SEARCH.items[i];if(!x)return;res.classList.remove('open');q.blur();x.go()};
  const draw=()=>{const it=SEARCH.items;res.innerHTML=it.length?it.map((x,i)=>`<div class="qi${i===SEARCH.sel?' sel':''}" data-i="${i}" role="option"><div><div>${esc(x.t)}</div><span class="qs">${esc(x.s||'')}</span></div><span class="qk">${esc(x.k)}</span></div>`).join(''):'<div class="qi">Sin resultados · prueba con un km (ej: 112), un sector, un contratista o un río</div>';res.classList.toggle('open',!!q.value.trim());res.querySelectorAll('[data-i]').forEach(el=>el.onmousedown=e=>{e.preventDefault();pick(+el.dataset.i)})};
  q.addEventListener('input',()=>{SEARCH.items=searchIndex(q.value);SEARCH.sel=0;draw()});
  q.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){SEARCH.sel=Math.min(SEARCH.items.length-1,SEARCH.sel+1);draw();e.preventDefault()}else if(e.key==='ArrowUp'){SEARCH.sel=Math.max(0,SEARCH.sel-1);draw();e.preventDefault()}else if(e.key==='Enter'){pick(SEARCH.sel)}else if(e.key==='Escape'){q.value='';res.classList.remove('open');q.blur()}});
  q.addEventListener('blur',()=>setTimeout(()=>res.classList.remove('open'),150));
  q.addEventListener('focus',()=>{if(q.value.trim()){SEARCH.items=searchIndex(q.value);draw()}});
  document.addEventListener('keydown',e=>{const a=document.activeElement;if(e.key==='/'&&a!==q&&!/INPUT|TEXTAREA|SELECT/.test(a.tagName)){e.preventDefault();q.focus()}else if(e.key==='Escape'&&a!==q){closeAllPanels();pinned=null;tooltip.style.display='none'}});
}

function syncHistOpen(){document.body.classList.toggle('histOpen',$('histPanel').classList.contains('open')&&innerWidth>900)}
function initV5(){
  $('alertsToggle').onclick=()=>togglePanel('alertsToggle','alertsPanel',renderAlertsPanel);
  $('histToggle').onclick=()=>{togglePanel('histToggle','histPanel',renderHist);syncHistOpen()};
  $('histClose').onclick=()=>{$('histPanel').classList.remove('open');$('histToggle').classList.remove('active');syncHistOpen()};
  new MutationObserver(syncHistOpen).observe($('histPanel'),{attributes:true,attributeFilter:['class']});
  document.querySelectorAll('#histTabs button').forEach(b=>b.onclick=()=>{HIST.tab=b.dataset.t;renderHist()});
  document.querySelectorAll('#alertFilter button').forEach(b=>b.onclick=()=>{INC.filter=b.dataset.f;LS.set('inc_filter',INC.filter);renderIncidents();renderAlertsPanel()});
  $('histBack').onclick=backToCurrent;
  $('workDate').onchange=e=>{WF.date=e.target.value;WF.touched=true;renderMarkers()};
  [['optToast','toast'],['optSound','sound'],['optNotif','notif']].forEach(([id,k])=>{$(id).checked=!!OPT[k];$(id).onchange=async e=>{OPT[k]=e.target.checked;
    if(k==='notif'&&OPT.notif&&'Notification' in window&&Notification.permission!=='granted'){const p=await Notification.requestPermission();if(p!=='granted'){OPT.notif=false;e.target.checked=false}}
    LS.set('opt_'+k,OPT[k]);if(k==='sound'&&OPT.sound)beep()}});
  initSearch();
}

/* ===================== ARRANQUE ===================== */
async function boot(){
  try{[GEO,RIVERS,SECTORS]=await Promise.all(['route.json','rivers.json','sectors.json'].map(f=>fetch(RC.staticBase+f).then(r=>{if(!r.ok)throw new Error(f);return r.json()})))}
  catch(e){document.body.insertAdjacentHTML('beforeend',`<div class="toast" style="position:fixed;left:50%;top:40%;transform:translateX(-50%);z-index:999;max-width:460px">No se pudo cargar la geometría de la ruta (${esc(e.message)}).<br>Abre la app desde un servidor web (GitHub Pages o <code>python -m http.server</code>), no como archivo local.</div>`);return}
  buildLayers();initMap();events();initV5();renderMarkers();startClock();initLive();fadeHint();updateKmReadout();
  await Promise.all([loadManifest(),loadServerWorks(),loadServerIncidents(),loadServerTraffic()]);
  handleHash();addEventListener('hashchange',handleHash);
  setInterval(()=>{if(document.hidden)return;loadManifest();loadServerWorks();loadServerIncidents();loadServerTraffic()},Math.max(1,RC.refreshMinutes)*60000);
}
boot();

})();