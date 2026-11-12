/**
 * Illustrated travel characters in the app's own palette (ink navy, sun yellow, coral, teal, sky, violet).
 * Each one is a real person-with-a-story: a mix of genders, skin tones, hair and headwear, a travel prop, and a
 * soft landmark behind them. The person's own color shows through as the background. Stored as 'a:<id>'.
 */
const INK = '#1f2a44'
const CREAM = '#fff8ec'
const S = { fair: '#f7d6b8', light: '#ecbb92', tan: '#d59a6c', brown: '#a96f48', deep: '#6b4429' }
const line = (w = 1.5) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`
/** faint landmark shapes painted in white so they take on the person's color */
const ghost = (inner: string, o = 0.38) => `<g fill="#fff" fill-opacity="${o}" stroke="none">${inner}</g>`

type Mood = 'smile' | 'grin' | 'cool'
interface Look { id: string; skin: string; body: string; mood?: Mood; bg?: string; behind?: string; hair?: string; hairFront?: string; over?: string; bare?: boolean; noEars?: boolean; brow?: string; blush?: boolean }

const face = (mood: Mood = 'smile', brow = INK, blush = true) => {
  const eye = (x: number) => `<ellipse cx="${x}" cy="31" rx="1.9" ry="2.5" fill="${INK}"/><circle cx="${x + 0.7}" cy="30.1" r="0.8" fill="#fff"/>`
  const mouth = mood === 'grin'
    ? `<path d="M27.500 36q4.500 5.500 9 0z" fill="#8a2c3a" ${line(1.3)}/><path d="M29.500 37.800q2.500 1.700 5 0" fill="#ff8fa3" stroke="none"/>`
    : mood === 'cool'
      ? `<path d="M28.500 37q3.500 2 7.500-.5" fill="none" ${line(1.5)}/>`
      : `<path d="M28 36.500q4 3.800 8 0" fill="none" ${line(1.6)}/>`
  return `${eye(26.500)}${eye(37.500)}<path d="M23.500 26.500q3-2 6 0M34.500 26.500q3-2 6 0" fill="none" stroke="${brow}" stroke-width="1.5" stroke-linecap="round"/>${blush ? `<ellipse cx="23" cy="35.500" rx="2.800" ry="1.900" fill="#ff7f96" fill-opacity=".42"/><ellipse cx="41" cy="35.500" rx="2.800" ry="1.900" fill="#ff7f96" fill-opacity=".42"/>` : ''}<path d="M31.200 33.500q.8.7 1.600 0" fill="none" stroke="${INK}" stroke-opacity=".45" stroke-width="1.1" stroke-linecap="round"/>${mouth}`
}

const LOOKS: Look[] = [
  { // explorer: safari hat, ponytail, compass, pyramids
    id: 'explorer', skin: S.light, body: '#2bb5a0',
    bg: ghost('<path d="M-2 58l18-26 16 26z"/><path d="M22 58l22-32 22 32z" fill-opacity=".28"/><circle cx="50" cy="12" r="6.500" fill-opacity=".55"/>'),
    behind: `<path d="M44 26q12 6 8 24-3 4-6 0 3-12-4-20z" fill="#7a3f1e" ${line(1.4)}/>`,
    hair: `<path d="M17.500 31q-1-12 6-15h17q7 3 6 15-4-7-14.500-7T17.500 31z" fill="#7a3f1e"/>`,
    hairFront: `<path d="M13 23.500q19 7 38 0l-2.500-1.500q-16.500 5-33 0z" fill="#c8923a" ${line(1.4)}/><path d="M19.500 22.500q1-10 12.500-10t12.500 10q-12.500 4-25 0z" fill="#e0ad4f" ${line(1.5)}/><path d="M20 20.500q12 3.200 24 0" fill="none" stroke="#7a3f1e" stroke-width="2.600"/>`,
    over: `<path d="M23 47l9 8 9-8" fill="none" stroke="${CREAM}" stroke-width="2.600" ${line(0)}/><circle cx="32" cy="57" r="5" fill="#ffc93c" ${line(1.4)}/><path d="M32 53.500l1.600 3.500-1.600 3.500-1.600-3.500z" fill="#e8483d"/>` },
  { // backpacker: curly hair, big pack, map roll, mountains
    id: 'backpacker', skin: S.deep, body: '#ff6f8e', mood: 'grin',
    bg: ghost('<path d="M-2 60l16-30 12 18 10-14 20 26z"/><path d="M10 30l4-1 3 4-3 1z" fill-opacity=".7"/>'),
    behind: `<rect x="9" y="42" width="46" height="26" rx="12" fill="#e3a23b" ${line(1.5)}/><rect x="44" y="38" width="14" height="18" rx="6" fill="#c07a1f" ${line(1.4)}/><circle cx="7" cy="47" r="5" fill="#e8483d" ${line(1.4)}/><path d="M4 47h6" stroke="${CREAM}" stroke-width="1.4"/>`,
    hair: `<g fill="#1b1424"><circle cx="21" cy="22" r="6.500"/><circle cx="28" cy="17.500" r="7"/><circle cx="36" cy="17.500" r="7"/><circle cx="43" cy="22" r="6.500"/><circle cx="18.500" cy="29" r="4.500"/><circle cx="45.500" cy="29" r="4.500"/></g>`,
    over: `<path d="M20 47v18M44 47v18" stroke="#e3a23b" stroke-width="4" ${line(0)}/><rect x="17" y="22" width="30" height="3.600" rx="1.800" fill="#ffc93c" ${line(1.2)}/><path d="M24 56l16-5" stroke="${CREAM}" stroke-width="3" stroke-linecap="round" stroke-opacity="0"/><path d="M42 54l8-3 2 7-8 3z" fill="${CREAM}" ${line(1.3)}/><path d="M44 56l5-2M45 58.500l5-2" stroke="#6eafff" stroke-width="1.200"/>` },
  { // time traveler: silver bob, brass goggles, pocket watch, clock halo
    id: 'timetraveler', skin: S.fair, body: '#6d4adf', mood: 'cool', blush: true,
    bg: `<circle cx="32" cy="31" r="29" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-dasharray="1 5.500" stroke-linecap="round"/>${ghost('<path d="M8 12l1.600 3.800L13.500 17l-3.900 1.200L8 22l-1.600-3.800L2.500 17l3.900-1.200z"/><path d="M56 44l1.300 3 3.200 1-3.200 1-1.300 3-1.300-3-3.200-1 3.200-1z"/><circle cx="54" cy="14" r="1.800"/><circle cx="9" cy="48" r="1.400"/>', 0.8)}`,
    behind: `<path d="M16 30q-3 16 4 20h24q7-4 4-20z" fill="#c9d6ef" ${line(1.4)}/>`,
    hair: `<path d="M17 32q-2-17 15-17t15 17q-2-8-9-10-3 4-6 4t-6-4q-7 2-9 10z" fill="#c9d6ef"/>`,
    hairFront: `<path d="M19.500 22.500q12.500-7 25 0v3.600q-12.500-5-25 0z" fill="#b9801f" ${line(1.4)}/><circle cx="27" cy="20" r="5.600" fill="#ffd978" ${line(1.5)}/><circle cx="37" cy="20" r="5.600" fill="#ffd978" ${line(1.5)}/><circle cx="27" cy="20" r="3" fill="#a5d8ee" ${line(1)}/><circle cx="37" cy="20" r="3" fill="#a5d8ee" ${line(1)}/>`,
    over: `<path d="M26 47q6 10 12 0" fill="none" stroke="#ffc93c" stroke-width="1.600"/><circle cx="32" cy="55" r="6" fill="#ffc93c" ${line(1.5)}/><circle cx="32" cy="55" r="4.200" fill="${CREAM}" stroke="${INK}" stroke-width="1"/><path d="M32 52v3.200l2.200 1.300" fill="none" ${line(1.2)}/>` },
  { // pilot: aviator cap + goggles, scarf, paper planes, clouds
    id: 'pilot', skin: S.brown, body: '#3f6fb5', mood: 'grin',
    bg: ghost('<path d="M4 20q0-5 5-5 2-4 7-1 5-1 5 4 5 0 5 4H4z"/><path d="M40 50q0-4 4-4 2-3 6-1 4 0 4 3 4 0 4 3H40z" fill-opacity=".28"/>') + `<path d="M46 12l12-4-4 12-3-4z" fill="#fff" fill-opacity=".85" stroke="none"/>`,
    behind: `<path d="M16 32q-2 12 3 14M48 32q2 12-3 14" stroke="#8a5a2b" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    hair: `<path d="M17 31q-2-17 15-17t15 17q-1-7-5-9h-20q-4 2-5 9z" fill="#8a5a2b" ${line(1.4)}/>`,
    hairFront: `<path d="M17 31q-2-17 15-17t15 17h-4q0-7-11-7t-11 7z" fill="#a8663a" ${line(1.5)}/><path d="M19 23.500h26" stroke="${INK}" stroke-width="2.400"/><rect x="22" y="19" width="8" height="7" rx="3.500" fill="#a5d8ee" ${line(1.5)}/><rect x="34" y="19" width="8" height="7" rx="3.500" fill="#a5d8ee" ${line(1.5)}/><path d="M17 27q-2 4 0 7M47 27q2 4 0 7" stroke="#a8663a" stroke-width="4" stroke-linecap="round" fill="none"/>`,
    over: `<path d="M20 46q12 8 24 0l3 6q-15 10-30 0z" fill="#e8483d" ${line(1.4)}/><path d="M42 50l9 8-3 2-8-6z" fill="#e8483d" ${line(1.4)}/><path d="M25 57l3-3 3 3-3 3z" fill="#ffc93c" stroke="none"/>` },
  { // sailor: captain cap, beard, stripes, waves + lighthouse
    id: 'sailor', skin: S.tan, body: '#fff8ec', mood: 'grin',
    bg: ghost('<path d="M6 30h6l1 24H5z"/><path d="M5 27l5-4 5 4z"/><path d="M-2 58q6-5 12 0t12 0 12 0 12 0 12 0v8H-2z"/>'),
    hair: `<path d="M17.500 33q-1-9 3-11h23q4 2 3 11-3-6-14.500-6T17.500 33z" fill="#d8dce6" ${line(1.3)}/>`,
    hairFront: `<path d="M24 36q8 11 16 0-8 2-16 0z" fill="#d8dce6" ${line(1.4)}/><path d="M17 22h30l-3.500-6q-11.500-5-23 0z" fill="${CREAM}" ${line(1.5)}/><path d="M17 22h30v3.200H17z" fill="#2c4a8a" ${line(1.2)}/><circle cx="32" cy="17" r="2.200" fill="#ffc93c" stroke="${INK}" stroke-width="1"/>`,
    over: `<path d="M12 56h40M14 62h36" stroke="#2c4a8a" stroke-width="3.200"/><path d="M26 47l6 6 6-6" fill="none" stroke="#2c4a8a" stroke-width="2.800" ${line(0)}/><path d="M32 52l-3 5h6z" fill="#ff6f8e" stroke="none"/>` },
  { // climber: beanie, braids, rope + ice axe, peaks
    id: 'climber', skin: S.fair, body: '#ff9a3c', mood: 'grin',
    bg: ghost('<path d="M-2 62l20-38 11 18 8-12 19 32z"/><path d="M18 24l4 7-4-2-4 2z" fill-opacity=".9"/>'),
    behind: `<path d="M15 33q-4 12 1 22M49 33q4 12-1 22" stroke="#b5542a" stroke-width="6.500" fill="none" stroke-linecap="round"/><path d="M16 40l-2 1M16 46l-2 1M48 40l2 1M48 46l2 1" stroke="${INK}" stroke-width="1" opacity=".5"/>`,
    hair: `<path d="M17.500 32q-1-9 4-13h21q5 4 4 13-3-6-14.500-6T17.500 32z" fill="#b5542a"/>`,
    hairFront: `<path d="M17 27q-2-16 15-16t15 16h-30z" fill="#6d4adf" ${line(1.5)}/><rect x="16.500" y="23.500" width="31" height="5" rx="2.500" fill="#4a30b0" ${line(1.4)}/><path d="M22 23.500v5M27 23.500v5M32 23.500v5M37 23.500v5M42 23.500v5" stroke="#8a6af0" stroke-width="1"/><circle cx="32" cy="10" r="3.400" fill="#ffc93c" ${line(1.3)}/>`,
    over: `<path d="M16 48q-9 4-5 17M48 48q9 4 5 17" stroke="#6eafff" stroke-width="3.400" fill="none" stroke-linecap="round"/><path d="M50 62l8-22" stroke="#c98a2b" stroke-width="3" stroke-linecap="round"/><path d="M52 40l8-3-1 6z" fill="#c9d6ef" ${line(1.3)}/>` },
  { // cyclist: helmet, sunglasses, scarf, road + hills
    id: 'cyclist', skin: S.light, body: '#2bb5a0', mood: 'cool',
    bg: ghost('<path d="M-2 56q14-14 28-4t40-6v20H-2z"/><path d="M-2 62q20-10 38-2t30-4v10H-2z" fill-opacity=".25"/>'),
    hair: `<path d="M17.500 31q-1-8 3-9h23q4 1 3 9-3-5-14.500-5T17.500 31z" fill="#3a2a22"/>`,
    hairFront: `<path d="M16.500 30q-2-17 15.500-17t15.500 17h-3.500q-1-8-12-8t-12 8z" fill="#ffc93c" ${line(1.5)}/><path d="M24 15v7M32 13.500v8M40 15v7" stroke="${INK}" stroke-width="1.300"/><path d="M21.500 25.500h21v6.500a5 5 0 0 1-5 3.500h-11a5 5 0 0 1-5-3.500z" fill="${INK}"/><path d="M24 29h16" stroke="#6eafff" stroke-width="2" stroke-linecap="round"/>`,
    over: `<path d="M22 46q10 7 20 0l1 5q-11 7-22 0z" fill="#ffc93c" ${line(1.4)}/><circle cx="12" cy="60" r="8" fill="none" stroke="${INK}" stroke-width="2.200"/><circle cx="52" cy="60" r="8" fill="none" stroke="${INK}" stroke-width="2.200"/>` },
  { // foodie: bun with chopsticks, ramen bowl, lanterns
    id: 'foodie', skin: S.fair, body: '#fff8ec', mood: 'grin',
    bg: ghost('<ellipse cx="10" cy="14" rx="5" ry="6.500"/><ellipse cx="54" cy="12" rx="5" ry="6.500" fill-opacity=".28"/><rect x="8" y="6" width="4" height="2"/><rect x="52" y="4" width="4" height="2"/>'),
    hair: `<circle cx="32" cy="12" r="7" fill="#2a1a1a" ${line(1.4)}/><path d="M17 31q-2-17 15-17t15 17q-3-8-9-10-3 3-6 3t-6-3q-6 2-9 10z" fill="#2a1a1a"/><path d="M24 8l16 6M40 8L24 14" stroke="#e8483d" stroke-width="2" stroke-linecap="round"/>`,
    over: `<path d="M8 55h48q0 12-24 12T8 55z" fill="#ff6f8e" ${line(1.5)}/><path d="M18 55q4-6 7 0t7 0 7 0 7 0" fill="none" stroke="#ffc93c" stroke-width="2.600" stroke-linecap="round"/><circle cx="25" cy="54" r="2.800" fill="${CREAM}" ${line(1)}/><path d="M43 42l-9 14M48 44l-9 13" stroke="#c98a2b" stroke-width="2" stroke-linecap="round"/>` },
  { // camper: beanie, flannel, tent + campfire, stars
    id: 'camper', skin: S.tan, body: '#e8483d', mood: 'smile',
    bg: ghost('<path d="M-2 62l20-24 20 24z"/><circle cx="52" cy="10" r="1.600"/><circle cx="44" cy="20" r="1.200"/><circle cx="10" cy="14" r="1.400"/>', 0.34),
    hair: `<path d="M17.500 33q-1-9 3-12h23q4 3 3 12-4-5-14.500-5T17.500 33z" fill="#4a2f22"/>`,
    hairFront: `<path d="M24 37q8 9 16 0-8 2-16 0z" fill="#4a2f22" ${line(1.3)}/><path d="M17 26q-1-14 15-14t15 14h-30z" fill="#3aa05a" ${line(1.5)}/><rect x="16.500" y="23" width="31" height="5.500" rx="2.700" fill="#2a7a42" ${line(1.4)}/><circle cx="32" cy="10" r="3.200" fill="#fff8ec" ${line(1.2)}/>`,
    over: `<path d="M20 47l6 8M44 47l-6 8M22 56h20M26 51l-4 14M38 51l4 14" fill="none" stroke="#a02a22" stroke-width="2" opacity=".9"/><path d="M44 66q2-8 6-14 2 6 6 14z" fill="#ff9a3c" ${line(1.4)}/><path d="M48 66q1-4 3-7 2 3 3 7z" fill="#ffd978" stroke="none"/>` },
  { // diver: wavy hair, mask on forehead, snorkel, fish + bubbles
    id: 'diver', skin: S.brown, body: '#1f2a44', mood: 'grin',
    bg: ghost('<circle cx="52" cy="14" r="3" fill="none" stroke="#fff" stroke-width="1.400"/><circle cx="47" cy="7" r="1.800" fill="none" stroke="#fff" stroke-width="1.200"/><circle cx="55" cy="26" r="1.600" fill="none" stroke="#fff" stroke-width="1.200"/><path d="M4 50q6-6 12 0-6 6-12 0zm12 0l5-4v8z"/>', 0.55),
    behind: `<path d="M15 30q-5 14 2 26l5-3q-4-10-1-23zM49 30q5 14-2 26l-5-3q4-10 1-23z" fill="#0f0a14" ${line(1.3)}/>`,
    hair: `<path d="M17 31q-3-17 15-17t15 17q-2-7-8-9-3 3-7 3t-7-3q-6 2-8 9z" fill="#0f0a14"/>`,
    hairFront: `<path d="M17 25q15-9 30 0" fill="none" stroke="#2bb5a0" stroke-width="3.600" stroke-linecap="round"/><rect x="21.500" y="14.500" width="21" height="10" rx="5" fill="#a5d8ee" fill-opacity=".85" stroke="#2bb5a0" stroke-width="2.200"/><path d="M25 18q3-1.500 6 0" stroke="#fff" stroke-width="1.400" fill="none" stroke-linecap="round"/><path d="M47 22q5-2 5-10" fill="none" stroke="#ffc93c" stroke-width="3.400" stroke-linecap="round"/>`,
    over: `<path d="M26 47q6 8 12 0" fill="none" stroke="#2bb5a0" stroke-width="3"/><path d="M12 54q2 8 8 10M52 54q-2 8-8 10" stroke="#ffc93c" stroke-width="3.600" fill="none" stroke-linecap="round"/>` },
  { // surfer: sun-kissed hair, lei, board, palms
    id: 'surfer', skin: S.light, body: '#ff7a5c', mood: 'grin',
    bg: ghost('<path d="M8 62q-1-24 6-34 3 8 0 12 5-6 10-4-6 2-8 10-1 8 0 16z"/><path d="M14 28q-8 0-12 6 8-2 12-2zM14 28q8-1 12 4-8-1-12-2z"/>'),
    behind: `<path d="M44 68q2-30 15-52 6 18 0 52z" fill="#6eafff" ${line(1.5)}/><path d="M52 24q3 18 0 40" stroke="${CREAM}" stroke-width="2" fill="none"/>`,
    hair: `<path d="M16.500 33q-3-20 15.500-20t15.500 20q-1-9-7-11-6 3.500-16 0-6 3-8 11z" fill="#f0c24a" ${line(1.3)}/>`,
    hairFront: `<path d="M20 20q10-5 20 1" fill="none" stroke="#fff3b8" stroke-width="2" stroke-linecap="round"/>`,
    over: `<path d="M20 47q12 11 24 0" fill="none" stroke="${INK}" stroke-width="0"/><g ${line(1)}><circle cx="22" cy="50" r="3" fill="#ff6f8e"/><circle cx="27" cy="54" r="3" fill="#ffc93c"/><circle cx="32" cy="56" r="3" fill="#ff6f8e"/><circle cx="37" cy="54" r="3" fill="#ffc93c"/><circle cx="42" cy="50" r="3" fill="#ff6f8e"/></g>` },
  { // photographer: headscarf, camera, film strip, city skyline
    id: 'photographer', skin: S.tan, body: '#7a6aba', mood: 'smile',
    bg: ghost('<path d="M2 60V42h6v-6h6v10h5V32h7v14h5v-8h6v22z"/><rect x="44" y="40" width="5" height="20"/><rect x="50" y="30" width="6" height="30"/>', 0.32),
    behind: `<path d="M13 28q-2 20 8 24h22q10-4 8-24z" fill="#2bb5a0" ${line(1.4)}/>`,
    hair: '',
    hairFront: `<path d="M16.500 33q-3-20 15.500-20t15.500 20q-4-3-6-8-9 3-19 0-2 5-6 8z" fill="#2bb5a0" ${line(1.5)}/><path d="M22 22q10-6 20 0" fill="none" stroke="#9be0d0" stroke-width="2" stroke-linecap="round"/>`,
    over: `<rect x="14" y="48" width="36" height="17" rx="5" fill="${INK}"/><rect x="20" y="44.500" width="10" height="5" rx="1.600" fill="#c9d6ef" ${line(1.2)}/><circle cx="32" cy="57" r="6.500" fill="#a5d8ee" stroke="#c9d6ef" stroke-width="2.400"/><circle cx="30" cy="55" r="1.800" fill="#fff"/><circle cx="44" cy="51.500" r="1.800" fill="#ffc93c"/><path d="M18 48q-4-8 3-10M46 48q4-8-3-10" stroke="#ffc93c" stroke-width="2.200" fill="none" stroke-linecap="round"/>` },
  { // desert nomad: wrapped headcloth, scarf, sun + dunes
    id: 'nomad', skin: S.brown, body: '#e8943a', mood: 'smile',
    bg: ghost('<circle cx="50" cy="14" r="8" fill-opacity=".6"/><path d="M-2 56q14-14 30-2 14-10 38 2v14H-2z"/>'),
    hair: '',
    hairFront: `<path d="M15.500 33q-4-21 16.500-21t16.500 21q-2-3-5-3 0-6-11.500-6T20.500 30q-3 0-5 3z" fill="${CREAM}" ${line(1.5)}/><path d="M17 24q15-6 30 0" fill="none" stroke="#2c4a8a" stroke-width="3" stroke-linecap="round"/><path d="M17 24q15-6 30 0" fill="none" stroke="#ffc93c" stroke-width="1" stroke-dasharray="2 2.500"/><path d="M16 33q-3 10 3 17M48 33q3 10-3 17" stroke="${CREAM}" stroke-width="5.500" fill="none" stroke-linecap="round"/><path d="M16 33q-3 10 3 17M48 33q3 10-3 17" stroke="${INK}" stroke-width="1.200" fill="none" stroke-linecap="round" stroke-opacity=".0"/>`,
    over: `<path d="M22 46q10 6 20 0l1 5q-11 6-22 0z" fill="#2c4a8a" ${line(1.4)}/><path d="M26 51l2 8M32 52l0 9M38 51l-2 8" stroke="#ffc93c" stroke-width="1.400" stroke-linecap="round"/>` },
  { // astronaut: helmet with a reflected planet, patch with the globe
    id: 'astronaut', skin: S.light, body: '#e6ecf5', bare: true,
    bg: ghost('<circle cx="8" cy="12" r="1.600"/><circle cx="56" cy="22" r="1.400"/><circle cx="50" cy="8" r="2"/><circle cx="10" cy="46" r="1.200"/><ellipse cx="54" cy="52" rx="7" ry="2.400" fill-opacity=".25"/><circle cx="54" cy="52" r="3.800" fill-opacity=".5"/>', 0.7),
    behind: `<rect x="12" y="38" width="40" height="28" rx="9" fill="#9aa8c4" ${line(1.5)}/>`,
    hair: `<circle cx="32" cy="29" r="19" fill="#e6ecf5" ${line(1.7)}/><circle cx="32" cy="30" r="14.500" fill="#2c4a8a" ${line(1.5)}/><path d="M22 23q8-6 17-1" stroke="#a5d8ee" stroke-width="2.600" fill="none" stroke-linecap="round"/><circle cx="39" cy="23" r="3" fill="#2bb5a0" fill-opacity=".9"/><path d="M37 22q2 0 4 1.200" stroke="#fff" stroke-width="1" fill="none"/>`,
    hairFront: `<circle cx="26" cy="31" r="1.900" fill="#fff"/><circle cx="35" cy="31" r="1.900" fill="#fff"/><path d="M26.500 35.500q3.500 3 7 0" fill="none" stroke="#fff" stroke-width="1.600" stroke-linecap="round"/>`,
    over: `<rect x="21" y="50" width="8" height="5" rx="2.200" fill="#ff6f8e" ${line(1.2)}/><rect x="35" y="50" width="8" height="5" rx="2.200" fill="#6eafff" ${line(1.2)}/><circle cx="32" cy="59" r="3.400" fill="#2bb5a0" ${line(1.2)}/>` },
  { // robot scout: friendly bot with a globe antenna
    id: 'robot', skin: '#c9d6ef', body: '#8796b4', bare: true,
    bg: ghost('<circle cx="8" cy="14" r="1.600"/><circle cx="56" cy="40" r="1.800"/><circle cx="52" cy="10" r="1.200"/>', 0.7),
    behind: `<rect x="9" y="30" width="6" height="12" rx="3" fill="#8796b4" ${line(1.3)}/><rect x="49" y="30" width="6" height="12" rx="3" fill="#8796b4" ${line(1.3)}/>`,
    hair: `<path d="M32 17v-6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="8" r="5" fill="#2bb5a0" ${line(1.5)}/><path d="M28 7.500q4 2 8 0M32 3v10" stroke="#fff" stroke-width="1" fill="none"/><rect x="15.500" y="16" width="33" height="29" rx="11" fill="#e6ecf5" ${line(1.7)}/>`,
    hairFront: `<rect x="20" y="23" width="24" height="14" rx="7" fill="${INK}"/><ellipse cx="27" cy="30" rx="2.800" ry="3.300" fill="#ffc93c"/><ellipse cx="37" cy="30" rx="2.800" ry="3.300" fill="#ffc93c"/><circle cx="27.800" cy="28.800" r="1" fill="#fff"/><circle cx="37.800" cy="28.800" r="1" fill="#fff"/><path d="M27.500 41q4.500 3 9 0" fill="none" ${line(1.8)}/><circle cx="21" cy="38" r="2" fill="#ff7f96" fill-opacity=".6"/><circle cx="43" cy="38" r="2" fill="#ff7f96" fill-opacity=".6"/>`,
    over: `<circle cx="32" cy="57" r="5" fill="#ffc93c" ${line(1.4)}/><path d="M29.500 57h5M32 54.500v5" stroke="${INK}" stroke-width="1.100"/>` },
  { // globe-trotting wizard: starry hat, long hair, glowing globe
    id: 'wizard', skin: S.fair, body: '#6d4adf', mood: 'grin',
    bg: ghost('<path d="M8 10l1.600 3.800L13.500 15l-3.900 1.200L8 20l-1.600-3.800L2.500 15l3.900-1.200z"/><path d="M54 30l1.300 3 3.200 1-3.200 1-1.300 3-1.300-3-3.200-1 3.200-1z"/><circle cx="50" cy="8" r="1.600"/>', 0.8),
    behind: `<path d="M14 30q-3 20 6 28h24q9-8 6-28z" fill="#e6ecf5" ${line(1.4)}/>`,
    hair: '',
    hairFront: `<path d="M9 25q23 8 46 0l-8-2-6-19q-3-3-6 0l-6 16z" fill="#6d4adf" ${line(1.5)}/><path d="M14 25q18 6 36 0" fill="none" stroke="#ffc93c" stroke-width="3"/><path d="M32 5l1.200 2.800 3 .3-2.300 2 .7 3-2.600-1.600-2.600 1.600.7-3-2.300-2 3-.3z" fill="#ffc93c" stroke="none" transform="translate(0 6) scale(.9) translate(3.500 0)"/><path d="M24 36q8 12 16 0-8-3-16 0z" fill="#e6ecf5" ${line(1.3)}/>`,
    over: `<circle cx="46" cy="52" r="9" fill="#a5d8ee" ${line(1.5)}/><path d="M40 49q5-3 9 0t2 6q-6 2-9-1z" fill="#3aa05a" stroke="none"/><path d="M37 52h18M46 43v18" stroke="${INK}" stroke-width="1" opacity=".35"/><circle cx="46" cy="52" r="12.500" fill="none" stroke="#ffc93c" stroke-opacity=".55" stroke-width="1.400"/>` },
]

const head = (l: Look) => l.bare ? '' : `${l.noEars ? '' : `<circle cx="17.500" cy="31.500" r="3" fill="${l.skin}" ${line(1.4)}/><circle cx="46.500" cy="31.500" r="3" fill="${l.skin}" ${line(1.4)}/>`}<path d="M27 40h10v8a5 5 0 0 1-10 0z" fill="${l.skin}" ${line(1.4)}/><circle cx="32" cy="30" r="14.500" fill="${l.skin}" ${line(1.6)}/>${face(l.mood, INK, l.blush !== false)}`

export const PRESETS: { id: string; svg: string }[] = LOOKS.map(l => ({
  id: l.id,
  svg: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${l.bg ?? ''}${l.behind ?? ''}<path d="M8 68q0-23 24-23t24 23z" fill="${l.body}" ${line(1.6)}/>${head(l)}${l.hair ?? ''}${l.hairFront ?? ''}${l.over ?? ''}</svg>`,
}))
