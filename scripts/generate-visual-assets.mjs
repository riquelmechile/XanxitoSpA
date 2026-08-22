import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const brandDir = path.join(root, 'assets', 'brand');
const diagramDir = path.join(root, 'assets', 'diagrams');
await mkdir(brandDir, { recursive: true });
await mkdir(diagramDir, { recursive: true });

const C = {
  bg: '#070B14',
  navy: '#0D1321',
  slate: '#172033',
  ivory: '#F6F0DF',
  muted: '#B9B2A3',
  gold: '#D6B56B',
};

const roles = [
  { id: 'executive', function: 'EXECUTIVE', name: 'THE SOVEREIGN', accent: '#D6B56B', motto: 'Decide with mandate.', glyph: '✦', motif: 'sovereign' },
  { id: 'commercial', function: 'COMMERCIAL', name: 'THE HUNTER', accent: '#E7525B', motto: 'Find demand. Prove value.', glyph: '◎', motif: 'hunter' },
  { id: 'finance', function: 'FINANCE', name: 'THE KEEPER', accent: '#4ED09B', motto: 'Protect the runway.', glyph: '◇', motif: 'keeper' },
  { id: 'operations', function: 'OPERATIONS', name: 'THE FORGE', accent: '#F28C45', motto: 'Turn plans into output.', glyph: '⬡', motif: 'forge' },
  { id: 'customer', function: 'CUSTOMER', name: 'THE ENVOY', accent: '#55C7E8', motto: 'Hear. Resolve. Retain.', glyph: '◌', motif: 'envoy' },
  { id: 'risk', function: 'ADMIN & RISK', name: 'THE SENTINEL', accent: '#9B7BEA', motto: 'Guard the constitution.', glyph: '⬢', motif: 'sentinel' },
  { id: 'data', function: 'DATA', name: 'THE ORACLE', accent: '#6E82F5', motto: 'Observe before belief.', glyph: '◉', motif: 'oracle' },
  { id: 'creative', function: 'CREATIVE', name: 'THE SHAPER', accent: '#E56EB1', motto: 'Turn intent into form.', glyph: '△', motif: 'shaper' },
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[m]));
}

function header(id, title, desc, viewBox = '0 0 800 1200') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${esc(title)}</title>
<desc id="${id}-desc">${esc(desc)}</desc>`;
}

function defs(role, id) {
  const a = role.accent;
  return `<defs>
  <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg}"/><stop offset="0.55" stop-color="${C.navy}"/><stop offset="1" stop-color="#05070C"/></linearGradient>
  <radialGradient id="${id}-glow" cx="50%" cy="43%" r="58%"><stop offset="0" stop-color="${a}" stop-opacity="0.32"/><stop offset="0.48" stop-color="${a}" stop-opacity="0.09"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3D995"/><stop offset="0.34" stop-color="${C.gold}"/><stop offset="0.72" stop-color="#80652F"/><stop offset="1" stop-color="#3B2B12"/></linearGradient>
  <linearGradient id="${id}-accent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${a}" stop-opacity="0.18"/></linearGradient>
  <filter id="${id}-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
  <clipPath id="${id}-portrait"><path d="M104 168 L172 94 H628 L696 168 V785 L632 846 H168 L104 785 Z"/></clipPath>
  </defs>`;
}

function commonBackground(role, id) {
  return `<rect width="800" height="1200" rx="48" fill="url(#${id}-bg)"/>
<path d="M50 132 L132 50 H668 L750 132 V1068 L668 1150 H132 L50 1068 Z" fill="none" stroke="url(#${id}-metal)" stroke-width="8"/>
<path d="M72 150 L150 72 H650 L728 150 V1048 L650 1128 H150 L72 1048 Z" fill="none" stroke="${role.accent}" stroke-opacity="0.38" stroke-width="2"/>
<circle cx="400" cy="485" r="330" fill="url(#${id}-glow)"/>
<path d="M102 915 H698" stroke="${C.gold}" stroke-opacity="0.5"/>
<path d="M132 940 H668" stroke="${role.accent}" stroke-opacity="0.32"/>
<g opacity="0.16" stroke="${role.accent}" fill="none">
  <path d="M90 240 C220 170 580 170 710 240"/>
  <path d="M90 710 C220 780 580 780 710 710"/>
  <circle cx="400" cy="470" r="260"/>
  <circle cx="400" cy="470" r="212" stroke-dasharray="8 20"/>
</g>`;
}

function crest(role) {
  return `<g transform="translate(400 116)">
  <path d="M0 -54 L42 -26 L48 22 L16 54 L-16 54 L-48 22 L-42 -26 Z" fill="${C.bg}" stroke="${C.gold}" stroke-width="4"/>
  <circle r="34" fill="${role.accent}" fill-opacity="0.12" stroke="${role.accent}" stroke-width="2"/>
  <text x="0" y="11" text-anchor="middle" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="34" font-weight="800" fill="${C.ivory}">${esc(role.glyph)}</text>
</g>`;
}

function faceBase(role) {
  return `<g>
    <path d="M310 340 L350 286 H450 L490 340 L474 515 L438 602 H362 L326 515 Z" fill="#111927" stroke="${role.accent}" stroke-opacity="0.65" stroke-width="4"/>
    <path d="M350 286 L400 245 L450 286 L430 330 H370 Z" fill="${role.accent}" fill-opacity="0.18" stroke="${C.gold}" stroke-opacity="0.55"/>
    <path d="M330 384 L370 365 H430 L470 384 L452 420 L420 399 H380 L348 420 Z" fill="${C.ivory}" fill-opacity="0.08"/>
    <path d="M360 430 H390" stroke="${role.accent}" stroke-width="9" stroke-linecap="round"/>
    <path d="M410 430 H440" stroke="${role.accent}" stroke-width="9" stroke-linecap="round"/>
    <path d="M400 438 L386 500 H414 Z" fill="${C.gold}" fill-opacity="0.28"/>
    <path d="M360 535 Q400 558 440 535" fill="none" stroke="${C.ivory}" stroke-opacity="0.45" stroke-width="3"/>
    <path d="M285 610 L350 568 H450 L515 610 L570 785 H230 Z" fill="#0B111D" stroke="${role.accent}" stroke-opacity="0.55" stroke-width="4"/>
    <path d="M350 568 L400 650 L450 568" fill="${role.accent}" fill-opacity="0.16" stroke="${C.gold}" stroke-opacity="0.38"/>
  </g>`;
}

function motif(role) {
  const a = role.accent;
  switch (role.motif) {
    case 'sovereign': return `<g fill="none" stroke="${a}">
      <path d="M400 214 L350 255 L330 205 L400 236 L470 205 L450 255 Z" fill="${a}" fill-opacity="0.12" stroke-width="4"/>
      <circle cx="400" cy="470" r="182" stroke-opacity="0.32" stroke-width="2"/>
      <path d="M400 220 V720 M150 470 H650" stroke-opacity="0.18"/>
      <path d="M400 180 L416 214 L400 248 L384 214 Z" fill="${C.gold}" fill-opacity="0.55" stroke="${C.gold}"/>
    </g>`;
    case 'hunter': return `<g fill="none" stroke="${a}">
      <circle cx="400" cy="465" r="204" stroke-opacity="0.22" stroke-width="3"/>
      <circle cx="400" cy="465" r="165" stroke-dasharray="18 18" stroke-opacity="0.45"/>
      <path d="M118 610 C260 560 470 510 684 286" stroke-width="5" stroke-opacity="0.62"/>
      <path d="M626 286 L685 286 L681 344" stroke-width="5"/>
      <circle cx="400" cy="430" r="13" fill="${a}" stroke="none"/>
    </g>`;
    case 'keeper': return `<g fill="none" stroke="${a}">
      <rect x="220" y="260" width="360" height="410" rx="90" stroke-opacity="0.18" stroke-width="4"/>
      <circle cx="400" cy="470" r="192" stroke-opacity="0.28"/>
      <path d="M224 696 H576 M250 725 H550 M280 754 H520" stroke-opacity="0.34"/>
      <path d="M400 175 V242 M378 196 H422" stroke="${C.gold}" stroke-width="4"/>
    </g>`;
    case 'forge': return `<g fill="none" stroke="${a}">
      <path d="M205 675 L250 620 L305 676 L360 620 L415 676 L470 620 L525 676 L580 620" stroke-opacity="0.4" stroke-width="8"/>
      <circle cx="400" cy="470" r="218" stroke-dasharray="36 16" stroke-opacity="0.2" stroke-width="12"/>
      <path d="M355 705 Q400 650 445 705 L430 770 H370 Z" fill="${a}" fill-opacity="0.22"/>
      <path d="M400 760 Q350 700 400 645 Q450 700 400 760 Z" fill="${a}" fill-opacity="0.34" stroke="none"/>
    </g>`;
    case 'envoy': return `<g fill="none" stroke="${a}">
      <path d="M170 420 Q220 350 290 330 M630 420 Q580 350 510 330" stroke-opacity="0.45" stroke-width="5"/>
      <path d="M145 470 Q215 390 300 380 M655 470 Q585 390 500 380" stroke-opacity="0.25"/>
      <circle cx="160" cy="420" r="10" fill="${a}" stroke="none"/><circle cx="640" cy="420" r="10" fill="${a}" stroke="none"/>
      <path d="M318 730 Q400 780 482 730" stroke-opacity="0.5" stroke-width="5"/>
    </g>`;
    case 'sentinel': return `<g fill="none" stroke="${a}">
      <path d="M400 198 L585 270 V485 Q570 650 400 760 Q230 650 215 485 V270 Z" stroke-opacity="0.28" stroke-width="5"/>
      <path d="M400 232 L540 286 V475 Q528 590 400 686 Q272 590 260 475 V286 Z" stroke-opacity="0.28"/>
      <circle cx="400" cy="470" r="236" stroke-dasharray="4 26" stroke-opacity="0.4"/>
    </g>`;
    case 'oracle': return `<g fill="none" stroke="${a}">
      <path d="M175 470 Q400 250 625 470 Q400 690 175 470 Z" stroke-opacity="0.32" stroke-width="4"/>
      <circle cx="400" cy="470" r="96" stroke-opacity="0.44"/>
      <circle cx="400" cy="470" r="26" fill="${a}" fill-opacity="0.35"/>
      ${[[210,300],[590,300],[180,620],[620,620],[400,190],[400,750]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="8" fill="${a}" stroke="none"/><path d="M${x} ${y} L400 470" stroke-opacity="0.18"/>`).join('')}
    </g>`;
    case 'shaper': return `<g fill="none" stroke="${a}">
      <path d="M400 190 L605 360 L520 705 L280 705 L195 360 Z" stroke-opacity="0.25" stroke-width="4"/>
      <path d="M400 220 L495 385 L400 470 L305 385 Z" fill="${a}" fill-opacity="0.12" stroke-opacity="0.55"/>
      <path d="M195 360 L305 385 L280 705 M605 360 L495 385 L520 705" stroke-opacity="0.28"/>
      <path d="M400 470 L520 705 M400 470 L280 705" stroke="${C.gold}" stroke-opacity="0.26"/>
    </g>`;
    default: return '';
  }
}

function cardSvg(role) {
  const id = `card-${role.id}`;
  return `${header(id, `${role.function} — ${role.name}`, `${role.function} archetype card in the XanxitoSpA Company Deck. ${role.motto}`)}
${defs(role,id)}
${commonBackground(role,id)}
<g clip-path="url(#${id}-portrait)">
  <rect x="104" y="94" width="592" height="752" fill="#080E18"/>
  <ellipse cx="400" cy="505" rx="250" ry="310" fill="${role.accent}" fill-opacity="0.05"/>
  ${motif(role)}
  ${faceBase(role)}
  <path d="M104 785 L260 660 L400 725 L540 660 L696 785 V846 H104 Z" fill="${role.accent}" fill-opacity="0.06"/>
</g>
${crest(role)}
<text x="400" y="904" text-anchor="middle" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="23" font-weight="800" letter-spacing="5" fill="${role.accent}">${role.function}</text>
<text x="400" y="978" text-anchor="middle" font-family="Georgia,ui-serif,serif" font-size="48" font-weight="700" letter-spacing="2" fill="${C.ivory}">${role.name}</text>
<text x="400" y="1030" text-anchor="middle" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="22" fill="${C.muted}">${role.motto}</text>
<g transform="translate(400 1092)" stroke="${C.gold}" stroke-opacity="0.55"><path d="M-110 0 H-28"/><circle r="5" fill="${role.accent}" stroke="none"/><path d="M28 0 H110"/></g>
</svg>`;
}

function heroSvg() {
  const id='xspa-hero';
  return `${header(id,'XanxitoSpA — The Company That Evolves','A cinematic technical banner showing the Executive crest above branching company functions, verified outcomes and evolving corporate genes.','0 0 1600 760')}
<defs>
  <linearGradient id="hero-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#050812"/><stop offset="0.52" stop-color="#0D1321"/><stop offset="1" stop-color="#090A10"/></linearGradient>
  <radialGradient id="hero-gold" cx="42%" cy="35%" r="58%"><stop offset="0" stop-color="#D6B56B" stop-opacity="0.28"/><stop offset="1" stop-color="#D6B56B" stop-opacity="0"/></radialGradient>
  <radialGradient id="hero-indigo" cx="78%" cy="55%" r="44%"><stop offset="0" stop-color="#6E82F5" stop-opacity="0.22"/><stop offset="1" stop-color="#6E82F5" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1600" height="760" rx="46" fill="url(#hero-bg)"/>
<rect x="2" y="2" width="1596" height="756" rx="44" fill="none" stroke="#D6B56B" stroke-opacity="0.5" stroke-width="2"/>
<circle cx="650" cy="270" r="360" fill="url(#hero-gold)"/><circle cx="1270" cy="460" r="330" fill="url(#hero-indigo)"/>
<g opacity="0.16" fill="none" stroke="#D6B56B"><path d="M930 60 C1230 120 1470 310 1540 610"/><path d="M1020 78 C1270 180 1450 350 1510 650"/><circle cx="1320" cy="470" r="178" stroke-dasharray="8 18"/></g>
<g transform="translate(1220 125)"><path d="M0 -72 L58 -35 L66 32 L22 74 L-22 74 L-66 32 L-58 -35 Z" fill="#070B14" stroke="#D6B56B" stroke-width="5"/><path d="M0 -32 L-38 6 L-22 -38 L0 -16 L22 -38 L38 6 Z" fill="#D6B56B" fill-opacity="0.32" stroke="#D6B56B"/><circle r="11" fill="#F6F0DF"/></g>
<text x="92" y="166" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="22" font-weight="800" letter-spacing="6" fill="#D6B56B">AUTONOMOUS COMPANY HARNESS</text>
<text x="92" y="262" font-family="Georgia,ui-serif,serif" font-size="86" font-weight="700" fill="#F6F0DF">XanxitoSpA</text>
<text x="92" y="334" font-family="Georgia,ui-serif,serif" font-size="43" font-style="italic" fill="#B9B2A3">The company that can improve how it works.</text>
<text x="92" y="414" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="25" fill="#F6F0DF" fill-opacity="0.88">GPT directs. Functions compete. Outcomes verify.</text>
<text x="92" y="452" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="25" fill="#F6F0DF" fill-opacity="0.88">Corporate genes evolve the operating system.</text>
<g transform="translate(92 535)"><path d="M0 0 H560" stroke="#D6B56B" stroke-opacity="0.45"/><g transform="translate(0 48)">${roles.slice(1,8).map((r,i)=>`<circle cx="${i*80+14}" cy="0" r="14" fill="${r.accent}" fill-opacity="0.2" stroke="${r.accent}"/><path d="M${i*80+28} 0 H${i*80+64}" stroke="${r.accent}" stroke-opacity="0.45"/>`).join('')}</g></g>
<g transform="translate(1005 320)">
  <path d="M0 90 C80 20 175 20 250 90" fill="none" stroke="#E7525B" stroke-width="4"/>
  <path d="M0 90 C80 160 175 160 250 90" fill="none" stroke="#6E82F5" stroke-width="4"/>
  <circle cx="0" cy="90" r="30" fill="#0D1321" stroke="#F6F0DF"/>
  <circle cx="250" cy="90" r="30" fill="#0D1321" stroke="#D6B56B"/>
  <circle cx="125" cy="32" r="27" fill="#0D1321" stroke="#E7525B"/><circle cx="125" cy="148" r="27" fill="#0D1321" stroke="#6E82F5"/>
  <text x="0" y="97" text-anchor="middle" font-family="system-ui" font-size="17" fill="#F6F0DF">X</text>
  <text x="125" y="39" text-anchor="middle" font-family="system-ui" font-size="15" fill="#E7525B">A</text><text x="125" y="155" text-anchor="middle" font-family="system-ui" font-size="15" fill="#6E82F5">B</text>
  <text x="250" y="97" text-anchor="middle" font-family="system-ui" font-size="17" fill="#D6B56B">✓</text>
</g>
<text x="1128" y="586" text-anchor="middle" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="19" letter-spacing="3" fill="#B9B2A3">COMPETE → VERIFY → EVOLVE</text>
<text x="92" y="690" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="18" fill="#B9B2A3">V0.3 · SECURE CAPABILITY PLANE · COMPANY GYM 51/51</text>
</svg>`;
}

function miniCard(role, x, y, w=300, h=420) {
  const scale = w/800;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <rect width="800" height="1120" rx="48" fill="#0B111D" stroke="${role.accent}" stroke-opacity="0.5" stroke-width="3"/>
    <path d="M56 100 L120 36 H680 L744 100 V770 L680 834 H120 L56 770 Z" fill="#070B14" stroke="#D6B56B" stroke-opacity="0.45" stroke-width="4"/>
    <circle cx="400" cy="430" r="250" fill="${role.accent}" fill-opacity="0.07"/>
    ${motif(role)}${faceBase(role)}
    <text x="400" y="900" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="28" font-weight="800" letter-spacing="5" fill="${role.accent}">${role.function}</text>
    <text x="400" y="972" text-anchor="middle" font-family="Georgia,serif" font-size="50" font-weight="700" fill="#F6F0DF">${role.name}</text>
    <text x="400" y="1030" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="21" fill="#B9B2A3">${role.motto}</text>
  </g>`;
}

function rosterSvg() {
  const id='company-deck';
  const cardW=290, cardH=406, gapX=34, gapY=40;
  return `${header(id,'The Company Deck','A roster board of eight original XanxitoSpA enterprise archetypes: Executive, Commercial, Finance, Operations, Customer, Risk, Data and Creative.','0 0 1360 1040')}
<defs><linearGradient id="board-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#070B14"/><stop offset="1" stop-color="#11192A"/></linearGradient></defs>
<rect width="1360" height="1040" rx="42" fill="url(#board-bg)"/>
<path d="M46 118 L118 46 H1242 L1314 118 V922 L1242 994 H118 L46 922 Z" fill="none" stroke="#D6B56B" stroke-opacity="0.55" stroke-width="2"/>
<text x="680" y="83" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="19" font-weight="800" letter-spacing="7" fill="#D6B56B">THE COMPANY DECK</text>
<text x="680" y="123" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="#F6F0DF">Stable functions. Temporary workers. One company.</text>
${roles.map((r,i)=>miniCard(r,76+(i%4)*(cardW+gapX),165+Math.floor(i/4)*(cardH+gapY),cardW,cardH)).join('\n')}
<text x="680" y="1000" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="16" letter-spacing="3" fill="#B9B2A3">FUNCTIONS ARE IDENTITIES · CAPABILITIES ARE TOOLS · OUTCOMES TEACH THE COMPANY</text>
</svg>`;
}

function competeSvg() {
  const id='compete';
  return `${header(id,'COMPETE — Competitive Branching','Two blind GPT workers receive the same evidence and solve the same task with different strategy overlays; one bounded critique round precedes owner adjudication.','0 0 1400 720')}
<defs><linearGradient id="cmp-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#070B14"/><stop offset="1" stop-color="#101827"/></linearGradient></defs>
<rect width="1400" height="720" rx="36" fill="url(#cmp-bg)"/><rect x="2" y="2" width="1396" height="716" rx="34" fill="none" stroke="#D6B56B" stroke-opacity="0.35"/>
<text x="74" y="84" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="800" letter-spacing="6" fill="#D6B56B">COMPETE</text>
<text x="74" y="130" font-family="Georgia,serif" font-size="34" fill="#F6F0DF">Same problem. Independent minds. Bounded argument.</text>
<g transform="translate(86 248)"><path d="M0 0 H160" stroke="#F6F0DF" stroke-opacity="0.4" stroke-width="2"/><path d="M160 0 C250 0 260 -118 360 -118" fill="none" stroke="#E7525B" stroke-width="5"/><path d="M160 0 C250 0 260 118 360 118" fill="none" stroke="#6E82F5" stroke-width="5"/>
<g><path d="M-20 -46 L26 -74 H118 L164 -46 V46 L118 74 H26 L-20 46 Z" fill="#0D1321" stroke="#F6F0DF"/><text x="72" y="-5" text-anchor="middle" font-family="system-ui" font-size="18" fill="#F6F0DF">EVIDENCE</text><text x="72" y="22" text-anchor="middle" font-family="system-ui" font-size="14" fill="#B9B2A3">same snapshot</text></g>
<g transform="translate(360 -118)"><path d="M0 -60 L52 -84 H178 L230 -60 V60 L178 84 H52 L0 60 Z" fill="#0D1321" stroke="#E7525B" stroke-width="2"/><text x="115" y="-12" text-anchor="middle" font-family="system-ui" font-size="22" font-weight="800" fill="#E7525B">WORKER A</text><text x="115" y="20" text-anchor="middle" font-family="system-ui" font-size="16" fill="#F6F0DF">margin-first</text><text x="115" y="47" text-anchor="middle" font-family="system-ui" font-size="13" fill="#B9B2A3">BLIND</text></g>
<g transform="translate(360 118)"><path d="M0 -60 L52 -84 H178 L230 -60 V60 L178 84 H52 L0 60 Z" fill="#0D1321" stroke="#6E82F5" stroke-width="2"/><text x="115" y="-12" text-anchor="middle" font-family="system-ui" font-size="22" font-weight="800" fill="#6E82F5">WORKER B</text><text x="115" y="20" text-anchor="middle" font-family="system-ui" font-size="16" fill="#F6F0DF">growth-first</text><text x="115" y="47" text-anchor="middle" font-family="system-ui" font-size="13" fill="#B9B2A3">BLIND</text></g>
<path d="M590 -118 C700 -118 700 -40 780 0 C700 40 700 118 590 118" fill="none" stroke="#D6B56B" stroke-dasharray="10 10" stroke-width="3"/><text x="710" y="-18" text-anchor="middle" font-family="system-ui" font-size="14" fill="#D6B56B">1 CROSS-CRITIQUE</text>
<g transform="translate(800 0)"><path d="M0 -72 L58 -98 H220 L278 -72 V72 L220 98 H58 L0 72 Z" fill="#0D1321" stroke="#D6B56B" stroke-width="3"/><text x="139" y="-15" text-anchor="middle" font-family="system-ui" font-size="20" font-weight="800" fill="#D6B56B">OWNER</text><text x="139" y="18" text-anchor="middle" font-family="system-ui" font-size="16" fill="#F6F0DF">choose A · B · synthesis</text><text x="139" y="47" text-anchor="middle" font-family="system-ui" font-size="13" fill="#B9B2A3">no majority voting</text></g>
<path d="M1078 0 H1180" stroke="#4ED09B" stroke-width="5"/><circle cx="1206" cy="0" r="28" fill="#0D1321" stroke="#4ED09B" stroke-width="3"/><text x="1206" y="7" text-anchor="middle" font-family="system-ui" font-size="18" fill="#4ED09B">✓</text>
</g>
<text x="700" y="630" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="18" fill="#B9B2A3">FAN-OUT scales capacity. COMPETE scales organizational intelligence.</text>
</svg>`;
}

function evolutionSvg() {
  const id='evolution';
  const genes=[['v1','#B9B2A3',190,360],['v2A','#E7525B',410,250],['v2B','#6E82F5',410,470],['CHAMPION','#D6B56B',675,250],['CHALLENGER','#E56EB1',675,470],['SILENT','#687183',945,470]];
  return `${header(id,'Corporate Evolution','Verified outcomes update multi-objective fitness; Pareto selection promotes champion and challenger corporate genes while preserving silent negative results.','0 0 1320 700')}
<rect width="1320" height="700" rx="36" fill="#070B14"/><rect x="2" y="2" width="1316" height="696" rx="34" fill="none" stroke="#D6B56B" stroke-opacity="0.35"/>
<text x="72" y="78" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="800" letter-spacing="6" fill="#D6B56B">CORPORATE EVOLUTION</text>
<text x="72" y="124" font-family="Georgia,serif" font-size="34" fill="#F6F0DF">The model stays. The company around it evolves.</text>
<g fill="none" stroke="#B9B2A3" stroke-opacity="0.35" stroke-width="2"><path d="M235 360 C300 360 330 250 365 250"/><path d="M235 360 C300 360 330 470 365 470"/><path d="M455 250 H620"/><path d="M455 470 H620"/><path d="M765 470 H900"/></g>
${genes.map(([label,color,x,y])=>`<g transform="translate(${x} ${y})"><path d="M0 -54 L46 -28 L54 18 L22 54 H-22 L-54 18 L-46 -28 Z" fill="#0D1321" stroke="${color}" stroke-width="${label==='CHAMPION'?4:2}"/><circle r="23" fill="${color}" fill-opacity="0.13"/><text x="0" y="5" text-anchor="middle" font-family="system-ui" font-size="${label.length>4?10:14}" font-weight="800" fill="${color}">${label}</text></g>`).join('')}
<g transform="translate(1120 258)"><path d="M-90 -76 H90 L128 -38 V38 L90 76 H-90 L-128 38 V-38 Z" fill="#0D1321" stroke="#4ED09B" stroke-width="2"/><text x="0" y="-22" text-anchor="middle" font-family="system-ui" font-size="17" fill="#4ED09B">VERIFIED OUTCOME</text><text x="0" y="8" text-anchor="middle" font-family="system-ui" font-size="14" fill="#F6F0DF">quality · cost · risk</text><text x="0" y="34" text-anchor="middle" font-family="system-ui" font-size="14" fill="#F6F0DF">latency · reliability</text></g>
<path d="M1050 334 C980 365 880 350 760 280" fill="none" stroke="#4ED09B" stroke-width="3" stroke-dasharray="8 10"/>
<text x="1132" y="470" text-anchor="middle" font-family="system-ui" font-size="16" fill="#D6B56B">PARETO FRONT</text><path d="M1015 488 H1248" stroke="#D6B56B" stroke-opacity="0.45"/>
<text x="1132" y="524" text-anchor="middle" font-family="system-ui" font-size="14" fill="#B9B2A3">no single “profit score”</text>
<text x="660" y="620" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="17" fill="#B9B2A3">Negative results survive as evidence. Silent is not forgotten.</text>
</svg>`;
}

function kernelSvg() {
  const id='kernel-planes';
  return `${header(id,'XanxitoSpA Kernel and Enterprise Planes','Executive and business preflight sit above the mission graph; durable state and universal capability planes connect to Data and Creative planes without making providers principals.','0 0 1500 900')}
<rect width="1500" height="900" rx="38" fill="#070B14"/><rect x="2" y="2" width="1496" height="896" rx="36" fill="none" stroke="#D6B56B" stroke-opacity="0.35"/>
<text x="72" y="78" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="800" letter-spacing="6" fill="#D6B56B">THE COMPANY KERNEL</text>
<text x="72" y="124" font-family="Georgia,serif" font-size="34" fill="#F6F0DF">Policy stays central. Providers stay replaceable.</text>
<g transform="translate(750 220)"><path d="M-150 -64 H150 L198 -28 V28 L150 64 H-150 L-198 28 V-28 Z" fill="#0D1321" stroke="#D6B56B" stroke-width="3"/><text x="0" y="-9" text-anchor="middle" font-family="system-ui" font-size="22" font-weight="800" fill="#D6B56B">EXECUTIVE</text><text x="0" y="22" text-anchor="middle" font-family="system-ui" font-size="15" fill="#F6F0DF">constitution · owner · authority</text></g>
<path d="M750 284 V340" stroke="#D6B56B" stroke-width="4"/>
<g transform="translate(750 400)"><path d="M-170 -58 H170 L210 -24 V24 L170 58 H-170 L-210 24 V-24 Z" fill="#0D1321" stroke="#F6F0DF" stroke-opacity="0.65"/><text x="0" y="-7" text-anchor="middle" font-family="system-ui" font-size="20" fill="#F6F0DF">BUSINESS PREFLIGHT</text><text x="0" y="23" text-anchor="middle" font-family="system-ui" font-size="14" fill="#B9B2A3">direct · fan-out · compete · debate · escalate</text></g>
<path d="M750 458 V510" stroke="#F6F0DF" stroke-opacity="0.45" stroke-width="3"/>
<g transform="translate(750 565)"><path d="M-170 -48 H170 L204 -18 V18 L170 48 H-170 L-204 18 V-18 Z" fill="#0D1321" stroke="#6E82F5" stroke-width="2"/><text x="0" y="8" text-anchor="middle" font-family="system-ui" font-size="20" font-weight="800" fill="#6E82F5">MISSION GRAPH</text></g>
${[
  ['DURABLE STATE','#4ED09B',245,700,'PostgreSQL · events · leases'],
  ['CAPABILITY PLANE','#D6B56B',750,700,'semantic tools · adapters · secrets'],
  ['DATA PLANE','#6E82F5',1245,700,'operational facts · analytics'],
].map(([name,color,x,y,sub])=>`<g transform="translate(${x} ${y})"><path d="M-185 -74 H185 L220 -34 V34 L185 74 H-185 L-220 34 V-34 Z" fill="#0D1321" stroke="${color}" stroke-width="2"/><text x="0" y="-10" text-anchor="middle" font-family="system-ui" font-size="19" font-weight="800" fill="${color}">${name}</text><text x="0" y="22" text-anchor="middle" font-family="system-ui" font-size="14" fill="#B9B2A3">${sub}</text></g>`).join('')}
<path d="M750 613 C700 650 500 655 430 680 M750 613 V626 M750 613 C800 650 1000 655 1070 680" fill="none" stroke="#B9B2A3" stroke-opacity="0.35" stroke-width="2"/>
<g transform="translate(1208 250)"><path d="M-120 -58 H120 L154 -26 V26 L120 58 H-120 L-154 26 V-26 Z" fill="#0D1321" stroke="#E56EB1" stroke-width="2"/><text x="0" y="-8" text-anchor="middle" font-family="system-ui" font-size="19" font-weight="800" fill="#E56EB1">CREATIVE PLANE</text><text x="0" y="22" text-anchor="middle" font-family="system-ui" font-size="14" fill="#B9B2A3">image · video · 3D · CAD</text></g>
<path d="M948 225 H1054" stroke="#E56EB1" stroke-opacity="0.45" stroke-dasharray="6 8"/>
<text x="750" y="840" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="16" fill="#B9B2A3">GPT is the principal. MCP/API/CLI/browser are capabilities behind governed adapters.</text>
</svg>`;
}

for (const role of roles) await writeFile(path.join(brandDir, `card-${role.id}.svg`), cardSvg(role), 'utf8');
await writeFile(path.join(brandDir, 'hero.svg'), heroSvg(), 'utf8');
await writeFile(path.join(brandDir, 'company-deck.svg'), rosterSvg(), 'utf8');
await writeFile(path.join(diagramDir, 'compete.svg'), competeSvg(), 'utf8');
await writeFile(path.join(diagramDir, 'evolution.svg'), evolutionSvg(), 'utf8');
await writeFile(path.join(diagramDir, 'kernel-planes.svg'), kernelSvg(), 'utf8');

console.log(`generated ${roles.length + 5} SVG assets`);
