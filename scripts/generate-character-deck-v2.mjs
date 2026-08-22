import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const brandDir = path.join(root, 'assets', 'brand');
const diagramDir = path.join(root, 'assets', 'diagrams');
await mkdir(brandDir, { recursive: true });
await mkdir(diagramDir, { recursive: true });

const C = {
  bg: '#050812', navy: '#0B1120', panel: '#0E1627', ivory: '#F7F1E2', muted: '#AEB5C2',
  gold: '#D8B86A', gold2: '#7B622D', ink: '#080B12', line: '#25304A',
};

const roles = [
  { id:'executive', fn:'EXECUTIVE', name:'THE SOVEREIGN', accent:'#D8B86A', skin:'#8B5B45', hair:'#16171B' },
  { id:'commercial', fn:'COMMERCIAL', name:'THE HUNTER', accent:'#EA5965', skin:'#C98E6B', hair:'#241B1E' },
  { id:'finance', fn:'FINANCE', name:'THE KEEPER', accent:'#54D39E', skin:'#624336', hair:'#171617' },
  { id:'operations', fn:'OPERATIONS', name:'THE FORGE', accent:'#F3954D', skin:'#B77956', hair:'#2A211D' },
  { id:'customer', fn:'CUSTOMER', name:'THE ENVOY', accent:'#59CAE9', skin:'#DBB28F', hair:'#432B25' },
  { id:'risk', fn:'ADMIN & RISK', name:'THE SENTINEL', accent:'#A784EF', skin:'#805542', hair:'#191721' },
  { id:'data', fn:'DATA', name:'THE ORACLE', accent:'#7187FA', skin:'#B98568', hair:'#171A29' },
  { id:'creative', fn:'CREATIVE', name:'THE SHAPER', accent:'#EB72B6', skin:'#6E4939', hair:'#251927' },
];

const esc = (v) => String(v).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));

function header(id, title, desc, viewBox='0 0 800 1200') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${esc(title)}</title>
<desc id="${id}-desc">${esc(desc)}</desc>`;
}

function defs(role, id) {
  return `<defs>
  <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#050812"/><stop offset=".55" stop-color="#0B1120"/><stop offset="1" stop-color="#02040A"/></linearGradient>
  <radialGradient id="${id}-halo" cx="50%" cy="36%" r="62%"><stop offset="0" stop-color="${role.accent}" stop-opacity=".34"/><stop offset=".45" stop-color="${role.accent}" stop-opacity=".10"/><stop offset="1" stop-color="${role.accent}" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}-cloth" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#24324A"/><stop offset=".46" stop-color="#111827"/><stop offset="1" stop-color="#080D17"/></linearGradient>
  <linearGradient id="${id}-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3DB9D"/><stop offset=".28" stop-color="${C.gold}"/><stop offset=".7" stop-color="#806530"/><stop offset="1" stop-color="#2D220E"/></linearGradient>
  <linearGradient id="${id}-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${role.skin}"/><stop offset=".52" stop-color="${role.skin}"/><stop offset="1" stop-color="#3B241D"/></linearGradient>
  <linearGradient id="${id}-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050812" stop-opacity="0"/><stop offset=".62" stop-color="#050812" stop-opacity=".16"/><stop offset="1" stop-color="#050812" stop-opacity=".98"/></linearGradient>
  <filter id="${id}-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="18"/></filter>
  <filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
  <clipPath id="${id}-art"><path d="M42 88 L96 34 H704 L758 88 V915 L704 970 H96 L42 915 Z"/></clipPath>
</defs>`;
}

function scene(role) {
  const a = role.accent;
  switch(role.id) {
    case 'executive': return `<g opacity=".55"><path d="M85 770 V310 H180 V770 M220 770 V205 H330 V770 M520 770 V240 H640 V770 M675 770 V350 H735 V770" fill="none" stroke="#B79B5B" stroke-opacity=".22" stroke-width="8"/><path d="M70 770 H745" stroke="#F6E6B0" stroke-opacity=".22"/><path d="M130 690 L660 350" stroke="${a}" stroke-opacity=".18" stroke-width="3"/></g>`;
    case 'commercial': return `<g fill="none" stroke="${a}"><path d="M45 760 C190 680 290 580 375 470 C470 345 590 270 760 170" stroke-opacity=".34" stroke-width="7"/><path d="M70 860 C230 720 330 740 470 590 C560 495 655 445 750 420" stroke-opacity=".15" stroke-width="4"/><circle cx="640" cy="300" r="110" stroke-opacity=".14"/><circle cx="640" cy="300" r="62" stroke-opacity=".24"/></g>`;
    case 'finance': return `<g fill="none" stroke="${a}"><circle cx="400" cy="465" r="290" stroke-opacity=".10" stroke-width="24"/><circle cx="400" cy="465" r="235" stroke-opacity=".18"/><path d="M100 770 H700 M130 810 H670 M165 850 H635" stroke-opacity=".20"/><path d="M160 175 H640 V820 H160 Z" stroke="#D8B86A" stroke-opacity=".10"/></g>`;
    case 'operations': return `<g opacity=".45"><path d="M80 760 H720 M110 760 V420 H220 V760 M260 760 V320 H370 V760 M420 760 V505 H535 V760 M575 760 V250 H695 V760" fill="none" stroke="${a}" stroke-opacity=".20" stroke-width="8"/><path d="M65 830 H735" stroke="#D8B86A" stroke-opacity=".2"/><g fill="${a}" fill-opacity=".3">${[[150,510],[210,600],[305,430],[510,590],[620,350]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5"/>`).join('')}</g></g>`;
    case 'customer': return `<g fill="none" stroke="${a}"><path d="M60 410 Q220 260 350 360" stroke-opacity=".22" stroke-width="5"/><path d="M740 490 Q590 300 455 390" stroke-opacity=".26" stroke-width="5"/><path d="M55 600 Q235 455 350 505" stroke-opacity=".12"/><circle cx="105" cy="405" r="9" fill="${a}"/><circle cx="700" cy="475" r="9" fill="${a}"/><circle cx="92" cy="600" r="6" fill="${a}"/></g>`;
    case 'risk': return `<g fill="none" stroke="${a}"><path d="M80 830 V205 H245 M720 830 V205 H555" stroke-opacity=".22" stroke-width="10"/><path d="M80 205 H245 M555 205 H720" stroke="#D8B86A" stroke-opacity=".18"/><path d="M400 130 L650 245 V545 Q620 735 400 875 Q180 735 150 545 V245 Z" stroke-opacity=".13" stroke-width="7"/></g>`;
    case 'data': return `<g fill="none" stroke="${a}" stroke-opacity=".25">${[[120,230],[690,180],[110,620],[700,700],[260,120],[580,840]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${i%2?7:10}" fill="${a}"/><path d="M${x} ${y} L400 450"/>`).join('')}<ellipse cx="400" cy="455" rx="280" ry="175" stroke-opacity=".13"/></g>`;
    case 'creative': return `<g fill="none"><path d="M60 700 C165 315 390 300 510 155 C620 30 755 160 720 360" stroke="${a}" stroke-opacity=".22" stroke-width="54"/><path d="M80 760 C260 700 260 475 435 470 C625 465 630 710 760 650" stroke="#D8B86A" stroke-opacity=".10" stroke-width="28"/><path d="M130 180 L270 120 L330 265 L210 335 Z M590 640 L725 580 L755 730 L620 780 Z" stroke="${a}" stroke-opacity=".22"/></g>`;
  }
}

function face(id, role, x, y, rx=50, ry=66, rotate=0) {
  return `<g transform="translate(${x} ${y}) rotate(${rotate})">
    <ellipse rx="${rx}" ry="${ry}" fill="url(#${id}-skin)"/>
    <path d="M-${rx*.9} -${ry*.45} Q0 -${ry*1.15} ${rx*.95} -${ry*.42} Q${rx*.7} -${ry*.88} 0 -${ry*.98} Q-${rx*.65} -${ry*.86} -${rx*.9} -${ry*.45}Z" fill="${role.hair}"/>
    <path d="M-${rx*.48} -4 H-${rx*.12} M${rx*.12} -4 H${rx*.48}" stroke="#F7F1E2" stroke-opacity=".72" stroke-width="5" stroke-linecap="round"/>
    <path d="M0 4 L-6 28 L8 26" fill="none" stroke="#E6C1A6" stroke-opacity=".45" stroke-width="2"/>
    <path d="M-17 45 Q0 54 18 42" fill="none" stroke="#F7D6C5" stroke-opacity=".38" stroke-width="2"/>
  </g>`;
}

function character(role, id) {
  const a = role.accent;
  switch(role.id) {
    case 'executive': return `<g filter="url(#${id}-soft)"><ellipse cx="400" cy="735" rx="255" ry="60" fill="#000" opacity=".34"/></g>
<g>
  <path d="M295 438 Q345 370 400 370 Q470 370 520 438 L590 855 L470 895 L400 760 L332 905 L205 870 Z" fill="url(#${id}-cloth)" stroke="${a}" stroke-opacity=".55" stroke-width="4"/>
  <path d="M310 445 L400 390 L490 445 L458 650 L400 710 L345 650 Z" fill="#111A2A"/>
  <path d="M320 452 L400 540 L480 452" fill="none" stroke="#F7F1E2" stroke-opacity=".30" stroke-width="6"/>
  <path d="M517 500 Q610 520 650 605" fill="none" stroke="#182238" stroke-width="42" stroke-linecap="round"/><ellipse cx="658" cy="620" rx="28" ry="18" fill="url(#${id}-skin)" transform="rotate(20 658 620)"/>
  <path d="M288 500 Q220 565 218 680" fill="none" stroke="#182238" stroke-width="40" stroke-linecap="round"/>
  <path d="M218 635 V865" stroke="#D8B86A" stroke-width="9"/><circle cx="218" cy="635" r="24" fill="#0E1627" stroke="#D8B86A" stroke-width="5"/><circle cx="218" cy="635" r="7" fill="${a}"/>
  ${face(id,role,400,305,50,66,-2)}
  <path d="M350 370 Q400 345 452 370" stroke="#D8B86A" stroke-opacity=".55" stroke-width="5"/>
</g>`;
    case 'commercial': return `<g><path d="M235 470 Q320 390 438 410 L560 500 L520 750 L640 920 L445 855 L330 685 L185 760 Z" fill="url(#${id}-cloth)" stroke="${a}" stroke-opacity=".62" stroke-width="4"/>
  <path d="M470 420 C575 355 655 270 750 185" fill="none" stroke="${a}" stroke-width="30" stroke-opacity=".42" stroke-linecap="round"/>
  <path d="M510 485 Q620 450 700 400" fill="none" stroke="#1A2538" stroke-width="34" stroke-linecap="round"/><ellipse cx="710" cy="394" rx="26" ry="17" fill="url(#${id}-skin)"/>
  <circle cx="712" cy="394" r="50" fill="none" stroke="${a}" stroke-width="7"/><circle cx="712" cy="394" r="26" fill="none" stroke="#D8B86A" stroke-opacity=".7"/>
  <path d="M270 500 Q190 535 125 620" fill="none" stroke="#1A2538" stroke-width="38" stroke-linecap="round"/><ellipse cx="120" cy="625" rx="27" ry="18" fill="url(#${id}-skin)" transform="rotate(-35 120 625)"/>
  ${face(id,role,430,325,48,64,7)}
  <path d="M355 430 L448 470 L518 432" fill="none" stroke="#F7F1E2" stroke-opacity=".2" stroke-width="5"/>
</g>`;
    case 'finance': return `<g><path d="M230 455 Q300 370 400 372 Q500 370 570 455 L640 860 Q515 930 400 870 Q285 930 160 860 Z" fill="url(#${id}-cloth)" stroke="${a}" stroke-opacity=".52" stroke-width="4"/>
  <path d="M250 470 Q170 545 205 650" fill="none" stroke="#152239" stroke-width="42"/><path d="M550 470 Q630 545 595 650" fill="none" stroke="#152239" stroke-width="42"/>
  <ellipse cx="230" cy="650" rx="26" ry="18" fill="url(#${id}-skin)"/><ellipse cx="570" cy="650" rx="26" ry="18" fill="url(#${id}-skin)"/>
  <g fill="none" stroke="${a}"><circle cx="400" cy="620" r="145" stroke-width="9"/><circle cx="400" cy="620" r="105" stroke-opacity=".55"/><path d="M255 620 H545 M400 475 V765" stroke="#D8B86A" stroke-opacity=".5"/></g>
  ${face(id,role,400,305,51,67,0)}
  <path d="M325 410 Q400 455 475 410" stroke="#D8B86A" stroke-opacity=".45" stroke-width="5"/>
</g>`;
    case 'operations': return `<g><path d="M210 455 Q270 360 385 375 Q535 385 590 505 L625 820 L490 900 L390 790 L300 900 L170 835 Z" fill="url(#${id}-cloth)" stroke="${a}" stroke-opacity=".56" stroke-width="4"/>
  <path d="M185 430 Q255 345 350 365 L315 500 L190 520 Z" fill="#252B35" stroke="${a}" stroke-width="6"/>
  <path d="M235 500 Q120 555 105 675" fill="none" stroke="#202B3A" stroke-width="52" stroke-linecap="round"/><ellipse cx="105" cy="680" rx="30" ry="20" fill="url(#${id}-skin)"/>
  <path d="M530 505 Q620 480 670 430" fill="none" stroke="#202B3A" stroke-width="48" stroke-linecap="round"/>
  <path d="M580 395 L715 210" stroke="#D8B86A" stroke-width="20" stroke-linecap="round"/><path d="M670 180 L760 245 L700 315 L615 250 Z" fill="#252A30" stroke="${a}" stroke-width="7"/>
  ${face(id,role,400,295,54,69,-4)}
  <path d="M350 390 L430 460 L500 398" fill="none" stroke="${a}" stroke-opacity=".35" stroke-width="8"/>
</g>`;
    case 'customer': return `<g><path d="M250 445 Q315 365 405 375 Q495 390 545 470 L565 850 L420 905 L335 830 L215 890 Z" fill="url(#${id}-cloth)" stroke="${a}" stroke-opacity=".5" stroke-width="4"/>
  <path d="M300 430 C235 530 240 650 160 750" fill="none" stroke="${a}" stroke-opacity=".45" stroke-width="34" stroke-linecap="round"/>
  <path d="M530 485 Q620 520 700 610" fill="none" stroke="#17243A" stroke-width="40" stroke-linecap="round"/><ellipse cx="710" cy="620" rx="31" ry="20" fill="url(#${id}-skin)" transform="rotate(15 710 620)"/>
  <path d="M270 490 Q205 530 185 610" fill="none" stroke="#17243A" stroke-width="36"/><ellipse cx="182" cy="615" rx="24" ry="16" fill="url(#${id}-skin)"/>
  ${face(id,role,405,302,49,64,2)}
  <circle cx="335" cy="430" r="12" fill="${a}"/><path d="M335 430 Q300 465 280 520" fill="none" stroke="${a}" stroke-opacity=".55"/>
</g>`;
    case 'risk': return `<g><path d="M295 450 Q360 365 440 380 Q525 395 570 495 L585 840 L455 910 L355 835 L255 900 L205 630 Z" fill="url(#${id}-cloth)" stroke="${a}" stroke-opacity=".52" stroke-width="4"/>
  <path d="M235 500 Q165 535 130 625" fill="none" stroke="#1A2236" stroke-width="42"/><path d="M80 475 L245 515 V785 L80 830 Q35 660 80 475 Z" fill="${a}" fill-opacity=".12" stroke="${a}" stroke-width="7"/><path d="M115 520 L210 545 V750 L115 780 Z" fill="none" stroke="#D8B86A" stroke-opacity=".5"/>
  <path d="M545 505 Q625 505 650 430" fill="none" stroke="#1A2236" stroke-width="38" stroke-linecap="round"/><ellipse cx="654" cy="422" rx="26" ry="18" fill="url(#${id}-skin)" transform="rotate(-15 654 422)"/>
  <path d="M678 415 H748 M710 380 V450" stroke="${a}" stroke-width="7" stroke-linecap="round"/>
  ${face(id,role,435,305,50,66,-3)}
  <path d="M380 388 L445 430 L505 392" fill="none" stroke="#D8B86A" stroke-opacity=".45" stroke-width="5"/>
</g>`;
    case 'data': return `<g><path d="M270 430 Q335 350 410 368 Q505 390 555 475 L600 885 L465 925 L405 790 L338 930 L205 895 Z" fill="url(#${id}-cloth)" stroke="${a}" stroke-opacity=".55" stroke-width="4"/>
  <path d="M535 500 Q620 505 650 585" fill="none" stroke="#152039" stroke-width="36"/><ellipse cx="650" cy="590" rx="24" ry="16" fill="url(#${id}-skin)"/>
  <g transform="translate(680 565)"><path d="M0 -54 L47 -18 L30 48 L-35 42 L-48 -22 Z" fill="${a}" fill-opacity=".12" stroke="${a}" stroke-width="5"/><path d="M-25 -8 L26 6 M-18 20 L18 -28" stroke="#D8B86A" stroke-opacity=".55"/></g>
  <path d="M280 500 Q205 555 180 665" fill="none" stroke="#152039" stroke-width="34"/><ellipse cx="180" cy="670" rx="23" ry="15" fill="url(#${id}-skin)"/>
  ${face(id,role,410,292,47,64,4)}
  <path d="M330 390 L410 448 L490 390" fill="none" stroke="${a}" stroke-opacity=".42" stroke-width="5"/>
</g>`;
    case 'creative': return `<g><path d="M250 450 Q310 360 375 370 Q480 380 535 480 L570 835 L450 900 L355 815 L210 875 Z" fill="url(#${id}-cloth)" stroke="${a}" stroke-opacity=".55" stroke-width="4"/>
  <path d="M300 480 Q215 530 160 615" fill="none" stroke="#1C2138" stroke-width="36"/><ellipse cx="155" cy="620" rx="25" ry="16" fill="url(#${id}-skin)"/>
  <path d="M525 500 Q625 500 690 420" fill="none" stroke="#1C2138" stroke-width="38"/><ellipse cx="697" cy="413" rx="25" ry="17" fill="url(#${id}-skin)"/>
  <path d="M695 410 C640 330 565 310 525 250 C470 170 505 110 610 105" fill="none" stroke="${a}" stroke-width="32" stroke-opacity=".48" stroke-linecap="round"/>
  <path d="M158 620 C250 650 305 610 350 535 C390 470 470 470 520 510" fill="none" stroke="#D8B86A" stroke-opacity=".26" stroke-width="18"/>
  ${face(id,role,385,295,50,65,8)}
  <path d="M320 395 L392 455 L470 405" fill="none" stroke="${a}" stroke-opacity=".4" stroke-width="6"/>
</g>`;
  }
}

function crest(role, id) {
  return `<g transform="translate(92 92)"><path d="M0 -34 L30 -18 L34 16 L12 38 L-12 38 L-34 16 L-30 -18 Z" fill="#070B14" stroke="url(#${id}-metal)" stroke-width="3"/><circle r="19" fill="${role.accent}" fill-opacity=".18" stroke="${role.accent}"/><path d="M-8 0 H8 M0 -8 V8" stroke="#F7F1E2" stroke-width="3" stroke-linecap="round"/></g>`;
}

function cardSvg(role) {
  const id = `v2-${role.id}`;
  return `${header(`card-${role.id}`, `${role.fn} — ${role.name}`, `XanxitoSpA Character Deck V2 concept portrait for ${role.fn}.`)}
${defs(role,id)}
<rect width="800" height="1200" rx="34" fill="url(#${id}-bg)"/>
<g clip-path="url(#${id}-art)"><rect x="40" y="34" width="720" height="940" fill="#070B14"/><circle cx="405" cy="420" r="390" fill="url(#${id}-halo)"/>${scene(role)}${character(role,id)}<rect x="42" y="650" width="716" height="320" fill="url(#${id}-fade)"/></g>
<path d="M42 88 L96 34 H704 L758 88 V1110 L704 1166 H96 L42 1110 Z" fill="none" stroke="url(#${id}-metal)" stroke-width="7"/>
<path d="M58 101 L106 52 H694 L742 101 V1098 L694 1148 H106 L58 1098 Z" fill="none" stroke="${role.accent}" stroke-opacity=".38" stroke-width="2"/>
${crest(role,id)}
<path d="M92 870 H708" stroke="#D8B86A" stroke-opacity=".55"/>
<text x="92" y="930" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="24" font-weight="800" letter-spacing="5" fill="${role.accent}">${esc(role.fn)}</text>
<text x="92" y="1004" font-family="Georgia,ui-serif,serif" font-size="50" font-weight="700" letter-spacing="1" fill="#F7F1E2">${esc(role.name)}</text>
<path d="M92 1042 H350" stroke="#D8B86A" stroke-opacity=".45"/><circle cx="92" cy="1042" r="4" fill="${role.accent}"/>
<text x="92" y="1090" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="18" letter-spacing="3" fill="#AEB5C2">CHARACTER CONCEPT · V2</text>
</svg>`;
}

function miniCard(role, x, y, w, h, idx) {
  const id = `deck-${role.id}-${idx}`;
  const sx = w/800, sy = h/1200;
  return `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">
    ${defs(role,id)}
    <rect width="800" height="1200" rx="34" fill="url(#${id}-bg)"/>
    <g clip-path="url(#${id}-art)"><rect x="40" y="34" width="720" height="940" fill="#070B14"/><circle cx="405" cy="420" r="390" fill="url(#${id}-halo)"/>${scene(role)}${character(role,id)}<rect x="42" y="650" width="716" height="320" fill="url(#${id}-fade)"/></g>
    <path d="M42 88 L96 34 H704 L758 88 V1110 L704 1166 H96 L42 1110 Z" fill="none" stroke="url(#${id}-metal)" stroke-width="7"/>
    <path d="M58 101 L106 52 H694 L742 101 V1098 L694 1148 H106 L58 1098 Z" fill="none" stroke="${role.accent}" stroke-opacity=".38" stroke-width="2"/>
    <path d="M92 870 H708" stroke="#D8B86A" stroke-opacity=".55"/>
    <text x="92" y="930" font-family="Inter,system-ui,sans-serif" font-size="26" font-weight="800" letter-spacing="5" fill="${role.accent}">${esc(role.fn)}</text>
    <text x="92" y="1005" font-family="Georgia,serif" font-size="50" font-weight="700" fill="#F7F1E2">${esc(role.name)}</text>
  </g>`;
}

function deckSvg(mobile=false) {
  const cols = mobile ? 2 : 4;
  const gap = mobile ? 50 : 36;
  const cardW = mobile ? 700 : 470;
  const cardH = cardW * 1.5;
  const margin = mobile ? 70 : 60;
  const titleH = mobile ? 240 : 210;
  const rows = Math.ceil(roles.length/cols);
  const width = margin*2 + cols*cardW + (cols-1)*gap;
  const height = titleH + margin + rows*cardH + (rows-1)*gap + margin;
  const id = mobile ? 'company-deck-mobile' : 'company-deck-desktop';
  const cards = roles.map((r,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    return miniCard(r, margin+col*(cardW+gap), titleH+row*(cardH+gap), cardW, cardH, i);
  }).join('\n');
  return `${header(id,'XanxitoSpA — The Company Deck','Eight original company-function character concepts arranged as a premium roster.',`0 0 ${width} ${height}`)}
<rect width="${width}" height="${height}" rx="44" fill="#050812"/>
<path d="M${margin} ${titleH-52} H${width-margin}" stroke="#D8B86A" stroke-opacity=".4"/>
<text x="${margin}" y="85" font-family="Inter,system-ui,sans-serif" font-size="24" font-weight="800" letter-spacing="7" fill="#D8B86A">THE COMPANY DECK · CHARACTER CONCEPT V2</text>
<text x="${margin}" y="154" font-family="Georgia,serif" font-size="${mobile?54:60}" font-weight="700" fill="#F7F1E2">Eight functions. Eight unmistakable silhouettes.</text>
${cards}
</svg>`;
}

function diagramMobile(kind) {
  const id = `${kind}-mobile`;
  if (kind === 'compete') return `${header(id,'COMPETE — mobile flow','Same evidence branches into two blind candidates, one critique, owner decision and verified outcome.','0 0 900 1320')}
<rect width="900" height="1320" rx="38" fill="#050812"/>
<text x="70" y="92" font-family="Inter,system-ui" font-size="24" font-weight="800" letter-spacing="7" fill="#D8B86A">COMPETE</text><text x="70" y="150" font-family="Georgia,serif" font-size="44" fill="#F7F1E2">Same problem. Independent minds.</text>
<g font-family="Inter,system-ui" text-anchor="middle"><g transform="translate(450 260)"><path d="M-170 -55 H170 L195 0 L170 55 H-170 L-195 0 Z" fill="#0E1627" stroke="#F7F1E2" stroke-opacity=".6"/><text y="-4" font-size="30" fill="#F7F1E2" font-weight="800">EVIDENCE SNAPSHOT</text><text y="32" font-size="20" fill="#AEB5C2">frozen · same for both</text></g>
<path d="M450 315 V380 M450 380 C300 400 260 455 260 510 M450 380 C600 400 640 455 640 510" fill="none" stroke="#D8B86A" stroke-width="5"/>
<g transform="translate(250 590)"><path d="M-150 -90 H150 L175 -62 V62 L150 90 H-150 L-175 62 V-62 Z" fill="#111827" stroke="#EA5965" stroke-width="4"/><text y="-20" font-size="31" font-weight="800" fill="#EA5965">WORKER A</text><text y="22" font-size="23" fill="#F7F1E2">margin-first</text><text y="55" font-size="18" fill="#AEB5C2">BLIND</text></g>
<g transform="translate(650 590)"><path d="M-150 -90 H150 L175 -62 V62 L150 90 H-150 L-175 62 V-62 Z" fill="#111827" stroke="#7187FA" stroke-width="4"/><text y="-20" font-size="31" font-weight="800" fill="#7187FA">WORKER B</text><text y="22" font-size="23" fill="#F7F1E2">growth-first</text><text y="55" font-size="18" fill="#AEB5C2">BLIND</text></g>
<path d="M250 680 C280 750 355 785 450 790 C545 785 620 750 650 680" fill="none" stroke="#D8B86A" stroke-width="4" stroke-dasharray="12 12"/><text x="450" y="835" font-size="20" fill="#D8B86A">ONE CROSS-CRITIQUE</text>
<path d="M450 858 V920" stroke="#D8B86A" stroke-width="5"/>
<g transform="translate(450 1015)"><path d="M-190 -85 H190 L215 -55 V55 L190 85 H-190 L-215 55 V-55 Z" fill="#0E1627" stroke="#D8B86A" stroke-width="4"/><text y="-18" font-size="32" font-weight="800" fill="#D8B86A">DECISION OWNER</text><text y="25" font-size="23" fill="#F7F1E2">choose A · B · synthesis</text><text y="58" font-size="18" fill="#AEB5C2">no majority voting</text></g>
<path d="M450 1100 V1170" stroke="#54D39E" stroke-width="5"/><circle cx="450" cy="1220" r="40" fill="#10241D" stroke="#54D39E" stroke-width="4"/><text x="450" y="1230" font-size="34" fill="#54D39E">✓</text><text x="450" y="1285" font-size="22" fill="#AEB5C2">VERIFIED OUTCOME</text></g></svg>`;

  if (kind === 'kernel') return `${header(id,'XanxitoSpA kernel — mobile','Executive authority flows through preflight and mission graph into governed durable, capability, data and creative planes.','0 0 900 1500')}
<rect width="900" height="1500" rx="38" fill="#050812"/>
<text x="70" y="92" font-family="Inter,system-ui" font-size="24" font-weight="800" letter-spacing="7" fill="#D8B86A">THE COMPANY KERNEL</text><text x="70" y="150" font-family="Georgia,serif" font-size="43" fill="#F7F1E2">Policy central. Providers replaceable.</text>
<g font-family="Inter,system-ui" text-anchor="middle"><g transform="translate(450 270)"><path d="M-210 -62 H210 L235 0 L210 62 H-210 L-235 0 Z" fill="#0E1627" stroke="#D8B86A" stroke-width="4"/><text y="-4" font-size="31" font-weight="800" fill="#D8B86A">EXECUTIVE</text><text y="32" font-size="19" fill="#AEB5C2">constitution · owner · authority</text></g>
<path d="M450 332 V410" stroke="#D8B86A" stroke-width="5"/>
<g transform="translate(450 500)"><path d="M-230 -62 H230 L255 0 L230 62 H-230 L-255 0 Z" fill="#0E1627" stroke="#F7F1E2" stroke-opacity=".62"/><text y="-4" font-size="30" fill="#F7F1E2">BUSINESS PREFLIGHT</text><text y="32" font-size="19" fill="#AEB5C2">direct · fan-out · compete · debate · escalate</text></g>
<path d="M450 562 V650" stroke="#AEB5C2" stroke-width="4"/>
<g transform="translate(450 725)"><path d="M-200 -58 H200 L225 0 L200 58 H-200 L-225 0 Z" fill="#111827" stroke="#7187FA" stroke-width="4"/><text y="10" font-size="30" font-weight="800" fill="#7187FA">MISSION GRAPH</text></g>
<path d="M450 783 V850" stroke="#7187FA" stroke-width="4"/>
${[['DURABLE STATE','#54D39E','events · leases · fencing'],['CAPABILITY PLANE','#D8B86A','semantic tools · adapters · secrets'],['DATA PLANE','#7187FA','facts · operational state · analytics'],['CREATIVE PLANE','#EB72B6','image · video · document · 3D · CAD']].map(([t,c,s],i)=>`<g transform="translate(450 ${920+i*135})"><path d="M-250 -48 H250 L270 0 L250 48 H-250 L-270 0 Z" fill="#0E1627" stroke="${c}" stroke-width="3"/><text y="-4" font-size="28" font-weight="800" fill="${c}">${t}</text><text y="29" font-size="18" fill="#AEB5C2">${s}</text></g>${i<3?`<path d="M450 ${968+i*135} V${1007+i*135}" stroke="#25304A" stroke-width="3"/>`:''}`).join('')}
</g></svg>`;

  return `${header(id,'Corporate evolution — mobile','Verified outcomes update contextual fitness; Pareto selection preserves champions, challengers and negative results.','0 0 900 1450')}
<rect width="900" height="1450" rx="38" fill="#050812"/>
<text x="70" y="92" font-family="Inter,system-ui" font-size="24" font-weight="800" letter-spacing="7" fill="#D8B86A">CORPORATE EVOLUTION</text><text x="70" y="150" font-family="Georgia,serif" font-size="43" fill="#F7F1E2">Outcomes evolve how the company works.</text>
<g font-family="Inter,system-ui" text-anchor="middle">${[['CANDIDATE GENE','#AEB5C2','strategy · process · skill'],['COMPETE / PILOT','#EA5965','parallel variants · reversible test'],['VERIFIED OUTCOME','#54D39E','business evidence, not opinion'],['FITNESS SNAPSHOT','#7187FA','quality · cost · risk · latency · reliability'],['PARETO SELECTION','#D8B86A','no single profit-only score']].map(([t,c,s],i)=>`<g transform="translate(450 ${280+i*180})"><path d="M-230 -62 H230 L255 0 L230 62 H-230 L-255 0 Z" fill="#0E1627" stroke="${c}" stroke-width="4"/><text y="-5" font-size="29" font-weight="800" fill="${c}">${t}</text><text y="31" font-size="18" fill="#AEB5C2">${s}</text></g>${i<4?`<path d="M450 ${342+i*180} V${398+i*180}" stroke="#25304A" stroke-width="4"/>`:''}`).join('')}
<path d="M450 1062 V1120" stroke="#D8B86A" stroke-width="4"/><path d="M450 1120 C300 1150 250 1190 220 1240 M450 1120 C450 1170 450 1190 450 1240 M450 1120 C600 1150 650 1190 680 1240" fill="none" stroke="#D8B86A" stroke-width="4"/>
${[['CHAMPION','#54D39E'],['CHALLENGER','#7187FA'],['SILENT','#A784EF']].map(([t,c],i)=>`<g transform="translate(${220+i*230} 1305)"><rect x="-95" y="-48" width="190" height="96" rx="18" fill="#0E1627" stroke="${c}" stroke-width="3"/><text y="10" font-size="23" font-weight="800" fill="${c}">${t}</text></g>`).join('')}
<text x="450" y="1400" font-size="19" fill="#AEB5C2">negative results stay remembered; exploration never goes to zero</text></g></svg>`;
}

for (const role of roles) await writeFile(path.join(brandDir,`card-${role.id}.svg`),cardSvg(role));
await writeFile(path.join(brandDir,'company-deck.svg'),deckSvg(false));
await writeFile(path.join(brandDir,'company-deck-mobile.svg'),deckSvg(true));
await writeFile(path.join(diagramDir,'compete-mobile.svg'),diagramMobile('compete'));
await writeFile(path.join(diagramDir,'kernel-planes-mobile.svg'),diagramMobile('kernel'));
await writeFile(path.join(diagramDir,'evolution-mobile.svg'),diagramMobile('evolution'));
console.log('generated Character Deck V2: 8 cards, 2 roster boards, 3 mobile diagrams');
